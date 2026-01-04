from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from app import models, schemas
from app.auth import get_current_user
from app.database import get_db
from app.services.code_generator import generate_react_fastapi_app, delete_generated_app
import logging
import re
import os

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
    
    # If database configuration is provided, generate database setup immediately
    if db_project.database_type and db_project.database_url and db_project.frontend_framework and db_project.backend_framework:
        try:
            from app.services.database_config import generate_database_config
            from app.services.code_generator import GENERATED_APPS_DIR
            from pathlib import Path
            
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
            logger.error(f"Error generating database configuration: {e}")
            # Don't fail project creation if database setup fails
    
    return db_project

@router.get("/", response_model=List[schemas.ProjectResponse])
def read_projects(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    projects = db.query(models.Project).filter(models.Project.user_id == current_user.id).offset(skip).limit(limit).all()
    return projects

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def read_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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
                
                if components:
                    result = generate_react_fastapi_app(
                        project_id=project.id,
                        project_name=update_data.get('name') or project.name,
                        components=components,
                        css_content=css_content,
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
            SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
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
                SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
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
    
    return {"message": "Project deleted successfully"}

