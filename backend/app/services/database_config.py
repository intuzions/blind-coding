"""
Database configuration service for setting up database connections in generated applications.
"""
import os
import re
from typing import Dict, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

def parse_database_url(database_url: str, database_type: str) -> Dict[str, str]:
    """
    Parse database URL into connection parameters.
    
    Returns:
        Dict with connection parameters (host, port, database, user, password, etc.)
    """
    if not database_url:
        return {}
    
    try:
        if database_type == 'postgresql':
            # postgresql://user:password@host:port/database
            pattern = r'postgresql://(?:([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?/(.+)'
            match = re.match(pattern, database_url)
            if match:
                user, password, host, port, database = match.groups()
                return {
                    'user': user or 'postgres',
                    'password': password or '',
                    'host': host or 'localhost',
                    'port': port or '5432',
                    'database': database
                }
        
        elif database_type == 'mysql':
            # mysql://user:password@host:port/database
            pattern = r'mysql://(?:([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?/(.+)'
            match = re.match(pattern, database_url)
            if match:
                user, password, host, port, database = match.groups()
                return {
                    'user': user or 'root',
                    'password': password or '',
                    'host': host or 'localhost',
                    'port': port or '3306',
                    'database': database
                }
        
        elif database_type == 'sqlite':
            # sqlite:///path/to/database.db
            pattern = r'sqlite:///(.+)'
            match = re.match(pattern, database_url)
            if match:
                path = match.group(1)
                return {
                    'database': path
                }
        
        elif database_type == 'mongodb':
            # mongodb://user:password@host:port/database
            pattern = r'mongodb://(?:([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?/(.+)'
            match = re.match(pattern, database_url)
            if match:
                user, password, host, port, database = match.groups()
                return {
                    'user': user or '',
                    'password': password or '',
                    'host': host or 'localhost',
                    'port': port or '27017',
                    'database': database
                }
    except Exception as e:
        logger.error(f"Error parsing database URL: {e}")
    
    return {}

def generate_database_config(
    backend_dir: Path,
    database_type: Optional[str],
    database_url: Optional[str],
    project_name: str
) -> bool:
    """
    Generate database configuration files for the backend.
    
    Returns:
        True if successful, False otherwise
    """
    if not database_type or not database_url:
        logger.info("No database configuration provided, skipping database setup")
        return True
    
    try:
        # Parse database URL
        db_params = parse_database_url(database_url, database_type)
        
        if database_type == 'postgresql':
            return generate_postgresql_config(backend_dir, db_params, project_name)
        elif database_type == 'mysql':
            return generate_mysql_config(backend_dir, db_params, project_name)
        elif database_type == 'sqlite':
            return generate_sqlite_config(backend_dir, db_params, project_name)
        elif database_type == 'mongodb':
            return generate_mongodb_config(backend_dir, db_params, project_name)
        else:
            logger.warning(f"Unsupported database type: {database_type}")
            return False
    except Exception as e:
        logger.error(f"Error generating database config: {e}")
        return False

def generate_postgresql_config(backend_dir: Path, db_params: Dict[str, str], project_name: str) -> bool:
    """Generate PostgreSQL configuration."""
    try:
        # database.py
        database_py = f"""from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://{db_params.get('user', 'postgres')}:{db_params.get('password', '')}@{db_params.get('host', 'localhost')}:{db_params.get('port', '5432')}/{db_params.get('database', project_name.lower().replace(' ', '_'))}"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
"""
        
        with open(backend_dir / "database.py", "w") as f:
            f.write(database_py)
        
        # Update requirements.txt
        requirements_path = backend_dir / "requirements.txt"
        requirements = ""
        if requirements_path.exists():
            with open(requirements_path, "r") as f:
                requirements = f.read()
        
        if "sqlalchemy" not in requirements:
            requirements += "\nsqlalchemy==2.0.23\n"
        if "psycopg2-binary" not in requirements:
            requirements += "psycopg2-binary==2.9.9\n"
        
        with open(requirements_path, "w") as f:
            f.write(requirements)
        
        # Create models.py template
        models_py = """from sqlalchemy import Column, Integer, String, DateTime, func
from database import Base

class Item(Base):
    __tablename__ = "items"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
"""
        
        models_dir = backend_dir / "models.py"
        if not models_dir.exists():
            with open(models_dir, "w") as f:
                f.write(models_py)
        
        # Create alembic.ini and migrations directory
        alembic_ini = """[alembic]
script_location = alembic
prepend_sys_path = .
version_path_separator = os

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
"""
        
        alembic_dir = backend_dir / "alembic"
        alembic_dir.mkdir(exist_ok=True)
        
        with open(backend_dir / "alembic.ini", "w") as f:
            f.write(alembic_ini)
        
        # Create env.py for Alembic
        env_py = """from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
from database import Base
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Import your models here
# from models import Item

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    url = os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={{"paramstyle": "named"}},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
"""
        
        with open(alembic_dir / "env.py", "w") as f:
            f.write(env_py)
        
        # Create script.py.mako template
        script_template = """\"\"\"${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

\"\"\"
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
"""
        
        with open(alembic_dir / "script.py.mako", "w") as f:
            f.write(script_template)
        
        # Create versions directory
        (alembic_dir / "versions").mkdir(exist_ok=True)
        
        logger.info(f"Generated PostgreSQL configuration for {project_name}")
        return True
    except Exception as e:
        logger.error(f"Error generating PostgreSQL config: {e}")
        return False

