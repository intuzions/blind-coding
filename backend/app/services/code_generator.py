"""
Code generation service for creating React + FastAPI applications from canvas components.
"""
import os
import json
import re
import shutil
from typing import Dict, List, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Base directory for generated applications
GENERATED_APPS_DIR = os.getenv("GENERATED_APPS_DIR", "./generated_apps")

def generate_react_fastapi_app(
    project_id: int,
    project_name: str,
    components: List[Dict[str, Any]],
    css_content: str = "",
    database_type: Optional[str] = None,
    database_url: Optional[str] = None
) -> Dict[str, str]:
    """
    Generate a React + FastAPI application from canvas components.
    
    Returns:
        Dict with 'frontend_path', 'backend_path', and 'application_url'
    """
    # Sanitize project name for directory
    safe_name = "".join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_name = safe_name.replace(' ', '_').lower()
    
    project_dir = Path(GENERATED_APPS_DIR) / f"project_{project_id}_{safe_name}"
    frontend_dir = project_dir / "frontend"
    backend_dir = project_dir / "backend"
    
    # Create directories
    project_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    backend_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate React frontend
    generate_react_app(frontend_dir, project_name, components, css_content)
    
    # Generate FastAPI backend
    generate_fastapi_app(backend_dir, project_name)
    
    # Generate database configuration if provided
    if database_type and database_url:
        from app.services.database_config import generate_database_config
        generate_database_config(backend_dir, database_type, database_url, project_name)
    
    # Generate docker-compose and README
    generate_docker_compose(project_dir, project_id)
    generate_readme(project_dir, project_name, project_id)
    
    # Application URL - point to preview endpoint in the main backend
    # This allows viewing the generated app without running it separately
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    application_url = f"{base_url}/api/projects/{project_id}/preview"
    
    return {
        'frontend_path': str(frontend_dir),
        'backend_path': str(backend_dir),
        'application_url': application_url
    }

def generate_react_app(
    frontend_dir: Path,
    project_name: str,
    components: List[Dict[str, Any]],
    css_content: str
):
    """Generate React application files."""
    # package.json
    package_json = {
        "name": project_name.lower().replace(' ', '-'),
        "version": "0.1.0",
        "private": True,
        "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "react-scripts": "5.0.1"
        },
        "scripts": {
            "start": "react-scripts start",
            "build": "react-scripts build",
            "test": "react-scripts test",
            "eject": "react-scripts eject"
        },
        "eslintConfig": {
            "extends": ["react-app"]
        },
        "browserslist": {
            "production": [">0.2%", "not dead", "not op_mini all"],
            "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
        }
    }
    
    with open(frontend_dir / "package.json", "w") as f:
        json.dump(package_json, f, indent=2)
    
    # public/index.html
    public_dir = frontend_dir / "public"
    public_dir.mkdir(exist_ok=True)
    
    index_html = f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="{project_name}" />
    <title>{project_name}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
"""
    
    with open(public_dir / "index.html", "w") as f:
        f.write(index_html)
    
    # src/index.js
    src_dir = frontend_dir / "src"
    src_dir.mkdir(exist_ok=True)
    
    index_js = """import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
"""
    
    with open(src_dir / "index.js", "w") as f:
        f.write(index_js)
    
    # src/index.css
    index_css = """* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
"""
    
    with open(src_dir / "index.css", "w") as f:
        f.write(index_css)
    
    # src/App.js - Convert components to React
    app_js = generate_react_components(components, css_content)
    
    with open(src_dir / "App.js", "w") as f:
        f.write(app_js)
    
    # .gitignore
    gitignore = """# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# production
/build

# misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local

npm-debug.log*
yarn-debug.log*
yarn-error.log*
"""
    
    with open(frontend_dir / ".gitignore", "w") as f:
        f.write(gitignore)

def generate_react_components(components: List[Dict[str, Any]], css_content: str) -> str:
    """Convert canvas components to React JSX."""
    css_section = f"""
      <style dangerouslySetInnerHTML={{__html: `
{css_content}
`}} />
"""
    
    component_code = """import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
""" + css_section + """
      {renderComponents()}
    </div>
  );
}

function renderComponents() {
  return (
    <>
"""
    
    # Filter root components (no parentId)
    root_components = [comp for comp in components if not comp.get('parentId')]
    
    for comp in root_components:
        component_code += convert_component_to_jsx(comp, 6) + "\n"
    
    component_code += """    </>
  );
}

