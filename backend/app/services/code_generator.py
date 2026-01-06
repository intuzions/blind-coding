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

# Base directory for generated applications - loaded from database
from app.services.settings_loader import get_generated_apps_dir
GENERATED_APPS_DIR = get_generated_apps_dir()

def generate_react_fastapi_app(
    project_id: int,
    project_name: str,
    components: List[Dict[str, Any]],
    css_content: str = "",
    pages: Optional[List[Dict[str, Any]]] = None,
    database_type: Optional[str] = None,
    database_url: Optional[str] = None
) -> Dict[str, str]:
    """
    Generate a React + FastAPI application from canvas components.
    
    Args:
        project_id: Project ID
        project_name: Project name
        components: List of component dictionaries
        css_content: Global CSS content
        pages: List of page dictionaries with id, name, route, componentIds
        database_type: Optional database type
        database_url: Optional database URL
    
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
    
    # Clean up unused files before generating
    cleanup_unused_files(frontend_dir, components, pages)
    
    # Generate React frontend with pages support
    generate_react_app(frontend_dir, project_name, components, css_content, pages)
    
    # Generate FastAPI backend
    generate_fastapi_app(backend_dir, project_name)
    
    # Generate database configuration if provided
    if database_type and database_url:
        from app.services.database_config import generate_database_config
        generate_database_config(backend_dir, database_type, database_url, project_name)
    
    # Generate docker-compose and README
    frontend_port, backend_port = generate_docker_compose(project_dir, project_id)
    generate_readme(project_dir, project_name, project_id, frontend_port, backend_port)
    
    # Application URL - point to actual running app
    from app.services.settings_loader import get_base_url
    base_url = get_base_url()
    application_url = f"{base_url}:{frontend_port}"
    
    return {
        'frontend_path': str(frontend_dir),
        'backend_path': str(backend_dir),
        'application_url': application_url,
        'frontend_port': frontend_port,
        'backend_port': backend_port
    }

def generate_react_app(
    frontend_dir: Path,
    project_name: str,
    components: List[Dict[str, Any]],
    css_content: str,
    pages: Optional[List[Dict[str, Any]]] = None
):
    """Generate React application files with proper structure."""
    # package.json with react-router-dom
    package_json = {
        "name": project_name.lower().replace(' ', '-'),
        "version": "0.1.0",
        "private": True,
        "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "react-router-dom": "^6.8.0",
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

// Suppress WebSocket connection errors (harmless HMR warnings in Docker)
const originalError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('WebSocket connection')) {
    // Suppress WebSocket errors - they're harmless in Docker environment
    return;
  }
  originalError.apply(console, args);
};

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
    
    # Create pages directory
    pages_dir = src_dir / "pages"
    pages_dir.mkdir(exist_ok=True)
    
    # Create components directory
    components_dir = src_dir / "components"
    components_dir.mkdir(exist_ok=True)
    
    # Create styles directory
    styles_dir = src_dir / "styles"
    styles_dir.mkdir(exist_ok=True)
    
    # Generate pages and routing
    if pages and len(pages) > 0:
        generate_react_app_with_pages(src_dir, pages_dir, components_dir, styles_dir, project_name, components, css_content, pages)
    else:
        # Fallback to single page app
        app_js, app_css = generate_react_components(components, css_content)
        with open(src_dir / "App.js", "w") as f:
            f.write(app_js)
        with open(src_dir / "App.css", "w") as f:
            f.write(app_css)
    
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
    
    # Remove any existing .env files that might cause webpack dev server errors
    # Don't create .env file - let react-scripts use defaults
    # Creating .env with WebSocket config causes webpack dev server schema errors
    # The WebSocket warnings are already suppressed in index.js
    env_file_path = frontend_dir / ".env"
    env_production_path = frontend_dir / ".env.production"
    if env_file_path.exists():
        try:
            env_file_path.unlink()
            logger.info("Removed existing .env file to avoid webpack dev server errors")
        except Exception as e:
            logger.warning(f"Could not remove .env file: {e}")
    if env_production_path.exists():
        try:
            env_production_path.unlink()
            logger.info("Removed existing .env.production file")
        except Exception as e:
            logger.warning(f"Could not remove .env.production file: {e}")

def generate_react_components(components: List[Dict[str, Any]], css_content: str) -> str:
    """Convert canvas components to React JSX with CSS classes."""
    # Collect all CSS from components
    css_dict = {}
    all_custom_css = []
    
    # First pass: collect all component styles and custom CSS
    for comp in components:
        component_id = comp.get('id', '')
        component_class = f"component-{component_id.replace(' ', '-').replace('_', '-').replace('.', '-')}"
        props = comp.get('props', {})
        style = props.get('style', {})
        
        # Convert style to CSS
        if style:
            css_rules = []
            for key, value in style.items():
                css_key = re.sub(r'([A-Z])', r'-\1', key).lower()
                css_rules.append(f"  {css_key}: {value};")
            css_dict[component_id] = f".{component_class} {{\n" + "\n".join(css_rules) + "\n}\n"
        
        # Collect custom CSS
        if props.get('customCSS'):
            custom_css = props['customCSS']
            pseudo_class_pattern = r'(^|\n)(\s*)(:hover|:active|:focus|:before|:after|:first-child|:last-child|:nth-child\([^)]*\)|::before|::after)\s*\{'
            scoped_css = re.sub(pseudo_class_pattern, lambda m: f"{m.group(1)}{m.group(2)}.{component_class}{m.group(3)} {{", custom_css, flags=re.IGNORECASE | re.MULTILINE)
            
            if f".{component_class}" not in scoped_css:
                if not re.match(r'^[.#\w]', scoped_css.strip()):
                    scoped_css = f".{component_class} {{\n{scoped_css}\n}}"
            
            all_custom_css.append(scoped_css)
    
    # Combine all CSS
    combined_css = css_content
    if css_dict:
        combined_css += "\n\n" + "\n\n".join(css_dict.values())
    if all_custom_css:
        combined_css += "\n\n" + "\n\n".join(all_custom_css)
    
    component_code = """import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
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
        component_code += convert_component_to_jsx(comp, components, 6, {}) + "\n"
    
    component_code += """    </>
  );
}

export default App;
"""
    
    # Write CSS to App.css
    return component_code, combined_css

