from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app import models, schemas
from app.auth import (
    authenticate_user, 
    create_access_token, 
    get_password_hash, 
    ACCESS_TOKEN_EXPIRE_MINUTES, 
    get_current_user,
    create_refresh_token_for_user,
    verify_refresh_token
)
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Validate passwords match
    if user.password != user.repeat_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    # Check if email already exists
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username already exists
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        first_name=user.first_name,
        last_name=user.last_name,
        personal_website=user.personal_website
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login", response_model=schemas.Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2PasswordRequestForm uses 'username' field, but we accept email or username
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    # Create refresh token
    refresh_token_obj = create_refresh_token_for_user(user.id, db)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token_obj.token,
        "token_type": "bearer"
    }

@router.post("/refresh", response_model=schemas.Token)
async def refresh_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Refresh access token using refresh token"""
    # OAuth2PasswordRequestForm uses 'username' field for refresh_token
    refresh_token = form_data.username
    token_obj = verify_refresh_token(refresh_token, db)
    if not token_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user
    user = db.query(models.User).filter(models.User.id == token_obj.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create new access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,  # Return same refresh token
        "token_type": "bearer"
    }

@router.post("/logout")
async def logout(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Revoke refresh token on logout"""
    # OAuth2PasswordRequestForm uses 'username' field for refresh_token
    refresh_token = form_data.username
    token_obj = db.query(models.RefreshToken).filter(
        models.RefreshToken.token == refresh_token
    ).first()
    if token_obj:
        token_obj.revoked = 1
        db.commit()
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=schemas.UserResponse)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

