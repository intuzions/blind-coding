"""add_database_connection_fields

Revision ID: add_db_conn_fields
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_db_conn_fields'
down_revision = 'beddee1470c1'  # Latest migration head
branch_labels = None
depends_on = None


def upgrade():
    # Add new database connection fields
    op.add_column('projects', sa.Column('database_name', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('database_username', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('database_password', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('database_host', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('database_port', sa.String(), nullable=True))


def downgrade():
    # Remove the new database connection fields
    op.drop_column('projects', 'database_port')
    op.drop_column('projects', 'database_host')
    op.drop_column('projects', 'database_password')
    op.drop_column('projects', 'database_username')
    op.drop_column('projects', 'database_name')

