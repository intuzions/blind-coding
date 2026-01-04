"""add_database_fields

Revision ID: add_database_fields
Revises: ea81f7d869c9
Create Date: 2024-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_database_fields'
down_revision = '6e36da17f767'  # Point to the other head to merge branches
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('database_type', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('database_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'database_url')
    op.drop_column('projects', 'database_type')

