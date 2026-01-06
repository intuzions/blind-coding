"""
Centralized settings loader that reads from database first, then falls back to os.getenv.
DATABASE_URL is always read from .env file (required for initial database connection).
All other settings are read from the database.
"""
import os
import logging
from typing import Optional, Dict, Any
from functools import lru_cache
from app.database import SessionLocal
from app import models
from app.services.settings_manager import load_settings_from_database

logger = logging.getLogger(__name__)

# Cache for settings to avoid repeated database queries
_settings_cache: Optional[Dict[str, Any]] = None
_cache_timestamp: float = 0
_cache_ttl: float = 60  # Cache for 60 seconds

def _get_settings_from_db() -> Dict[str, Any]:
    """Load settings from database. Returns empty dict if database is not available."""
    global _settings_cache, _cache_timestamp
    
    try:
        db = SessionLocal()
        try:
            settings = load_settings_from_database(db)
            _settings_cache = settings
            import time
            _cache_timestamp = time.time()
            return settings
        finally:
            db.close()
    except Exception as e:
        logger.debug(f"Could not load settings from database: {e}")
        # Return empty dict to fall back to os.getenv
        return {}

def _refresh_cache_if_needed():
    """Refresh cache if it's expired or doesn't exist."""
    global _settings_cache, _cache_timestamp
    import time
    
    current_time = time.time()
    if _settings_cache is None or (current_time - _cache_timestamp) > _cache_ttl:
        _get_settings_from_db()

def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """
    Get a setting value from database first, then fall back to os.getenv.
    
    Args:
        key: The setting key to retrieve
        default: Default value if not found in database or environment
    
    Returns:
        The setting value, or default if not found
    """
    # DATABASE_URL is always read from .env (required for initial connection)
    if key == "DATABASE_URL":
        return os.getenv("DATABASE_URL", default)
    
    # Refresh cache if needed
    _refresh_cache_if_needed()
    
    # Try database first
    if _settings_cache:
        # Check direct key
        if key in _settings_cache:
            value = _settings_cache[key]
            # Convert to string if needed
            if value is not None:
                return str(value)
        
        # Check environment_variables dict
        if 'environment_variables' in _settings_cache:
            env_vars = _settings_cache['environment_variables']
            if isinstance(env_vars, dict) and key in env_vars:
                env_var = env_vars[key]
                if isinstance(env_var, dict) and 'value' in env_var:
                    return str(env_var['value'])
                elif isinstance(env_var, str):
                    return env_var
    
    # Fallback to os.getenv
    return os.getenv(key, default)

def get_setting_bool(key: str, default: bool = False) -> bool:
    """Get a boolean setting value."""
    value = get_setting(key)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes', 'on', 't')
    return bool(value)

def get_setting_int(key: str, default: int = 0) -> int:
    """Get an integer setting value."""
    value = get_setting(key)
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default

def clear_cache():
    """Clear the settings cache to force a refresh on next access."""
    global _settings_cache, _cache_timestamp
    _settings_cache = None
    _cache_timestamp = 0

# Convenience functions for common settings
def get_secret_key() -> str:
    """Get SECRET_KEY from database or environment."""
    return get_setting("SECRET_KEY", "your-secret-key-change-this-in-production")

def get_refresh_token_secret_key() -> str:
    """Get REFRESH_TOKEN_SECRET_KEY from database or environment."""
    return get_setting("REFRESH_TOKEN_SECRET_KEY", "your-refresh-secret-key-change-this-in-production")

def get_system_id() -> Optional[str]:
    """Get SYSTEM_ID from database or environment."""
    return get_setting("SYSTEM_ID")

def get_ollama_url() -> str:
    """Get OLLAMA_URL from database or environment."""
    return get_setting("OLLAMA_URL", "http://localhost:11434")

def get_ollama_model() -> Optional[str]:
    """Get OLLAMA_MODEL from database or environment."""
    return get_setting("OLLAMA_MODEL")

def get_ollama_timeout() -> int:
    """Get OLLAMA_TIMEOUT from database or environment."""
    return get_setting_int("OLLAMA_TIMEOUT", 120)

def get_base_url() -> str:
    """Get BASE_URL from database or environment."""
    return get_setting("BASE_URL", "http://localhost")

def get_generated_apps_dir() -> str:
    """Get GENERATED_APPS_DIR from database or environment."""
    return get_setting("GENERATED_APPS_DIR", "./generated_apps")

def get_mcp_enabled() -> bool:
    """Get MCP_ENABLED from database or environment."""
    return get_setting_bool("MCP_ENABLED", True)

def get_mcp_strategy() -> str:
    """Get MCP_STRATEGY from database or environment."""
    return get_setting("MCP_STRATEGY", "consensus")

def get_use_ollama() -> bool:
    """Get USE_OLLAMA from database or environment."""
    return get_setting_bool("USE_OLLAMA", False)

def get_openai_api_key() -> Optional[str]:
    """Get OPENAI_API_KEY from database or environment."""
    return get_setting("OPENAI_API_KEY")

def get_anthropic_api_key() -> Optional[str]:
    """Get ANTHROPIC_API_KEY from database or environment."""
    return get_setting("ANTHROPIC_API_KEY")

