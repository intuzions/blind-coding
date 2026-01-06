"""add is_admin field to users table

Revision ID: add_is_admin_field
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_is_admin_field'
down_revision = 'c40122de3f41'  # Latest migration
branch_labels = None
depends_on = None

def upgrade():
    # Add is_admin column to users table
    op.add_column('users', sa.Column('is_admin', sa.Integer(), nullable=True, server_default='0'))
    
    # Update existing users to have is_admin = 0 (regular user)
    op.execute("UPDATE users SET is_admin = 0 WHERE is_admin IS NULL")

def downgrade():
    # Remove is_admin column
    op.drop_column('users', 'is_admin')

