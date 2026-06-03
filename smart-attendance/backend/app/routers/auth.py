"""
Auth Router - Authentication endpoints for admin users.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.auth import (
    authenticate_admin, create_access_token, create_refresh_token,
    get_current_admin, require_super_admin, pwd_context
)
from app import models, schemas
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


@router.post("/login", response_model=schemas.LoginResponse)
def login(request: Request, credentials: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Authenticate admin user and return JWT tokens."""
    admin = authenticate_admin(db, credentials.username, credentials.password)
    
    if not admin:
        logger.warning(f"Failed login attempt for user '{credentials.username}' from {request.client.host}")
        return schemas.LoginResponse(
            success=False,
            message="Invalid username or password"
        )
    
    # Check if account is locked
    from datetime import datetime
    if admin.locked_until and datetime.utcnow() < admin.locked_until:
        return schemas.LoginResponse(
            success=False,
            message=f"Account locked. Try again after {admin.locked_until.isoformat()}"
        )
    
    # Create tokens
    access_token = create_access_token(admin.id, admin.role)
    refresh_token = create_refresh_token(admin.id)
    
    logger.info(f"Admin '{admin.username}' logged in from {request.client.host}")
    
    return schemas.LoginResponse(
        success=True,
        token=schemas.Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        ),
        user={
            "id": admin.id,
            "username": admin.username,
            "full_name": admin.full_name,
            "email": admin.email,
            "role": admin.role,
        }
    )


@router.post("/refresh", response_model=schemas.Token)
def refresh_token(refresh_token: str, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""
    from app.auth import decode_token
    
    payload = decode_token(refresh_token)
    if payload is None or payload.sub is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    
    admin = db.query(models.AdminUser).filter(models.AdminUser.id == payload.sub).first()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    
    access_token = create_access_token(admin.id, admin.role)
    new_refresh = create_refresh_token(admin.id)
    
    return schemas.Token(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.get("/me")
def get_me(admin: models.AdminUser = Depends(get_current_admin)):
    """Get current admin user info."""
    return {
        "id": admin.id,
        "username": admin.username,
        "full_name": admin.full_name,
        "email": admin.email,
        "role": admin.role,
    }


@router.post("/change-password")
def change_password(
    current_password: str,
    new_password: str,
    admin: models.AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Change admin password."""
    if not pwd_context.verify(current_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    if len(new_password) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters")
    
    admin.password_hash = pwd_context.hash(new_password)
    db.commit()
    
    logger.info(f"Admin '{admin.username}' changed password")
    return {"success": True, "message": "Password changed successfully"}


@router.get("/admins", dependencies=[Depends(require_super_admin)])
def list_admins(db: Session = Depends(get_db)):
    """List all admin accounts (super admin only)."""
    admins = db.query(models.AdminUser).all()
    return [
        {
            "id": a.id,
            "username": a.username,
            "full_name": a.full_name,
            "email": a.email,
            "role": a.role,
            "is_active": a.is_active,
            "last_login": a.last_login.isoformat() if a.last_login else None,
        }
        for a in admins
    ]


@router.post("/admins", dependencies=[Depends(require_super_admin)])
def create_admin(
    username: str,
    password: str,
    full_name: str = "",
    email: str = "",
    role: str = "admin",
    db: Session = Depends(get_db)
):
    """Create new admin account (super admin only)."""
    existing = db.query(models.AdminUser).filter(models.AdminUser.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    admin = models.AdminUser(
        username=username,
        password_hash=pwd_context.hash(password),
        full_name=full_name,
        email=email,
        role=role,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    
    logger.info(f"New admin account created: {username} with role {role}")
    return {"success": True, "id": admin.id, "message": "Admin created successfully"}
