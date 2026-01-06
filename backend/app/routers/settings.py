"""
Settings router for admin configuration.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, sessionmaker
from pydantic import BaseModel, validator
from typing import Optional, Dict, Any, Union
from app.database import get_db, Base, engine, SessionLocal
from app.auth import get_current_user, get_password_hash
from app import models
from app.services.settings_manager import (
    create_database_engine_from_settings,
    run_database_migrations,
    ensure_settings_table,
    save_settings_to_database,
    load_settings_from_database,
    clear_env_file
)
import logging
import os
from pathlib import Path
import secrets
import time
from datetime import datetime, timedelta
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

# In-memory storage for temporary setup tokens (expires after 30 minutes)
# Format: {token: expiry_timestamp}
setup_tokens: Dict[str, float] = {}

class EnvVarValue(BaseModel):
    value: str
    isPublic: bool = False

class TokenVerifyRequest(BaseModel):
    token: str

class TokenVerifyResponse(BaseModel):
    valid: bool
    message: Optional[str] = None

class SettingsRequest(BaseModel):
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None
    cloud_provider: Optional[str] = None
    cloud_region: Optional[str] = None
    cloud_access_key: Optional[str] = None
    cloud_secret_key: Optional[str] = None
    database_type: Optional[str] = None
    database_username: Optional[str] = None
    database_password: Optional[str] = None
    database_host: Optional[str] = None
    database_port: Optional[str] = None
    database_name: Optional[str] = None
    environment_variables: Optional[Dict[str, Union[str, EnvVarValue]]] = None
    
    @validator('database_port', pre=True)
    def convert_port_to_string(cls, v):
        """Convert database_port to string if it's a number or None."""
        if v is None:
            return None
        return str(v)

class SettingsResponse(BaseModel):
    success: bool
    message: str
    env_file_path: Optional[str] = None

class SetupTokenResponse(BaseModel):
    valid: bool
    setup_token: Optional[str] = None  # Temporary token for settings page (30 min expiry)
    message: Optional[str] = None

class ConfiguredResponse(BaseModel):
    configured: bool
    message: Optional[str] = None

@router.post("/verify-token", response_model=SetupTokenResponse)
def verify_token(request: TokenVerifyRequest):
    """
    Verify setup token against SYSTEM_ID environment variable.
    If valid, generates a temporary token (5 minutes expiry) for settings page access.
    No authentication required.
    """
    from app.services.settings_loader import get_system_id
    system_id = get_system_id()
    
    if not system_id:
        return SetupTokenResponse(
            valid=False,
            message="SYSTEM_ID not configured in environment"
        )
    
    if request.token == system_id:
        # Generate temporary token (30 minutes expiry)
        temp_token = secrets.token_urlsafe(32)
        expiry_time = time.time() + (30 * 60)  # 30 minutes from now
        
        # Store token with expiry
        setup_tokens[temp_token] = expiry_time
        
        # Clean up expired tokens
        current_time = time.time()
        expired_tokens = [token for token, expiry in setup_tokens.items() if expiry < current_time]
        for token in expired_tokens:
            del setup_tokens[token]
        
        logger.info(f"Generated temporary setup token (expires in 30 minutes)")
        
        return SetupTokenResponse(
            valid=True,
            setup_token=temp_token,
            message="Token verified. Temporary access token generated."
        )
    else:
        return SetupTokenResponse(
            valid=False,
            message="Invalid token"
        )

@router.post("/validate-setup-token", response_model=Dict[str, Any])
def validate_setup_token(request: TokenVerifyRequest):
    """
    Validate temporary setup token for settings page access.
    No authentication required.
    """
    current_time = time.time()
    
    # Clean up expired tokens first
    expired_tokens = [token for token, expiry in setup_tokens.items() if expiry < current_time]
    for token in expired_tokens:
        del setup_tokens[token]
    
    # Check if token exists and is not expired
    if request.token in setup_tokens:
        expiry_time = setup_tokens[request.token]
        
        if current_time < expiry_time:
            # Token is valid
            remaining_time = expiry_time - current_time
            return {
                "valid": True,
                "remaining_seconds": int(remaining_time),
                "message": "Token is valid"
            }
        else:
            # Token expired, remove it
            del setup_tokens[request.token]
            return {
                "valid": False,
                "message": "Token has expired"
            }
    else:
        return {
            "valid": False,
            "message": "Invalid or expired token"
        }

