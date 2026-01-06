"""
Form to API Generator Service
Generates backend API endpoints, models, and database tables from form components.
"""

import os
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import logging
import subprocess

logger = logging.getLogger(__name__)

# Import GENERATED_APPS_DIR from code_generator
try:
    from app.services.code_generator import GENERATED_APPS_DIR
except ImportError:
    from app.services.settings_loader import get_generated_apps_dir
    GENERATED_APPS_DIR = get_generated_apps_dir()

def extract_form_fields(component: Dict[str, Any], all_components: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """
    Extract form fields from a form component structure.
    Supports both nested children (props.children) and flat structure (parentId relationships).
    Traverses ALL layers recursively to find all input fields.
    
    Args:
        component: The form component
        all_components: Optional list of all components (for flat structure traversal)
    
    Returns:
        List of field dictionaries with name, type, required, etc.
    """
    fields = []
    component_id = component.get('id')
    visited_ids = set()
    
    def extract_field_from_component(comp: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract field information from a single component."""
        comp_type = comp.get('type', '').lower()
        props = comp.get('props', {})
        
        # Check if this is an input field
        if comp_type in ['input', 'textarea', 'select']:
            field = {
                'name': props.get('name') or props.get('id') or f"field_{len(fields)}",
                'type': comp_type,
                'input_type': props.get('type', 'text'),
                'label': props.get('placeholder') or props.get('label') or '',
                'required': props.get('required', False),
                'placeholder': props.get('placeholder', ''),
                'validation': {}
            }
            
            # Extract validation rules
            if props.get('required'):
                field['validation']['required'] = True
            if props.get('pattern'):
                field['validation']['pattern'] = props.get('pattern')
            if props.get('minLength'):
                field['validation']['minLength'] = props.get('minLength')
            if props.get('maxLength'):
                field['validation']['maxLength'] = props.get('maxLength')
            if props.get('min'):
                field['validation']['min'] = props.get('min')
            if props.get('max'):
                field['validation']['max'] = props.get('max')
            
            # Determine database field type
            input_type = props.get('type', 'text').lower()
            if input_type in ['email']:
                field['db_type'] = 'String'
            elif input_type in ['number', 'tel']:
                field['db_type'] = 'Integer' if 'int' in str(props.get('step', '1')) else 'Float'
            elif input_type in ['date', 'datetime-local']:
                field['db_type'] = 'Date'
            elif input_type == 'password':
                field['db_type'] = 'String'
            elif comp_type == 'textarea':
                field['db_type'] = 'Text'
            else:
                field['db_type'] = 'String'
            
            return field
        return None
    
    def traverse_nested_children(comp: Dict[str, Any], depth: int = 0, max_depth: int = 50):
        """Traverse nested children from props.children recursively through ALL layers."""
        if depth > max_depth:
            return  # Prevent infinite recursion
        
        comp_id = comp.get('id')
        if comp_id and comp_id in visited_ids:
            return  # Prevent processing same component twice
        if comp_id:
            visited_ids.add(comp_id)
        
        # Extract field from current component
        field = extract_field_from_component(comp)
        if field:
            fields.append(field)
        
        # Traverse nested children from props.children - go DEEP
        props = comp.get('props', {})
        children = props.get('children', [])
        
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    # Recursively traverse this child and ALL its nested children
                    traverse_nested_children(child, depth + 1, max_depth)
        elif isinstance(children, dict):
            traverse_nested_children(children, depth + 1, max_depth)
    
    def traverse_flat_structure(parent_id: str, all_comps: List[Dict[str, Any]], depth: int = 0, max_depth: int = 50):
        """Traverse flat structure using parentId relationships - go through ALL layers."""
        if depth > max_depth:
            return  # Prevent infinite recursion
        
        if parent_id in visited_ids:
            return  # Prevent infinite loops
        visited_ids.add(parent_id)
        
        # Find all direct children
        direct_children = [c for c in all_comps if isinstance(c, dict) and c.get('parentId') == parent_id]
        
        for child in direct_children:
            child_id = child.get('id')
            if not child_id:
                continue
            
            # Extract field from child component
            field = extract_field_from_component(child)
            if field:
                fields.append(field)
            
            # Also check nested children in props.children - traverse DEEP
            props = child.get('props', {})
            nested_children = props.get('children', [])
            if isinstance(nested_children, list):
                for nested_child in nested_children:
                    if isinstance(nested_child, dict):
                        traverse_nested_children(nested_child, depth + 1, max_depth)
            elif isinstance(nested_children, dict):
                traverse_nested_children(nested_children, depth + 1, max_depth)
            
            # Recursively traverse ALL grandchildren and deeper levels
            traverse_flat_structure(child_id, all_comps, depth + 1, max_depth)
    
    # First, try to extract from the component itself
    field = extract_field_from_component(component)
    if field:
        fields.append(field)
    
    # Traverse nested children (props.children) - go through ALL layers
    traverse_nested_children(component)
    
    # If all_components is provided, also traverse flat structure (parentId relationships) - go through ALL layers
    if all_components and component_id:
        traverse_flat_structure(component_id, all_components)
    
    return fields

def extract_fields_from_generated_page(page_file_path: Path) -> List[Dict[str, Any]]:
    """
    Extract form fields by reading the generated page file line by line.
    This is a fallback method when component tree traversal doesn't find fields.
    
    Args:
        page_file_path: Path to the generated page file (e.g., SignupPage.js)
    
    Returns:
        List of field dictionaries extracted from the code
    """
    fields = []
    
    if not page_file_path.exists():
        return fields
    
    try:
        with open(page_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Pattern to match input fields in React/JSX
        # Matches: <input ... name="fieldName" ... type="text" ... />
        # Matches: <input ... type="email" ... name="email" ... />
        # Matches: <textarea ... name="message" ... />
        # Matches: <select ... name="country" ... />
        
        import re
        
        # Pattern for input elements
        input_pattern = r'<input\s+([^>]+)>'
        textarea_pattern = r'<textarea\s+([^>]+)>'
        select_pattern = r'<select\s+([^>]+)>'
        
        def extract_attributes(attrs_str: str) -> Dict[str, str]:
            """Extract attributes from attribute string."""
            attrs = {}
            # Match name="value" or name='value'
            attr_pattern = r'(\w+)=["\']([^"\']+)["\']'
            for match in re.finditer(attr_pattern, attrs_str):
                attrs[match.group(1)] = match.group(2)
            return attrs
        
        def create_field_from_attrs(attrs: Dict[str, str], attrs_str: str, field_type: str) -> Dict[str, Any]:
            """Create field dictionary from extracted attributes."""
            name = attrs.get('name') or attrs.get('id') or f"field_{len(fields)}"
            
            # Skip if already added
            if any(f.get('name') == name for f in fields):
                return None
            
            input_type = attrs.get('type', 'text').lower()
            
            # Check if required (from attrs dict or attrs_str)
            is_required = attrs.get('required', '').lower() in ['true', 'required', '1'] or 'required' in attrs_str.lower()
            
            field = {
                'name': name,
                'type': field_type,
                'input_type': input_type,
                'label': attrs.get('placeholder') or attrs.get('label') or name,
                'required': is_required,
                'placeholder': attrs.get('placeholder', ''),
                'validation': {}
            }
            
            # Extract validation
            if field['required']:
                field['validation']['required'] = True
            if 'minLength' in attrs:
                field['validation']['minLength'] = int(attrs.get('minLength', 0))
            if 'maxLength' in attrs:
                field['validation']['maxLength'] = int(attrs.get('maxLength', 255))
            
            # Determine database field type
            if input_type in ['email']:
                field['db_type'] = 'String'
            elif input_type in ['number', 'tel']:
                field['db_type'] = 'Integer'
            elif input_type in ['date', 'datetime-local']:
                field['db_type'] = 'Date'
            elif input_type == 'password':
                field['db_type'] = 'String'
            elif field_type == 'textarea':
                field['db_type'] = 'Text'
            else:
                field['db_type'] = 'String'
            
            return field
        
        # Extract input fields
        for match in re.finditer(input_pattern, content, re.IGNORECASE):
            attrs_str = match.group(1)
            attrs = extract_attributes(attrs_str)
            field = create_field_from_attrs(attrs, attrs_str, 'input')
            if field:
                fields.append(field)
        
        # Extract textarea fields
        for match in re.finditer(textarea_pattern, content, re.IGNORECASE):
            attrs_str = match.group(1)
            attrs = extract_attributes(attrs_str)
            field = create_field_from_attrs(attrs, attrs_str, 'textarea')
            if field:
                fields.append(field)
        
        # Extract select fields
        for match in re.finditer(select_pattern, content, re.IGNORECASE):
            attrs_str = match.group(1)
            attrs = extract_attributes(attrs_str)
            field = create_field_from_attrs(attrs, attrs_str, 'select')
            if field:
                fields.append(field)
        
        logger.info(f"Extracted {len(fields)} fields from generated page: {page_file_path}")
        
    except Exception as e:
        logger.error(f"Error reading generated page file: {e}")
    
    return fields

def check_backend_structure(backend_dir: Path) -> Dict[str, Any]:
    """
    Check if backend structure is properly created and read all files.
    
    Returns:
        Dict with structure info and file contents
    """
    structure_info = {
        'exists': backend_dir.exists(),
        'files': {},
        'structure_valid': False,
        'missing_files': [],
        'errors': []
    }
    
    if not backend_dir.exists():
        structure_info['errors'].append(f"Backend directory does not exist: {backend_dir}")
        return structure_info
    
    # Expected files for FastAPI
    expected_files = {
        'main.py': 'Main application file',
        'requirements.txt': 'Python dependencies',
        'database.py': 'Database configuration'
    }
    
    # Read all Python files
    for py_file in backend_dir.rglob('*.py'):
        try:
            with open(py_file, 'r') as f:
                content = f.read()
            relative_path = py_file.relative_to(backend_dir)
            structure_info['files'][str(relative_path)] = {
                'content': content,
                'size': len(content),
                'exists': True
            }
        except Exception as e:
            structure_info['errors'].append(f"Error reading {py_file}: {e}")
    
    # Check for expected files
    for file_name, description in expected_files.items():
        file_path = backend_dir / file_name
        if not file_path.exists():
            structure_info['missing_files'].append(f"{file_name} ({description})")
    
    structure_info['structure_valid'] = len(structure_info['missing_files']) == 0
    
    return structure_info

def generate_database_model(
    model_name: str,
    fields: List[Dict[str, Any]],
    backend_dir: Path,
    database_type: str
) -> Tuple[bool, str]:
    """
    Generate database model file.
    
    Returns:
        (success, file_path or error_message)
    """
    try:
        # Create models directory if it doesn't exist
        models_dir = backend_dir / "models"
        models_dir.mkdir(exist_ok=True)
        
        # Generate model file name
        model_file_name = f"{model_name.lower()}_model.py"
        model_file_path = models_dir / model_file_name
        
        # Generate model code based on database type
        if database_type == 'postgresql' or database_type == 'mysql':
            model_code = generate_sqlalchemy_model(model_name, fields)
        elif database_type == 'mongodb':
            model_code = generate_mongodb_model(model_name, fields)
        else:
            return False, f"Unsupported database type: {database_type}"
        
        # Write model file
        with open(model_file_path, 'w') as f:
            f.write(model_code)
        
        logger.info(f"Generated model file: {model_file_path}")
        return True, str(model_file_path)
        
    except Exception as e:
        logger.error(f"Error generating model: {e}")
        return False, str(e)

def generate_sqlalchemy_model(model_name: str, fields: List[Dict[str, Any]]) -> str:
    """Generate SQLAlchemy model code."""
    imports = """from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
from database import Base
"""
    
    class_def = f"""
class {model_name.capitalize()}(Base):
    __tablename__ = "{model_name.lower()}s"
    
    id = Column(Integer, primary_key=True, index=True)
"""
    
    # Add fields
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        required = field.get('required', False)
        
        # Map types
        type_mapping = {
            'String': 'String',
            'Text': 'Text',
            'Integer': 'Integer',
            'Float': 'Float',
            'Date': 'DateTime',
            'Boolean': 'Boolean'
        }
        
        sqlalchemy_type = type_mapping.get(db_type, 'String')
        
        # Add nullable based on required
        nullable = 'nullable=False' if required else 'nullable=True'
        
        if sqlalchemy_type == 'String':
            max_length = field.get('validation', {}).get('maxLength', 255)
            class_def += f"    {field_name} = Column(String({max_length}), {nullable})\n"
        else:
            class_def += f"    {field_name} = Column({sqlalchemy_type}, {nullable})\n"
    
    # Add timestamps
    class_def += """    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
"""
    
    return imports + class_def

def generate_mongodb_model(model_name: str, fields: List[Dict[str, Any]]) -> str:
    """Generate MongoDB model code."""
    return f"""from pymongo import MongoClient
from datetime import datetime
from database import db

class {model_name.capitalize()}Model:
    collection_name = "{model_name.lower()}s"
    
    @staticmethod
    def create(data: dict):
        data['created_at'] = datetime.utcnow()
        data['updated_at'] = datetime.utcnow()
        return db[{model_name.capitalize()}Model.collection_name].insert_one(data)
    
    @staticmethod
    def find_by_id(id: str):
        return db[{model_name.capitalize()}Model.collection_name].find_one({{"_id": id}})
    
    @staticmethod
    def find_all():
        return list(db[{model_name.capitalize()}Model.collection_name].find())
"""

def generate_api_routes(
    model_name: str,
    fields: List[Dict[str, Any]],
    backend_dir: Path,
    backend_framework: str
) -> Tuple[bool, str]:
    """
    Generate API routes file.
    
    Returns:
        (success, file_path or error_message)
    """
    try:
        # Create routers directory if it doesn't exist
        routers_dir = backend_dir / "routers"
        routers_dir.mkdir(exist_ok=True)
        
        # Generate routes file name
        routes_file_name = f"{model_name.lower()}_routes.py"
        routes_file_path = routers_dir / routes_file_name
        
        if backend_framework == 'fastapi':
            routes_code = generate_fastapi_routes(model_name, fields)
        elif backend_framework == 'express':
            routes_code = generate_express_routes(model_name, fields)
        elif backend_framework == 'django':
            routes_code = generate_django_routes(model_name, fields)
        else:
            return False, f"Unsupported backend framework: {backend_framework}"
        
        # Write routes file
        with open(routes_file_path, 'w') as f:
            f.write(routes_code)
        
        logger.info(f"Generated routes file: {routes_file_path}")
        return True, str(routes_file_path)
        
    except Exception as e:
        logger.error(f"Error generating routes: {e}")
        return False, str(e)

def generate_fastapi_routes(model_name: str, fields: List[Dict[str, Any]]) -> str:
    """Generate FastAPI routes code."""
    model_class = model_name.capitalize()
    route_prefix = f"/api/{model_name.lower()}"
    
    code = f"""from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.{model_name.lower()}_model import {model_class}
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="{route_prefix}", tags=["{model_name}"])

# Pydantic schemas
class {model_class}Create(BaseModel):
"""
    
    # Add fields to schema
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        required = field.get('required', False)
        
        # Map to Python types
        type_mapping = {
            'String': 'str',
            'Text': 'str',
            'Integer': 'int',
            'Float': 'float',
            'Date': 'datetime',
            'Boolean': 'bool'
        }
        
        python_type = type_mapping.get(db_type, 'str')
        optional = '' if required else 'Optional['
        optional_close = '' if required else ']'
        
        code += f"    {field_name}: {optional}{python_type}{optional_close}\n"
    
    code += f"""
class {model_class}Response(BaseModel):
    id: int
"""
    
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        type_mapping = {
            'String': 'str',
            'Text': 'str',
            'Integer': 'int',
            'Float': 'float',
            'Date': 'datetime',
            'Boolean': 'bool'
        }
        python_type = type_mapping.get(db_type, 'str')
        code += f"    {field_name}: {python_type}\n"
    
    code += """    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

@router.post("/", response_model={model_class}Response, status_code=status.HTTP_201_CREATED)
def create_{model_name.lower()}({model_name.lower()}: {model_class}Create, db: Session = Depends(get_db)):
    \"\"\"Create a new {model_name} record.\"\"\"
    db_{model_name.lower()} = {model_class}(**{model_name.lower()}.dict())
    db.add(db_{model_name.lower()})
    db.commit()
    db.refresh(db_{model_name.lower()})
    return db_{model_name.lower()}

@router.get("/", response_model=List[{model_class}Response])
def get_{model_name.lower()}s(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    \"\"\"Get all {model_name} records.\"\"\"
    {model_name.lower()}s = db.query({model_class}).offset(skip).limit(limit).all()
    return {model_name.lower()}s

@router.get("/{{id}}", response_model={model_class}Response)
def get_{model_name.lower()}(id: int, db: Session = Depends(get_db)):
    \"\"\"Get a {model_name} record by ID.\"\"\"
    {model_name.lower()} = db.query({model_class}).filter({model_class}.id == id).first()
    if not {model_name.lower()}:
        raise HTTPException(status_code=404, detail="{model_name} not found")
    return {model_name.lower()}

@router.put("/{{id}}", response_model={model_class}Response)
def update_{model_name.lower()}(id: int, {model_name.lower()}: {model_class}Create, db: Session = Depends(get_db)):
    \"\"\"Update a {model_name} record.\"\"\"
    db_{model_name.lower()} = db.query({model_class}).filter({model_class}.id == id).first()
    if not db_{model_name.lower()}:
        raise HTTPException(status_code=404, detail="{model_name} not found")
    
    for key, value in {model_name.lower()}.dict().items():
        setattr(db_{model_name.lower()}, key, value)
    
    db_{model_name.lower()}.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_{model_name.lower()})
    return db_{model_name.lower()}

@router.delete("/{{id}}", status_code=status.HTTP_204_NO_CONTENT)
def delete_{model_name.lower()}(id: int, db: Session = Depends(get_db)):
    \"\"\"Delete a {model_name} record.\"\"\"
    {model_name.lower()} = db.query({model_class}).filter({model_class}.id == id).first()
    if not {model_name.lower()}:
        raise HTTPException(status_code=404, detail="{model_name} not found")
    db.delete({model_name.lower()})
    db.commit()
    return None
"""
    
    return code

def generate_express_routes(model_name: str, fields: List[Dict[str, Any]]) -> str:
    """Generate Express.js routes code."""
    # Implementation for Express.js
    return f"""// Express.js routes for {model_name}
const express = require('express');
const router = express.Router();
const {{ {model_name.capitalize()} }} = require('../models/{model_name.lower()}_model');

// Create
router.post('/', async (req, res) => {{
  try {{
    const {model_name.lower()} = await {model_name.capitalize()}.create(req.body);
    res.status(201).json({model_name.lower()});
  }} catch (error) {{
    res.status(400).json({{ error: error.message }});
  }}
}});

// Get all
router.get('/', async (req, res) => {{
  try {{
    const {model_name.lower()}s = await {model_name.capitalize()}.findAll();
    res.json({model_name.lower()}s);
  }} catch (error) {{
    res.status(500).json({{ error: error.message }});
  }}
}});

// Get by ID
router.get('/:id', async (req, res) => {{
  try {{
    const {model_name.lower()} = await {model_name.capitalize()}.findById(req.params.id);
    if (!{model_name.lower()}) {{
      return res.status(404).json({{ error: '{model_name} not found' }});
    }}
    res.json({model_name.lower()});
  }} catch (error) {{
    res.status(500).json({{ error: error.message }});
  }}
}});

// Update
router.put('/:id', async (req, res) => {{
  try {{
    const {model_name.lower()} = await {model_name.capitalize()}.update(req.params.id, req.body);
    if (!{model_name.lower()}) {{
      return res.status(404).json({{ error: '{model_name} not found' }});
    }}
    res.json({model_name.lower()});
  }} catch (error) {{
    res.status(400).json({{ error: error.message }});
  }}
}});

// Delete
router.delete('/:id', async (req, res) => {{
  try {{
    await {model_name.capitalize()}.delete(req.params.id);
    res.status(204).send();
  }} catch (error) {{
    res.status(500).json({{ error: error.message }});
  }}
}});

module.exports = router;
"""

def generate_django_routes(model_name: str, fields: List[Dict[str, Any]]) -> str:
    """Generate Django views code."""
    # Implementation for Django
    return f"""# Django views for {model_name}
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import {model_name.capitalize()}
from .serializers import {model_name.capitalize()}Serializer

class {model_name.capitalize()}ViewSet(viewsets.ModelViewSet):
    queryset = {model_name.capitalize()}.objects.all()
    serializer_class = {model_name.capitalize()}Serializer
"""

def generate_test_cases(
    model_name: str,
    fields: List[Dict[str, Any]],
    backend_dir: Path,
    backend_framework: str,
    api_url: str
) -> Tuple[bool, str]:
    """
    Generate test cases for the API.
    
    Returns:
        (success, file_path or error_message)
    """
    try:
        # Create tests directory
        tests_dir = backend_dir / "tests"
        tests_dir.mkdir(exist_ok=True)
        
        test_file_name = f"test_{model_name.lower()}_api.py"
        test_file_path = tests_dir / test_file_name
        
        if backend_framework == 'fastapi':
            test_code = generate_fastapi_tests(model_name, fields, api_url)
        elif backend_framework == 'express':
            test_code = generate_express_tests(model_name, fields, api_url)
        else:
            test_code = f"# Test cases for {model_name} API\n# Framework: {backend_framework}\n"
        
        with open(test_file_path, 'w') as f:
            f.write(test_code)
        
        logger.info(f"Generated test file: {test_file_path}")
        return True, str(test_file_path)
        
    except Exception as e:
        logger.error(f"Error generating tests: {e}")
        return False, str(e)

def generate_fastapi_tests(model_name: str, fields: List[Dict[str, Any]], api_url: str) -> str:
    """Generate FastAPI test cases."""
    route_prefix = f"/api/{model_name.lower()}"
    
    code = f"""import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_create_{model_name.lower()}():
    \"\"\"Test creating a {model_name} record.\"\"\"
    data = {{
"""
    
    # Add test data
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        
        if db_type == 'Integer':
            code += f'        "{field_name}": 1,\n'
        elif db_type == 'Float':
            code += f'        "{field_name}": 1.0,\n'
        elif db_type == 'Boolean':
            code += f'        "{field_name}": True,\n'
        else:
            code += f'        "{field_name}": "test_value",\n'
    
    code += f"""    }}
    response = client.post("{route_prefix}/", json=data)
    assert response.status_code == 201
    assert response.json()["id"] is not None

def test_get_{model_name.lower()}s():
    \"\"\"Test getting all {model_name} records.\"\"\"
    response = client.get("{route_prefix}/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_{model_name.lower()}_by_id():
    \"\"\"Test getting a {model_name} by ID.\"\"\"
    # First create one
    data = {{
"""
    
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        if db_type == 'Integer':
            code += f'        "{field_name}": 1,\n'
        elif db_type == 'Float':
            code += f'        "{field_name}": 1.0,\n'
        elif db_type == 'Boolean':
            code += f'        "{field_name}": True,\n'
        else:
            code += f'        "{field_name}": "test_value",\n'
    
    code += f"""    }}
    create_response = client.post("{route_prefix}/", json=data)
    id = create_response.json()["id"]
    
    response = client.get(f"{route_prefix}/{{id}}")
    assert response.status_code == 200
    assert response.json()["id"] == id

def test_update_{model_name.lower()}():
    \"\"\"Test updating a {model_name}.\"\"\"
    # First create one
    data = {{
"""
    
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        if db_type == 'Integer':
            code += f'        "{field_name}": 1,\n'
        elif db_type == 'Float':
            code += f'        "{field_name}": 1.0,\n'
        elif db_type == 'Boolean':
            code += f'        "{field_name}": True,\n'
        else:
            code += f'        "{field_name}": "test_value",\n'
    
    code += f"""    }}
    create_response = client.post("{route_prefix}/", json=data)
    id = create_response.json()["id"]
    
    # Update
    update_data = {{**data, "{fields[0]['name'] if fields else 'name'}": "updated_value"}}
    response = client.put(f"{route_prefix}/{{id}}", json=update_data)
    assert response.status_code == 200

def test_delete_{model_name.lower()}():
    \"\"\"Test deleting a {model_name}.\"\"\"
    # First create one
    data = {{
"""
    
    for field in fields:
        field_name = field['name']
        db_type = field.get('db_type', 'String')
        if db_type == 'Integer':
            code += f'        "{field_name}": 1,\n'
        elif db_type == 'Float':
            code += f'        "{field_name}": 1.0,\n'
        elif db_type == 'Boolean':
            code += f'        "{field_name}": True,\n'
        else:
            code += f'        "{field_name}": "test_value",\n'
    
    code += f"""    }}
    create_response = client.post("{route_prefix}/", json=data)
    id = create_response.json()["id"]
    
    response = client.delete(f"{route_prefix}/{{id}}")
    assert response.status_code == 204
"""
    
    return code

def generate_express_tests(model_name: str, fields: List[Dict[str, Any]], api_url: str) -> str:
    """Generate Express.js test cases."""
    return f"""// Express.js tests for {model_name}
const request = require('supertest');
const app = require('../app');

describe('{model_name} API', () => {{
  it('should create a {model_name}', async () => {{
    const res = await request(app)
      .post('/api/{model_name.lower()}')
      .send({{
        // Add test data
      }});
    expect(res.statusCode).toEqual(201);
  }});
  
  // Add more tests
}});
"""

def check_database_connection(
    database_type: str,
    database_url: str,
    database_name: Optional[str] = None,
    database_host: Optional[str] = None,
    database_port: Optional[str] = None,
    database_username: Optional[str] = None,
    database_password: Optional[str] = None
) -> Tuple[bool, str, Optional[str]]:
    """
    Check database connectivity and create table if needed.
    
    Returns:
        (success, message, table_name)
    """
    try:
        if database_type == 'postgresql':
            return check_postgresql_connection(
                database_url, database_name, database_host, 
                database_port, database_username, database_password
            )
        elif database_type == 'mysql':
            return check_mysql_connection(
                database_url, database_name, database_host,
                database_port, database_username, database_password
            )
        elif database_type == 'sqlite':
            return check_sqlite_connection(database_url)
        elif database_type == 'mongodb':
            return check_mongodb_connection(
                database_url, database_name, database_host,
                database_port, database_username, database_password
            )
        else:
            return False, f"Unsupported database type: {database_type}", None
            
    except Exception as e:
        logger.error(f"Error checking database connection: {e}")
        return False, f"Database connection error: {str(e)}", None

def check_postgresql_connection(
    database_url: str,
    database_name: Optional[str],
    database_host: Optional[str],
    database_port: Optional[str],
    database_username: Optional[str],
    database_password: Optional[str]
) -> Tuple[bool, str, Optional[str]]:
    """Check PostgreSQL connection."""
    try:
        import psycopg2
        from urllib.parse import urlparse
        
        # Parse connection string or use individual parameters
        if database_url:
            parsed = urlparse(database_url)
            conn = psycopg2.connect(
                host=parsed.hostname or database_host or 'localhost',
                port=parsed.port or database_port or 5432,
                database=parsed.path[1:] if parsed.path else database_name,
                user=parsed.username or database_username,
                password=parsed.password or database_password
            )
        else:
            conn = psycopg2.connect(
                host=database_host or 'localhost',
                port=database_port or 5432,
                database=database_name,
                user=database_username,
                password=database_password
            )
        
        conn.close()
        return True, "PostgreSQL connection successful", database_name
        
    except ImportError:
        return False, "psycopg2 not installed. Install with: pip install psycopg2-binary", None
    except Exception as e:
        return False, f"PostgreSQL connection failed: {str(e)}", None

def check_mysql_connection(
    database_url: str,
    database_name: Optional[str],
    database_host: Optional[str],
    database_port: Optional[str],
    database_username: Optional[str],
    database_password: Optional[str]
) -> Tuple[bool, str, Optional[str]]:
    """Check MySQL connection."""
    try:
        import pymysql
        
        # Parse connection
        if database_url:
            from urllib.parse import urlparse
            parsed = urlparse(database_url.replace('mysql://', 'mysql+pymysql://'))
            conn = pymysql.connect(
                host=parsed.hostname or database_host or 'localhost',
                port=int(parsed.port or database_port or 3306),
                database=parsed.path[1:] if parsed.path else database_name,
                user=parsed.username or database_username,
                password=parsed.password or database_password
            )
        else:
            conn = pymysql.connect(
                host=database_host or 'localhost',
                port=int(database_port or 3306),
                database=database_name,
                user=database_username,
                password=database_password
            )
        
        conn.close()
        return True, "MySQL connection successful", database_name
        
    except ImportError:
        return False, "pymysql not installed. Install with: pip install pymysql", None
    except Exception as e:
        return False, f"MySQL connection failed: {str(e)}", None

def check_sqlite_connection(database_url: str) -> Tuple[bool, str, Optional[str]]:
    """Check SQLite connection."""
    try:
        import sqlite3
        from pathlib import Path
        
        # Extract database path from URL
        db_path = database_url.replace('sqlite:///', '').replace('sqlite://', '')
        db_file = Path(db_path)
        
        # Create directory if needed
        db_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Test connection
        conn = sqlite3.connect(db_path)
        conn.close()
        
        return True, f"SQLite connection successful. Database: {db_path}", db_path
        
    except Exception as e:
        return False, f"SQLite connection failed: {str(e)}", None

def check_mongodb_connection(
    database_url: str,
    database_name: Optional[str],
    database_host: Optional[str],
    database_port: Optional[str],
    database_username: Optional[str],
    database_password: Optional[str]
) -> Tuple[bool, str, Optional[str]]:
    """Check MongoDB connection."""
    try:
        from pymongo import MongoClient
        
        if database_url:
            client = MongoClient(database_url)
        else:
            client = MongoClient(
                host=database_host or 'localhost',
                port=int(database_port or 27017),
                username=database_username,
                password=database_password
            )
        
        # Test connection
        client.admin.command('ping')
        client.close()
        
        return True, "MongoDB connection successful", database_name
        
    except ImportError:
        return False, "pymongo not installed. Install with: pip install pymongo", None
    except Exception as e:
        return False, f"MongoDB connection failed: {str(e)}", None

def create_database_table(
    model_name: str,
    fields: List[Dict[str, Any]],
    backend_dir: Path,
    database_type: str,
    database_url: str
) -> Tuple[bool, str]:
    """
    Create database table using Alembic or direct SQL.
    
    Returns:
        (success, message)
    """
    try:
        if database_type in ['postgresql', 'mysql', 'sqlite']:
            # Use Alembic for SQL databases
            return create_table_with_alembic(model_name, fields, backend_dir, database_type)
        elif database_type == 'mongodb':
            # MongoDB doesn't need table creation
            return True, "MongoDB collections are created automatically"
        else:
            return False, f"Unsupported database type: {database_type}"
            
    except Exception as e:
        logger.error(f"Error creating table: {e}")
        return False, f"Error creating table: {str(e)}"

def create_table_with_alembic(
    model_name: str,
    fields: List[Dict[str, Any]],
    backend_dir: Path,
    database_type: str
) -> Tuple[bool, str]:
    """Create table using Alembic migration."""
    try:
        # Check if Alembic is set up
        alembic_dir = backend_dir / "alembic"
        if not alembic_dir.exists():
            # Initialize Alembic
            subprocess.run(
                ['alembic', 'init', 'alembic'],
                cwd=backend_dir,
                capture_output=True,
                check=False
            )
        
        # Generate migration
        migration_name = f"create_{model_name.lower()}_table"
        result = subprocess.run(
            ['alembic', 'revision', '--autogenerate', '-m', migration_name],
            cwd=backend_dir,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            return False, f"Alembic migration generation failed: {result.stderr}"
        
        # Apply migration
        result = subprocess.run(
            ['alembic', 'upgrade', 'head'],
            cwd=backend_dir,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            return False, f"Alembic migration failed: {result.stderr}"
        
        return True, f"Table '{model_name.lower()}s' created successfully"
        
    except Exception as e:
        logger.error(f"Error with Alembic: {e}")
        return False, f"Error creating table with Alembic: {str(e)}"

def integrate_with_frontend(
    form_component_id: str,
    api_url: str,
    model_name: str,
    fields: List[Dict[str, Any]],
    frontend_dir: Path,
    frontend_framework: str
) -> Tuple[bool, str]:
    """
    Integrate API with frontend form.
    
    Returns:
        (success, message)
    """
    try:
        if frontend_framework == 'react':
            return integrate_react_form(form_component_id, api_url, model_name, fields, frontend_dir)
        else:
            return False, f"Frontend integration for {frontend_framework} not yet implemented"
            
    except Exception as e:
        logger.error(f"Error integrating with frontend: {e}")
        return False, f"Error integrating with frontend: {str(e)}"

def integrate_react_form(
    form_component_id: str,
    api_url: str,
    model_name: str,
    fields: List[Dict[str, Any]],
    frontend_dir: Path
) -> Tuple[bool, str]:
    """Integrate API with React form."""
    try:
        # Find the form component file
        # This would need to search through generated files
        # For now, we'll create a utility function
        
        # Create API service file
        api_service_dir = frontend_dir / "src" / "services"
        api_service_dir.mkdir(parents=True, exist_ok=True)
        
        api_service_file = api_service_dir / f"{model_name.lower()}Api.js"
        
        service_code = f"""// API service for {model_name}
const API_BASE_URL = '{api_url}';

export const {model_name.lower()}Api = {{
  create: async (data) => {{
    const response = await fetch(`${{API_BASE_URL}}/api/{model_name.lower()}/`, {{
      method: 'POST',
      headers: {{
        'Content-Type': 'application/json',
      }},
      body: JSON.stringify(data),
    }});
    
    if (!response.ok) {{
      throw new Error(`HTTP error! status: ${{response.status}}`);
    }}
    
    return await response.json();
  }},
  
  getAll: async () => {{
    const response = await fetch(`${{API_BASE_URL}}/api/{model_name.lower()}/`);
    if (!response.ok) {{
      throw new Error(`HTTP error! status: ${{response.status}}`);
    }}
    return await response.json();
  }},
  
  getById: async (id) => {{
    const response = await fetch(`${{API_BASE_URL}}/api/{model_name.lower()}/${{id}}`);
    if (!response.ok) {{
      throw new Error(`HTTP error! status: ${{response.status}}`);
    }}
    return await response.json();
  }},
  
  update: async (id, data) => {{
    const response = await fetch(`${{API_BASE_URL}}/api/{model_name.lower()}/${{id}}`, {{
      method: 'PUT',
      headers: {{
        'Content-Type': 'application/json',
      }},
      body: JSON.stringify(data),
    }});
    
    if (!response.ok) {{
      throw new Error(`HTTP error! status: ${{response.status}}`);
    }}
    
    return await response.json();
  }},
  
  delete: async (id) => {{
    const response = await fetch(`${{API_BASE_URL}}/api/{model_name.lower()}/${{id}}`, {{
      method: 'DELETE',
    }});
    
    if (!response.ok) {{
      throw new Error(`HTTP error! status: ${{response.status}}`);
    }}
  }},
}};
"""
        
        with open(api_service_file, 'w') as f:
            f.write(service_code)
        
        logger.info(f"Created API service file: {api_service_file}")
        return True, f"API service created at {api_service_file}"
        
    except Exception as e:
        logger.error(f"Error creating React API service: {e}")
        return False, f"Error creating API service: {str(e)}"

def update_main_file(backend_dir: Path, model_name: str, backend_framework: str):
    """Update main.py to include the new routes."""
    try:
        main_file = backend_dir / "main.py"
        if not main_file.exists():
            return
        
        with open(main_file, 'r') as f:
            content = f.read()
        
        # Check if route is already imported
        route_import = f"from routers.{model_name.lower()}_routes import router as {model_name.lower()}_router"
        app_include = f"app.include_router({model_name.lower()}_router)"
        
        if route_import not in content:
            # Add import after other router imports
            import_pattern = r'(from routers\.[^\n]+\n)'
            if re.search(import_pattern, content):
                content = re.sub(
                    import_pattern,
                    f'\\1{route_import}\n',
                    content,
                    count=1
                )
            else:
                # Add after fastapi import
                content = content.replace(
                    'from fastapi import FastAPI',
                    f'from fastapi import FastAPI\n{route_import}'
                )
        
        if app_include not in content:
            # Add router include before app.run or at the end
            if 'if __name__' in content:
                content = content.replace(
                    'if __name__',
                    f'{app_include}\n\nif __name__'
                )
            else:
                content += f'\n{app_include}\n'
        
        with open(main_file, 'w') as f:
            f.write(content)
        
        logger.info(f"Updated main.py with {model_name} routes")
        
    except Exception as e:
        logger.error(f"Error updating main.py: {e}")

def generate_summary(
    model_name: str,
    fields: List[Dict[str, Any]],
    files_created: List[str],
    database_status: Optional[str],
    api_url: Optional[str],
    errors: List[str],
    warnings: List[str]
) -> str:
    """Generate detailed summary of API generation."""
    summary = f"""# API Generation Summary for {model_name.capitalize()}

## Model Information
- **Model Name**: {model_name}
- **Fields**: {len(fields)}
  {chr(10).join(f"  - {f['name']} ({f.get('db_type', 'String')})" for f in fields)}

## Files Created
{chr(10).join(f"- {f}" for f in files_created)}

## Database Status
{database_status or 'Not configured'}

## API Endpoints
- **Base URL**: {api_url or 'N/A'}
- **Create**: POST {api_url or ''}
- **Get All**: GET {api_url or ''}
- **Get by ID**: GET {api_url or ''}/{{id}}
- **Update**: PUT {api_url or ''}/{{id}}
- **Delete**: DELETE {api_url or ''}/{{id}}

"""
    
    if warnings:
        summary += f"## Warnings\n{chr(10).join(f'- {w}' for w in warnings)}\n\n"
    
    if errors:
        summary += f"## Errors\n{chr(10).join(f'- {e}' for e in errors)}\n\n"
    
    summary += "## Next Steps\n"
    summary += "1. Review the generated files\n"
    summary += "2. Run tests to verify API functionality\n"
    summary += "3. Update frontend form to use the API service\n"
    summary += "4. Test the complete flow end-to-end\n"
    
    return summary

def generate_form_api(
    component_id: str,
    component_data: Dict[str, Any],
    project_id: int,
    project: Any,
    db: Any
) -> Dict[str, Any]:
    """
    Main function to generate API for a form component.
    
    Returns:
        Dict with success status, summary, API URL, and details
    """
    result = {
        'success': False,
        'message': '',
        'summary': '',
        'api_url': None,
        'generated_model_name': None,  # Renamed from model_name to avoid Pydantic conflict
        'fields': [],
        'files_created': [],
        'database_status': None,
        'test_file': None,
        'errors': [],
        'warnings': []
    }
    
    try:
        # Step 1: Check project configuration
        backend_framework = project.backend_framework
        database_type = project.database_type
        frontend_framework = project.frontend_framework
        
        if not backend_framework:
            result['errors'].append("Backend framework not specified in project. Please configure backend framework.")
            result['message'] = "Backend framework not configured"
            return result
        
        if not database_type:
            result['warnings'].append("Database type not specified. API will be created but database operations may not work.")
        
        # Step 2: Find project directory
        safe_name = "".join(c for c in project.name if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_name = safe_name.replace(' ', '_').lower()
        project_dir = Path(GENERATED_APPS_DIR) / f"project_{project_id}_{safe_name}"
        backend_dir = project_dir / "backend"
        frontend_dir = project_dir / "frontend"
        
        if not project_dir.exists():
            result['errors'].append(f"Project directory not found: {project_dir}")
            result['message'] = "Project directory does not exist"
            return result
        
        # Step 3: Check backend structure
        structure_info = check_backend_structure(backend_dir)
        if not structure_info['exists']:
            result['errors'].append(f"Backend directory does not exist: {backend_dir}")
            result['message'] = "Backend structure not found"
            return result
        
        if not structure_info['structure_valid']:
            result['warnings'].extend([f"Missing file: {f}" for f in structure_info['missing_files']])
        
        # Step 4: Get all components from project to traverse child components
        all_components_list = []
        if project.component_tree:
            if isinstance(project.component_tree, list):
                all_components_list = project.component_tree
            elif isinstance(project.component_tree, dict):
                # If component_tree is a dict, try to extract components
                if 'components' in project.component_tree:
                    all_components_list = project.component_tree['components']
                elif 'items' in project.component_tree:
                    all_components_list = project.component_tree['items']
                else:
                    # Try to convert dict to list
                    all_components_list = [project.component_tree]
        
        # Step 5: Extract form fields (with all components for deep traversal through ALL layers)
        fields = extract_form_fields(component_data, all_components_list)
        
        # If no fields found from component tree, try reading the generated page file
        if not fields:
            logger.info("No fields found from component tree, trying to extract from generated page files...")
            
            # Try to find the page file that contains this form
            # Look for page files in frontend/src/pages/
            pages_dir = frontend_dir / "src" / "pages"
            if pages_dir.exists():
                # Try to find page files that might contain this form
                page_files = list(pages_dir.glob("*.js")) + list(pages_dir.glob("*.jsx")) + list(pages_dir.glob("*.ts")) + list(pages_dir.glob("*.tsx"))
                
                for page_file in page_files:
                    page_fields = extract_fields_from_generated_page(page_file)
                    if page_fields:
                        logger.info(f"Found {len(page_fields)} fields in {page_file.name}")
                        fields.extend(page_fields)
                        break  # Use first page that has fields
            
            # If still no fields, try to find form-related files
            if not fields:
                # Check all JS/JSX files in frontend/src
                src_dir = frontend_dir / "src"
                if src_dir.exists():
                    all_js_files = list(src_dir.rglob("*.js")) + list(src_dir.rglob("*.jsx"))
                    for js_file in all_js_files:
                        page_fields = extract_fields_from_generated_page(js_file)
                        if page_fields:
                            logger.info(f"Found {len(page_fields)} fields in {js_file.relative_to(frontend_dir)}")
                            fields.extend(page_fields)
                            break
        
        if not fields:
            result['errors'].append("No form fields found in component. Please ensure the component is a form with input fields.")
            result['message'] = "No form fields detected"
            result['warnings'].append(f"Component structure: {json.dumps(component_data, indent=2)[:500]}...")
            result['warnings'].append(f"Total components in project: {len(all_components_list)}")
            # Try to find child components
            if component_id:
                child_components = [c for c in all_components_list if isinstance(c, dict) and c.get('parentId') == component_id]
                result['warnings'].append(f"Direct child components found: {len(child_components)}")
                for child in child_components[:5]:  # Show first 5
                    result['warnings'].append(f"  - {child.get('type', 'unknown')} (id: {child.get('id', 'unknown')})")
            return result
        
        # Step 5: Generate model name from component
        model_name = component_data.get('props', {}).get('name') or component_data.get('id', 'form').replace('comp-', '').replace('-', '_')
        # Clean model name
        model_name = re.sub(r'[^a-zA-Z0-9_]', '', model_name)
        if not model_name:
            model_name = 'form'
        model_name = model_name.lower()
        
        result['generated_model_name'] = model_name
        result['fields'] = fields
        
        # Step 6: Check database connection
        if database_type:
            db_success, db_message, table_name = check_database_connection(
                database_type,
                project.database_url or '',
                project.database_name,
                project.database_host,
                project.database_port,
                project.database_username,
                project.database_password
            )
            
            if not db_success:
                result['warnings'].append(f"Database connection check failed: {db_message}")
                result['database_status'] = f"Connection failed: {db_message}"
            else:
                result['database_status'] = db_message
                
                # Step 7: Create database table
                if db_success:
                    table_success, table_message = create_database_table(
                        model_name, fields, backend_dir, database_type, project.database_url or ''
                    )
                    if table_success:
                        result['database_status'] = f"{db_message}. {table_message}"
                    else:
                        result['warnings'].append(f"Table creation: {table_message}")
        
        # Step 8: Generate database model
        model_success, model_path = generate_database_model(
            model_name, fields, backend_dir, database_type or 'postgresql'
        )
        if model_success:
            result['files_created'].append(f"Model: {model_path}")
        else:
            result['errors'].append(f"Model generation failed: {model_path}")
        
        # Step 9: Generate API routes
        routes_success, routes_path = generate_api_routes(
            model_name, fields, backend_dir, backend_framework
        )
        if routes_success:
            result['files_created'].append(f"Routes: {routes_path}")
        else:
            result['errors'].append(f"Routes generation failed: {routes_path}")
        
        # Step 10: Update main.py to include routes
        if routes_success:
            update_main_file(backend_dir, model_name, backend_framework)
        
        # Step 11: Generate test cases
        api_base_url = project.application_url or "http://localhost:8000"
        test_success, test_path = generate_test_cases(
            model_name, fields, backend_dir, backend_framework, api_base_url
        )
        if test_success:
            result['files_created'].append(f"Tests: {test_path}")
            result['test_file'] = test_path
        else:
            result['warnings'].append(f"Test generation: {test_path}")
        
        # Step 12: Integrate with frontend
        if frontend_framework:
            frontend_success, frontend_message = integrate_with_frontend(
                component_id, api_base_url, model_name, fields, frontend_dir, frontend_framework
            )
            if frontend_success:
                result['files_created'].append(f"Frontend service: {frontend_message}")
            else:
                result['warnings'].append(f"Frontend integration: {frontend_message}")
        
        # Step 13: Generate API URL
        result['api_url'] = f"{api_base_url}/api/{model_name.lower()}/"
        
        # Step 14: Generate summary
        result['summary'] = generate_summary(
            model_name, fields, result['files_created'], 
            result['database_status'], result['api_url'], 
            result['errors'], result['warnings']
        )
        
        # Determine overall success
        if len(result['errors']) == 0:
            result['success'] = True
            result['message'] = f"API for {model_name} generated successfully"
        else:
            result['message'] = f"API generation completed with {len(result['errors'])} error(s)"
        
        return result
        
    except Exception as e:
        logger.error(f"Error in generate_form_api: {e}", exc_info=True)
        result['errors'].append(f"Unexpected error: {str(e)}")
        result['message'] = f"Error generating API: {str(e)}"
        return result