def convert_component_to_jsx(component: Dict[str, Any], all_components: List[Dict[str, Any]], indent: int = 0, css_dict: Dict[str, str] = None) -> str:
    """Convert a component dictionary to JSX string with CSS classes instead of inline styles."""
    if css_dict is None:
        css_dict = {}
    
    indent_str = " " * indent
    comp_type = component.get('type', 'div')
    props = component.get('props', {})
    style = props.get('style', {})
    children = props.get('children', '')
    component_id = component.get('id', '')
    
    # Generate CSS class name - replace dots, spaces, and underscores with dashes
    component_class = f"component-{component_id.replace(' ', '-').replace('_', '-').replace('.', '-')}"
    
    # Convert style object to CSS and add to css_dict
    if style:
        css_rules = []
        for key, value in style.items():
            # Convert camelCase to kebab-case for CSS
            css_key = re.sub(r'([A-Z])', r'-\1', key).lower()
            css_rules.append(f"  {css_key}: {value};")
        
        css_content = f".{component_class} {{\n" + "\n".join(css_rules) + "\n}\n"
        css_dict[component_id] = css_content
    
    # Build props - use className instead of style
    props_str = ""
    
    # Add component class for custom CSS scoping
    class_names = [component_class]
    if props.get('className'):
        class_names.append(props['className'])
    
    props_str += f' className="{" ".join(class_names)}"'
    
    # Handle id - replace dots with dashes for valid HTML/CSS
    if props.get('id'):
        sanitized_id = str(props['id']).replace('.', '-').replace(' ', '-').replace('_', '-')
        props_str += f' id="{sanitized_id}"'
    
    # Handle other props (except style, className, children, pageId, customCSS)
    excluded_props = {'style', 'className', 'children', 'pageId', 'customCSS'}
    # Event handlers that should be rendered as functions, not strings
    event_handlers = {'onClick', 'onChange', 'onSubmit', 'onFocus', 'onBlur', 'onMouseEnter', 'onMouseLeave', 'onKeyDown', 'onKeyUp'}
    
    for key, value in props.items():
        if key not in excluded_props:
            if key in event_handlers and isinstance(value, str):
                # Event handlers should be rendered as functions, not strings
                # Clean up invalid characters (like # at the start)
                cleaned_value = value.strip()
                # Remove leading # or other invalid characters
                if cleaned_value.startswith('#'):
                    cleaned_value = cleaned_value[1:].strip()
                # If it's already a function string like "() => {...}", use it directly
                if cleaned_value.startswith('(') or cleaned_value.startswith('function'):
                    props_str += f' {key}={{{cleaned_value}}}'
                elif cleaned_value:
                    # Wrap in arrow function if it's just code
                    props_str += f' {key}={{() => {{ {cleaned_value} }}}}'
                # If cleaned_value is empty, skip this prop
            elif isinstance(value, (str, int, float, bool)):
                props_str += f' {key}="{value}"'
            elif isinstance(value, dict):
                # For objects, convert to JSON string
                import json
                props_str += f' {key}={{{json.dumps(value)}}}'
    
    # Find child components by parentId
    child_components = [c for c in all_components if c.get('parentId') == component_id]
    
    # Handle children
    children_jsx = ""
    if isinstance(children, str):
        children_jsx = children
    elif isinstance(children, list):
        children_jsx = "\n".join([convert_component_to_jsx(child, all_components, indent + 2, css_dict) if isinstance(child, dict) else str(child) for child in children])
    
    # Add child components
    if child_components:
        if children_jsx:
            children_jsx += "\n"
        children_jsx += "\n".join([convert_component_to_jsx(child, all_components, indent + 2, css_dict) for child in child_components])
    
    if children_jsx:
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
    """Generate docker-compose.yml with proper configuration."""
    # Use dynamic port assignment - will be set when starting containers
    frontend_port = 3000 + (project_id % 1000)  # Default port, will be updated on start
    backend_port = 8000 + (project_id % 1000)  # Default port, will be updated on start
    
    docker_compose = f"""version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "{frontend_port}:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - REACT_APP_API_URL=http://localhost:{backend_port}
      - CHOKIDAR_USEPOLLING=true
    stdin_open: true
    tty: true
    networks:
      - app-network
  
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "{backend_port}:8000"
    volumes:
      - ./backend:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      - PYTHONUNBUFFERED=1
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
"""
    
    with open(project_dir / "docker-compose.yml", "w") as f:
        f.write(docker_compose)
    
    # Generate Dockerfile for frontend
    frontend_dockerfile = """FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
"""
    
    with open(project_dir / "frontend" / "Dockerfile", "w") as f:
        f.write(frontend_dockerfile)
    
    # Generate Dockerfile for backend
    backend_dockerfile = """FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
"""
    
    with open(project_dir / "backend" / "Dockerfile", "w") as f:
        f.write(backend_dockerfile)
    
    # Generate .dockerignore for frontend
    frontend_dockerignore = """node_modules
npm-debug.log
build
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.DS_Store
"""
    
    with open(project_dir / "frontend" / ".dockerignore", "w") as f:
        f.write(frontend_dockerignore)
    
    # Generate .dockerignore for backend
    backend_dockerignore = """__pycache__
*.pyc
*.pyo
*.pyd
.Python
env
venv
.venv
pip-log.txt
pip-delete-this-directory.txt
.DS_Store
"""
    
    with open(project_dir / "backend" / ".dockerignore", "w") as f:
        f.write(backend_dockerignore)
    
    return frontend_port, backend_port