@router.post("/invalidate-setup-token")
def invalidate_setup_token(request: TokenVerifyRequest):
    """
    Invalidate a setup token (e.g., after settings are saved).
    No authentication required.
    """
    if request.token in setup_tokens:
        del setup_tokens[request.token]
        logger.info("Setup token invalidated")
    
    return {"success": True, "message": "Token invalidated"}

@router.post("/save", response_model=SettingsResponse)
def save_settings(
    settings: SettingsRequest,
    current_user: Optional[models.User] = Depends(get_current_user)
):
    """
    Save no-code application settings.
    Steps:
    1. Create/update admin user (if provided and not authenticated)
    2. Connect to provided database
    3. Run database migrations
    4. Save all settings to database
    5. Update DATABASE_URL in .env file
    
    Authentication:
    - If current_user is provided (admin logged in), allow saving settings
    - If no current_user, allow only during initial setup (when app is not configured)
    """
    
    # Check if user is authenticated
    is_authenticated = current_user is not None
    
    # If authenticated, verify user is admin
    if is_authenticated:
        if not current_user.is_admin or current_user.is_admin != 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin users can save settings"
            )
        logger.info(f"Admin user {current_user.email} is updating settings")
    else:
        # Not authenticated - check if app is already configured
        # If configured, require authentication
        try:
            default_db = SessionLocal()
            try:
                app_setting = default_db.query(models.ApplicationSettings).filter(
                    models.ApplicationSettings.key == 'app_configured'
                ).first()
                
                if app_setting:
                    # Try to parse the value
                    value = app_setting.value
                    is_configured = False
                    if value is True:
                        is_configured = True
                    elif isinstance(value, str):
                        try:
                            parsed = json.loads(value)
                            if parsed is True:
                                is_configured = True
                        except:
                            if value.lower().strip() in ['true', '1', 'yes']:
                                is_configured = True
                    
                    if is_configured:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Application is already configured. Please login as admin to update settings."
                        )
            finally:
                default_db.close()
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not check app configuration status: {e}")
            # Continue with initial setup if check fails
    
    # Initialize settings_db_session to None to avoid UnboundLocalError
    settings_db_session = None
    
    try:
        # Get project root directory (parent of backend directory)
        backend_dir = Path(__file__).parent.parent
        project_root = backend_dir.parent
        env_file_path = project_root / ".env"
        
        # Step 1: Create/update admin user if email and password provided
        # Admin user should be created in the default database (the one used by the application)
        admin_user_created = False
        if settings.admin_email and settings.admin_password:
            try:
                # Try to get a database session from the default connection
                default_db = SessionLocal()
                try:
                    # Check if admin user already exists
                    existing_admin = default_db.query(models.User).filter(
                        models.User.email == settings.admin_email
                    ).first()
                    
                    if existing_admin:
                        # Update existing admin user
                        existing_admin.hashed_password = get_password_hash(settings.admin_password)
                        existing_admin.is_admin = 1
                        default_db.commit()
                        logger.info(f"Updated admin user in users table: {settings.admin_email}")
                        admin_user_created = True
                    else:
                        # Create new admin user
                        # Generate username from email (before @)
                        username = settings.admin_email.split('@')[0]
                        # Ensure username is unique - if exists, append number
                        base_username = username
                        counter = 1
                        while default_db.query(models.User).filter(models.User.username == username).first():
                            username = f"{base_username}{counter}"
                            counter += 1
                        
                        admin_user = models.User(
                            username=username,
                            email=settings.admin_email,
                            hashed_password=get_password_hash(settings.admin_password),
                            is_admin=1
                        )
                        default_db.add(admin_user)
                        default_db.commit()
                        default_db.refresh(admin_user)
                        logger.info(f"Created admin user in users table: {settings.admin_email} (username: {username})")
                        admin_user_created = True
                finally:
                    default_db.close()
            except Exception as db_error:
                logger.error(f"Could not connect to default database to create admin user: {db_error}", exc_info=True)
                # If default database fails, we'll try again after settings database is configured
                # But log this as an error since admin user creation is important
                admin_user_created = False
        
        # Step 2: If database credentials provided, connect and run migrations
        if (settings.database_type and settings.database_username and 
                settings.database_password and settings.database_host and 
                settings.database_name):
                
                try:
                    # Create engine for settings database
                    settings_engine = create_database_engine_from_settings(
                        settings.database_type,
                        settings.database_username,
                        settings.database_password,
                        settings.database_host,
                        settings.database_port or ('5432' if settings.database_type == 'postgresql' else '3306' if settings.database_type == 'mysql' else ''),
                        settings.database_name
                    )
                    
                    # Ensure settings table exists
                    if not ensure_settings_table(settings_engine):
                        raise Exception("Failed to create settings table")
                    
                    # Create session for settings database
                    SettingsSession = sessionmaker(bind=settings_engine)
                    settings_db_session = SettingsSession()
                    
                    # Run migrations if database type supports it
                    if settings.database_type in ['postgresql', 'mysql']:
                        database_url = f"{settings.database_type}://{settings.database_username}:{settings.database_password}@{settings.database_host}:{settings.database_port or ('5432' if settings.database_type == 'postgresql' else '3306')}/{settings.database_name}"
                        migration_success, migration_message = run_database_migrations(
                            database_url,
                            settings.database_type,
                            project_root
                        )
                        if not migration_success:
                            logger.warning(f"Migration warning: {migration_message}")
                    
                    logger.info("Connected to settings database successfully")
                    
                except Exception as e:
                    logger.error(f"Error connecting to settings database: {e}", exc_info=True)
                    # Continue anyway - we'll try to save to main database
                    if settings_db_session is not None:
                        try:
                            settings_db_session.close()
                        except:
                            pass
                    settings_db_session = None
        
        # Step 3: Prepare settings dictionary for database storage
        # Save all provided values (including empty strings to clear fields)
        settings_dict = {}
        
        # Only save admin_email during initial setup (not when admin is updating)
        if settings.admin_email is not None and not is_authenticated:
            settings_dict['admin_email'] = settings.admin_email
        
        # Save cloud settings (save even if empty to clear them)
        if settings.cloud_provider is not None:
            settings_dict['cloud_provider'] = settings.cloud_provider
        if settings.cloud_region is not None:
            settings_dict['cloud_region'] = settings.cloud_region
        if settings.cloud_access_key is not None:
            settings_dict['cloud_access_key'] = settings.cloud_access_key
        if settings.cloud_secret_key is not None:
            settings_dict['cloud_secret_key'] = settings.cloud_secret_key
        
        # Save database settings (save even if empty to clear them)
        if settings.database_type is not None:
            settings_dict['database_type'] = settings.database_type
        if settings.database_username is not None:
            settings_dict['database_username'] = settings.database_username
        if settings.database_password is not None:
            settings_dict['database_password'] = settings.database_password
        if settings.database_host is not None:
            settings_dict['database_host'] = settings.database_host
        if settings.database_port is not None:
            settings_dict['database_port'] = settings.database_port
        if settings.database_name is not None:
            settings_dict['database_name'] = settings.database_name
        
        # Save environment variables
        if settings.environment_variables is not None:
            settings_dict['environment_variables'] = settings.environment_variables
        
        # Generate and add DATABASE_URL to settings_dict if database credentials are provided
        if (settings.database_type and settings.database_username and 
            settings.database_password and settings.database_host and 
            settings.database_name):
            port = settings.database_port or ('5432' if settings.database_type == 'postgresql' else '3306' if settings.database_type == 'mysql' else '')
            
            if settings.database_type == 'postgresql':
                database_url = f"postgresql://{settings.database_username}:{settings.database_password}@{settings.database_host}:{port}/{settings.database_name}"
            elif settings.database_type == 'mysql':
                database_url = f"mysql+pymysql://{settings.database_username}:{settings.database_password}@{settings.database_host}:{port}/{settings.database_name}"
            elif settings.database_type == 'sqlite':
                database_url = f"sqlite:///{settings.database_name}"
            else:
                database_url = f"{settings.database_type}://{settings.database_username}:{settings.database_password}@{settings.database_host}:{port}/{settings.database_name}"
            
            settings_dict['database_url'] = database_url
        
        # Step 4: Save settings to database
        # For authenticated admin users, always save to default database
        # For initial setup, save to settings database if provided, otherwise default database
        save_success = False
        
        if is_authenticated:
            # Admin user updating settings - save to default database
            try:
                default_db = SessionLocal()
                try:
                    save_success = save_settings_to_database(default_db, settings_dict)
                    logger.info("Settings saved to default database by admin user")
                finally:
                    default_db.close()
            except Exception as db_error:
                logger.error(f"Could not save settings to default database: {db_error}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to save settings: {str(db_error)}"
                )
        elif settings_db_session is not None:
            # Initial setup with custom database - save to settings database
            save_success = save_settings_to_database(settings_db_session, settings_dict)
            
            # Mark app as configured in settings database
            configured_dict = {'app_configured': True}
            save_settings_to_database(settings_db_session, configured_dict)
            
            # ALSO save app_configured to default database so it can be checked easily
            try:
                default_db = SessionLocal()
                try:
                    save_settings_to_database(default_db, configured_dict)
                    logger.info("app_configured saved to both settings database and default database")
                except Exception as default_db_error:
                    logger.warning(f"Could not save app_configured to default database: {default_db_error}")
                finally:
                    default_db.close()
            except Exception as default_db_init_error:
                logger.warning(f"Could not initialize default database to save app_configured: {default_db_init_error}")
            
            try:
                settings_db_session.close()
            except Exception as close_error:
                logger.warning(f"Error closing settings database session: {close_error}")
            
            if not save_success:
                raise Exception("Failed to save settings to database")
        else:
            # Initial setup without custom database - save to default database
            try:
                default_db = SessionLocal()
                try:
                    save_success = save_settings_to_database(default_db, settings_dict)
                    # Mark app as configured
                    configured_dict = {'app_configured': True}
                    save_settings_to_database(default_db, configured_dict)
                    logger.info("Settings saved to default database during initial setup")
                finally:
                    default_db.close()
            except Exception as db_error:
                logger.error(f"Could not save to default database: {db_error}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to save settings: {str(db_error)}"
                )
        
        if not save_success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save settings to database"
            )
        
        # Step 5: Write DATABASE_URL to .env file (only database connection, other settings stay in DB)
        try:
            if (settings.database_type and settings.database_username and 
                settings.database_password and settings.database_host and 
                settings.database_name):
                # Generate DATABASE_URL from credentials
                port = settings.database_port or ('5432' if settings.database_type == 'postgresql' else '3306' if settings.database_type == 'mysql' else '')
                
                if settings.database_type == 'postgresql':
                    database_url = f"postgresql://{settings.database_username}:{settings.database_password}@{settings.database_host}:{port}/{settings.database_name}"
                elif settings.database_type == 'mysql':
                    database_url = f"mysql+pymysql://{settings.database_username}:{settings.database_password}@{settings.database_host}:{port}/{settings.database_name}"
                elif settings.database_type == 'sqlite':
                    database_url = f"sqlite:///{settings.database_name}"
                else:
                    database_url = f"{settings.database_type}://{settings.database_username}:{settings.database_password}@{settings.database_host}:{port}/{settings.database_name}"
                
                # Write only DATABASE_URL to .env file
                with open(env_file_path, 'w') as f:
                    f.write(f"# Database connection URL (auto-generated from settings)\n")
                    f.write(f"DATABASE_URL={database_url}\n")
                
                logger.info(f"DATABASE_URL written to .env file")
                
                # Step 6: Retry admin user creation if it failed initially (now that DATABASE_URL is updated)
                if not admin_user_created and settings.admin_email and settings.admin_password:
                    try:
                        # Reload environment to get new DATABASE_URL
                        import os
                        from dotenv import load_dotenv
                        load_dotenv(override=True)
                        
                        # Recreate engine and session with new DATABASE_URL
                        from sqlalchemy import create_engine
                        from sqlalchemy.orm import sessionmaker
                        new_engine = create_engine(os.getenv("DATABASE_URL"), pool_pre_ping=True)
                        NewSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=new_engine)
                        retry_db = NewSessionLocal()
                        
                        try:
                            # Check if admin user already exists
                            existing_admin = retry_db.query(models.User).filter(
                                models.User.email == settings.admin_email
                            ).first()
                            
                            if existing_admin:
                                # Update existing admin user
                                existing_admin.hashed_password = get_password_hash(settings.admin_password)
                                existing_admin.is_admin = 1
                                retry_db.commit()
                                logger.info(f"Updated admin user in users table (retry): {settings.admin_email}")
                                admin_user_created = True
                            else:
                                # Create new admin user
                                username = settings.admin_email.split('@')[0]
                                base_username = username
                                counter = 1
                                while retry_db.query(models.User).filter(models.User.username == username).first():
                                    username = f"{base_username}{counter}"
                                    counter += 1
                                
                                admin_user = models.User(
                                    username=username,
                                    email=settings.admin_email,
                                    hashed_password=get_password_hash(settings.admin_password),
                                    is_admin=1
                                )
                                retry_db.add(admin_user)
                                retry_db.commit()
                                retry_db.refresh(admin_user)
                                logger.info(f"Created admin user in users table (retry): {settings.admin_email} (username: {username})")
                                admin_user_created = True
                        finally:
                            retry_db.close()
                    except Exception as retry_error:
                        logger.error(f"Could not create admin user after DATABASE_URL update: {retry_error}", exc_info=True)
            else:
                # No database credentials, clear .env file
                clear_env_file(env_file_path)
        except Exception as env_error:
            logger.warning(f"Error writing DATABASE_URL to .env: {env_error}")
        
        if admin_user_created:
            logger.info("Settings saved to database. DATABASE_URL written to .env. Admin user created/updated in users table. App marked as configured.")
        else:
            logger.warning("Settings saved to database. DATABASE_URL written to .env. App marked as configured. WARNING: Admin user was not created.")
        
        # Step 7: Trigger backend app reload (graceful - only if uvicorn is running with --reload)
        try:
            # Method 1: Touch a Python file that uvicorn --reload watches
            # Uvicorn with --reload watches Python files, so touching one will trigger reload
            # This is the safest method as uvicorn handles the reload gracefully
            reload_trigger_file = backend_dir / "app" / "__init__.py"
            if reload_trigger_file.exists():
                # Touch the file to trigger uvicorn reload
                # Uvicorn will gracefully restart, waiting for the old process to release the port
                reload_trigger_file.touch()
                logger.info("Backend reload trigger: Touched app/__init__.py - uvicorn will reload automatically (if running with --reload flag)")
            
            # Method 2: Create a reload flag file (can be watched by external process manager)
            reload_flag_file = backend_dir / ".reload"
            try:
                with open(reload_flag_file, 'w') as f:
                    f.write(str(time.time()))
                logger.info("Backend reload trigger: Created .reload flag file")
            except Exception as flag_error:
                logger.debug(f"Could not create reload flag file: {flag_error}")
            
            # Note: We don't send SIGHUP signal as it can cause "Address already in use" errors
            # if the old process hasn't released the port yet. Uvicorn's file watcher handles
            # this more gracefully by waiting for the old process to finish.
                
        except Exception as reload_error:
            logger.warning(f"Could not trigger backend reload: {reload_error}")
            # Don't fail the request if reload trigger fails
            # User can manually restart the server if needed
        
        return SettingsResponse(
            success=True,
            message="Settings saved successfully to database" + (" and admin user created in users table" if admin_user_created else "") + ". Backend will reload automatically.",
            env_file_path=str(env_file_path)
        )
        
    except Exception as e:
            logger.error(f"Error saving settings: {e}", exc_info=True)
            if settings_db_session is not None:
                try:
                    settings_db_session.close()
                except:
                    pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save settings: {str(e)}"
            )

