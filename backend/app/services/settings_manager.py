"""
Settings manager for storing and retrieving application settings from database.
"""
import logging
import os
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
from app import models

logger = logging.getLogger(__name__)

def create_database_engine_from_settings(
    database_type: str,
    database_username: str,
    database_password: str,
    database_host: str,
    database_port: str,
    database_name: str
):
    """Create a SQLAlchemy engine from database settings."""
    if database_type == 'postgresql':
        database_url = f"postgresql://{database_username}:{database_password}@{database_host}:{database_port}/{database_name}"
    elif database_type == 'mysql':
        database_url = f"mysql+pymysql://{database_username}:{database_password}@{database_host}:{database_port}/{database_name}"
    elif database_type == 'sqlite':
        database_url = f"sqlite:///{database_name}"
    elif database_type == 'mongodb':
        # MongoDB uses different connection, but for now we'll skip it
        raise ValueError("MongoDB not supported for settings storage")
    else:
        raise ValueError(f"Unsupported database type: {database_type}")
    
    return create_engine(database_url, pool_pre_ping=True)

def run_database_migrations(database_url: str, database_type: str, project_root: Path):
    """
    Run Alembic migrations on the target database.
    """
    try:
        # Create a temporary alembic.ini or use existing one
        alembic_dir = project_root / "backend" / "alembic"
        if not alembic_dir.exists():
            logger.warning("Alembic directory not found, skipping migrations")
            return False, "Alembic not configured"
        
        # Set environment variable for database URL
        env = os.environ.copy()
        env['DATABASE_URL'] = database_url
        
        # Run alembic upgrade head
        result = subprocess.run(
            ['alembic', 'upgrade', 'head'],
            cwd=project_root / "backend",
            env=env,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            logger.info("Database migrations completed successfully")
            return True, "Migrations completed successfully"
        else:
            logger.error(f"Migration failed: {result.stderr}")
            return False, f"Migration failed: {result.stderr}"
            
    except subprocess.TimeoutExpired:
        logger.error("Migration timed out")
        return False, "Migration timed out"
    except Exception as e:
        logger.error(f"Error running migrations: {e}", exc_info=True)
        return False, f"Error running migrations: {str(e)}"

def ensure_settings_table(engine):
    """Ensure the application_settings table exists in the database."""
    try:
        # Create all tables (this will create application_settings if it doesn't exist)
        models.Base.metadata.create_all(bind=engine)
        logger.info("Settings table ensured")
        return True
    except Exception as e:
        logger.error(f"Error ensuring settings table: {e}", exc_info=True)
        return False

def save_settings_to_database(
    db_session: Session,
    settings: Dict[str, Any]
) -> bool:
    """
    Save all settings to the database.
    Settings are stored as key-value pairs in application_settings table.
    """
    def convert_to_serializable(obj):
        """Recursively convert Pydantic models and objects to serializable format."""
        if obj is None:
            return None
        
        # Check if it's a Pydantic model
        if hasattr(obj, 'dict'):
            return convert_to_serializable(obj.dict())
        elif hasattr(obj, 'model_dump'):  # Pydantic v2
            return convert_to_serializable(obj.model_dump())
        elif isinstance(obj, dict):
            return {k: convert_to_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_to_serializable(item) for item in obj]
        elif isinstance(obj, (str, int, float, bool)):
            return obj
        else:
            # For any other type, convert to string
            return str(obj)
    
    try:
        for key, value in settings.items():
            # Save all values including empty strings (to clear fields)
            # Only skip None values
            if value is None:
                continue
            
            # Convert to serializable format
            serializable_value = convert_to_serializable(value)
            
            # Convert to JSON string - handle booleans specially to preserve them
            if isinstance(serializable_value, bool):
                # Save boolean as JSON boolean (true/false)
                value_str = json.dumps(serializable_value)
            elif isinstance(serializable_value, (dict, list)):
                value_str = json.dumps(serializable_value, default=str)
            else:
                value_str = str(serializable_value)
            
            # Check if setting exists
            existing = db_session.query(models.ApplicationSettings).filter(
                models.ApplicationSettings.key == key
            ).first()
            
            if existing:
                # Update existing setting
                existing.value = value_str
                # updated_at will be set automatically by SQLAlchemy onupdate
            else:
                # Create new setting
                new_setting = models.ApplicationSettings(
                    key=key,
                    value=value_str
                )
                db_session.add(new_setting)
        
        db_session.commit()
        logger.info("Settings saved to database successfully")
        return True
        
    except Exception as e:
        db_session.rollback()
        logger.error(f"Error saving settings to database: {e}", exc_info=True)
        return False

def load_settings_from_database(db_session: Session) -> Dict[str, Any]:
    """
    Load all settings from the database.
    """
    settings = {}
    try:
        all_settings = db_session.query(models.ApplicationSettings).all()
        for setting in all_settings:
            # Try to parse JSON, otherwise use as string
            try:
                parsed_value = json.loads(setting.value)
                # Handle boolean values - JSON booleans are already True/False
                if isinstance(parsed_value, bool):
                    settings[setting.key] = parsed_value
                # Handle boolean strings like "True" or "False"
                elif isinstance(parsed_value, str):
                    if parsed_value.lower() == 'true':
                        settings[setting.key] = True
                    elif parsed_value.lower() == 'false':
                        settings[setting.key] = False
                    else:
                        settings[setting.key] = parsed_value
                else:
                    settings[setting.key] = parsed_value
            except (json.JSONDecodeError, TypeError):
                # If not JSON, check if it's a boolean string
                value_str = str(setting.value)
                if value_str.lower() == 'true':
                    settings[setting.key] = True
                elif value_str.lower() == 'false':
                    settings[setting.key] = False
                else:
                    settings[setting.key] = setting.value
        
        logger.info(f"Loaded {len(settings)} settings from database")
        return settings
        
    except Exception as e:
        logger.error(f"Error loading settings from database: {e}", exc_info=True)
        return {}

def clear_env_file(env_file_path: Path) -> bool:
    """
    Clear the .env file after settings are saved to database.
    """
    try:
        if env_file_path.exists():
            # Instead of deleting, we'll clear its contents
            with open(env_file_path, 'w') as f:
                f.write("# Settings are now stored in the database\n")
                f.write("# This file is kept for reference but is no longer used\n")
            logger.info(f"Cleared .env file: {env_file_path}")
            return True
        return True  # File doesn't exist, which is fine
    except Exception as e:
        logger.error(f"Error clearing .env file: {e}", exc_info=True)
        return False

