"""
Smart Attendance System - Authentication Module
JWT-based auth with bcrypt password hashing and role-based access control.
"""

from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import logging

from app.config import settings
from app.database import get_db
from app import models, schemas

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: Union[str, int], role: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject), "role": role, "type": "access"}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(subject: Union[str, int]) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh"}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[schemas.TokenPayload]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        exp: datetime = payload.get("exp")
        if user_id is None:
            return None
        return schemas.TokenPayload(sub=int(user_id), role=role, exp=exp)
    except JWTError as e:
        logger.debug(f"Token decode error: {e}")
        return None


def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> models.AdminUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token_data = decode_token(credentials.credentials)
    if token_data is None or token_data.sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    admin = db.query(models.AdminUser).filter(models.AdminUser.id == token_data.sub).first()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    
    return admin


def require_role(allowed_roles: list):
    """Dependency factory to require specific admin roles."""
    def role_checker(admin: models.AdminUser = Depends(get_current_admin)):
        if admin.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(allowed_roles)}",
            )
        return admin
    return role_checker


require_super_admin = require_role(["super_admin"])
require_admin = require_role(["super_admin", "admin"])
require_viewer = require_role(["super_admin", "admin", "viewer"])


def authenticate_admin(db: Session, username: str, password: str) -> Optional[models.AdminUser]:
    admin = db.query(models.AdminUser).filter(models.AdminUser.username == username).first()
    if not admin:
        return None
    if not verify_password(password, admin.password_hash):
        # Track failed attempts
        admin.login_attempts = (admin.login_attempts or 0) + 1
        if admin.login_attempts >= 5:
            admin.locked_until = datetime.utcnow() + timedelta(minutes=30)
        db.commit()
        return None
    
    # Reset login attempts on success
    admin.login_attempts = 0
    admin.locked_until = None
    admin.last_login = datetime.utcnow()
    db.commit()
    
    return admin


def create_default_admin(db: Session):
    """Create default admin account if none exists."""
    existing = db.query(models.AdminUser).first()
    if existing:
        return
    
    admin = models.AdminUser(
        username="admin",
        password_hash=get_password_hash("admin123"),
        full_name="System Administrator",
        email="admin@smartattendance.local",
        role="super_admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    logger.info("Created default admin account (username: admin, password: admin123)")
