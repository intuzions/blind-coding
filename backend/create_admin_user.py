"""
Script to create an admin user for the no-code application.
Run this script to create an admin user with full access.

Usage:
    python create_admin_user.py
    or
    python create_admin_user.py --username admin --email admin@example.com --password admin123
"""

import argparse
import sys
from app.database import SessionLocal
from app import models
from app.auth import get_password_hash

def create_admin_user(username: str = "admin", email: str = "admin@nocode.com", password: str = "admin123"):
    """Create an admin user."""
    db = SessionLocal()
    try:
        # Check if admin user already exists
        existing_user = db.query(models.User).filter(
            (models.User.username == username) | (models.User.email == email)
        ).first()
        
        if existing_user:
            # Update existing user to admin
            existing_user.is_admin = 1
            existing_user.hashed_password = get_password_hash(password)
            db.commit()
            print(f"✅ Updated existing user '{username}' to admin")
            return existing_user
        else:
            # Create new admin user
            admin_user = models.User(
                username=username,
                email=email,
                hashed_password=get_password_hash(password),
                is_admin=1
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print(f"✅ Admin user created successfully!")
            print(f"   Username: {username}")
            print(f"   Email: {email}")
            print(f"   Password: {password}")
            print(f"   Admin: Yes")
            return admin_user
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating admin user: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create an admin user for the no-code application")
    parser.add_argument("--username", default="admin", help="Admin username (default: admin)")
    parser.add_argument("--email", default="admin@nocode.com", help="Admin email (default: admin@nocode.com)")
    parser.add_argument("--password", default="admin123", help="Admin password (default: admin123)")
    
    args = parser.parse_args()
    
    create_admin_user(args.username, args.email, args.password)