@router.get("/check-configured", response_model=ConfiguredResponse)
def check_configured():
    """
    Simple check if the application is configured.
    Queries database for 'app_configured' key and checks if value is true.
    No authentication required.
    """
    try:
        # Query default database for app_configured key
        default_db = SessionLocal()
        try:
            app_setting = default_db.query(models.ApplicationSettings).filter(
                models.ApplicationSettings.key == 'app_configured'
            ).first()
            
            if app_setting:
                # Key exists, check the value
                value = app_setting.value
                logger.info(f"Found app_configured: value='{value}' (type: {type(value)})")
                
                # Check if value is true (handle string, boolean, JSON)
                is_true = False
                if value is True:
                    is_true = True
                elif isinstance(value, str):
                    # Try JSON parse first
                    try:
                        parsed = json.loads(value)
                        if parsed is True:
                            is_true = True
                    except:
                        # Not JSON, check as string
                        if value.lower().strip() in ['true', '1', 'yes']:
                            is_true = True
                elif isinstance(value, bool) and value:
                    is_true = True
                
                if is_true:
                    logger.info("App is configured")
                    return ConfiguredResponse(
                        configured=True,
                        message="Application is configured"
                    )
                else:
                    logger.info(f"App is not configured (value is not true: '{value}')")
                    return ConfiguredResponse(
                        configured=False,
                        message="Application is not configured"
                    )
            else:
                # Key does not exist
                logger.info("app_configured key not found in database")
                return ConfiguredResponse(
                    configured=False,
                    message="Application is not configured"
                )
        finally:
            default_db.close()
            
    except Exception as e:
        logger.error(f"Error checking configuration: {e}", exc_info=True)
        return ConfiguredResponse(
            configured=False,
            message=f"Error checking configuration: {str(e)}"
        )