def generate_readme(project_dir: Path, project_name: str, project_id: int, frontend_port: int = 3000, backend_port: int = 8000):
    """Generate README.md."""
    readme = f"""# {project_name}

Generated application from No-Code Platform.

## Project ID: {project_id}

## Getting Started

### Prerequisites
- Node.js 16+ (for manual setup)
- Python 3.9+ (for manual setup)
- Docker and Docker Compose (recommended)

### Running with Docker (Recommended)

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
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

- Frontend: http://localhost:{frontend_port}
- Backend API: http://localhost:{backend_port}
- API Docs: http://localhost:{backend_port}/docs

## Project Structure

```
{project_name}/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── styles/        # CSS files
│   │   │   ├── global.css # Global styles
│   │   │   └── *.css      # Page-specific styles
│   │   ├── App.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
└── docker-compose.yml
```

## Notes

- All styles are in separate CSS files (no inline styles)
- Each page has its own CSS file in `src/styles/`
- Components use CSS classes for styling
- Custom CSS from components is properly scoped
"""
    
    with open(project_dir / "README.md", "w") as f:
        f.write(readme)

def generate_react_app_with_pages(
    src_dir: Path,
    pages_dir: Path,
    components_dir: Path,
    styles_dir: Path,
    project_name: str,
    components: List[Dict[str, Any]],
    css_content: str,
    pages: List[Dict[str, Any]]
):
    """Generate React app with proper page structure and routing."""
    # Generate global CSS
    global_css = css_content or ""
    with open(styles_dir / "global.css", "w") as f:
        f.write(global_css)
    
    # Load existing page file mappings from metadata file
    page_metadata_file = src_dir / ".page_metadata.json"
    existing_page_mappings = {}
    if page_metadata_file.exists():
        try:
            with open(page_metadata_file, 'r') as f:
                existing_page_mappings = json.load(f)
        except Exception as e:
            logger.warning(f"Could not read page metadata: {e}")
    
    # Build mapping of page_id -> old file names from existing files
    old_file_mappings = {}
    if pages_dir.exists():
        for existing_file in pages_dir.glob("*.js"):
            # First try to get page_id from metadata file
            page_id = existing_page_mappings.get(existing_file.name)
            
            # If not in metadata, try to extract from file comments
            if not page_id:
                try:
                    with open(existing_file, 'r') as f:
                        content = f.read()
                        # Look for page ID comment: // Page ID: page-xxx
                        page_id_match = re.search(r'//\s*Page\s+ID:\s*([^\n]+)', content)
                        if page_id_match:
                            page_id = page_id_match.group(1).strip()
                except Exception:
                    pass
            
            if page_id:
                old_file_mappings[page_id] = {
                    'js_file': existing_file.name,
                    'css_file': existing_file.name.replace('.js', '.css')
                }
    
    # Group components by page
    default_page_id = pages[0]['id'] if pages else None
    page_components = {}
    for page in pages:
        page_components[page['id']] = []
    
    # Assign components to pages
    for comp in components:
        comp_page_id = comp.get('props', {}).get('pageId') or default_page_id
        if comp_page_id and comp_page_id in page_components:
            page_components[comp_page_id].append(comp)
        elif default_page_id:
            page_components[default_page_id].append(comp)
    
    # Generate page components
    page_imports = []
    page_routes = []
    page_file_mappings = {}  # Map page_id to file names
    
    for page in pages:
        page_id = page['id']
        page_name = page['name']
        page_route = page.get('route', f"/{page_name.lower().replace(' ', '-')}")
        page_comps = page_components.get(page_id, [])
        
        # Generate page component file name
        page_component_name = f"{page_name.replace(' ', '')}Page"
        page_file_name = f"{page_component_name}.js"
        page_css_name = f"{page_component_name}.css"
        
        # Check if we need to rename existing files for this page ID
        old_js_file_path = None
        old_css_file_path = None
        
        if page_id in old_file_mappings:
            old_mapping = old_file_mappings[page_id]
            old_js_name = old_mapping['js_file']
            old_css_name = old_mapping['css_file']
            
            # If the file names are different, we need to rename
            if old_js_name != page_file_name:
                old_js_file_path = pages_dir / old_js_name
                new_js_file_path = pages_dir / page_file_name
                if old_js_file_path.exists():
                    try:
                        # If new file already exists, delete it first
                        if new_js_file_path.exists():
                            new_js_file_path.unlink()
                        old_js_file_path.rename(new_js_file_path)
                        logger.info(f"Renamed page file from {old_js_name} to {page_file_name} for page {page_id}")
                    except Exception as e:
                        logger.warning(f"Could not rename page file {old_js_name}: {e}")
            
            if old_css_name != page_css_name:
                old_css_file_path = styles_dir / old_css_name
                new_css_file_path = styles_dir / page_css_name
                if old_css_file_path.exists():
                    try:
                        # If new file already exists, delete it first
                        if new_css_file_path.exists():
                            new_css_file_path.unlink()
                        old_css_file_path.rename(new_css_file_path)
                        logger.info(f"Renamed CSS file from {old_css_name} to {page_css_name} for page {page_id}")
                    except Exception as e:
                        logger.warning(f"Could not rename CSS file {old_css_name}: {e}")
        
        # Store mapping for later reference
        page_file_mappings[page_id] = {
            'component_name': page_component_name,
            'file_name': page_file_name,
            'css_name': page_css_name
        }
        
        # Generate page CSS with component styles
        page_css = ""
        css_dict = {}  # Dictionary to collect all CSS for this page
        processed_ids = set()  # Track processed component IDs to avoid duplicates
        
        # Process ALL components on the page to ensure no CSS is missed
        def collect_css_from_component(comp, all_comps, css_dict, processed_ids):
            """Recursively collect CSS from component and its children."""
            component_id = comp.get('id', '')
            
            # Skip if already processed
            if component_id in processed_ids:
                return
            
            processed_ids.add(component_id)
            
            props = comp.get('props', {})
            style = props.get('style', {})
            
            # Generate CSS class name
            component_class = f"component-{component_id.replace(' ', '-').replace('_', '-').replace('.', '-')}"
            
            # Convert style object to CSS and add to css_dict
            if style:
                css_rules = []
                for key, value in style.items():
                    # Convert camelCase to kebab-case for CSS
                    css_key = re.sub(r'([A-Z])', r'-\1', key).lower()
                    css_rules.append(f"  {css_key}: {value};")
                
                css_content = f".{component_class} {{\n" + "\n".join(css_rules) + "\n}\n"
                # If component already has CSS, append to it; otherwise set it
                if component_id in css_dict:
                    css_dict[component_id] += css_content
                else:
                    css_dict[component_id] = css_content
            
            # Add custom CSS
            if props.get('customCSS'):
                custom_css = props['customCSS']
                
                pseudo_class_pattern = r'(^|\n)(\s*)(:hover|:active|:focus|:before|:after|:first-child|:last-child|:nth-child\([^)]*\)|::before|::after)\s*\{'
                scoped_css = re.sub(pseudo_class_pattern, lambda m: f"{m.group(1)}{m.group(2)}.{component_class}{m.group(3)} {{", custom_css, flags=re.IGNORECASE | re.MULTILINE)
                
                if f".{component_class}" not in scoped_css:
                    if not re.match(r'^[.#\w]', scoped_css.strip()):
                        scoped_css = f".{component_class} {{\n{scoped_css}\n}}"
                
                # Store custom CSS separately or append to component CSS
                if component_id in css_dict:
                    css_dict[component_id] += "\n" + scoped_css + "\n"
                else:
                    css_dict[component_id] = scoped_css + "\n"
            
            # Process child components
            child_components = [c for c in all_comps if c.get('parentId') == component_id]
            for child in child_components:
                collect_css_from_component(child, all_comps, css_dict, processed_ids)
        
        # Process ALL components on the page to ensure complete CSS collection
        # Start with root components, but also process any orphaned components
        root_comps = [c for c in page_comps if not c.get('parentId')]
        
        # First, process root components (recursive function handles children)
        for comp in root_comps:
            collect_css_from_component(comp, page_comps, css_dict, processed_ids)
        
        # Then, process any remaining components that weren't processed (orphaned components)
        for comp in page_comps:
            if comp.get('id') not in processed_ids:
                collect_css_from_component(comp, page_comps, css_dict, processed_ids)
        
        # Add all component styles to page CSS
        for comp_id, css_content in css_dict.items():
            page_css += css_content + "\n"
        
        # Log CSS collection for debugging
        logger.info(f"Generated CSS for page {page_name} ({page_id}): {len(css_dict)} component styles collected")
        
        with open(styles_dir / page_css_name, "w") as f:
            f.write(page_css)
        
        logger.info(f"Written CSS to {page_css_name} ({len(page_css)} characters)")
        
        # Generate page component (ensure component name starts with uppercase for React)
        page_component_name_capitalized = page_component_name[0].upper() + page_component_name[1:] if page_component_name else page_component_name
        
        # Generate page component
        page_jsx = f"""// Page ID: {page_id}
// Page Name: {page_name}
import React from 'react';
import '../styles/{page_css_name}';

function {page_component_name_capitalized}() {{
  return (
    <div className="{page_component_name.lower()}">
"""
        
        # Generate JSX for root components
        # Use the same css_dict to avoid re-processing (CSS already collected above)
        jsx_css_dict = {}  # Empty dict is fine - CSS already collected and written
        for comp in root_comps:
            page_jsx += convert_component_to_jsx(comp, page_comps, 6, jsx_css_dict) + "\n"
        
        page_jsx += """    </div>
  );
}

export default """ + page_component_name_capitalized + ";"
        
        # Always write the file to ensure content matches the new component name
        # This is important when pages are renamed
        page_file_path = pages_dir / page_file_name
        with open(page_file_path, "w") as f:
            f.write(page_jsx)
        
        logger.info(f"Generated/updated page file: {page_file_name} with component {page_component_name_capitalized}")
        
        # Add to imports and routes (use capitalized name for import and route)
        page_imports.append(f"import {page_component_name_capitalized} from './pages/{page_file_name}';")
        # Use single curly braces for JSX element
        route_jsx = f'<{page_component_name_capitalized} />'
        page_routes.append(f'        <Route path="{page_route}" element={{{route_jsx}}} />')
    
    # Generate App.js with routing
    # Get the first page's route for default navigation
    default_route = '/'
    if pages and len(pages) > 0:
        first_page = pages[0]
        default_route = first_page.get('route')
        if not default_route:
            # Generate route from page name if route is not set
            first_page_name = first_page.get('name', '')
            default_route = f"/{first_page_name.lower().replace(' ', '-')}"
    
    app_js = f"""import React from 'react';
import {{ BrowserRouter as Router, Routes, Route, Navigate }} from 'react-router-dom';
import './styles/global.css';
{chr(10).join(page_imports)}

function App() {{
  return (
    <Router>
      <Routes>
{chr(10).join(page_routes)}
        <Route path="/" element={{{f'<Navigate to="{default_route}" replace />'}}} />
        <Route path="*" element={{{f'<Navigate to="{default_route}" replace />'}}} />
      </Routes>
    </Router>
  );
}}

export default App;
"""
    
    with open(src_dir / "App.js", "w") as f:
        f.write(app_js)
    
    logger.info(f"Generated App.js with {len(page_imports)} page imports and {len(page_routes)} routes. Default route: {default_route}")
    
    # Save page metadata for future reference (maps file names to page IDs)
    page_metadata = {}
    for page_id, mapping in page_file_mappings.items():
        page_metadata[mapping['file_name']] = page_id
        page_metadata[mapping['css_name']] = page_id
    
    try:
        with open(page_metadata_file, 'w') as f:
            json.dump(page_metadata, f, indent=2)
    except Exception as e:
        logger.warning(f"Could not save page metadata: {e}")
    
    # Clean up orphaned files (files that don't match any current page)
    if pages_dir.exists():
        current_file_names = {mapping['file_name'] for mapping in page_file_mappings.values()}
        for existing_file in pages_dir.glob("*.js"):
            if existing_file.name not in current_file_names:
                try:
                    existing_file.unlink()
                    logger.info(f"Removed orphaned page file: {existing_file.name}")
                except Exception as e:
                    logger.warning(f"Could not remove orphaned file {existing_file.name}: {e}")
    
    # Clean up orphaned CSS files
    if styles_dir.exists():
        current_css_names = {mapping['css_name'] for mapping in page_file_mappings.values()}
        current_css_names.add("global.css")
        for existing_css in styles_dir.glob("*.css"):
            if existing_css.name not in current_css_names:
                try:
                    existing_css.unlink()
                    logger.info(f"Removed orphaned CSS file: {existing_css.name}")
                except Exception as e:
                    logger.warning(f"Could not remove orphaned CSS file {existing_css.name}: {e}")
    
    # Clean up orphaned component files
    if components_dir.exists():
        # Get all component IDs from current components
        current_component_ids = {comp.get('id', '') for comp in components}
        for existing_component_file in components_dir.glob("*.js"):
            # Extract component ID from filename or file content
            component_id = None
            try:
                with open(existing_component_file, 'r') as f:
                    content = f.read()
                    # Look for component ID comment
                    id_match = re.search(r'//\s*Component\s+ID:\s*([^\n]+)', content)
                    if id_match:
                        component_id = id_match.group(1).strip()
            except Exception:
                pass
            
            # If component ID not found in current components, remove file
            if component_id and component_id not in current_component_ids:
                try:
                    existing_component_file.unlink()
                    logger.info(f"Removed orphaned component file: {existing_component_file.name}")
                except Exception as e:
                    logger.warning(f"Could not remove orphaned component file {existing_component_file.name}: {e}")

