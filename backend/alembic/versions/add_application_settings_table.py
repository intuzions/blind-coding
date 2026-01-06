"""add application_settings table

Revision ID: add_application_settings
Revises: add_is_admin_field
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_application_settings'
down_revision = 'add_is_admin_field'
branch_labels = None
depends_on = None

def upgrade():
    # Create application_settings table
    op.create_table(
        'application_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_application_settings_id'), 'application_settings', ['id'], unique=False)
    op.create_index(op.f('ix_application_settings_key'), 'application_settings', ['key'], unique=True)

def downgrade():
    # Drop application_settings table
    op.drop_index(op.f('ix_application_settings_key'), table_name='application_settings')
    op.drop_index(op.f('ix_application_settings_id'), table_name='application_settings')
    op.drop_table('application_settings')

