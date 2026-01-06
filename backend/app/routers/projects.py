from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from app import models, schemas
from app.auth import get_current_user
from app.database import get_db
from app.services.code_generator import generate_react_fastapi_app, delete_generated_app, GENERATED_APPS_DIR
import logging
import re
import os
import subprocess
import socket
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.post("/", response_model=schemas.ProjectResponse)
def create_project(
    project: schemas.ProjectCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_project = models.Project(**project.dict(), user_id=current_user.id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # If database configuration is provided, create database and generate setup
    if db_project.database_type and db_project.database_username and db_project.database_password:
        try:
            from app.services.database_manager import create_database_and_grant_permissions, check_database_exists
            from app.services.database_config import generate_database_config
            from app.services.code_generator import GENERATED_APPS_DIR
            from pathlib import Path
            
            # Determine database name (use provided name or generate from project name)
            database_name = db_project.database_name
            if not database_name:
                safe_name = "".join(c for c in db_project.name if c.isalnum() or c in (' ', '-', '_')).strip()
                database_name = safe_name.replace(' ', '_').lower()
                # Update project with generated database name
                db_project.database_name = database_name
                db.commit()
            
            # Get admin database credentials from settings (for creating databases/users)
            admin_db_username = None
            admin_db_password = None
            try:
                from app.services.settings_loader import get_setting
                admin_db_username = get_setting('database_username')
                admin_db_password = get_setting('database_password')
            except Exception as e:
                logger.debug(f"Could not load admin database credentials from settings: {e}")
            
            # Check if database exists
            db_exists, conn_success = check_database_exists(
                db_project.database_type,
                db_project.database_host or 'localhost',
                db_project.database_port or ('5432' if db_project.database_type == 'postgresql' else '3306' if db_project.database_type == 'mysql' else '27017'),
                database_name,
                db_project.database_username,
                db_project.database_password
            )
            
            # Always try to create database and user (function will check if they exist)
            # This ensures the user exists and has proper permissions
            success, message = create_database_and_grant_permissions(
                db_project.database_type,
                db_project.database_host or 'localhost',
                db_project.database_port or ('5432' if db_project.database_type == 'postgresql' else '3306' if db_project.database_type == 'mysql' else '27017'),
                database_name,
                db_project.database_username,
                db_project.database_password,
                admin_username=admin_db_username,
                admin_password=admin_db_password
            )
            
            if success:
                logger.info(f"Database and user verified/created for project {db_project.id}: {message}")
            else:
                logger.warning(f"Failed to create/verify database for project {db_project.id}: {message}")
                # Continue anyway - database might already exist or be created manually
            
            # Generate database URL if not provided
            if not db_project.database_url:
                if db_project.database_type == 'postgresql':
                    db_project.database_url = f"postgresql://{db_project.database_username}:{db_project.database_password}@{db_project.database_host or 'localhost'}:{db_project.database_port or '5432'}/{database_name}"
                elif db_project.database_type == 'mysql':
                    db_project.database_url = f"mysql://{db_project.database_username}:{db_project.database_password}@{db_project.database_host or 'localhost'}:{db_project.database_port or '3306'}/{database_name}"
                elif db_project.database_type == 'sqlite':
                    db_project.database_url = f"sqlite:///{database_name}"
                elif db_project.database_type == 'mongodb':
                    db_project.database_url = f"mongodb://{db_project.database_username}:{db_project.database_password}@{db_project.database_host or 'localhost'}:{db_project.database_port or '27017'}/{database_name}"
                
                db.commit()
            
            # Generate database configuration files if frontend and backend frameworks are set
            if db_project.frontend_framework and db_project.backend_framework:
                # Create backend directory structure
                safe_name = "".join(c for c in db_project.name if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_name = safe_name.replace(' ', '_').lower()
                project_dir = Path(GENERATED_APPS_DIR) / f"project_{db_project.id}_{safe_name}"
                backend_dir = project_dir / "backend"
                backend_dir.mkdir(parents=True, exist_ok=True)
                
                # Generate database configuration
                generate_database_config(backend_dir, db_project.database_type, db_project.database_url, db_project.name)
                logger.info(f"Generated database configuration for project {db_project.id}")
        except Exception as e:
            logger.error(f"Error setting up database for project {db_project.id}: {e}", exc_info=True)
            # Don't fail project creation if database setup fails
    
    return db_project

@router.get("/", response_model=List[schemas.ProjectResponse])
def read_projects(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Admin users can see all projects, regular users only see their own
    if current_user.is_admin == 1:
        projects = db.query(models.Project).offset(skip).limit(limit).all()
    else:
        projects = db.query(models.Project).filter(models.Project.user_id == current_user.id).offset(skip).limit(limit).all()
    return projects

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def read_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Admin users can access any project, regular users only their own
    if current_user.is_admin == 1:
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
    else:
        project = db.query(models.Project).filter(
            models.Project.id == project_id,
            models.Project.user_id == current_user.id
        ).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.put("/{project_id}", response_model=schemas.ProjectResponse)
def update_project(
    project_id: int,
    project_update: schemas.ProjectUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Admin users can update any project, regular users only their own
    if current_user.is_admin == 1:
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
    else:
        project = db.query(models.Project).filter(
            models.Project.id == project_id,
            models.Project.user_id == current_user.id
        ).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = project_update.dict(exclude_unset=True)
    
    # Generate application code if frameworks are selected
    # Use updated data if available, otherwise fall back to existing project data
    frontend_framework = update_data.get('frontend_framework') or project.frontend_framework
    backend_framework = update_data.get('backend_framework') or project.backend_framework
    
    if frontend_framework and backend_framework:
        if frontend_framework == 'react' and backend_framework == 'fastapi':
            try:
                # Get components from UPDATED configuration or component_tree first, then fall back to existing
                components = []
                configuration = update_data.get('configuration') or project.configuration
                component_tree = update_data.get('component_tree') or project.component_tree
                css_content = update_data.get('css_content') or project.css_content or ""
                
                if configuration and isinstance(configuration, dict):
                    components = configuration.get('components', [])
                elif component_tree:
                    if isinstance(component_tree, list):
                        components = component_tree
                    elif isinstance(component_tree, dict):
                        components = [component_tree]
                
                # Extract pages from configuration
                pages = None
                if configuration and isinstance(configuration, dict):
                    pages = configuration.get('pages', [])
                
                if components:
                    result = generate_react_fastapi_app(
                        project_id=project.id,
                        project_name=update_data.get('name') or project.name,
                        components=components,
                        css_content=css_content,
                        pages=pages,
                        database_type=update_data.get('database_type') or project.database_type,
                        database_url=update_data.get('database_url') or project.database_url
                    )
                    update_data['application_url'] = result['application_url']
                    logger.info(f"Generated application for project {project.id}: {result['application_url']}")
            except Exception as e:
                logger.error(f"Error generating application code: {str(e)}")
                # Don't fail the save if code generation fails
    
    for field, value in update_data.items():
        setattr(project, field, value)
    
    db.commit()
    db.refresh(project)
    return project

@router.get("/{project_id}/preview", response_class=HTMLResponse)
def preview_project(
    request: Request,
    project_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Preview endpoint that renders the project as HTML.
    This allows viewing the generated application without running it separately.
    Accepts token as query parameter for authentication when opening in new tab.
    """
    from fastapi.responses import HTMLResponse
    from fastapi import Request
    from jose import jwt, JWTError
    from app.auth import oauth2_scheme
    import os
    
    current_user = None
    
    # Try to get user from token query parameter (for new tab requests)
    if token:
        try:
            from app.services.settings_loader import get_secret_key
            SECRET_KEY = get_secret_key()
            ALGORITHM = "HS256"
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")  # JWT uses email as sub, not user_id
            if email:
                current_user = db.query(models.User).filter(models.User.email == email).first()
        except (JWTError, ValueError, TypeError) as e:
            logger.warning(f"Token verification failed: {e}")
    
    # If no user from token, try to get from Authorization header (for same-origin requests)
    if not current_user and request:
        try:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token_from_header = auth_header.split(" ")[1]
                from app.services.settings_loader import get_secret_key
                SECRET_KEY = get_secret_key()
                ALGORITHM = "HS256"
                payload = jwt.decode(token_from_header, SECRET_KEY, algorithms=[ALGORITHM])
                email: str = payload.get("sub")
                if email:
                    current_user = db.query(models.User).filter(models.User.email == email).first()
        except Exception as e:
            logger.debug(f"Could not get user from header: {e}")
            pass
    
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required. Please provide a token.")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get components from configuration or component_tree
    components = []
    if project.configuration and isinstance(project.configuration, dict):
        components = project.configuration.get('components', [])
    elif project.component_tree:
        if isinstance(project.component_tree, list):
            components = project.component_tree
        elif isinstance(project.component_tree, dict):
            components = [project.component_tree]
    
    # Generate HTML from components
    html_content = generate_preview_html(components, project.css_content or "")
    
    return HTMLResponse(content=html_content)

def generate_preview_html(components: List[Dict[str, Any]], css_content: str) -> str:
    """Generate HTML preview from components."""
    # Create a map of all components by ID for easy lookup
    components_map = {comp.get('id'): comp for comp in components}
    
    def render_component(comp: Dict[str, Any], depth: int = 0) -> str:
        if depth > 50:  # Prevent infinite recursion
            return ""
        
        comp_type = comp.get('type', 'div')
        props = comp.get('props', {})
        style = props.get('style', {})
        children = props.get('children', '')
        
        # Build style string
        style_str = ""
        if style:
            style_parts = []
            for key, value in style.items():
                # Convert camelCase to kebab-case for CSS
                css_key = re.sub(r'([A-Z])', r'-\1', key).lower()
                # Escape quotes in values
                value_str = str(value).replace('"', '&quot;')
                style_parts.append(f"{css_key}: {value_str}")
            style_str = f' style="{"; ".join(style_parts)}"'
        
        # Build other attributes
        attrs = []
        if props.get('className'):
            attrs.append(f'class="{props["className"]}"')
        if props.get('id'):
            attrs.append(f'id="{props["id"]}"')
        if props.get('href'):
            attrs.append(f'href="{props["href"]}"')
        if props.get('src'):
            attrs.append(f'src="{props["src"]}"')
        if props.get('alt'):
            attrs.append(f'alt="{props["alt"]}"')
        if props.get('placeholder'):
            attrs.append(f'placeholder="{props["placeholder"]}"')
        if props.get('type'):
            attrs.append(f'type="{props["type"]}"')
        if props.get('disabled'):
            attrs.append('disabled')
        if props.get('required'):
            attrs.append('required')
        
        attrs_str = " " + " ".join(attrs) if attrs else ""
        
        # Handle children - check both props.children and component children
        children_html = ""
        
        # First, check if there are child components by parentId
        comp_id = comp.get('id')
        child_components = [c for c in components if c.get('parentId') == comp_id]
        
        # Then check props.children (for nested structures like navbars, forms)
        if isinstance(children, str):
            children_html = children
        elif isinstance(children, list):
            # Render children from props.children
            children_html = "".join([render_component(child, depth + 1) if isinstance(child, dict) else str(child) for child in children])
        
        # Also render child components found by parentId
        if child_components:
            children_html += "".join([render_component(child_comp, depth + 1) for child_comp in child_components])
        
        if children_html:
            return f"<{comp_type}{attrs_str}{style_str}>{children_html}</{comp_type}>"
        else:
            return f"<{comp_type}{attrs_str}{style_str} />"
    
    # Filter root components (no parentId)
    root_components = [comp for comp in components if not comp.get('parentId')]
    components_html = "".join([render_component(comp) for comp in root_components])
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Preview</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }}
        {css_content}
    </style>
</head>
<body>
    {components_html}
</body>
</html>"""
    
    return html

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Admin users can delete any project, regular users only their own
    if current_user.is_admin == 1:
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
    else:
        project = db.query(models.Project).filter(
            models.Project.id == project_id,
            models.Project.user_id == current_user.id
        ).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Store project name before deletion for cleanup
    project_name = project.name
    
    # Delete the project from database
    db.delete(project)
    db.commit()
    
    # Delete generated application files if they exist
    try:
        delete_generated_app(project_id, project_name)
        logger.info(f"Deleted generated app for project {project_id} ({project_name})")
    except Exception as e:
        # Log error but don't fail the delete operation
        logger.error(f"Failed to delete generated app for project {project_id}: {e}")
    
    # Stop Docker containers if running
    try:
        stop_project_containers(project_id, project_name)
    except Exception as e:
        logger.warning(f"Could not stop containers for project {project_id}: {e}")
    
    return {"message": "Project deleted successfully"}

def find_free_port(start_port: int = 3000, max_attempts: int = 100) -> int:
    """Find a free port starting from start_port."""
    for i in range(max_attempts):
        port = start_port + i
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('localhost', port))
                return port
            except OSError:
                continue
    raise Exception(f"Could not find free port starting from {start_port}")

def update_docker_compose_ports(project_dir: Path, frontend_port: int, backend_port: int):
    """Update docker-compose.yml with new ports."""
    docker_compose_file = project_dir / "docker-compose.yml"
    if not docker_compose_file.exists():
        return
    
    try:
        with open(docker_compose_file, 'r') as f:
            content = f.read()
        
        # Update frontend port
        content = re.sub(
            r'ports:\s*\n\s*-\s*"\d+:3000"',
            f'ports:\n      - "{frontend_port}:3000"',
            content,
            flags=re.MULTILINE
        )
        
        # Update backend port
        content = re.sub(
            r'ports:\s*\n\s*-\s*"\d+:8000"',
            f'ports:\n      - "{backend_port}:8000"',
            content,
            flags=re.MULTILINE
        )
        
        # Update REACT_APP_API_URL if present
        content = re.sub(
            r'REACT_APP_API_URL=http://localhost:\d+',
            f'REACT_APP_API_URL=http://localhost:{backend_port}',
            content
        )
        
        with open(docker_compose_file, 'w') as f:
            f.write(content)
    except Exception as e:
        logger.error(f"Error updating docker-compose.yml: {e}")

def get_docker_compose_cmd():
    """Get the docker compose command (supports both 'docker-compose' and 'docker compose')."""
    try:
        # Try 'docker compose' first (newer version)
        result = subprocess.run(['docker', 'compose', 'version'], capture_output=True, timeout=5)
        if result.returncode == 0:
            return ['docker', 'compose']
    except Exception:
        pass
    
    # Fallback to 'docker-compose'
    try:
        result = subprocess.run(['docker-compose', '--version'], capture_output=True, timeout=5)
        if result.returncode == 0:
            return ['docker-compose']
    except Exception:
        pass
    
    # Check if Docker is available at all
    try:
        result = subprocess.run(['docker', '--version'], capture_output=True, timeout=5)
        if result.returncode != 0:
            raise Exception("Docker is not installed or not accessible")
    except Exception as e:
        raise Exception(f"Docker is not available: {str(e)}")
    
    # Default to 'docker compose' (assume it's available)
    return ['docker', 'compose']

def stop_project_containers(project_id: int, project_name: str):
    """Stop Docker containers for a project."""
    safe_name = "".join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_name = safe_name.replace(' ', '_').lower()
    project_dir = Path(GENERATED_APPS_DIR) / f"project_{project_id}_{safe_name}"
    
    if not project_dir.exists():
        return
    
    docker_compose_file = project_dir / "docker-compose.yml"
    if not docker_compose_file.exists():
        return
    
    try:
        docker_cmd = get_docker_compose_cmd()
        # Stop and remove containers
        subprocess.run(
            docker_cmd + ['down'],
            cwd=project_dir,
            capture_output=True,
            timeout=30
        )
        logger.info(f"Stopped containers for project {project_id}")
    except Exception as e:
        logger.warning(f"Error stopping containers: {e}")

def check_containers_running(project_dir: Path) -> Tuple[bool, Optional[int], Optional[int]]:
    """
    Check if Docker containers are already running for this project.
    Returns (is_running, frontend_port, backend_port)
    """
    try:
        docker_cmd = get_docker_compose_cmd()
        
        # Get project name from directory
        project_name = project_dir.name
        
        # Check using docker-compose ps
        ps_result = subprocess.run(
            docker_cmd + ['ps', '--format', 'json'],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if ps_result.returncode != 0:
            return False, None, None
        
        # Parse container status
        running_containers = []
        for line in ps_result.stdout.strip().split('\n'):
            if line.strip():
                try:
                    import json
                    container_info = json.loads(line)
                    state = container_info.get('State', '').lower()
                    if state == 'running':
                        running_containers.append(container_info)
                except:
                    pass
        
        # Check if both frontend and backend are running
        has_frontend = any('frontend' in c.get('Service', '').lower() for c in running_containers)
        has_backend = any('backend' in c.get('Service', '').lower() for c in running_containers)
        
        if has_frontend and has_backend:
            # Extract ports from docker-compose.yml
            frontend_port = None
            backend_port = None
            
            docker_compose_file = project_dir / "docker-compose.yml"
            if docker_compose_file.exists():
                with open(docker_compose_file, 'r') as f:
                    content = f.read()
                    # Extract frontend port (format: "3001:3000")
                    frontend_match = re.search(r'"(\d+):3000"', content)
                    if frontend_match:
                        frontend_port = int(frontend_match.group(1))
                    # Extract backend port (format: "8001:8000")
                    backend_match = re.search(r'"(\d+):8000"', content)
                    if backend_match:
                        backend_port = int(backend_match.group(1))
            
            # If we found both containers running and have ports, return success
            if frontend_port and backend_port:
                return True, frontend_port, backend_port
        
        return False, None, None
    except Exception as e:
        logger.warning(f"Error checking container status: {e}")
        return False, None, None

@router.post("/{project_id}/start", response_model=Dict[str, Any])
async def start_project_app(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Start the project application using Docker Compose.
    Always rebuilds the application and uses existing ports if available.
    """
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.frontend_framework or not project.backend_framework:
        raise HTTPException(
            status_code=400,
            detail="Project must have frontend and backend frameworks configured"
        )
    
    # Find project directory
    safe_name = "".join(c for c in project.name if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_name = safe_name.replace(' ', '_').lower()
    project_dir = Path(GENERATED_APPS_DIR) / f"project_{project_id}_{safe_name}"
    
    if not project_dir.exists():
        raise HTTPException(
            status_code=404,
            detail="Generated application not found. Please save the project first."
        )
    
    docker_compose_file = project_dir / "docker-compose.yml"
    if not docker_compose_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Docker Compose file not found. Please regenerate the project."
        )
    
    try:
        # Get existing ports from docker-compose.yml if they exist
        frontend_port = None
        backend_port = None
        
        if docker_compose_file.exists():
            with open(docker_compose_file, 'r') as f:
                content = f.read()
                # Extract frontend port (format: "3001:3000")
                frontend_match = re.search(r'"(\d+):3000"', content)
                if frontend_match:
                    frontend_port = int(frontend_match.group(1))
                # Extract backend port (format: "8001:8000")
                backend_match = re.search(r'"(\d+):8000"', content)
                if backend_match:
                    backend_port = int(backend_match.group(1))
        
        # If ports don't exist, find free ports
        if not frontend_port:
            frontend_port = find_free_port(3000)
        if not backend_port:
            backend_port = find_free_port(8000)
        
        # Update docker-compose.yml with ports (only if they changed)
        update_docker_compose_ports(project_dir, frontend_port, backend_port)
        
        # Get docker compose command
        docker_cmd = get_docker_compose_cmd()
        
        # Stop any existing containers first
        try:
            subprocess.run(
                docker_cmd + ['down'],
                cwd=project_dir,
                capture_output=True,
                timeout=30
            )
        except Exception:
            pass
        
        # Always rebuild containers to ensure latest code is used
        build_result = subprocess.run(
            docker_cmd + ['build', '--no-cache'],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )
        
        if build_result.returncode != 0:
            logger.error(f"Docker build failed: {build_result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to build Docker containers: {build_result.stderr[:500]}"
            )
        
        # Start containers in detached mode
        start_result = subprocess.run(
            docker_cmd + ['up', '-d'],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if start_result.returncode != 0:
            logger.error(f"Docker start failed: {start_result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start Docker containers: {start_result.stderr[:500]}"
            )
        
        # Update application URL in database
        from app.services.settings_loader import get_base_url
        base_url = get_base_url()
        application_url = f"{base_url}:{frontend_port}"
        project.application_url = application_url
        db.commit()
        
        logger.info(f"Started project {project_id} on port {frontend_port}")
        
        return {
            "success": True,
            "application_url": application_url,
            "frontend_port": frontend_port,
            "backend_port": backend_port,
            "message": "Application started successfully"
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=500,
            detail="Docker operation timed out. Please try again."
        )
    except Exception as e:
        logger.error(f"Error starting project {project_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start application: {str(e)}"
        )

@router.post("/{project_id}/stop")
async def stop_project_app(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stop the project application Docker containers."""
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        stop_project_containers(project_id, project.name)
        return {"success": True, "message": "Application stopped successfully"}
    except Exception as e:
        logger.error(f"Error stopping project {project_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop application: {str(e)}"
        )