def cleanup_unused_files(frontend_dir: Path, components: List[Dict[str, Any]], pages: Optional[List[Dict[str, Any]]] = None):
    """
    Remove all unused files from the project directory.
    This includes orphaned page files, CSS files, component files, and other unused assets.
    """
    src_dir = frontend_dir / "src"
    if not src_dir.exists():
        return
    
    pages_dir = src_dir / "pages"
    styles_dir = src_dir / "styles"
    components_dir = src_dir / "components"
    
    # Get current page IDs and component IDs
    current_page_ids = {page['id'] for page in pages} if pages else set()
    current_component_ids = {comp.get('id', '') for comp in components if comp.get('id')}
    
    # Load page metadata to identify which files belong to which pages
    page_metadata_file = src_dir / ".page_metadata.json"
    page_metadata = {}
    if page_metadata_file.exists():
        try:
            with open(page_metadata_file, 'r') as f:
                page_metadata = json.load(f)
        except Exception:
            pass
    
    # Clean up orphaned page files
    if pages_dir.exists():
        current_page_file_names = set()
        if pages:
            for page in pages:
                page_name = page['name']
                page_component_name = f"{page_name.replace(' ', '')}Page"
                current_page_file_names.add(f"{page_component_name}.js")
        
        for existing_file in pages_dir.glob("*.js"):
            # Check if file belongs to a current page
            file_page_id = page_metadata.get(existing_file.name)
            if file_page_id and file_page_id not in current_page_ids:
                # File belongs to a page that no longer exists
                try:
                    existing_file.unlink()
                    logger.info(f"Removed orphaned page file: {existing_file.name}")
                except Exception as e:
                    logger.warning(f"Could not remove orphaned page file {existing_file.name}: {e}")
            elif existing_file.name not in current_page_file_names:
                # File doesn't match any current page name
                try:
                    existing_file.unlink()
                    logger.info(f"Removed unused page file: {existing_file.name}")
                except Exception as e:
                    logger.warning(f"Could not remove unused page file {existing_file.name}: {e}")
    
    # Clean up orphaned CSS files
    if styles_dir.exists():
        current_css_file_names = {"global.css", "index.css"}
        if pages:
            for page in pages:
                page_name = page['name']
                page_component_name = f"{page_name.replace(' ', '')}Page"
                current_css_file_names.add(f"{page_component_name}.css")
        
        for existing_css in styles_dir.glob("*.css"):
            if existing_css.name not in current_css_file_names:
                # Check if CSS belongs to a deleted page
                css_page_id = page_metadata.get(existing_css.name)
                if css_page_id and css_page_id not in current_page_ids:
                    try:
                        existing_css.unlink()
                        logger.info(f"Removed orphaned CSS file: {existing_css.name}")
                    except Exception as e:
                        logger.warning(f"Could not remove orphaned CSS file {existing_css.name}: {e}")
                elif existing_css.name not in current_css_file_names:
                    try:
                        existing_css.unlink()
                        logger.info(f"Removed unused CSS file: {existing_css.name}")
                    except Exception as e:
                        logger.warning(f"Could not remove unused CSS file {existing_css.name}: {e}")
    
    # Clean up orphaned component files
    if components_dir.exists():
        for existing_component_file in components_dir.glob("*.js"):
            component_id = None
            try:
                with open(existing_component_file, 'r') as f:
                    content = f.read()
                    # Look for component ID comment
                    id_match = re.search(r'//\s*Component\s+ID:\s*([^\n]+)', content)
                    if id_match:
                        component_id = id_match.group(1).strip()
            except Exception:
                pass
            
            # If component ID not found in current components, remove file
            if component_id and component_id not in current_component_ids:
                try:
                    existing_component_file.unlink()
                    logger.info(f"Removed orphaned component file: {existing_component_file.name}")
                except Exception as e:
                    logger.warning(f"Could not remove orphaned component file {existing_component_file.name}: {e}")
            elif not component_id:
                # If no component ID found and file doesn't match pattern, consider removing
                # But be conservative - only remove if we're sure it's not needed
                pass
    
    # Clean up any other unused files in src directory (except core files)
    core_files = {"index.js", "index.css", "App.js", "App.css", ".page_metadata.json"}
    for item in src_dir.iterdir():
        if item.is_file() and item.name not in core_files:
            # Check if it's a known file type we manage
            if item.suffix in ['.js', '.jsx', '.ts', '.tsx', '.css']:
                # This is an orphaned file in src root (should be in pages/, components/, or styles/)
                try:
                    item.unlink()
                    logger.info(f"Removed orphaned file from src: {item.name}")
                except Exception as e:
                    logger.warning(f"Could not remove orphaned file {item.name}: {e}")
    
    # Clean up empty directories
    for dir_path in [pages_dir, components_dir, styles_dir]:
        if dir_path.exists():
            try:
                # Check if directory is empty
                if not any(dir_path.iterdir()):
                    dir_path.rmdir()
                    logger.info(f"Removed empty directory: {dir_path.name}")
            except Exception as e:
                logger.warning(f"Could not remove empty directory {dir_path.name}: {e}")

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

