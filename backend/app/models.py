from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    personal_website = Column(String, nullable=True)
    is_admin = Column(Integer, default=0)  # 0 = regular user, 1 = admin
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    projects = relationship("Project", back_populates="owner")
    refresh_tokens = relationship("RefreshToken", back_populates="user")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked = Column(Integer, default=0)  # 0 = active, 1 = revoked

    user = relationship("User", back_populates="refresh_tokens")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    html_content = Column(Text, nullable=True)
    css_content = Column(Text, nullable=True)
    component_tree = Column(JSON, nullable=True)
    configuration = Column(JSON, nullable=True)  # Store project configuration as JSON
    image_url = Column(String, nullable=True)
    published = Column(String, nullable=True)
    frontend_framework = Column(String, nullable=True)  # e.g., 'react', 'vue', 'angular'
    backend_framework = Column(String, nullable=True)  # e.g., 'fastapi', 'express', 'django'
    application_url = Column(String, nullable=True)  # URL to access the generated application
    database_type = Column(String, nullable=True)  # e.g., 'postgresql', 'mysql', 'sqlite', 'mongodb'
    database_url = Column(String, nullable=True)  # Database connection URL
    database_name = Column(String, nullable=True)  # Database name
    database_username = Column(String, nullable=True)  # Database username
    database_password = Column(String, nullable=True)  # Database password
    database_host = Column(String, nullable=True)  # Database host
    database_port = Column(String, nullable=True)  # Database port
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="projects")

class ApplicationSettings(Base):
    __tablename__ = "application_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