def generate_mysql_config(backend_dir: Path, db_params: Dict[str, str], project_name: str) -> bool:
    """Generate MySQL configuration."""
    try:
        database_py = f"""from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://{db_params.get('user', 'root')}:{db_params.get('password', '')}@{db_params.get('host', 'localhost')}:{db_params.get('port', '3306')}/{db_params.get('database', project_name.lower().replace(' ', '_'))}"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
"""
        
        with open(backend_dir / "database.py", "w") as f:
            f.write(database_py)
        
        # Update requirements.txt
        requirements_path = backend_dir / "requirements.txt"
        requirements = ""
        if requirements_path.exists():
            with open(requirements_path, "r") as f:
                requirements = f.read()
        
        if "sqlalchemy" not in requirements:
            requirements += "\nsqlalchemy==2.0.23\n"
        if "pymysql" not in requirements:
            requirements += "pymysql==1.1.0\n"
        
        with open(requirements_path, "w") as f:
            f.write(requirements)
        
        logger.info(f"Generated MySQL configuration for {project_name}")
        return True
    except Exception as e:
        logger.error(f"Error generating MySQL config: {e}")
        return False

def generate_sqlite_config(backend_dir: Path, db_params: Dict[str, str], project_name: str) -> bool:
    """Generate SQLite configuration."""
    try:
        db_path = db_params.get('database', f"{project_name.lower().replace(' ', '_')}.db")
        database_py = f"""from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///./{db_path}")

engine = create_engine(DATABASE_URL, connect_args={{"check_same_thread": False}})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
"""
        
        with open(backend_dir / "database.py", "w") as f:
            f.write(database_py)
        
        # Update requirements.txt
        requirements_path = backend_dir / "requirements.txt"
        requirements = ""
        if requirements_path.exists():
            with open(requirements_path, "r") as f:
                requirements = f.read()
        
        if "sqlalchemy" not in requirements:
            requirements += "\nsqlalchemy==2.0.23\n"
        
        with open(requirements_path, "w") as f:
            f.write(requirements)
        
        logger.info(f"Generated SQLite configuration for {project_name}")
        return True
    except Exception as e:
        logger.error(f"Error generating SQLite config: {e}")
        return False

def generate_mongodb_config(backend_dir: Path, db_params: Dict[str, str], project_name: str) -> bool:
    """Generate MongoDB configuration."""
    try:
        database_py = f"""from pymongo import MongoClient
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mongodb://{db_params.get('user', '')}:{db_params.get('password', '')}@{db_params.get('host', 'localhost')}:{db_params.get('port', '27017')}/{db_params.get('database', project_name.lower().replace(' ', '_'))}"
)

client = MongoClient(DATABASE_URL)
db = client[{db_params.get('database', project_name.lower().replace(' ', '_'))}]

def get_db():
    return db
"""
        
        with open(backend_dir / "database.py", "w") as f:
            f.write(database_py)
        
        # Update requirements.txt
        requirements_path = backend_dir / "requirements.txt"
        requirements = ""
        if requirements_path.exists():
            with open(requirements_path, "r") as f:
                requirements = f.read()
        
        if "pymongo" not in requirements:
            requirements += "\npymongo==4.6.0\n"
        
        with open(requirements_path, "w") as f:
            f.write(requirements)
        
        logger.info(f"Generated MongoDB configuration for {project_name}")
        return True
    except Exception as e:
        logger.error(f"Error generating MongoDB config: {e}")
        return False