export default App;
"""
    
    return component_code

def convert_component_to_jsx(component: Dict[str, Any], indent: int = 0) -> str:
    """Convert a component dictionary to JSX string."""
    indent_str = " " * indent
    comp_type = component.get('type', 'div')
    props = component.get('props', {})
    style = props.get('style', {})
    children = props.get('children', '')
    
    # Build style object
    style_str = "{"
    for key, value in style.items():
        # Keep camelCase for React (React expects camelCase for style properties)
        style_str += f"{key}: '{value}', "
    style_str = style_str.rstrip(', ') + "}"
    
    # Build props
    props_str = ""
    if style:
        props_str = f" style={style_str}"
    
    # Handle className
    if props.get('className'):
        props_str += f' className="{props["className"]}"'
    
    # Handle id
    if props.get('id'):
        props_str += f' id="{props["id"]}"'
    
    # Handle children
    if isinstance(children, str):
        return f"{indent_str}<{comp_type}{props_str}>{children}</{comp_type}>"
    elif isinstance(children, list):
        children_jsx = "\n".join([convert_component_to_jsx(child, indent + 2) for child in children])
        return f"{indent_str}<{comp_type}{props_str}>\n{children_jsx}\n{indent_str}</{comp_type}>"
    else:
        return f"{indent_str}<{comp_type}{props_str} />"

def generate_fastapi_app(backend_dir: Path, project_name: str):
    """Generate FastAPI backend files."""
    # main.py
    main_py = """from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="{}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {{"message": "Welcome to {} API"}}

@app.get("/health")
def health_check():
    return {{"status": "healthy"}}
""".format(project_name, project_name)
    
    with open(backend_dir / "main.py", "w") as f:
        f.write(main_py)
    
    # requirements.txt
    requirements = """fastapi==0.104.1
uvicorn[standard]==0.24.0
"""
    
    with open(backend_dir / "requirements.txt", "w") as f:
        f.write(requirements)

def generate_docker_compose(project_dir: Path, project_id: int):
    """Generate docker-compose.yml."""
    docker_compose = f"""version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - REACT_APP_API_URL=http://localhost:8000
  
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
    
    with open(project_dir / "docker-compose.yml", "w") as f:
        f.write(docker_compose)

def generate_readme(project_dir: Path, project_name: str, project_id: int):
    """Generate README.md."""
    readme = f"""# {project_name}

Generated application from No-Code Platform.

## Project ID: {project_id}

## Getting Started

### Prerequisites
- Node.js 16+
- Python 3.9+
- Docker (optional)

### Running with Docker

```bash
docker-compose up
```

### Running Manually

#### Frontend
```bash
cd frontend
npm install
npm start
```

#### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
"""
    
    with open(project_dir / "README.md", "w") as f:
        f.write(readme)

def delete_generated_app(project_id: int, project_name: str = None) -> bool:
    """
    Delete the generated application directory for a project.
    
    Args:
        project_id: The ID of the project
        project_name: Optional project name (if None, will try to find by pattern)
    
    Returns:
        True if deletion was successful or directory didn't exist, False on error
    """
    try:
        base_dir = Path(GENERATED_APPS_DIR)
        
        if not base_dir.exists():
            logger.info(f"Generated apps directory does not exist: {base_dir}")
            return True
        
        # Try to find the project directory
        project_dir = None
        
        if project_name:
            # If we have the project name, construct the exact path
            safe_name = "".join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_name = safe_name.replace(' ', '_').lower()
            exact_path = base_dir / f"project_{project_id}_{safe_name}"
            if exact_path.exists():
                project_dir = exact_path
        
        # If exact path not found, search for directories matching the pattern
        if not project_dir:
            pattern = f"project_{project_id}_*"
            matching_dirs = list(base_dir.glob(pattern))
            if matching_dirs:
                project_dir = matching_dirs[0]  # Take the first match
        
        if project_dir and project_dir.exists():
            shutil.rmtree(project_dir)
            logger.info(f"Successfully deleted generated app directory: {project_dir}")
            return True
        else:
            logger.info(f"No generated app directory found for project {project_id}")
            return True  # Not an error if it doesn't exist
    except Exception as e:
        logger.error(f"Error deleting generated app for project {project_id}: {e}")
        return False

