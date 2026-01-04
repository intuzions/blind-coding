from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app import models, schemas
from app.database import get_db
import os
import secrets

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
REFRESH_TOKEN_SECRET_KEY = os.getenv("REFRESH_TOKEN_SECRET_KEY", "your-refresh-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def truncate_password_for_bcrypt(password: str) -> str:
    """
    Truncate password to 72 bytes for bcrypt compatibility.
    Bcrypt has a 72-byte limit, so we need to truncate if the password is longer.
    We truncate by bytes (not characters) to handle multi-byte UTF-8 characters safely.
    """
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        # Truncate to 72 bytes, but ensure we don't cut a multi-byte character
        truncated = password_bytes[:72]
        # Try to decode, if it fails (incomplete character), remove last byte and try again
        while True:
            try:
                return truncated.decode('utf-8')
            except UnicodeDecodeError:
                if len(truncated) == 0:
                    return ''
                truncated = truncated[:-1]
    return password

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Bcrypt has a 72-byte limit, so truncate if necessary
    truncated_password = truncate_password_for_bcrypt(plain_password)
    return pwd_context.verify(truncated_password, hashed_password)

def get_password_hash(password: str) -> str:
    # Bcrypt has a 72-byte limit, so truncate if necessary
    truncated_password = truncate_password_for_bcrypt(password)
    return pwd_context.hash(truncated_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token() -> str:
    """Generate a secure random refresh token"""
    return secrets.token_urlsafe(32)

def verify_refresh_token(token: str, db: Session) -> Optional[models.RefreshToken]:
    """Verify if refresh token is valid and not revoked"""
    refresh_token = db.query(models.RefreshToken).filter(
        models.RefreshToken.token == token,
        models.RefreshToken.revoked == 0,
        models.RefreshToken.expires_at > datetime.utcnow()
    ).first()
    return refresh_token

def create_refresh_token_for_user(user_id: int, db: Session) -> models.RefreshToken:
    """Create and store a refresh token for a user"""
    # Revoke all existing refresh tokens for this user
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user_id,
        models.RefreshToken.revoked == 0
    ).update({"revoked": 1})
    
    # Create new refresh token
    token = create_refresh_token()
    expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    refresh_token = models.RefreshToken(
        token=token,
        user_id=user_id,
        expires_at=expires_at
    )
    db.add(refresh_token)
    db.commit()
    db.refresh(refresh_token)
    return refresh_token

def authenticate_user(db: Session, email_or_username: str, password: str):
    # Try to find user by email first, then by username
    user = db.query(models.User).filter(models.User.email == email_or_username).first()
    if not user:
        user = db.query(models.User).filter(models.User.username == email_or_username).first()
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

