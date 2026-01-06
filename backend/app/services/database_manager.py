"""
Database Management Service
Handles database creation, user creation, and permission granting.
"""

import logging
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

def create_database_and_grant_permissions(
    database_type: str,
    database_host: str,
    database_port: str,
    database_name: str,
    database_username: str,
    database_password: str,
    admin_username: Optional[str] = None,
    admin_password: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Create database and grant full permissions to the user.
    
    Args:
        database_type: Type of database (postgresql, mysql, sqlite, mongodb)
        database_host: Database host
        database_port: Database port
        database_name: Name of the database to create
        database_username: Username for the database user
        database_password: Password for the database user
        admin_username: Admin username (for creating database/user)
        admin_password: Admin password (for creating database/user)
    
    Returns:
        Tuple of (success: bool, message: str)
    """
    if not database_type or not database_name:
        return False, "Database type and name are required"
    
    try:
        if database_type == 'postgresql':
            return create_postgresql_database(
                database_host, database_port, database_name,
                database_username, database_password,
                admin_username, admin_password
            )
        elif database_type == 'mysql':
            return create_mysql_database(
                database_host, database_port, database_name,
                database_username, database_password,
                admin_username, admin_password
            )
        elif database_type == 'sqlite':
            return create_sqlite_database(database_name)
        elif database_type == 'mongodb':
            return create_mongodb_database(
                database_host, database_port, database_name,
                database_username, database_password,
                admin_username, admin_password
            )
        else:
            return False, f"Unsupported database type: {database_type}"
    except Exception as e:
        logger.error(f"Error creating database: {e}", exc_info=True)
        return False, f"Error creating database: {str(e)}"

def create_postgresql_database(
    host: str,
    port: str,
    database_name: str,
    username: str,
    password: str,
    admin_username: Optional[str] = None,
    admin_password: Optional[str] = None
) -> Tuple[bool, str]:
    """Create PostgreSQL database and user with full permissions."""
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
        
        # Use admin credentials if provided, otherwise use the user credentials
        conn_username = admin_username or username
        conn_password = admin_password or password
        
        # Connect to PostgreSQL server (connect to 'postgres' database to create new database)
        try:
            conn = psycopg2.connect(
                host=host or 'localhost',
                port=int(port or 5432),
                database='postgres',  # Connect to default database
                user=conn_username,
                password=conn_password
            )
        except psycopg2.OperationalError as e:
            # If admin credentials fail, try with user credentials
            if admin_username:
                try:
                    conn = psycopg2.connect(
                        host=host or 'localhost',
                        port=int(port or 5432),
                        database='postgres',
                        user=username,
                        password=password
                    )
                    conn_username = username
                    conn_password = password
                except:
                    return False, f"Cannot connect to PostgreSQL server: {str(e)}"
            else:
                return False, f"Cannot connect to PostgreSQL server: {str(e)}"
        
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (database_name,)
        )
        database_exists = cursor.fetchone() is not None
        
        if not database_exists:
            # Create database
            cursor.execute(f'CREATE DATABASE "{database_name}"')
            logger.info(f"Created PostgreSQL database: {database_name}")
        else:
            logger.info(f"PostgreSQL database already exists: {database_name}")
        
        # Check if user exists
        cursor.execute(
            "SELECT 1 FROM pg_user WHERE usename = %s",
            (username,)
        )
        user_exists = cursor.fetchone() is not None
        
        if not user_exists:
            # Create user
            cursor.execute(
                f"CREATE USER {username} WITH PASSWORD %s",
                (password,)
            )
            logger.info(f"Created PostgreSQL user: {username}")
        else:
            # Update password if user exists
            cursor.execute(
                f"ALTER USER {username} WITH PASSWORD %s",
                (password,)
            )
            logger.info(f"Updated password for PostgreSQL user: {username}")
        
        # Grant all privileges on the database to the user
        cursor.execute(f'GRANT ALL PRIVILEGES ON DATABASE "{database_name}" TO {username}')
        
        # Connect to the new database to grant schema privileges
        cursor.close()
        conn.close()
        
        # Connect to the new database
        conn = psycopg2.connect(
            host=host or 'localhost',
            port=int(port or 5432),
            database=database_name,
            user=conn_username,
            password=conn_password
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Grant all privileges on all tables in the public schema
        cursor.execute(f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {username}")
        cursor.execute(f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {username}")
        cursor.execute(f"GRANT ALL PRIVILEGES ON SCHEMA public TO {username}")
        
        # Grant default privileges for future tables
        cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {username}")
        cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {username}")
        
        cursor.close()
        conn.close()
        
        return True, f"Database '{database_name}' created and user '{username}' granted full permissions"
        
    except ImportError:
        return False, "psycopg2 not installed. Install with: pip install psycopg2-binary"
    except Exception as e:
        logger.error(f"Error creating PostgreSQL database: {e}", exc_info=True)
        return False, f"Error creating PostgreSQL database: {str(e)}"

def create_mysql_database(
    host: str,
    port: str,
    database_name: str,
    username: str,
    password: str,
    admin_username: Optional[str] = None,
    admin_password: Optional[str] = None
) -> Tuple[bool, str]:
    """Create MySQL database and user with full permissions."""
    try:
        import pymysql
        
        # Use admin credentials if provided, otherwise use the user credentials
        conn_username = admin_username or username
        conn_password = admin_password or password
        
        # Connect to MySQL server
        try:
            conn = pymysql.connect(
                host=host or 'localhost',
                port=int(port or 3306),
                user=conn_username,
                password=conn_password
            )
        except pymysql.Error as e:
            # If admin credentials fail, try with user credentials
            if admin_username:
                try:
                    conn = pymysql.connect(
                        host=host or 'localhost',
                        port=int(port or 3306),
                        user=username,
                        password=password
                    )
                    conn_username = username
                    conn_password = password
                except:
                    return False, f"Cannot connect to MySQL server: {str(e)}"
            else:
                return False, f"Cannot connect to MySQL server: {str(e)}"
        
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute("SHOW DATABASES LIKE %s", (database_name,))
        database_exists = cursor.fetchone() is not None
        
        if not database_exists:
            # Create database
            cursor.execute(f"CREATE DATABASE `{database_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            logger.info(f"Created MySQL database: {database_name}")
        else:
            logger.info(f"MySQL database already exists: {database_name}")
        
        # Check if user exists
        cursor.execute("SELECT User FROM mysql.user WHERE User = %s AND Host = %s", (username, '%'))
        user_exists = cursor.fetchone() is not None
        
        if not user_exists:
            # Create user with password
            cursor.execute(f"CREATE USER '{username}'@'%' IDENTIFIED BY %s", (password,))
            logger.info(f"Created MySQL user: {username}")
        else:
            # Update password if user exists
            cursor.execute(f"ALTER USER '{username}'@'%' IDENTIFIED BY %s", (password,))
            logger.info(f"Updated password for MySQL user: {username}")
        
        # Grant all privileges on the database to the user
        cursor.execute(f"GRANT ALL PRIVILEGES ON `{database_name}`.* TO '{username}'@'%'")
        
        # Flush privileges
        cursor.execute("FLUSH PRIVILEGES")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return True, f"Database '{database_name}' created and user '{username}' granted full permissions"
        
    except ImportError:
        return False, "pymysql not installed. Install with: pip install pymysql"
    except Exception as e:
        logger.error(f"Error creating MySQL database: {e}", exc_info=True)
        return False, f"Error creating MySQL database: {str(e)}"

def create_sqlite_database(database_name: str) -> Tuple[bool, str]:
    """Create SQLite database file."""
    try:
        import sqlite3
        from pathlib import Path
        
        # SQLite doesn't need user creation or permissions
        # Just ensure the database file path exists
        db_path = Path(database_name)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create/connect to database file
        conn = sqlite3.connect(str(db_path))
        conn.close()
        
        logger.info(f"SQLite database file created/verified: {database_name}")
        return True, f"SQLite database '{database_name}' ready"
        
    except Exception as e:
        logger.error(f"Error creating SQLite database: {e}", exc_info=True)
        return False, f"Error creating SQLite database: {str(e)}"

def create_mongodb_database(
    host: str,
    port: str,
    database_name: str,
    username: str,
    password: str,
    admin_username: Optional[str] = None,
    admin_password: Optional[str] = None
) -> Tuple[bool, str]:
    """Create MongoDB database and user with full permissions."""
    try:
        from pymongo import MongoClient
        
        # Use admin credentials if provided
        conn_username = admin_username or username
        conn_password = admin_password or password
        
        # Connect to MongoDB
        if conn_username and conn_password:
            mongo_url = f"mongodb://{conn_username}:{conn_password}@{host or 'localhost'}:{int(port or 27017)}/admin"
        else:
            mongo_url = f"mongodb://{host or 'localhost'}:{int(port or 27017)}"
        
        client = MongoClient(mongo_url)
        
        # MongoDB creates databases automatically when you write to them
        # Just verify connection
        client.admin.command('ping')
        
        # Get the database (creates it if it doesn't exist)
        db = client[database_name]
        
        # Check if user exists
        existing_users = db.command("usersInfo")
        user_exists = any(user['user'] == username for user in existing_users.get('users', []))
        
        if not user_exists:
            # Create user with readWrite role on the database
            db.command(
                "createUser",
                username,
                pwd=password,
                roles=[{"role": "readWrite", "db": database_name}]
            )
            logger.info(f"Created MongoDB user: {username}")
        else:
            # Update password if user exists
            db.command(
                "updateUser",
                username,
                pwd=password
            )
            logger.info(f"Updated password for MongoDB user: {username}")
        
        client.close()
        
        return True, f"Database '{database_name}' ready and user '{username}' granted permissions"
        
    except ImportError:
        return False, "pymongo not installed. Install with: pip install pymongo"
    except Exception as e:
        logger.error(f"Error creating MongoDB database: {e}", exc_info=True)
        return False, f"Error creating MongoDB database: {str(e)}"

def check_database_exists(
    database_type: str,
    database_host: str,
    database_port: str,
    database_name: str,
    database_username: str,
    database_password: str
) -> Tuple[bool, bool]:
    """
    Check if database exists.
    
    Returns:
        Tuple of (database_exists: bool, connection_successful: bool)
    """
    try:
        if database_type == 'postgresql':
            import psycopg2
            conn = psycopg2.connect(
                host=database_host or 'localhost',
                port=int(database_port or 5432),
                database='postgres',
                user=database_username,
                password=database_password
            )
            cursor = conn.cursor()
            cursor.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (database_name,)
            )
            exists = cursor.fetchone() is not None
            cursor.close()
            conn.close()
            return exists, True
            
        elif database_type == 'mysql':
            import pymysql
            conn = pymysql.connect(
                host=database_host or 'localhost',
                port=int(database_port or 3306),
                user=database_username,
                password=database_password
            )
            cursor = conn.cursor()
            cursor.execute("SHOW DATABASES LIKE %s", (database_name,))
            exists = cursor.fetchone() is not None
            cursor.close()
            conn.close()
            return exists, True
            
        elif database_type == 'sqlite':
            from pathlib import Path
            return Path(database_name).exists(), True
            
        elif database_type == 'mongodb':
            from pymongo import MongoClient
            mongo_url = f"mongodb://{database_username}:{database_password}@{database_host or 'localhost'}:{int(database_port or 27017)}"
            client = MongoClient(mongo_url)
            client.admin.command('ping')
            # List databases
            db_list = client.list_database_names()
            exists = database_name in db_list
            client.close()
            return exists, True
            
        else:
            return False, False
            
    except Exception as e:
        logger.error(f"Error checking database existence: {e}")
        return False, False