@router.get("/", response_model=Dict[str, Any])
def get_settings(
    current_user: Optional[models.User] = Depends(get_current_user)
):
    """
    Get current no-code application settings from database.
    DATABASE_URL is read from .env file, all other settings from database.
    
    Authentication:
    - Admin users can always access settings
    - Non-authenticated users can access during initial setup only
    """
    
    # Check if user is authenticated
    is_authenticated = current_user is not None
    
    # If authenticated, verify user is admin
    if is_authenticated:
        if not current_user.is_admin or current_user.is_admin != 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin users can view settings"
            )
    else:
        # Not authenticated - check if app is already configured
        # If configured, require authentication
        try:
            default_db = SessionLocal()
            try:
                app_setting = default_db.query(models.ApplicationSettings).filter(
                    models.ApplicationSettings.key == 'app_configured'
                ).first()
                
                if app_setting:
                    # Try to parse the value
                    value = app_setting.value
                    is_configured = False
                    if value is True:
                        is_configured = True
                    elif isinstance(value, str):
                        try:
                            parsed = json.loads(value)
                            if parsed is True:
                                is_configured = True
                        except:
                            if value.lower().strip() in ['true', '1', 'yes']:
                                is_configured = True
                    
                    if is_configured:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Application is already configured. Please login as admin to view settings."
                        )
            finally:
                default_db.close()
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not check app configuration status: {e}")
            # Continue with initial setup if check fails
    
    try:
        # Load settings from database
        settings = {}
        try:
            default_db = SessionLocal()
            try:
                settings = load_settings_from_database(default_db)
                logger.info("Settings loaded from database")
            finally:
                default_db.close()
        except Exception as db_error:
            logger.warning(f"Could not load settings from database: {db_error}")
            settings = {}
        
        # Initialize default structure if empty
        if not settings:
            settings = {
                "admin_email": None,
                "cloud_provider": None,
                "cloud_region": None,
                "cloud_access_key": None,
                "cloud_secret_key": None,
                "database_type": None,
                "database_username": None,
                "database_password": None,
                "database_host": None,
                "database_port": None,
                "database_name": None,
                "environment_variables": {}
            }
        
        # DATABASE_URL is read from .env file (not from database)
        backend_dir = Path(__file__).parent.parent
        project_root = backend_dir.parent
        env_file_path = project_root / ".env"
        
        # Read DATABASE_URL from .env if it exists
        if env_file_path.exists():
            with open(env_file_path, 'r') as f:
                content = f.read()
                for line in content.split('\n'):
                    line = line.strip()
                    if line and not line.startswith('#') and line.startswith('DATABASE_URL='):
                        _, db_url = line.split('=', 1)
                        db_url = db_url.strip().strip('"').strip("'")
                        # Parse DATABASE_URL to extract components if not already in settings
                        if db_url and not settings.get('database_type'):
                            # Try to parse the URL to populate database fields
                            try:
                                if db_url.startswith('postgresql://'):
                                    # postgresql://user:pass@host:port/dbname
                                    parts = db_url.replace('postgresql://', '').split('@')
                                    if len(parts) == 2:
                                        user_pass = parts[0].split(':')
                                        host_db = parts[1].split('/')
                                        if len(host_db) == 2:
                                            host_port = host_db[0].split(':')
                                            if not settings.get('database_type'):
                                                settings['database_type'] = 'postgresql'
                                            if not settings.get('database_username') and len(user_pass) > 0:
                                                settings['database_username'] = user_pass[0]
                                            if not settings.get('database_password') and len(user_pass) > 1:
                                                settings['database_password'] = user_pass[1]
                                            if not settings.get('database_host') and len(host_port) > 0:
                                                settings['database_host'] = host_port[0]
                                            if not settings.get('database_port') and len(host_port) > 1:
                                                settings['database_port'] = host_port[1]
                                            if not settings.get('database_name'):
                                                settings['database_name'] = host_db[1]
                            except Exception as parse_error:
                                logger.warning(f"Could not parse DATABASE_URL: {parse_error}")
                        break
        
        return settings
        
    except Exception as e:
        logger.error(f"Error loading settings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load settings: {str(e)}"
        )

