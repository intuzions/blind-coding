from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, Union, List
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    username: str

class UserCreate(UserBase):
    password: str
    repeat_password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    personal_website: Optional[str] = None

class UserResponse(UserBase):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    personal_website: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    frontend_framework: Optional[str] = None
    backend_framework: Optional[str] = None
    database_type: Optional[str] = None
    database_url: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    component_tree: Optional[Union[Dict[str, Any], List[Any]]] = None  # Can be dict or list
    configuration: Optional[Union[Dict[str, Any], List[Any]]] = None  # Project configuration as JSON (can be dict or list)
    image_url: Optional[str] = None
    published: Optional[str] = None
    frontend_framework: Optional[str] = None
    backend_framework: Optional[str] = None
    application_url: Optional[str] = None
    database_type: Optional[str] = None
    database_url: Optional[str] = None

class ProjectResponse(ProjectBase):
    id: int
    user_id: int
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    component_tree: Optional[Union[Dict[str, Any], List[Any]]] = None  # Can be dict or list
    configuration: Optional[Union[Dict[str, Any], List[Any]]] = None  # Project configuration as JSON (can be dict or list)
    image_url: Optional[str] = None
    published: Optional[str] = None
    frontend_framework: Optional[str] = None
    backend_framework: Optional[str] = None
    application_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

