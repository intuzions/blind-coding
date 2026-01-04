"""add framework fields

Revision ID: add_framework_fields
Revises: 
Create Date: 2024-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_framework_fields'
down_revision = 'ea81f7d869c9'  # Points to the latest migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('frontend_framework', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('backend_framework', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('application_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'application_url')
    op.drop_column('projects', 'backend_framework')
    op.drop_column('projects', 'frontend_framework')

