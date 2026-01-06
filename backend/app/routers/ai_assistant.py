from typing import Optional, List, Dict, Any
from pathlib import Path
import subprocess
import os
from app.database import get_db
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.auth import get_current_user
from app import models
from app.services.mcp_server import call_mcp_models, get_mcp_server
from app.services.form_api_generator import generate_form_api
import os
import json
import re
import requests
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

class AIRequest(BaseModel):
    prompt: str
    component_type: Optional[str] = None
    current_styles: Optional[dict] = None
    current_props: Optional[dict] = None  # Full component props including attributes, content, etc.

class ActionRequest(BaseModel):
    action_message: str
    component_type: Optional[str] = None
    component_id: Optional[str] = None
    current_props: Optional[dict] = None
    pages: Optional[List[dict]] = None  # List of pages for navigation context

class ActionResponse(BaseModel):
    action_code: str  # Generated code (e.g., onClick handler)
    explanation: str  # What the action will do
    changes: dict  # Component changes to apply
    detailed_changes: Optional[str] = None  # Detailed breakdown of what will change
    project_impact: Optional[str] = None  # What this means for the project
    needs_confirmation: bool = True

class DebugRequest(BaseModel):
    error_message: str  # Error description or debug message
    error_traceback: Optional[str] = None  # Optional error traceback
    file_path: Optional[str] = None  # Optional specific file to check
    project_id: Optional[int] = None  # Optional project ID for context

class DebugResponse(BaseModel):
    issue_identified: str  # What issue was found
    root_cause: str  # Root cause analysis
    fix_code: str  # The fixed code
    file_path: str  # File that needs to be fixed
    explanation: str  # Explanation of the fix
    confidence: float  # Confidence level (0-1)
    needs_confirmation: bool = True
    fix_applied: bool = False  # Whether the fix was actually applied
    docker_rebuilt: bool = False  # Whether Docker was rebuilt
    application_url: Optional[str] = None  # Application URL after rebuild

class AIResponse(BaseModel):
    changes: dict
    message: str
    explanation: Optional[str] = None
    guess: Optional[str] = None  # Suggested interpretation of the user's request
    needs_clarification: bool = False  # Whether the system needs user confirmation
    raw_response: Optional[str] = None  # Full raw response from the AI model

class FormAPIRequest(BaseModel):
    component_id: str  # Form component ID
    component_data: Dict[str, Any]  # Full component structure
    project_id: int  # Project ID

class FormAPIResponse(BaseModel):
    success: bool
    message: str
    summary: str  # Detailed summary
    api_url: Optional[str] = None  # API endpoint URL
    generated_model_name: Optional[str] = None  # Renamed from model_name to avoid Pydantic conflict
    fields: Optional[List[Dict[str, Any]]] = None
    files_created: List[str] = []  # List of created files
    database_status: Optional[str] = None
    test_file: Optional[str] = None
    errors: List[str] = []
    warnings: List[str] = []

def get_available_ollama_models(ollama_url: str = "http://localhost:11434") -> List[str]:
    """
    Get list of available Ollama models.
    """
    try:
        response = requests.get(f"{ollama_url}/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            models = [model.get("name", "") for model in data.get("models", [])]
            return models
    except Exception as e:
        logger.warning(f"Could not fetch Ollama models: {e}")
    return []

def call_ollama(prompt: str, system_prompt: str = None, model: str = "deepseek-coder") -> Optional[str]:
    """
    Call Ollama LLM API running locally.
    Default model is DeepSeek Coder for better code understanding and CSS/UI modifications.
    Can be changed via OLLAMA_MODEL environment variable.
    
    If MCP_ENABLED is true, this will use the MCP server to query multiple models
    and return the consensus result for more accurate responses.
    
    Recommended models for UI/CSS modifications:
    1. deepseek-coder:6.7b - Best for understanding component structure and CSS
    2. qwen2.5-coder:7b - Excellent for UI/UX modifications
    3. mistral:7b - Fast and good for simple modifications
    """
    # Check if MCP is enabled
    from app.services.settings_loader import get_mcp_enabled, get_mcp_strategy
    use_mcp = get_mcp_enabled()
    
    if use_mcp:
        # Use MCP server for multi-model consensus
        strategy = get_mcp_strategy()
        mcp_response = call_mcp_models(prompt, system_prompt, strategy=strategy)
        if mcp_response:
            return mcp_response
        # Fallback to single model if MCP fails
        logger.warning("MCP consensus failed, falling back to single model")
    
    # Single model fallback (original behavior)
    from app.services.settings_loader import get_ollama_url, get_ollama_model, get_ollama_timeout
    ollama_url = get_ollama_url()
    ollama_model = get_ollama_model() or model
    
    try:
        payload = {
            "model": ollama_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,  # Lower temperature for more deterministic, logical responses
                "top_p": 0.9,
                "top_k": 40,
                "repeat_penalty": 1.1
            }
        }
        
        if system_prompt:
            payload["system"] = system_prompt
        
        # Use longer timeout for large requests
        timeout = get_ollama_timeout()  # Default 2 minutes, configurable
        estimated_size = len(prompt) + (len(system_prompt) if system_prompt else 0)
        if estimated_size > 5000:
            timeout = max(timeout, 300)  # At least 5 minutes for large requests
        
        response = requests.post(
            f"{ollama_url}/api/generate",
            json=payload,
            timeout=timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get("response", "")
        elif response.status_code == 404:
            # Model not found - provide helpful error message
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("error", "Model not found")
            
            # Try to get available models
            available_models = get_available_ollama_models(ollama_url)
            
            if available_models:
                logger.error(
                    f"Ollama model '{ollama_model}' not found. "
                    f"Available models: {', '.join(available_models)}. "
                    f"Install with: ollama pull {ollama_model}"
                )
            else:
                logger.error(
                    f"Ollama model '{ollama_model}' not found. "
                    f"Install with: ollama pull {ollama_model}"
                )
            return None
        else:
            logger.error(f"Ollama API error: {response.status_code} - {response.text}")
            return None
    except requests.exceptions.ConnectionError:
        logger.error(
            f"Could not connect to Ollama at {ollama_url}. "
            f"Make sure Ollama is running: ollama serve"
        )
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling Ollama API: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error calling Ollama: {e}")
        return None

def call_llm(prompt: str, component_type: Optional[str] = None, current_styles: Optional[dict] = None, current_props: Optional[dict] = None) -> tuple[dict, Optional[str]]:
    """
    Call LLM to process the user's prompt and return component changes (CSS styles, HTML attributes, content, etc.).
    Supports Ollama (local), OpenAI, Anthropic, or pattern-based fallback.
    """
    # Check if Ollama is enabled
    from app.services.settings_loader import get_use_ollama
    use_ollama = get_use_ollama()
    
    if use_ollama:
        system_prompt = """You are an expert web developer and UI/UX designer with deep understanding of CSS, React, and modern web design principles. You excel at understanding component structures and applying precise style modifications.

YOUR TASK: Convert natural language requests into precise component modifications.

UNDERSTANDING CONTEXT:
- Analyze the current component state (type, styles, props)
- Understand design relationships (e.g., centering requires flexbox, colors need proper contrast)
- Apply design best practices (spacing, typography, visual hierarchy)
- Consider component semantics and accessibility
- CRITICAL: Detect hover/state-based requests (hover, active, focus, before, after) and use customCSS instead of style

OUTPUT FORMAT - Return ONLY valid JSON with these keys:
1. "style": Object with CSS properties in camelCase for DIRECT styles (e.g., {"backgroundColor": "#ff0000", "padding": "20px", "display": "flex"})
2. "customCSS": String with CSS code for PSEUDO-CLASSES and STATE-BASED styles (e.g., ":hover { width: 500px; }" or ":active { background-color: red; }")
3. "type": String for element type change (e.g., "button", "input", "h1")
4. "props": Object for HTML attributes/content (e.g., {"children": "New Text", "href": "https://example.com", "className": "my-class"})

CRITICAL RULES:
1. HOVER/STATE DETECTION: If user mentions "hover", "on hover", "when hover", "when cursor", "on mouse", "active", "focus", "before", "after" → Use "customCSS" NOT "style"
2. Use camelCase for CSS properties in "style" object (backgroundColor, not background-color)
3. Use standard CSS syntax in "customCSS" string (background-color, not backgroundColor)
4. For flexbox: If justifyContent/alignItems are set, ALWAYS include "display": "flex"
5. For centering: Use display: flex + justifyContent: center + alignItems: center
6. For colors: Use hex codes (#ff0000) or named colors (blue, red, transparent)
7. For spacing: Use consistent units (px, rem, em) - prefer rem for responsive design
8. For sizes: Include units (20px, 2rem, 50%)
9. NEVER add "children" property unless user explicitly requests text/content change
10. NEVER add default text like "New Text" or placeholder text
11. Understand relationships: "center" = flexbox centering, "bigger" = increase size, "modern" = rounded corners + shadow
12. Apply logical defaults: buttons need padding, forms need spacing, cards need shadows

EXAMPLES:
- "make background blue" → {"style": {"backgroundColor": "#0066ff"}}
- "center content" → {"style": {"display": "flex", "justifyContent": "center", "alignItems": "center"}}
- "when i hover change width to 500px" → {"customCSS": ":hover { width: 500px; }"}
- "on hover make background red" → {"customCSS": ":hover { background-color: red; }"}
- "when cursor hover change width to 500px" → {"customCSS": ":hover { width: 500px; }"}
- "make it bigger" → {"style": {"padding": "1.5rem", "fontSize": "1.25rem"}}
- "modern card style" → {"style": {"borderRadius": "12px", "boxShadow": "0 4px 6px rgba(0,0,0,0.1)", "padding": "1.5rem"}}
- "make it a button" → {"type": "button", "style": {"padding": "0.75rem 1.5rem", "borderRadius": "8px", "cursor": "pointer"}}

Return ONLY the JSON object, no explanations."""
        
        user_prompt = f"""COMPONENT CONTEXT:
Type: {component_type or 'div'}
Current Styles: {json.dumps(current_styles, indent=2) if current_styles else '{}'}
Current Props: {json.dumps(current_props, indent=2) if current_props else '{}'}

USER REQUEST: {prompt}

TASK: Analyze the request, understand the intent, and return ONLY a JSON object with the appropriate changes.
Apply design best practices and ensure all changes are logical and complete.

JSON OUTPUT:"""
        
        llm_response = call_ollama(user_prompt, system_prompt)
        
        if llm_response:
            parsed_changes = parse_llm_response_extended(llm_response)
            if parsed_changes:
                return parsed_changes, llm_response
    
    # Fallback to pattern-based matching
    fallback_changes = process_prompt_with_llm_logic_extended(prompt, component_type, current_styles, current_props)
    return fallback_changes, None

def parse_llm_response_extended(llm_output: str) -> dict:
    """
    Parse LLM response to extract component changes (CSS, HTML attributes, content, type, etc.).
    The LLM should return JSON with structure: {"style": {...}, "type": "...", "props": {...}}
    """
    changes = {}
    
    # Remove markdown code blocks if present
    cleaned_output = llm_output
    # Remove ```json ... ``` blocks
    cleaned_output = re.sub(r'```json\s*\n?', '', cleaned_output)
    cleaned_output = re.sub(r'```\s*\n?', '', cleaned_output)
    # Remove ``` ... ``` blocks
    cleaned_output = re.sub(r'```[a-z]*\s*\n?', '', cleaned_output)
    cleaned_output = re.sub(r'```', '', cleaned_output)
    
    # Try to extract JSON from the response (handle nested objects)
    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned_output, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            if isinstance(parsed, dict):
                changes = parsed
        except json.JSONDecodeError:
            # Try to fix common JSON issues
            try:
                # Remove trailing commas
                fixed_json = re.sub(r',\s*}', '}', json_match.group())
                fixed_json = re.sub(r',\s*]', ']', fixed_json)
                parsed = json.loads(fixed_json)
                if isinstance(parsed, dict):
                    changes = parsed
            except:
                pass
    
    # If no JSON found, try to extract properties from text
    if not changes:
        # Look for patterns like "property: value" or "style.property: value"
        css_pattern = re.findall(r'(?:style\.)?(\w+):\s*([^;,\n}]+)', cleaned_output)
        style_changes = {}
        for prop, value in css_pattern:
            prop = prop.strip()
            value = value.strip().strip('"').strip("'").strip('`')
            # Skip if it looks like markdown or code
            if '```' in value or value.startswith('json'):
                continue
            # Convert kebab-case to camelCase for React inline styles
            if '-' in prop:
                parts = prop.split('-')
                prop = parts[0] + ''.join(word.capitalize() for word in parts[1:])
            style_changes[prop] = value
        
        if style_changes:
            changes['style'] = style_changes
    
    # Check for customCSS in the output (hover, pseudo-classes)
    if 'customCSS' not in changes:
        # Look for :hover, :active, :before, :after patterns
        hover_pattern = re.search(r':hover\s*\{[^}]+\}', cleaned_output, re.DOTALL | re.IGNORECASE)
        if hover_pattern:
            changes['customCSS'] = hover_pattern.group(0)
        else:
            # Look for any pseudo-class pattern
            pseudo_pattern = re.search(r'(:hover|:active|:focus|:before|:after|::before|::after)\s*\{[^}]+\}', cleaned_output, re.DOTALL | re.IGNORECASE)
            if pseudo_pattern:
                changes['customCSS'] = pseudo_pattern.group(0)
    
    # Ensure if justifyContent or alignItems are present, display: flex is also set
    if changes.get('style'):
        style = changes['style']
        if ('justifyContent' in style or 'alignItems' in style) and 'display' not in style:
            style['display'] = 'flex'
    
    return changes

def generate_intelligent_guess(prompt: str, component_type: Optional[str] = None) -> Optional[str]:
    """
    Generate an intelligent guess about what the user wants based on the prompt.
    Returns a rephrased version of the request that the system can understand.
    """
    lower_prompt = prompt.lower().strip()
    
    # Extract key words and patterns
    keywords = {
        'center': ['center', 'centre', 'middle', 'align', 'position'],
        'color': ['color', 'colour', 'background', 'bg', 'red', 'blue', 'green', 'yellow', 'black', 'white'],
        'size': ['size', 'width', 'height', 'big', 'small', 'large', 'tiny', 'bigger', 'smaller'],
        'text': ['text', 'font', 'content', 'label', 'title', 'heading'],
        'spacing': ['padding', 'margin', 'space', 'gap'],
        'border': ['border', 'outline', 'radius', 'rounded'],
        'opacity': ['opacity', 'transparent', 'visible', 'hidden'],
        'display': ['show', 'hide', 'display', 'visible', 'hidden'],
        'button': ['button', 'click', 'link'],
        'input': ['input', 'textbox', 'field', 'form'],
    }
    
    # Detect intent categories
    detected_intents = []
    for intent, words in keywords.items():
        if any(word in lower_prompt for word in words):
            detected_intents.append(intent)
    
    # Generate guess based on detected intents
    guesses = []
    
    if 'center' in detected_intents:
        if 'screen' in lower_prompt or 'page' in lower_prompt:
            guesses.append("center content on screen")
        else:
            guesses.append("center content inside component")
    
    if 'color' in detected_intents:
        # Try to extract color name
        color_words = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'gray', 'grey']
        found_color = None
        for color in color_words:
            if color in lower_prompt:
                found_color = color
                break
        
        if 'background' in lower_prompt or 'bg' in lower_prompt:
            if found_color:
                guesses.append(f"make background {found_color}")
            else:
                guesses.append("change background color")
        elif 'text' in lower_prompt or 'font' in lower_prompt:
            if found_color:
                guesses.append(f"make text {found_color}")
            else:
                guesses.append("change text color")
        else:
            if found_color:
                guesses.append(f"change color to {found_color}")
            else:
                guesses.append("change color")
    
    if 'size' in detected_intents:
        if 'width' in lower_prompt:
            guesses.append("set width")
        elif 'height' in lower_prompt:
            guesses.append("set height")
        elif 'big' in lower_prompt or 'large' in lower_prompt or 'bigger' in lower_prompt:
            guesses.append("make component bigger")
        elif 'small' in lower_prompt or 'tiny' in lower_prompt or 'smaller' in lower_prompt:
            guesses.append("make component smaller")
        else:
            guesses.append("change component size")
    
    if 'text' in detected_intents:
        if 'bold' in lower_prompt:
            guesses.append("make text bold")
        elif 'italic' in lower_prompt:
            guesses.append("make text italic")
        elif any(word in lower_prompt for word in ['change', 'set', 'update', 'modify']):
            guesses.append("change text content")
        else:
            guesses.append("modify text")
    
    if 'spacing' in detected_intents:
        if 'padding' in lower_prompt:
            guesses.append("add padding")
        elif 'margin' in lower_prompt:
            guesses.append("add margin")
        else:
            guesses.append("adjust spacing")
    
    if 'border' in detected_intents:
        if 'radius' in lower_prompt or 'rounded' in lower_prompt:
            guesses.append("add border radius")
        else:
            guesses.append("add border")
    
    if 'opacity' in detected_intents:
        guesses.append("change opacity")
    
    if 'display' in detected_intents:
        if 'hide' in lower_prompt or 'hidden' in lower_prompt:
            guesses.append("hide component")
        elif 'show' in lower_prompt or 'visible' in lower_prompt:
            guesses.append("show component")
    
    if 'button' in detected_intents:
        guesses.append("convert to button")
    
    if 'input' in detected_intents:
        guesses.append("convert to input field")
    
    # If no specific intent detected, try to create a general guess
    if not guesses:
        # Look for action words
        action_words = ['make', 'set', 'change', 'update', 'modify', 'add', 'remove', 'delete']
        for action in action_words:
            if action in lower_prompt:
                # Try to extract what they want to modify
                words_after_action = lower_prompt.split(action, 1)
                if len(words_after_action) > 1:
                    rest = words_after_action[1].strip()
                    if len(rest) < 50:  # Reasonable length
                        guesses.append(f"{action} {rest}")
                        break
        
        # If still no guess, create a generic one
        if not guesses:
            guesses.append("modify component style")
    
    # Return the first (most specific) guess
    return guesses[0] if guesses else None

def process_prompt_with_llm_logic_extended(prompt: str, component_type: Optional[str] = None, current_styles: Optional[dict] = None, current_props: Optional[dict] = None) -> dict:
    """
    Enhanced prompt processing with LLM-like understanding.
    Handles CSS styles, HTML component type changes, content changes, and attribute modifications.
    """
    changes = {}
    lower_prompt = prompt.lower().strip()
    original_prompt = prompt
    
    # Check for hover/state-based requests FIRST
    hover_keywords = ['hover', 'on hover', 'when hover', 'when cursor', 'on mouse', 'on mouseover', 'mouse over']
    state_keywords = ['active', 'focus', 'before', 'after', 'first-child', 'last-child']
    
    is_hover_request = any(keyword in lower_prompt for keyword in hover_keywords)
    is_state_request = any(keyword in lower_prompt for keyword in state_keywords)
    
    if is_hover_request or is_state_request:
        # Extract the pseudo-class and CSS properties
        pseudo_class = ':hover' if is_hover_request else (':active' if 'active' in lower_prompt else (':focus' if 'focus' in lower_prompt else ':hover'))
        
        # Extract CSS properties from the prompt
        css_properties = []
        
        # Width detection
        width_match = re.search(r'width.*?(\d+)\s*(px|%|em|rem|vh|vw)?', lower_prompt, re.IGNORECASE)
        if width_match:
            value = width_match.group(1)
            unit = width_match.group(2) if width_match.lastindex >= 2 and width_match.group(2) else 'px'
            css_properties.append(f"  width: {value}{unit};")
        
        # Height detection
        height_match = re.search(r'height.*?(\d+)\s*(px|%|em|rem|vh|vw)?', lower_prompt, re.IGNORECASE)
        if height_match:
            value = height_match.group(1)
            unit = height_match.group(2) if height_match.lastindex >= 2 and height_match.group(2) else 'px'
            css_properties.append(f"  height: {value}{unit};")
        
        # Background color detection
        bg_match = re.search(r'background.*?(?:to|as|is|=|into|like)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))', lower_prompt, re.IGNORECASE)
        if bg_match:
            color = bg_match.group(1).strip()
            color_map = {
                'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
                'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
                'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
                'gray': '#808080', 'grey': '#808080'
            }
            color_lower = color.lower()
            if color_lower in color_map:
                color = color_map[color_lower]
            css_properties.append(f"  background-color: {color};")
        
        # Text color detection
        color_match = re.search(r'(?:text|color|font-color).*?(?:to|as|is|=|into|like)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))', lower_prompt, re.IGNORECASE)
        if color_match:
            color = color_match.group(1).strip()
            color_map = {
                'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
                'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
                'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
                'gray': '#808080', 'grey': '#808080'
            }
            color_lower = color.lower()
            if color_lower in color_map:
                color = color_map[color_lower]
            css_properties.append(f"  color: {color};")
        
        # If we found any CSS properties, create customCSS
        if css_properties:
            custom_css = f"{pseudo_class} {{\n" + "\n".join(css_properties) + "\n}"
            changes['customCSS'] = custom_css
            return changes  # Return early, don't process as regular style changes
    
    # Process HTML component changes first (type, content, attributes)
    component_changes = process_html_component_changes(prompt, component_type, current_props)
    if component_changes:
        changes.update(component_changes)
    
    # Then process CSS style changes (only if not a hover/state request)
    style_changes = process_prompt_with_llm_logic(prompt, component_type, current_styles)
    if style_changes and len(style_changes) > 0:
        if 'style' not in changes:
            changes['style'] = {}
        changes['style'].update(style_changes)
    
    return changes

def process_html_component_changes(prompt: str, component_type: Optional[str] = None, current_props: Optional[dict] = None) -> dict:
    """
    Process prompts to modify HTML component properties (type, content, attributes).
    Also handles modal creation, onClick handlers, and parent/wrapping requests.
    """
    changes = {}
    lower_prompt = prompt.lower().strip()
    
    # Parent/wrap requests - check BEFORE type changes to avoid confusion
    parent_wrap_patterns = [
        r'(?:create|add|make|put).*?(?:parent|wrapper|container).*?(?:tag|element|component).*?(?:for|around|of|this)',
        r'(?:wrap|enclose|surround).*?(?:in|with|inside).*?(?:tag|element|component)',
        r'(?:create|add|make).*?(?:parent|wrapper).*?(?:main|div|section|article|header|footer|nav|aside)',
        r'(?:put|place|move).*?(?:inside|into|within).*?(?:main|div|section|article|header|footer|nav|aside)',
    ]
    
    is_parent_request = False
    parent_type = None
    
    # Check if this is a parent/wrap request
    for pattern in parent_wrap_patterns:
        if re.search(pattern, lower_prompt, re.IGNORECASE):
            is_parent_request = True
            # Extract the parent tag type
            parent_tags = ['main', 'div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'form']
            for tag in parent_tags:
                if re.search(rf'\b{tag}\b', lower_prompt, re.IGNORECASE):
                    parent_type = tag
                    break
            # Default to 'main' if no specific tag mentioned
            if not parent_type:
                parent_type = 'main'
            break
    
    if is_parent_request and parent_type:
        # This is a wrap request, not a type change
        changes['wrap_in'] = parent_type
        return changes  # Return early, don't process as type change
    
    # Modal creation requests
    modal_patterns = [
        r'(?:open|show|create|add).*?modal.*?(?:with|having|containing|that has)',
        r'(?:when|on).*?(?:click|press).*?(?:open|show|display).*?modal',
        r'modal.*?(?:with|having|containing|that has)',
        r'(?:click|press).*?(?:this|the).*?(?:button|element).*?(?:open|show|display).*?modal',
    ]
    
    is_modal_request = False
    for pattern in modal_patterns:
        if re.search(pattern, lower_prompt, re.IGNORECASE):
            is_modal_request = True
            break
    
    if is_modal_request:
        # Extract modal fields from the prompt
        modal_fields = []
        
        # Look for quote number
        if re.search(r'quote.*?number|number.*?quote', lower_prompt, re.IGNORECASE):
            modal_fields.append({'name': 'quoteNumber', 'label': 'Quote Number', 'type': 'input'})
        
        # Look for description
        if re.search(r'description', lower_prompt, re.IGNORECASE):
            modal_fields.append({'name': 'description', 'label': 'Description', 'type': 'textarea'})
        
        # Look for other common fields
        if re.search(r'name|title', lower_prompt, re.IGNORECASE):
            modal_fields.append({'name': 'name', 'label': 'Name', 'type': 'input'})
        
        if re.search(r'email', lower_prompt, re.IGNORECASE):
            modal_fields.append({'name': 'email', 'label': 'Email', 'type': 'input'})
        
        # Create modal component structure
        import time
        modal_id = f"modal-{int(time.time() * 1000)}"
        
        # Generate modal component structure (ComponentNode format)
        modal_component = generate_modal_component(modal_id, modal_fields)
        
        # Add onClick handler to open modal
        if 'props' not in changes:
            changes['props'] = {}
        
        # Create onClick handler code that shows the modal
        onClick_code = f"document.getElementById('{modal_id}').style.display = 'flex';"
        changes['props']['onClick'] = onClick_code
        
        # Add modal component to be created (as ComponentNode structure)
        changes['create_modal'] = modal_component
    
    # Component type changes
    type_changes = {
        'button': ['button', 'btn'],
        'input': ['input', 'textbox', 'text field', 'textfield'],
        'textarea': ['textarea', 'text area', 'text box'],
        'select': ['select', 'dropdown', 'select box'],
        'a': ['link', 'anchor', 'hyperlink'],
        'img': ['image', 'img', 'picture'],
        'h1': ['h1', 'heading 1', 'title'],
        'h2': ['h2', 'heading 2', 'subtitle'],
        'h3': ['h3', 'heading 3'],
        'h4': ['h4', 'heading 4'],
        'h5': ['h5', 'heading 5'],
        'h6': ['h6', 'heading 6'],
        'p': ['paragraph', 'p', 'text'],
        'span': ['span', 'inline text'],
        'div': ['div', 'container', 'box'],
        'section': ['section'],
        'article': ['article'],
        'header': ['header'],
        'footer': ['footer'],
        'nav': ['nav', 'navbar', 'navigation'],
        'ul': ['ul', 'list', 'unordered list'],
        'ol': ['ol', 'ordered list'],
        'li': ['li', 'list item'],
        'table': ['table'],
        'tr': ['tr', 'table row'],
        'td': ['td', 'table cell'],
        'th': ['th', 'table header'],
    }
    
    for new_type, keywords in type_changes.items():
        for keyword in keywords:
            # More specific patterns to avoid false positives with wrap/parent requests
            if re.search(rf'\b(?:change|convert|make|set|turn|switch).*?(?:to|into|as).*?\b{keyword}\b', lower_prompt, re.IGNORECASE) or \
               (re.search(rf'\b(?:make|set|change|convert|turn|switch).*?\b{keyword}\b', lower_prompt, re.IGNORECASE) and \
                not re.search(r'(?:parent|wrapper|wrap|enclose|surround|for|around|of|this)', lower_prompt, re.IGNORECASE)):
                changes['type'] = new_type
                break
        if 'type' in changes:
            break
    
    # Content/text changes
    text_patterns = [
        r'(?:change|set|update|modify).*?(?:text|content|value|label).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']',
        r'(?:text|content|value|label).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']',
        r'(?:set|change|update).*?["\']([^"\']+)["\']',
        r'text\s+["\']([^"\']+)["\']',
    ]
    
    for pattern in text_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            if 'props' not in changes:
                changes['props'] = {}
            changes['props']['children'] = match.group(1)
            break
    
    # Placeholder changes (for inputs)
    placeholder_match = re.search(r'(?:placeholder|hint).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']', prompt, re.IGNORECASE)
    if placeholder_match:
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['placeholder'] = placeholder_match.group(1)
    
    # href changes (for links)
    href_patterns = [
        r'(?:href|link|url).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']',
        r'(?:link|url).*?["\']([^"\']+)["\']',
    ]
    for pattern in href_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            if 'props' not in changes:
                changes['props'] = {}
            changes['props']['href'] = match.group(1)
            break
    
    # src changes (for images)
    src_match = re.search(r'(?:src|source|image).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']', prompt, re.IGNORECASE)
    if src_match:
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['src'] = src_match.group(1)
    
    # alt text changes (for images)
    alt_match = re.search(r'(?:alt|alternative).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']', prompt, re.IGNORECASE)
    if alt_match:
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['alt'] = alt_match.group(1)
    
    # className changes
    class_patterns = [
        r'(?:class|className).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']',
        r'(?:add|set).*?class.*?["\']([^"\']+)["\']',
    ]
    for pattern in class_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            if 'props' not in changes:
                changes['props'] = {}
            changes['props']['className'] = match.group(1)
            break
    
    # id changes
    id_match = re.search(r'(?:id).*?(?:to|as|is|=)\s*["\']([^"\']+)["\']', prompt, re.IGNORECASE)
    if id_match:
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['id'] = id_match.group(1)
    
    # type attribute changes (for inputs, buttons)
    input_type_match = re.search(r'(?:input\s+type|type).*?(?:to|as|is|=)\s*["\']?(\w+)["\']?', prompt, re.IGNORECASE)
    if input_type_match:
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['type'] = input_type_match.group(1)
    
    # disabled/enabled changes
    if re.search(r'\b(?:disable|disabled)\b', lower_prompt, re.IGNORECASE):
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['disabled'] = True
    elif re.search(r'\b(?:enable|enabled)\b', lower_prompt, re.IGNORECASE):
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['disabled'] = False
    
    # required attribute
    if re.search(r'\b(?:require|required|mandatory)\b', lower_prompt, re.IGNORECASE):
        if 'props' not in changes:
            changes['props'] = {}
        changes['props']['required'] = True
    
    return changes

def generate_modal_component(modal_id: str, fields: list) -> dict:
    """
    Generate ComponentNode structure for a modal with the specified fields.
    """
    import time
    base_id = f"comp-{int(time.time() * 1000)}"
    
    # Create field components
    field_components = []
    for idx, field in enumerate(fields):
        field_id = f"{base_id}-field-{idx}"
        if field['type'] == 'input':
            field_components.append({
                'type': 'div',
                'id': f"{field_id}-container",
                'props': {
                    'style': {'marginBottom': '1rem'},
                    'children': [
                        {
                            'type': 'label',
                            'id': f"{field_id}-label",
                            'props': {
                                'style': {'display': 'block', 'marginBottom': '0.5rem', 'fontWeight': '600'},
                                'children': field['label']
                            }
                        },
                        {
                            'type': 'input',
                            'id': f"{field_id}-input",
                            'props': {
                                'type': 'text',
                                'id': field['name'],
                                'name': field['name'],
                                'style': {'width': '100%', 'padding': '0.5rem', 'border': '1px solid #ddd', 'borderRadius': '4px', 'boxSizing': 'border-box'}
                            }
                        }
                    ]
                }
            })
        elif field['type'] == 'textarea':
            field_components.append({
                'type': 'div',
                'id': f"{field_id}-container",
                'props': {
                    'style': {'marginBottom': '1rem'},
                    'children': [
                        {
                            'type': 'label',
                            'id': f"{field_id}-label",
                            'props': {
                                'style': {'display': 'block', 'marginBottom': '0.5rem', 'fontWeight': '600'},
                                'children': field['label']
                            }
                        },
                        {
                            'type': 'textarea',
                            'id': f"{field_id}-textarea",
                            'props': {
                                'id': field['name'],
                                'name': field['name'],
                                'rows': 4,
                                'style': {'width': '100%', 'padding': '0.5rem', 'border': '1px solid #ddd', 'borderRadius': '4px', 'boxSizing': 'border-box', 'resize': 'vertical'}
                            }
                        }
                    ]
                }
            })
    
    # Create modal component structure
    modal_component = {
        'type': 'div',
        'id': modal_id,
        'props': {
            'style': {
                'display': 'none',
                'position': 'fixed',
                'top': '0',
                'left': '0',
                'width': '100%',
                'height': '100%',
                'background': 'rgba(0, 0, 0, 0.5)',
                'zIndex': '1000',
                'alignItems': 'center',
                'justifyContent': 'center'
            },
            'children': [
                {
                    'type': 'div',
                    'id': f"{base_id}-content",
                    'props': {
                        'style': {
                            'background': 'white',
                            'padding': '2rem',
                            'borderRadius': '8px',
                            'maxWidth': '500px',
                            'width': '90%',
                            'maxHeight': '90vh',
                            'overflowY': 'auto',
                            'boxShadow': '0 4px 6px rgba(0, 0, 0, 0.1)'
                        },
                        'children': [
                            {
                                'type': 'div',
                                'id': f"{base_id}-header",
                                'props': {
                                    'style': {'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'marginBottom': '1.5rem'},
                                    'children': [
                                        {
                                            'type': 'h2',
                                            'id': f"{base_id}-title",
                                            'props': {
                                                'style': {'margin': '0', 'fontSize': '1.5rem'},
                                                'children': 'Modal'
                                            }
                                        },
                                        {
                                            'type': 'button',
                                            'id': f"{base_id}-close",
                                            'props': {
                                                'onClick': f"document.getElementById('{modal_id}').style.display = 'none';",
                                                'style': {'background': 'none', 'border': 'none', 'fontSize': '1.5rem', 'cursor': 'pointer', 'padding': '0.25rem 0.5rem'},
                                                'children': '×'
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                'type': 'form',
                                'id': f"{base_id}-form",
                                'props': {
                                    'children': field_components + [
                                        {
                                            'type': 'div',
                                            'id': f"{base_id}-actions",
                                            'props': {
                                                'style': {'display': 'flex', 'gap': '0.5rem', 'justifyContent': 'flex-end', 'marginTop': '1.5rem'},
                                                'children': [
                                                    {
                                                        'type': 'button',
                                                        'id': f"{base_id}-cancel",
                                                        'props': {
                                                            'type': 'button',
                                                            'onClick': f"document.getElementById('{modal_id}').style.display = 'none';",
                                                            'style': {'padding': '0.5rem 1rem', 'border': '1px solid #ddd', 'background': 'white', 'borderRadius': '4px', 'cursor': 'pointer'},
                                                            'children': 'Cancel'
                                                        }
                                                    },
                                                    {
                                                        'type': 'button',
                                                        'id': f"{base_id}-submit",
                                                        'props': {
                                                            'type': 'submit',
                                                            'style': {'padding': '0.5rem 1rem', 'border': 'none', 'background': '#667eea', 'color': 'white', 'borderRadius': '4px', 'cursor': 'pointer'},
                                                            'children': 'Submit'
                                                        }
                                                    }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        }
    }
    
    return modal_component

def process_prompt_with_llm_logic(prompt: str, component_type: Optional[str] = None, current_styles: Optional[dict] = None) -> dict:
    """
    Enhanced prompt processing for CSS styles only.
    This is called by process_prompt_with_llm_logic_extended for style changes.
    """
    changes = {}
    lower_prompt = prompt.lower().strip()
    original_prompt = prompt
    
    # Color changes with comprehensive pattern matching - handles all phrase variations
    # Action verbs: make, set, change, color, update, modify, turn, switch, apply, use, give, put, paint, fill
    # Background patterns - try multiple variations
    bg_patterns = [
        # Pattern 1: "change background to blue", "make background blue", "set background to blue", "turn background blue"
        r'(?:make|set|change|color|update|modify|turn|switch|apply|use|give|put|paint|fill|make\s+it|set\s+it|change\s+it).*?(?:background|bg|background-color|backgroundcolor|back\s*ground).*?(?:to|as|is|=|into|like)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        # Pattern 2: "background to blue", "background blue", "bg blue" (without action verb)
        r'(?:background|bg|background-color|backgroundcolor|back\s*ground).*?(?:to|as|is|=|into|like)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        # Pattern 3: "background blue", "bg blue" (without "to")
        r'(?:background|bg|background-color|backgroundcolor|back\s*ground)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        # Pattern 4: "blue background", "red bg" (color before background)
        r'([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))\s+(?:background|bg|background-color|backgroundcolor|back\s*ground)',
        # Pattern 5: "make it blue", "set it to blue" (when context suggests background)
        r'(?:make|set|change|turn|switch|apply|use|give|put|paint|fill)\s+(?:it|the\s+background|the\s+bg|this).*?(?:to|as|is|=|into|like)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        # Pattern 6: "blue it", "make blue" (very casual)
        r'(?:make|set|change|turn|switch|apply|use|give|put|paint|fill)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        # Pattern 7: Just a color word when background context is clear
        r'\b(?:background|bg)\b.*?\b([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))\b',
    ]
    
    bg_match = None
    for pattern in bg_patterns:
        bg_match = re.search(pattern, prompt, re.IGNORECASE)
        if bg_match:
            break
    
    if bg_match:
        color = bg_match.group(1).strip()
        color_map = {
            'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
            'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
            'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
            'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
            'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
            'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
            'maroon': '#800000', 'silver': '#c0c0c0', 'gold': '#ffd700',
            'aqua': '#00ffff', 'fuchsia': '#ff00ff'
        }
        color_lower = color.lower()
        if color_lower in color_map:
            color = color_map[color_lower]
        changes['backgroundColor'] = color
    
    # Text color patterns - comprehensive variations
    text_patterns = [
        r'(?:make|set|change|color|update|modify|turn|switch|apply|use|give|put|paint).*?(?:text|font|foreground|text-color|font-color|text\s*color|font\s*color).*?(?:to|as|is|=|into|like)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        r'(?:text|font|foreground|text-color|font-color|text\s*color|font\s*color).*?(?:to|as|is|=|into|like)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        r'(?:text|font|foreground|text-color|font-color|text\s*color|font\s*color)\s+([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))',
        r'([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))\s+(?:text|font|foreground|text-color|font-color|text\s*color|font\s*color)',
    ]
    
    text_match = None
    for pattern in text_patterns:
        text_match = re.search(pattern, prompt, re.IGNORECASE)
        if text_match:
            break
    
    if text_match:
        color = text_match.group(1).strip()
        color_map = {
            'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
            'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
            'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
            'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
            'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
            'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
            'maroon': '#800000', 'silver': '#c0c0c0', 'gold': '#ffd700',
            'aqua': '#00ffff', 'fuchsia': '#ff00ff'
        }
        color_lower = color.lower()
        if color_lower in color_map:
            color = color_map[color_lower]
        changes['color'] = color
    
    # Size changes - more flexible patterns
    # Width patterns
    width_patterns = [
        r'(?:make|set|change|update|modify|make\s+it|set\s+it|change\s+it).*?(?:width|w|wide).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem|vh|vw)?',
        r'(?:width|w|wide).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem|vh|vw)?',
        r'(?:width|w|wide)\s+(\d+)\s*(px|%|em|rem|vh|vw)?',
        r'(\d+)\s*(px|%|em|rem|vh|vw)?\s+(?:width|w|wide)',
    ]
    for pattern in width_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex >= 2 and match.group(2) else 'px'
            changes['width'] = f"{value}{unit}"
            break
    
    # Height patterns
    height_patterns = [
        r'(?:make|set|change|update|modify|make\s+it|set\s+it|change\s+it).*?(?:height|h|tall).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem|vh|vw)?',
        r'(?:height|h|tall).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem|vh|vw)?',
        r'(?:height|h|tall)\s+(\d+)\s*(px|%|em|rem|vh|vw)?',
        r'(\d+)\s*(px|%|em|rem|vh|vw)?\s+(?:height|h|tall)',
    ]
    for pattern in height_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex >= 2 and match.group(2) else 'px'
            changes['height'] = f"{value}{unit}"
            break
    
    # Font size patterns
    font_size_patterns = [
        r'(?:make|set|change|update|modify).*?(?:font|text).*?(?:size|bigger|smaller|larger).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'(?:font|text).*?(?:size|bigger|smaller|larger).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'(?:font|text)\s+size.*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'font\s+size\s+(\d+)\s*(px|%|em|rem)?',
        r'(\d+)\s*(px|%|em|rem)?\s+font',
    ]
    for pattern in font_size_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex >= 2 and match.group(2) else 'px'
            changes['fontSize'] = f"{value}{unit}"
            break
    
    # Spacing - more flexible patterns
    # Padding patterns
    padding_patterns = [
        r'(?:add|set|change|update|modify|make|give|put|apply).*?padding.*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'padding.*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'padding\s+(\d+)\s*(px|%|em|rem)?',
        r'(\d+)\s*(px|%|em|rem)?\s+padding',
        r'add\s+(\d+)\s*(px|%|em|rem)?\s+padding',
    ]
    for pattern in padding_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex >= 2 and match.group(2) else 'px'
            changes['padding'] = f"{value}{unit}"
            break
    
    # Margin patterns
    margin_patterns = [
        r'(?:add|set|change|update|modify|make|give|put|apply).*?margin.*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'margin.*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'margin\s+(\d+)\s*(px|%|em|rem)?',
        r'(\d+)\s*(px|%|em|rem)?\s+margin',
        r'add\s+(\d+)\s*(px|%|em|rem)?\s+margin',
    ]
    for pattern in margin_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex >= 2 and match.group(2) else 'px'
            changes['margin'] = f"{value}{unit}"
            break
    
    # Border radius - more patterns
    border_radius_patterns = [
        r'(?:make|set|change|update|modify|add|give).*?(?:border.*?radius|rounded|round|roundness).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'(?:border.*?radius|rounded|round|roundness).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px|%|em|rem)?',
        r'(?:border.*?radius|rounded|round|roundness)\s+(\d+)\s*(px|%|em|rem)?',
        r'(\d+)\s*(px|%|em|rem)?\s+(?:border.*?radius|rounded|round|roundness)',
        r'round.*?(\d+)\s*(px|%|em|rem)?',
    ]
    for pattern in border_radius_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex >= 2 and match.group(2) else 'px'
            changes['borderRadius'] = f"{value}{unit}"
            break
    
    # Text alignment - more patterns
    if (re.search(r'(?:center|centre|middle)', prompt, re.IGNORECASE) and 
        (re.search(r'(?:text|align|content)', prompt, re.IGNORECASE) or 
         re.search(r'(?:align|text|center)', prompt, re.IGNORECASE) or
         re.search(r'center\s+(?:it|text|content)', prompt, re.IGNORECASE))):
        changes['textAlign'] = 'center'
    elif (re.search(r'(?:left)', prompt, re.IGNORECASE) and 
          re.search(r'(?:text|align)', prompt, re.IGNORECASE)):
        changes['textAlign'] = 'left'
    elif (re.search(r'(?:right)', prompt, re.IGNORECASE) and 
          re.search(r'(?:text|align)', prompt, re.IGNORECASE)):
        changes['textAlign'] = 'right'
    elif re.search(r'center\s+(?:the\s+)?(?:text|content)', prompt, re.IGNORECASE):
        changes['textAlign'] = 'center'
    
    # Display - more patterns
    if re.search(r'(?:make|set|change|turn|switch|use|apply).*?(?:flex|flexbox)', prompt, re.IGNORECASE):
        changes['display'] = 'flex'
    elif re.search(r'(?:make|set|change|turn|switch|use|apply).*?(?:block)', prompt, re.IGNORECASE):
        changes['display'] = 'block'
    elif re.search(r'(?:make|set|change|turn|switch|use|apply).*?(?:inline)', prompt, re.IGNORECASE):
        changes['display'] = 'inline'
    elif re.search(r'(?:make|set|change|turn|switch|use|apply).*?(?:grid)', prompt, re.IGNORECASE):
        changes['display'] = 'grid'
    elif re.search(r'(?:flex|flexbox)', prompt, re.IGNORECASE) and re.search(r'(?:display|layout)', prompt, re.IGNORECASE):
        changes['display'] = 'flex'
    
    # Flex direction - more patterns
    if (re.search(r'(?:column|vertical|stack)', prompt, re.IGNORECASE) and 
        re.search(r'(?:flex|direction|layout)', prompt, re.IGNORECASE)):
        changes['flexDirection'] = 'column'
    elif (re.search(r'(?:row|horizontal|side)', prompt, re.IGNORECASE) and 
          re.search(r'(?:flex|direction|layout)', prompt, re.IGNORECASE)):
        changes['flexDirection'] = 'row'
    elif re.search(r'flex.*?column', prompt, re.IGNORECASE):
        changes['flexDirection'] = 'column'
    elif re.search(r'flex.*?row', prompt, re.IGNORECASE):
        changes['flexDirection'] = 'row'
    
    # Centering content - comprehensive patterns (handles both screen and component centering)
    center_patterns = [
        # Screen/page centering
        r'(?:center|centre|middle).*?(?:content|content.*?screen|screen|page|element|div|it|this)',
        r'(?:content|content.*?screen|screen|page|element|div|it|this).*?(?:center|centre|middle)',
        r'(?:make|set|put|place|position).*?(?:content|it|this|element).*?(?:center|centre|middle).*?(?:screen|page)',
        r'(?:make|set|put|place|position).*?(?:center|centre|middle).*?(?:content|it|this|element).*?(?:screen|page)',
        r'center.*?of.*?screen',
        r'center.*?on.*?screen',
        r'center.*?the.*?screen',
        # Component/child centering patterns - very comprehensive
        r'(?:inside|inner|child|children|content).*?(?:component|element|div|it|this|item).*?(?:should|must|need).*?(?:be|is).*?(?:center|centre|middle)',
        r'(?:inside|inner|child|children|content).*?(?:component|element|div|it|this|item).*?(?:should|must|need).*?(?:be|is).*?(?:center|centre|middle).*?(?:of|in).*?(?:this|the).*?(?:component|element|div|container)',
        r'(?:inside|inner|child|children|content).*?(?:component|element|div|it|this|item).*?(?:center|centre|middle)',
        r'(?:center|centre|middle).*?(?:inside|inner|child|children|content).*?(?:component|element|div|it|this)',
        r'(?:make|set|put|place|position).*?(?:inside|inner|child|children|content).*?(?:center|centre|middle)',
        r'(?:make|set|put|place|position).*?(?:center|centre|middle).*?(?:inside|inner|child|children|content)',
        r'(?:inside|inner|child|children|content).*?(?:should|must|need).*?(?:center|centre|middle)',
        r'(?:center|centre|middle).*?(?:of|in).*?(?:this|the).*?(?:component|element|div|container)',
        r'(?:component|element|div|container).*?(?:should|must|need).*?(?:center|centre|middle)',
        r'(?:component|element|div|container).*?(?:should|must|need).*?(?:be|is).*?(?:center|centre|middle)',
        r'(?:align|position).*?(?:center|centre|middle)',
        r'(?:center|centre|middle).*?(?:align|position)',
        # Simple centering requests
        r'center.*?(?:it|this|content|element|component)',
        r'(?:it|this|content|element|component).*?center',
        r'(?:should|must|need).*?(?:be|is).*?center',
    ]
    
    is_centering_request = False
    is_screen_centering = False
    for pattern in center_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            is_centering_request = True
            # Check if it's screen/page centering
            if re.search(r'(?:screen|page|viewport|view)', prompt, re.IGNORECASE):
                is_screen_centering = True
            break
    
    if is_centering_request:
        # For centering content, use flexbox
        changes['display'] = 'flex'
        changes['justifyContent'] = 'center'
        changes['alignItems'] = 'center'
        # If screen/page context, add full height
        if is_screen_centering:
            changes['minHeight'] = '100vh'
            changes['height'] = '100vh'
        # For component centering (inside another component), ensure it has some height to center within
        elif re.search(r'(?:inside|inner|child|children|content|of|in).*?(?:component|element|div|this|the)', prompt, re.IGNORECASE):
            # If no height is set, add min-height to allow centering
            if not current_styles or ('height' not in current_styles and 'minHeight' not in current_styles):
                changes['minHeight'] = '100%'
    
    # Justify content - more patterns (for horizontal alignment only)
    if not is_centering_request:
        if (re.search(r'(?:center|centre|middle)', prompt, re.IGNORECASE) and 
            re.search(r'(?:content|items|justify|align)', prompt, re.IGNORECASE)):
            changes['justifyContent'] = 'center'
        elif re.search(r'(?:space.*?between|spread)', prompt, re.IGNORECASE):
            changes['justifyContent'] = 'space-between'
        elif re.search(r'(?:space.*?around)', prompt, re.IGNORECASE):
            changes['justifyContent'] = 'space-around'
        elif re.search(r'center\s+(?:content|items)', prompt, re.IGNORECASE):
            changes['justifyContent'] = 'center'
    
    # Align items - for vertical alignment
    if not is_centering_request:
        if (re.search(r'(?:center|centre|middle)', prompt, re.IGNORECASE) and 
            re.search(r'(?:items|align.*?items|vertical)', prompt, re.IGNORECASE)):
            changes['alignItems'] = 'center'
        elif re.search(r'(?:start|top)', prompt, re.IGNORECASE) and re.search(r'(?:items|align)', prompt, re.IGNORECASE):
            changes['alignItems'] = 'flex-start'
        elif re.search(r'(?:end|bottom)', prompt, re.IGNORECASE) and re.search(r'(?:items|align)', prompt, re.IGNORECASE):
            changes['alignItems'] = 'flex-end'
    
    # Opacity - more patterns
    opacity_patterns = [
        r'(?:make|set|change|update|modify).*?(?:opacity|transparent|transparency|see.*?through).*?(?:to|as|is|=|into)?\s*(\d+(?:\.\d+)?)',
        r'(?:opacity|transparent|transparency).*?(?:to|as|is|=|into)?\s*(\d+(?:\.\d+)?)',
        r'(?:opacity|transparent|transparency)\s+(\d+(?:\.\d+)?)',
    ]
    for pattern in opacity_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            changes['opacity'] = str(value / 100 if value > 1 else value)
            break
    
    # Font weight - more patterns
    if (re.search(r'(?:bold|heavy|thick|strong)', prompt, re.IGNORECASE) and 
        (re.search(r'(?:font|text|weight)', prompt, re.IGNORECASE) or 
         re.search(r'make.*?bold', prompt, re.IGNORECASE) or
         re.search(r'bold.*?text', prompt, re.IGNORECASE))):
        changes['fontWeight'] = 'bold'
    elif (re.search(r'(?:normal|regular|standard)', prompt, re.IGNORECASE) and 
          re.search(r'(?:font|text|weight)', prompt, re.IGNORECASE)):
        changes['fontWeight'] = 'normal'
    elif (re.search(r'(?:light|thin|lighter)', prompt, re.IGNORECASE) and 
          re.search(r'(?:font|text|weight)', prompt, re.IGNORECASE)):
        changes['fontWeight'] = '300'
    elif re.search(r'make.*?bold', prompt, re.IGNORECASE):
        changes['fontWeight'] = 'bold'
    
    # Border - more patterns
    border_patterns = [
        r'(?:add|set|change|update|modify|make|give|put|apply).*?(?:border|outline|edge).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px)?\s*([a-z]+|#[0-9a-f]{3,6})?',
        r'(?:border|outline|edge).*?(?:to|as|is|=|into)?\s*(\d+)\s*(px)?\s*([a-z]+|#[0-9a-f]{3,6})?',
        r'(?:border|outline|edge)\s+(\d+)\s*(px)?\s*([a-z]+|#[0-9a-f]{3,6})?',
        r'(\d+)\s*(px)?\s*(?:border|outline|edge)',
    ]
    for pattern in border_patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            width = match.group(1) or '1'
            color = match.group(3) if match.lastindex >= 3 and match.group(3) else '#000000'
            changes['border'] = f"{width}px solid {color}"
            break
    
    # Fallback: Try to extract any CSS property mentioned in common phrases
    # This handles cases like "make it bigger", "increase size", etc.
    if not changes:
        # Try to find any color word in the prompt (if no specific property was matched)
        color_words = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 
                      'gray', 'grey', 'brown', 'cyan', 'magenta', 'lime', 'navy', 'teal', 'olive',
                      'maroon', 'silver', 'gold', 'aqua', 'fuchsia']
        for color_word in color_words:
            if re.search(rf'\b{color_word}\b', prompt, re.IGNORECASE):
                # If background context is likely, apply to background
                if re.search(r'(?:background|bg|back)', prompt, re.IGNORECASE):
                    color_map = {
                        'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
                        'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
                        'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
                        'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
                        'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
                        'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
                        'maroon': '#800000', 'silver': '#c0c0c0', 'gold': '#ffd700',
                        'aqua': '#00ffff', 'fuchsia': '#ff00ff'
                    }
                    changes['backgroundColor'] = color_map.get(color_word.lower(), f'#{color_word}')
                    break
                # If text context is likely, apply to text color
                elif re.search(r'(?:text|font|foreground)', prompt, re.IGNORECASE):
                    color_map = {
                        'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
                        'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
                        'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
                        'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
                        'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
                        'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
                        'maroon': '#800000', 'silver': '#c0c0c0', 'gold': '#ffd700',
                        'aqua': '#00ffff', 'fuchsia': '#ff00ff'
                    }
                    changes['color'] = color_map.get(color_word.lower(), f'#{color_word}')
                    break
                # Default to background if no context
                else:
                    color_map = {
                        'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
                        'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
                        'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
                        'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
                        'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
                        'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
                        'maroon': '#800000', 'silver': '#c0c0c0', 'gold': '#ffd700',
                        'aqua': '#00ffff', 'fuchsia': '#ff00ff'
                    }
                    changes['backgroundColor'] = color_map.get(color_word.lower(), f'#{color_word}')
                    break
    
    return changes

@router.post("/process-prompt", response_model=AIResponse)
async def process_ai_prompt(
    request: AIRequest,
    current_user: models.User = Depends(get_current_user)
):
    """
    Process AI prompt and return component changes (CSS styles, HTML attributes, content, type).
    This endpoint can be integrated with any LLM provider.
    """
    try:
        # Call LLM (or enhanced pattern matching) and capture raw response
        changes, raw_llm_response = call_llm(
            request.prompt,
            request.component_type,
            request.current_styles,
            request.current_props
        )
        
        # Ensure changes is a dict
        if not isinstance(changes, dict):
            changes = {}
        
        # Ensure 'style' key exists if there are style changes
        if 'style' not in changes:
            changes['style'] = {}
        
        # Critical fix: If justifyContent or alignItems are set, ensure display: flex is also set
        # This is required for flexbox properties to work
        if changes.get('style'):
            style = changes['style']
            if ('justifyContent' in style or 'alignItems' in style) and 'display' not in style:
                style['display'] = 'flex'
            # Also check if they're in the root (legacy format)
            if ('justifyContent' in changes or 'alignItems' in changes) and 'display' not in changes:
                if 'display' not in style:
                    style['display'] = 'flex'
                # Move root-level flex properties to style
                if 'justifyContent' in changes:
                    style['justifyContent'] = changes.pop('justifyContent')
                if 'alignItems' in changes:
                    style['alignItems'] = changes.pop('alignItems')
        
        # Check if changes is empty or has no meaningful content
        has_changes = False
        if changes.get('style') and len(changes.get('style', {})) > 0:
            has_changes = True
        if changes.get('customCSS'):
            has_changes = True
        if changes.get('type'):
            has_changes = True
        if changes.get('props') and len(changes.get('props', {})) > 0:
            has_changes = True
        if changes.get('wrap_in'):
            has_changes = True
        if changes.get('create_modal'):
            has_changes = True
        
        if not has_changes:
            # Check if the prompt is clear enough to auto-apply (don't ask for confirmation)
            prompt_lower = request.prompt.lower().strip()
            clear_patterns = [
                r'^(make|set|change|update|add|remove|delete|clear)\s+(background|bg|color|text|font|size|width|height|padding|margin|border|opacity|display|position)',
                r'^(center|align|justify|flex|grid)',
                r'^(make|set)\s+(it|this|component)\s+(blue|red|green|yellow|black|white|gray|grey|transparent)',
                r'^(make|set)\s+(it|this|component)\s+\d+\s*(px|rem|em|%)',
                r'^(bold|italic|underline|hidden|visible|block|inline|flex|grid|none)'
            ]
            
            is_clear = any(re.match(pattern, prompt_lower) for pattern in clear_patterns)
            
            # Generate an intelligent guess about what the user wants
            guess = generate_intelligent_guess(request.prompt, request.component_type)
            
            if guess:
                # If it's a clear request, don't ask for confirmation - let frontend auto-apply
                if is_clear:
                    return AIResponse(
                        changes={},
                        message=f"Applying: \"{guess}\"",
                        explanation="Applying your request...",
                        guess=guess,
                        needs_clarification=False,  # Don't ask, just apply
                        raw_response=None
                    )
                else:
                    # Only ask for clarification if request is truly ambiguous
                    return AIResponse(
                        changes={},
                        message=f"Did you mean: \"{guess}\"?",
                        explanation="I'm not sure I understood your request correctly. Please confirm if this is what you want.",
                        guess=guess,
                        needs_clarification=True,
                        raw_response=None
                    )
            else:
                # Fallback to suggestions if no guess can be generated
                suggestions = []
                lower_prompt = request.prompt.lower()
                
                if any(word in lower_prompt for word in ['center', 'centre', 'middle', 'align']):
                    suggestions.append("• \"center content\" or \"center inside component\"")
                    suggestions.append("• \"center on screen\" or \"center the page\"")
                if any(word in lower_prompt for word in ['color', 'background', 'bg']):
                    suggestions.append("• \"make background blue\" or \"change background to red\"")
                if any(word in lower_prompt for word in ['text', 'font', 'content']):
                    suggestions.append("• \"change text to 'Hello'\" or \"make text bold\"")
                if any(word in lower_prompt for word in ['size', 'width', 'height', 'big', 'small']):
                    suggestions.append("• \"set width to 500px\" or \"make it bigger\"")
                if any(word in lower_prompt for word in ['button', 'link', 'input']):
                    suggestions.append("• \"convert to button\" or \"make it a link\"")
                
                # Default suggestions if no specific context found
                if not suggestions:
                    suggestions = [
                        "• \"make background blue\"",
                        "• \"center content\" or \"center on screen\"",
                        "• \"change text to 'Hello'\"",
                        "• \"set width to 500px\"",
                        "• \"convert to button\""
                    ]
                
                return AIResponse(
                    changes={},
                    message="I couldn't understand that request. Try phrases like:\n" + "\n".join(suggestions),
                    explanation="No valid changes could be extracted from your request. Please try rephrasing your request.",
                    needs_clarification=False,
                    raw_response=None
                )
        
        # Create explanation message - clean and user-friendly
        changes_list = []
        if 'wrap_in' in changes and changes['wrap_in']:
            changes_list.append(f"• Wrapped component in <{changes['wrap_in']}> tag")
        if 'style' in changes and changes['style']:
            for key, value in changes['style'].items():
                # Format CSS property names nicely (convert camelCase to readable)
                formatted_key = re.sub(r'([A-Z])', r' \1', key).strip()
                formatted_key = formatted_key[0].upper() + formatted_key[1:] if formatted_key else key
                changes_list.append(f"• {formatted_key}: {value}")
        if 'type' in changes and changes['type']:
            changes_list.append(f"• Component type changed to: {changes['type']}")
        if 'props' in changes and changes['props']:
            for key, value in changes['props'].items():
                # Skip internal props in the message (including children to avoid "New Text" issue)
                if key not in ['style', 'children']:
                    formatted_key = re.sub(r'([A-Z])', r' \1', key).strip()
                    formatted_key = formatted_key[0].upper() + formatted_key[1:] if formatted_key else key
                    # Truncate long values
                    display_value = str(value)
                    if len(display_value) > 50:
                        display_value = display_value[:47] + "..."
                    changes_list.append(f"• {formatted_key}: {display_value}")
        
        if changes_list:
            message = "Applied the following changes:\n" + "\n".join(changes_list)
        else:
            message = "Changes applied successfully!"
        
        return AIResponse(
            changes=changes,
            message=message,
            explanation=f"Successfully processed your request and applied changes.",
            raw_response=raw_llm_response
        )
        
    except Exception as e:
        logger.error(f"Error processing AI prompt: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing AI prompt: {str(e)}"
        )

def process_action_message(action_message: str, component_type: Optional[str] = None, 
                          component_id: Optional[str] = None, current_props: Optional[dict] = None,
                          pages: Optional[List[dict]] = None) -> dict:
    """
    Process action messages like "when signup button click then open login page"
    Returns generated code and explanation.
    """
    system_prompt = """You are an expert React developer. Your task is to convert natural language action descriptions into React code for MODIFYING AN EXISTING COMPONENT.

CRITICAL: You are MODIFYING an existing component, NOT creating a new one. Only return the event handler code and props that need to be added/modified.

USER REQUEST FORMAT: "when [event] then [action]" or direct property assignments like "onClick=..."
Examples:
- "when signup button click then open login page" → onClick handler that navigates to login page
- "onClick=function that navigates to login page" → onClick handler that navigates to login page
- "when submit button click then show success message" → onClick handler that shows alert/toast
- "when input change then validate email" → onChange handler with validation
- "when button click then redirect to home page" → onClick handler with navigation

OUTPUT FORMAT - Return ONLY valid JSON:
{
  "action_code": "React code string (e.g., () => { window.location.href = '/login'; })",
  "explanation": "Human-readable explanation of what will happen",
  "changes": {
    "props": {
      "onClick": "function code string (e.g., () => { window.location.href = '/login'; })"
    }
  },
  "detailed_changes": "Detailed list of what will be modified (e.g., '• Add onClick event handler: () => {...}')",
  "project_impact": "Explanation of how this affects the generated project and user experience"
}

CRITICAL RULES:
1. DO NOT create new components - only return props/event handlers to modify the existing component
2. DO NOT return full JSX elements like <button onClick=...> - only return the function code
3. For navigation: Use React Router's useNavigate or window.location.href
4. For page navigation: Check pages list to find target page route
5. For alerts/messages: Use alert() or show toast notification
6. For form validation: Add onChange handlers with validation logic
7. Always return valid JavaScript/React function code (e.g., "() => { ... }")
8. Include proper error handling when applicable
9. If user provides "onClick=...", extract just the function part, not the full attribute

Return ONLY the JSON object, no explanations."""
    
    user_prompt = f"""ACTION REQUEST: {action_message}
COMPONENT TYPE: {component_type or 'button'}
COMPONENT ID: {component_id or 'unknown'}
CURRENT PROPS: {json.dumps(current_props or {}, indent=2)}
AVAILABLE PAGES: {json.dumps(pages or [], indent=2) if pages else '[]'}

IMPORTANT: You are MODIFYING an existing component with ID {component_id}. DO NOT create a new component.
Only return the event handler code (e.g., onClick function) and props that need to be added/modified.
Do NOT return full JSX elements or create new components.

Generate the React code and explanation for this action."""
    
    try:
        llm_response = call_ollama(user_prompt, system_prompt)
        if llm_response:
            try:
                # Parse JSON from LLM response
                # First, try to find JSON block (may be in markdown code blocks)
                cleaned_response = llm_response
                
                # Remove markdown code blocks if present
                cleaned_response = re.sub(r'```json\s*\n?', '', cleaned_response)
                cleaned_response = re.sub(r'```\s*\n?', '', cleaned_response)
                cleaned_response = re.sub(r'```[a-z]*\s*\n?', '', cleaned_response)
                
                # Try to find JSON object
                json_match = re.search(r'\{[\s\S]*\}', cleaned_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                
                # Try to fix common JSON issues
                # Fix trailing commas first
                json_str = re.sub(r',\s*}', '}', json_str)
                json_str = re.sub(r',\s*]', ']', json_str)
                
                # Fix single quotes to double quotes - be more careful
                # Replace 'key': patterns
                json_str = re.sub(r"'(\w+)':", r'"\1":', json_str)
                
                # Replace key: 'value' patterns - handle function strings carefully
                def fix_string_quotes(match):
                    key = match.group(1)
                    value = match.group(2)
                    # Escape any double quotes in the value
                    value = value.replace('"', '\\"')
                    return f'{key}: "{value}"'
                
                json_str = re.sub(r'(\w+):\s*\'([^\']*)\'', fix_string_quotes, json_str)
                
                try:
                    parsed = json.loads(json_str)
                except json.JSONDecodeError as e:
                    logger.warning(f"JSON parse error, trying to fix: {e}")
                    logger.debug(f"Problematic JSON (first attempt): {json_str[:300]}")
                    
                    # Try more aggressive fixes
                    # Remove any non-JSON content before first {
                    if '{' in json_str:
                        json_str = json_str[json_str.find('{'):]
                    # Remove any content after last }
                    if '}' in json_str:
                        json_str = json_str[:json_str.rfind('}') + 1]
                    
                    # More careful quote fixing
                    # Replace single quotes in keys
                    json_str = re.sub(r"'(\w+)':", r'"\1":', json_str)
                    # For values, escape quotes properly
                    json_str = re.sub(r":\s*'([^']*)'", lambda m: f': "{m.group(1).replace(chr(34), chr(92)+chr(34))}"', json_str)
                    
                    try:
                        parsed = json.loads(json_str)
                    except json.JSONDecodeError as e2:
                        logger.error(f"Could not parse LLM response as JSON after fixes: {e2}")
                        logger.debug(f"Problematic JSON string: {json_str[:500]}")
                        # Fallback to pattern matching
                        return process_action_patterns(action_message, component_type, pages)
                
                # Validate and clean the response - ensure we're not creating new components
                
                # Clean action_code if it contains a full component
                if parsed.get("action_code") and isinstance(parsed["action_code"], str):
                    action_code = parsed["action_code"]
                    # If action_code contains a full button/component element, extract just the onClick handler
                    if "<button" in action_code or "<Button" in action_code:
                        # Extract onClick handler from the component
                        onClick_match = re.search(r'onClick\s*=\s*["\']?([^"\']+)["\']?', action_code, re.IGNORECASE)
                        if onClick_match:
                            parsed["action_code"] = onClick_match.group(1).strip()
                        else:
                            # Try to extract from JSX format onClick={{...}}
                            onClick_match = re.search(r'onClick\s*=\s*\{\{([^}]+)\}\}', action_code, re.IGNORECASE)
                            if onClick_match:
                                parsed["action_code"] = onClick_match.group(1).strip()
                            else:
                                # Fallback to pattern matching
                                fallback_result = process_action_patterns(action_message, component_type, pages)
                                parsed["action_code"] = fallback_result.get("action_code", "() => { console.log('Action triggered'); }")
                
                if parsed.get("changes", {}).get("props"):
                    props = parsed["changes"]["props"]
                    # Remove any props that suggest component creation
                    if "type" in props:
                        del props["type"]
                    if "children" in props and isinstance(props["children"], str) and props["children"].strip().startswith("<"):
                        # If children contains HTML/JSX, remove it
                        del props["children"]
                    
                    # Ensure onClick is a function string, not a full component
                    if "onClick" in props:
                        onClick_value = props["onClick"]
                        # If it contains JSX/HTML tags, extract just the function
                        if isinstance(onClick_value, str):
                            # Remove any JSX/HTML tags - if it looks like a full button element, extract just the onClick value
                            if "<button" in onClick_value or "<Button" in onClick_value:
                                # Extract function from onClick="..." or onClick={...}
                                func_match = re.search(r'onClick\s*=\s*["\']?([^"\']+)["\']?', onClick_value, re.IGNORECASE)
                                if func_match:
                                    props["onClick"] = func_match.group(1).strip()
                                else:
                                    # Try to extract function from JSX
                                    func_match = re.search(r'\{([^}]+)\}', onClick_value)
                                    if func_match:
                                        props["onClick"] = func_match.group(1).strip()
                                    else:
                                        # Fallback: use pattern matching
                                        fallback_result = process_action_patterns(action_message, component_type, pages)
                                        props["onClick"] = fallback_result.get("changes", {}).get("props", {}).get("onClick", "() => { console.log('Action triggered'); }")
                    
                    return parsed
                else:
                    # No JSON found in response
                    logger.warning("No JSON object found in LLM response")
                    return process_action_patterns(action_message, component_type, pages)
            except (json.JSONDecodeError, ValueError, KeyError, AttributeError) as parse_error:
                logger.warning(f"Error parsing LLM response, using pattern matching: {parse_error}")
                logger.debug(f"LLM response was: {llm_response[:500] if llm_response else 'None'}")
                # Fallback to pattern matching
                return process_action_patterns(action_message, component_type, pages)
        else:
            # No LLM response, use pattern matching
            return process_action_patterns(action_message, component_type, pages)
    except Exception as e:
        logger.error(f"Error processing action message: {e}", exc_info=True)
        return process_action_patterns(action_message, component_type, pages)

def process_action_patterns(action_message: str, component_type: Optional[str] = None, 
                           pages: Optional[List[dict]] = None) -> dict:
    """Fallback pattern-based processing for action messages."""
    lower_msg = action_message.lower()
    changes = {"props": {}}
    action_code = ""
    explanation = ""
    
    # Handle direct onClick assignment like "onClick=function that navigates to login page"
    if re.search(r'onclick\s*=\s*["\']?', action_message, re.IGNORECASE):
        # Extract the function description after onClick=
        onclick_match = re.search(r'onclick\s*=\s*["\']?([^"\']+)["\']?', action_message, re.IGNORECASE)
        if onclick_match:
            func_desc = onclick_match.group(1).strip()
            # Process the function description
            if 'navigate' in func_desc.lower() or 'login' in func_desc.lower() or 'page' in func_desc.lower():
                # Find login page
                target_page = None
                if pages:
                    for page in pages:
                        page_name = page.get('name', '').lower()
                        page_route = page.get('route', '').lower()
                        if 'login' in page_name or 'login' in page_route:
                            target_page = page
                            break
                
                if target_page:
                    route = target_page.get('route', '/login')
                    action_code = f"() => {{ window.location.href = '{route}'; }}"
                    explanation = f"When clicked, this will navigate to {target_page.get('name', 'the login page')}"
                else:
                    action_code = "() => { window.location.href = '/login'; }"
                    explanation = "When clicked, this will navigate to the login page"
                changes["props"]["onClick"] = action_code
                detailed_changes = [f"• Add onClick event handler: {action_code}"]
                return {
                    "action_code": action_code,
                    "explanation": explanation,
                    "changes": changes,
                    "detailed_changes": "\n".join(detailed_changes),
                    "project_impact": "This change will modify the component's behavior. When users click this component, it will navigate to the login page."
                }
    
    # Navigation patterns
    if re.search(r'(open|navigate|go|redirect|route).*?(page|route)', lower_msg):
        # Extract target page
        target_page = None
        if pages:
            for page in pages:
                page_name = page.get('name', '').lower()
                page_route = page.get('route', '').lower()
                if any(word in page_name or word in page_route for word in ['login', 'signin']):
                    if 'login' in lower_msg or 'signin' in lower_msg:
                        target_page = page
                        break
                elif any(word in page_name or word in page_route for word in ['home', 'index', 'main']):
                    if 'home' in lower_msg or 'main' in lower_msg:
                        target_page = page
                        break
        
        if target_page:
            route = target_page.get('route', '/')
            action_code = f"() => {{ window.location.href = '{route}'; }}"
            explanation = f"When clicked, this will navigate to {target_page.get('name', 'the target page')}"
            changes["props"]["onClick"] = action_code
        else:
            action_code = "() => { window.location.href = '/'; }"
            explanation = "When clicked, this will navigate to the home page"
            changes["props"]["onClick"] = action_code
    
    # Alert/Message patterns
    elif re.search(r'(show|display|alert|message|toast|notification)', lower_msg):
        if 'success' in lower_msg:
            action_code = "() => { alert('Success!'); }"
            explanation = "When clicked, this will show a success message"
        elif 'error' in lower_msg:
            action_code = "() => { alert('Error occurred'); }"
            explanation = "When clicked, this will show an error message"
        else:
            action_code = "() => { alert('Action completed'); }"
            explanation = "When clicked, this will show a message"
        changes["props"]["onClick"] = action_code
    
    # Default: onClick handler
    else:
        action_code = "() => { console.log('Action triggered'); }"
        explanation = "When clicked, this will trigger an action"
        changes["props"]["onClick"] = action_code
    
    # Generate detailed changes description
    detailed_changes = []
    if changes.get("props"):
        for prop_key, prop_value in changes["props"].items():
            if prop_key == "onClick":
                detailed_changes.append(f"• Add onClick event handler: {prop_value}")
            else:
                detailed_changes.append(f"• Add/Update property '{prop_key}': {prop_value}")
    
    project_impact = "This change will modify the component's behavior. "
    if "onClick" in changes.get("props", {}):
        project_impact += "When users interact with this component, the specified action will be triggered. "
        if "navigate" in action_code.lower() or "location" in action_code.lower():
            project_impact += "This will cause page navigation in the generated application."
        elif "alert" in action_code.lower():
            project_impact += "This will display a message to users."
    
    return {
        "action_code": action_code,
        "explanation": explanation,
        "changes": changes,
        "detailed_changes": "\n".join(detailed_changes) if detailed_changes else "No specific changes detected",
        "project_impact": project_impact
    }

@router.post("/process-action", response_model=ActionResponse)
async def process_action(
    request: ActionRequest,
    current_user: models.User = Depends(get_current_user)
):
    """
    Process action messages and return generated code with explanation.
    Example: "when signup button click then open login page"
    """
    try:
        result = process_action_message(
            request.action_message,
            request.component_type,
            request.component_id,
            request.current_props,
            request.pages
        )
        
        return ActionResponse(
            action_code=result.get("action_code", ""),
            explanation=result.get("explanation", "Action will be applied"),
            changes=result.get("changes", {}),
            detailed_changes=result.get("detailed_changes", ""),
            project_impact=result.get("project_impact", "This will modify the component behavior."),
            needs_confirmation=True
        )
    except Exception as e:
        logger.error(f"Error processing action: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process action: {str(e)}"
        )

def analyze_and_fix_error(error_message: str, error_traceback: Optional[str] = None, 
                         file_path: Optional[str] = None, project_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Analyze an error message and generate a fix for backend code.
    """
    system_prompt = """You are an expert developer specializing in debugging and fixing errors in JavaScript, React, Python, and FastAPI code.

YOUR TASK: Analyze error messages and tracebacks to identify the root cause and generate COMPLETE FIXED CODE.

CRITICAL RULES:
1. You MUST return the COMPLETE FIXED FILE CONTENT in "fix_code", not just an explanation or partial code.
2. DO NOT create new components, files, or features - ONLY fix the existing error in the provided file.
3. DO NOT add new functionality - ONLY fix what is broken.
4. Your job is to FIX ERRORS, not to create new code or components.
5. Read the error message carefully and fix ONLY the specific issue mentioned.

ANALYSIS PROCESS:
1. Read and understand the error message
2. Analyze the traceback (if provided) to identify the exact line and file
3. Read the CURRENT FILE CONTENT provided in the context
4. Identify the root cause (syntax error, type error, missing import, undefined variable, logic error, etc.)
5. Generate the COMPLETE FIXED FILE with all necessary changes applied
6. Provide clear explanation of what was wrong and how the fix works

OUTPUT FORMAT - Return ONLY valid JSON:
{
  "issue_identified": "Brief description of the issue (e.g., 'Undefined variable handleSignup', 'Missing import statement', 'TypeError: expected str got int')",
  "root_cause": "Detailed explanation of why this error occurred",
  "fix_code": "THE COMPLETE FIXED FILE CONTENT - must be the entire file with all fixes applied. Include all imports, functions, and code.",
  "file_path": "Path to the file that needs fixing (e.g., 'src/pages/SignupPage.js' or 'backend/main.py')",
  "explanation": "Step-by-step explanation of the fix",
  "confidence": 0.95,
  "line_number": 123  // Optional: line number where the error occurs
}

COMMON ERROR PATTERNS:
1. ImportError/ModuleNotFoundError → Add missing import or fix import path
2. TypeError → Fix type mismatches, add type conversions
3. AttributeError → Check if attribute exists, add null checks
4. SyntaxError → Fix syntax issues (missing colons, brackets, quotes)
5. IndentationError → Fix indentation
6. NameError → Fix undefined variables, add variable declarations
7. KeyError → Add key existence checks or default values
8. ValueError → Fix value validation or type conversion
9. JSONDecodeError → Fix JSON parsing, add error handling
10. HTTPException → Fix API endpoint logic, add proper error handling

RULES:
1. Always provide complete, working code
2. Include necessary imports
3. Add proper error handling when applicable
4. Maintain code style and conventions
5. If file_path is provided, read the actual file content and fix it
6. If multiple files are involved, prioritize the file mentioned in traceback
7. Be specific about line numbers if traceback provides them

Return ONLY the JSON object, no explanations."""
    
    # Build context for the LLM
    context_parts = [f"ERROR MESSAGE: {error_message}"]
    
    if error_traceback:
        context_parts.append(f"TRACEBACK:\n{error_traceback}")
    
    # If project_id is provided, try to find the file in the generated project
    actual_file_path = None
    if project_id:
        context_parts.append(f"PROJECT ID: {project_id}")
        # Try to find the project directory
        from app.services.code_generator import GENERATED_APPS_DIR
        base_dir = Path(GENERATED_APPS_DIR)
        
        # Search for project directory
        pattern = f"project_{project_id}_*"
        matching_dirs = list(base_dir.glob(pattern))
        if matching_dirs:
            project_dir = matching_dirs[0]
            
            # If file_path is provided, try to find it in the project
            if file_path:
                # Try different possible locations
                possible_paths = [
                    project_dir / file_path,  # Direct path
                    project_dir / "backend" / file_path,  # Backend file
                    project_dir / "frontend" / file_path,  # Frontend file
                    project_dir / "backend" / file_path.replace("app/", ""),  # Without app/ prefix
                ]
                
                for possible_path in possible_paths:
                    if possible_path.exists():
                        actual_file_path = possible_path
                        try:
                            with open(possible_path, 'r') as f:
                                file_content = f.read()
                            context_parts.append(f"FILE PATH: {possible_path}")
                            context_parts.append(f"CURRENT FILE CONTENT:\n{file_content}")
                            break
                        except Exception as e:
                            logger.warning(f"Could not read file {possible_path}: {e}")
            
            # If no file_path specified, try to extract from error message or traceback
            if not actual_file_path:
                search_text = error_traceback or error_message
                if search_text:
                    # Enhanced file path extraction patterns
                    file_patterns = [
                        r'File\s+["\']([^"\']+\.(py|js|jsx|ts|tsx))["\']',  # File "path/to/file.py"
                        r'["\']([^"\']+\.(py|js|jsx|ts|tsx))["\']',  # "path/to/file.py"
                        r'File\s+([^\s,]+\.(py|js|jsx|ts|tsx))',  # File path/to/file.py
                        r'([^\s,]+\.(py|js|jsx|ts|tsx))',  # path/to/file.py
                        r'in\s+([^\s,]+\.(py|js|jsx|ts|tsx))',  # in path/to/file.py
                        r'at\s+([^\s,]+\.(py|js|jsx|ts|tsx))',  # at path/to/file.py
                        r'line\s+\d+.*?([^\s,]+\.(py|js|jsx|ts|tsx))',  # line 123 in path/to/file.py
                    ]
                    
                    found_file = None
                    for pattern in file_patterns:
                        file_match = re.search(pattern, search_text, re.IGNORECASE)
                        if file_match:
                            found_file = file_match.group(1)
                            # Clean up the file path (remove line numbers, etc.)
                            found_file = found_file.strip('"\'')
                            # Remove line number if present (e.g., "file.py:123" -> "file.py")
                            found_file = re.sub(r':\d+$', '', found_file)
                            if found_file:
                                break
                    
                    if found_file:
                        # Try to find it in project with multiple search strategies
                        # Extract just the filename and directory parts
                        file_name = Path(found_file).name
                        file_dir = Path(found_file).parent
                        
                        # Build comprehensive search paths
                        possible_paths = []
                        
                        # Direct path matches
                        possible_paths.extend([
                            project_dir / found_file,
                            project_dir / "backend" / found_file,
                            project_dir / "frontend" / found_file,
                            project_dir / "backend" / found_file.replace("app/", ""),
                            project_dir / "frontend" / "src" / found_file,
                        ])
                        
                        # Filename-only matches (search recursively)
                        if file_name:
                            possible_paths.extend([
                                project_dir / "backend" / file_name,
                                project_dir / "frontend" / file_name,
                                project_dir / "frontend" / "src" / file_name,
                            ])
                            
                            # Recursive search for filename
                            for py_file in project_dir.rglob(file_name):
                                possible_paths.append(py_file)
                        
                        # Directory + filename matches
                        if file_dir and file_dir != Path('.'):
                            possible_paths.extend([
                                project_dir / "backend" / file_dir / file_name,
                                project_dir / "frontend" / file_dir / file_name,
                                project_dir / "frontend" / "src" / file_dir / file_name,
                            ])
                        
                        # Remove duplicates and check existence
                        seen = set()
                        for possible_path in possible_paths:
                            path_str = str(possible_path)
                            if path_str not in seen and possible_path.exists():
                                seen.add(path_str)
                                actual_file_path = possible_path
                                try:
                                    with open(possible_path, 'r') as f:
                                        file_content = f.read()
                                    context_parts.append(f"FILE PATH (extracted from error): {possible_path}")
                                    context_parts.append(f"CURRENT FILE CONTENT:\n{file_content}")
                                    logger.info(f"Found and read file from error message: {possible_path}")
                                    break
                                except Exception as e:
                                    logger.warning(f"Could not read file {possible_path}: {e}")
                        
                        if not actual_file_path:
                            logger.warning(f"Could not find file '{found_file}' in project directory")
    
    elif file_path:
        # No project_id, try direct path
        context_parts.append(f"FILE PATH: {file_path}")
        try:
            file_path_obj = Path(file_path)
            if file_path_obj.exists():
                actual_file_path = file_path_obj
                with open(file_path_obj, 'r') as f:
                    file_content = f.read()
                context_parts.append(f"CURRENT FILE CONTENT:\n{file_content}")
        except Exception as e:
            logger.warning(f"Could not read file {file_path}: {e}")
    
    user_prompt = "\n\n".join(context_parts) + """

CRITICAL INSTRUCTIONS:
1. Read the CURRENT FILE CONTENT above (if provided)
2. Identify the exact issue causing the error
3. Return the COMPLETE FIXED FILE CONTENT in the "fix_code" field
4. Do NOT return explanations or instructions - return actual working code
5. For undefined variables: Add the function/variable definition
6. For React: Ensure all functions are defined before use
7. Preserve all existing code that doesn't need changes
8. Include ALL imports and exports

Analyze this error and provide the COMPLETE FIXED FILE CONTENT."""
    
    try:
        llm_response = call_ollama(user_prompt, system_prompt, model="deepseek-coder")
        
        if llm_response:
            # Parse JSON from LLM response
            cleaned_response = llm_response
            
            # Remove markdown code blocks if present
            cleaned_response = re.sub(r'```json\s*\n?', '', cleaned_response)
            cleaned_response = re.sub(r'```\s*\n?', '', cleaned_response)
            cleaned_response = re.sub(r'```[a-z]*\s*\n?', '', cleaned_response)
            
            # Try to find JSON object
            json_match = re.search(r'\{[\s\S]*\}', cleaned_response, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                
                # Fix common JSON issues
                json_str = re.sub(r',\s*}', '}', json_str)
                json_str = re.sub(r',\s*]', ']', json_str)
                json_str = re.sub(r"'(\w+)':", r'"\1":', json_str)
                
                try:
                    parsed = json.loads(json_str)
                    # Store the actual file path for later use
                    if actual_file_path:
                        parsed['_actual_file_path'] = str(actual_file_path)
                    return parsed
                except json.JSONDecodeError as e:
                    logger.warning(f"Could not parse LLM response as JSON: {e}")
        
        # Fallback: Generate a basic response
        return {
            "issue_identified": "Unable to parse error automatically",
            "root_cause": "The error message could not be automatically analyzed",
            "fix_code": "# Please review the error manually and apply appropriate fixes",
            "file_path": file_path or "unknown",
            "explanation": "Automatic analysis failed. Please review the error message and traceback manually.",
            "confidence": 0.3
        }
    except Exception as e:
        logger.error(f"Error analyzing error: {e}")
        return {
            "issue_identified": "Error during analysis",
            "root_cause": str(e),
            "fix_code": "# Error occurred during analysis",
            "file_path": file_path or "unknown",
            "explanation": f"An error occurred while analyzing: {str(e)}",
            "confidence": 0.1
        }

def apply_fix_to_file(file_path: str, fix_code: str) -> bool:
    """Apply the fix code to the actual file."""
    try:
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            logger.error(f"File does not exist: {file_path}")
            return False
        
        # Write the fix code to the file
        with open(file_path_obj, 'w') as f:
            f.write(fix_code)
        
        logger.info(f"Successfully applied fix to {file_path}")
        return True
    except Exception as e:
        logger.error(f"Error applying fix to {file_path}: {e}")
        return False

def rebuild_docker_containers(project_dir: Path) -> tuple[bool, Optional[str]]:
    """Rebuild Docker containers for the project."""
    try:
        from app.routers.projects import get_docker_compose_cmd
        
        docker_cmd = get_docker_compose_cmd()
        
        # Stop existing containers
        subprocess.run(
            docker_cmd + ['down'],
            cwd=project_dir,
            capture_output=True,
            timeout=30
        )
        
        # Rebuild containers
        build_result = subprocess.run(
            docker_cmd + ['build'],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        if build_result.returncode != 0:
            logger.error(f"Docker build failed: {build_result.stderr}")
            return False, build_result.stderr[:500]
        
        # Start containers
        start_result = subprocess.run(
            docker_cmd + ['up', '-d'],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if start_result.returncode != 0:
            logger.error(f"Docker start failed: {start_result.stderr}")
            return False, start_result.stderr[:500]
        
        logger.info(f"Successfully rebuilt Docker containers for {project_dir}")
        return True, None
    except Exception as e:
        logger.error(f"Error rebuilding Docker: {e}")
        return False, str(e)

@router.post("/debug-fix", response_model=DebugResponse)
async def debug_and_fix(
    request: DebugRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Analyze an error message, generate a fix, apply it to the generated project,
    and rebuild Docker containers.
    Example: "JSONDecodeError: Expecting property name enclosed in double quotes"
    """
    try:
        # PROACTIVE FIX: Check for common errors and fix them immediately before calling LLM
        error_msg_lower = request.error_message.lower()
        fix_applied_proactive = False
        actual_file_path_proactive = None
        
        # Handle "expected 'except' or 'finally' block" error proactively
        if ("expected 'except' or 'finally' block" in error_msg_lower or 
            "expected except" in error_msg_lower or 
            "expected finally" in error_msg_lower):
            
            if request.project_id:
                from app.services.code_generator import GENERATED_APPS_DIR
                base_dir = Path(GENERATED_APPS_DIR)
                pattern = f"project_{request.project_id}_*"
                matching_dirs = list(base_dir.glob(pattern))
                
                if matching_dirs:
                    project_dir = matching_dirs[0]
                    
                    # Search for Python files in the project
                    python_files = list(project_dir.rglob("*.py"))
                    
                    for py_file in python_files:
                        try:
                            with open(py_file, 'r') as f:
                                content = f.read()
                            
                            # Check if this file has a try block without except/finally
                            lines = content.split('\n')
                            new_lines = []
                            modified = False
                            i = 0
                            
                            while i < len(lines):
                                line = lines[i]
                                new_lines.append(line)
                                
                                # Check if this line starts a try block
                                if re.match(r'^\s*try\s*:', line):
                                    # Find the indentation
                                    indent_match = re.match(r'^(\s*)', line)
                                    indent = indent_match.group(1) if indent_match else ''
                                    
                                    # Look ahead to see if there's an except or finally
                                    has_except_or_finally = False
                                    j = i + 1
                                    while j < len(lines):
                                        next_line = lines[j]
                                        # If we hit a line with same or less indentation (not empty), check if it's except/finally
                                        if next_line.strip() and not next_line.strip().startswith('#'):
                                            next_indent = len(next_line) - len(next_line.lstrip())
                                            if next_indent <= len(indent):
                                                # Check if it's except or finally
                                                if re.match(r'^\s*(except|finally)', next_line):
                                                    has_except_or_finally = True
                                                break
                                        j += 1
                                    
                                    # If no except/finally found, add one
                                    if not has_except_or_finally:
                                        # Find where the try block ends (next line with same or less indentation)
                                        try_block_end = i + 1
                                        while try_block_end < len(lines):
                                            next_line = lines[try_block_end]
                                            if next_line.strip() and not next_line.strip().startswith('#'):
                                                next_indent = len(next_line) - len(next_line.lstrip())
                                                if next_indent <= len(indent):
                                                    break
                                            try_block_end += 1
                                        
                                        # Insert except block at the end of try block
                                        except_block = f"{indent}except Exception as e:\n{indent}    # Handle error\n{indent}    pass"
                                        new_lines.append(except_block)
                                        modified = True
                                
                                i += 1
                            
                            # If we found and fixed a try block, write it back
                            if modified:
                                fixed_content = '\n'.join(new_lines)
                                with open(py_file, 'w') as f:
                                    f.write(fixed_content)
                                
                                actual_file_path_proactive = str(py_file)
                                fix_applied_proactive = True
                                logger.info(f"Proactively fixed try block in {py_file}")
                                break  # Fix one file at a time
                        except Exception as e:
                            logger.warning(f"Error checking file {py_file}: {e}")
                            continue
        
        # If we already fixed it proactively, return early
        if fix_applied_proactive:
            # Rebuild Docker
            from app.services.code_generator import GENERATED_APPS_DIR
            base_dir = Path(GENERATED_APPS_DIR)
            pattern = f"project_{request.project_id}_*"
            matching_dirs = list(base_dir.glob(pattern))
            docker_rebuilt = False
            application_url = None
            
            if matching_dirs:
                project_dir = matching_dirs[0]
                docker_rebuilt, error_msg = rebuild_docker_containers(project_dir)
                
                if docker_rebuilt:
                    # Get application URL from database
                    project = db.query(models.Project).filter(models.Project.id == request.project_id).first()
                    if project:
                        application_url = project.application_url
            
            return DebugResponse(
                issue_identified="SyntaxError: expected 'except' or 'finally' block",
                root_cause="A try block was found without a corresponding except or finally block",
                fix_code=f"Added 'except Exception as e: pass' block to try statement in {actual_file_path_proactive}",
                file_path=actual_file_path_proactive or "unknown",
                explanation="The try block was missing an except or finally clause. Added an except block to handle exceptions.",
                confidence=0.95,
                needs_confirmation=False,
                fix_applied=True,
                docker_rebuilt=docker_rebuilt,
                application_url=application_url
            )
        
        result = analyze_and_fix_error(
            request.error_message,
            request.error_traceback,
            request.file_path,
            request.project_id
        )
        
        fix_applied = False
        docker_rebuilt = False
        application_url = None
        
        # If project_id is provided and we have a fix, apply it
        if request.project_id and result.get("fix_code") and result.get("confidence", 0) > 0.5:
            # Try to find the actual file path
            actual_file_path = result.get("_actual_file_path")
            
            # If not found, try to resolve from the file_path in result
            if not actual_file_path:
                from app.services.code_generator import GENERATED_APPS_DIR
                base_dir = Path(GENERATED_APPS_DIR)
                pattern = f"project_{request.project_id}_*"
                matching_dirs = list(base_dir.glob(pattern))
                
                if matching_dirs:
                    project_dir = matching_dirs[0]
                    file_path_from_result = result.get("file_path", "")
                    
                    # Enhanced file path resolution
                    if file_path_from_result:
                        # Try different possible locations
                        possible_paths = [
                            project_dir / file_path_from_result,
                            project_dir / "backend" / file_path_from_result,
                            project_dir / "frontend" / file_path_from_result,
                            project_dir / "frontend" / "src" / file_path_from_result,
                            project_dir / "backend" / file_path_from_result.replace("app/", ""),
                        ]
                        
                        # Also try extracting filename and searching recursively
                        file_name = Path(file_path_from_result).name
                        if file_name:
                            # Recursive search for filename
                            for found_file in project_dir.rglob(file_name):
                                possible_paths.append(found_file)
                        
                        for possible_path in possible_paths:
                            if possible_path.exists():
                                actual_file_path = str(possible_path)
                                logger.info(f"Resolved file path: {actual_file_path}")
                                break
                    
                    # If still not found, try to extract from error message again
                    if not actual_file_path:
                        search_text = request.error_traceback or request.error_message
                        if search_text:
                            # Use same enhanced extraction as in analyze_and_fix_error
                            file_patterns = [
                                r'File\s+["\']([^"\']+\.(py|js|jsx|ts|tsx))["\']',
                                r'["\']([^"\']+\.(py|js|jsx|ts|tsx))["\']',
                                r'File\s+([^\s,]+\.(py|js|jsx|ts|tsx))',
                                r'([^\s,]+\.(py|js|jsx|ts|tsx))',
                                r'in\s+([^\s,]+\.(py|js|jsx|ts|tsx))',
                                r'at\s+([^\s,]+\.(py|js|jsx|ts|tsx))',
                            ]
                            
                            found_file = None
                            for pattern in file_patterns:
                                file_match = re.search(pattern, search_text, re.IGNORECASE)
                                if file_match:
                                    found_file = file_match.group(1).strip('"\'')
                                    found_file = re.sub(r':\d+$', '', found_file)
                                    if found_file:
                                        break
                            
                            if found_file:
                                file_name = Path(found_file).name
                                # Recursive search
                                for found_path in project_dir.rglob(file_name):
                                    actual_file_path = str(found_path)
                                    logger.info(f"Found file from error message: {actual_file_path}")
                                    break
            
            if actual_file_path:
                # Verify the file exists before proceeding
                if not Path(actual_file_path).exists():
                    logger.error(f"File does not exist: {actual_file_path}")
                    actual_file_path = None
                else:
                    # Read the current file content to verify it's the right file
                    try:
                        with open(actual_file_path, 'r') as f:
                            current_content = f.read()
                        logger.info(f"Verified file exists and is readable: {actual_file_path} ({len(current_content)} chars)")
                    except Exception as e:
                        logger.error(f"Cannot read file {actual_file_path}: {e}")
                        actual_file_path = None
            
            if actual_file_path:
                # Check if fix_code is actually code (not just explanation)
                fix_code = result.get("fix_code", "")
                
                # Check if fix_code is explanation rather than code
                is_explanation = (
                    fix_code.strip().lower().startswith("ensure") or
                    fix_code.strip().lower().startswith("you need") or
                    fix_code.strip().lower().startswith("please") or
                    fix_code.strip().lower().startswith("add") and "function" not in fix_code or
                    len(fix_code) < 50 or
                    ("function" not in fix_code and "const" not in fix_code and "import" not in fix_code and 
                     "def " not in fix_code and "class " not in fix_code and "export" not in fix_code)
                )
                
                # If it's an explanation, try to generate actual fix from the original file
                if is_explanation and Path(actual_file_path).exists():
                    try:
                        # Read the original file
                        with open(actual_file_path, 'r') as f:
                            original_content = f.read()
                        
                        # Try to generate a proper fix based on the error
                        issue = result.get("issue_identified", "").lower()
                        error_msg_lower = request.error_message.lower()
                        
                        # Handle "expected 'except' or 'finally' block" error
                        if "expected 'except' or 'finally' block" in error_msg_lower or "expected except" in error_msg_lower:
                            fixed_content = original_content
                            
                            # Find try blocks without except/finally
                            lines = fixed_content.split('\n')
                            new_lines = []
                            i = 0
                            
                            while i < len(lines):
                                line = lines[i]
                                new_lines.append(line)
                                
                                # Check if this line starts a try block
                                if re.match(r'^\s*try\s*:', line):
                                    # Find the indentation
                                    indent_match = re.match(r'^(\s*)', line)
                                    indent = indent_match.group(1) if indent_match else ''
                                    
                                    # Look ahead to see if there's an except or finally
                                    has_except_or_finally = False
                                    j = i + 1
                                    while j < len(lines):
                                        next_line = lines[j]
                                        # If we hit a line with same or less indentation (not empty), check if it's except/finally
                                        if next_line.strip() and not next_line.strip().startswith('#'):
                                            next_indent = len(next_line) - len(next_line.lstrip())
                                            if next_indent <= len(indent):
                                                # Check if it's except or finally
                                                if re.match(r'^\s*(except|finally)', next_line):
                                                    has_except_or_finally = True
                                                break
                                        j += 1
                                    
                                    # If no except/finally found, add one
                                    if not has_except_or_finally:
                                        # Find where the try block ends (next line with same or less indentation)
                                        try_block_end = i + 1
                                        while try_block_end < len(lines):
                                            next_line = lines[try_block_end]
                                            if next_line.strip() and not next_line.strip().startswith('#'):
                                                next_indent = len(next_line) - len(next_line.lstrip())
                                                if next_indent <= len(indent):
                                                    break
                                            try_block_end += 1
                                        
                                        # Insert except block at the end of try block
                                        except_block = f"{indent}except Exception as e:\n{indent}    # Handle error\n{indent}    pass"
                                        new_lines.append(except_block)
                                
                                i += 1
                            
                            fix_code = '\n'.join(new_lines)
                            logger.info("Added except block to try statement")
                        elif "undefined" in issue or "not defined" in issue:
                            # Extract variable/function name
                            var_match = re.search(r"undefined.*?['\"]([^'\"]+)['\"]", issue)
                            if not var_match:
                                var_match = re.search(r"['\"]([^'\"]+)['\"].*?not defined", issue)
                            
                            if var_match:
                                var_name = var_match.group(1)
                                
                                # For React files, add function definition
                                if actual_file_path.endswith(('.js', '.jsx', '.ts', '.tsx')):
                                    # Check if it's used in the file
                                    if var_name in original_content:
                                        fixed_content = original_content
                                        
                                        # Fix the onSubmit/onClick handler - handle different patterns
                                        # Pattern 1: onSubmit={() => { handleSignup }} (with spaces)
                                        fixed_content = re.sub(
                                            rf'onSubmit=\{{\(\)\s*=>\s*{{\s*{re.escape(var_name)}\s*}}\}}',
                                            f'onSubmit={{{var_name}}}',
                                            fixed_content
                                        )
                                        # Pattern 2: onClick={() => { handleSignup }}
                                        fixed_content = re.sub(
                                            rf'onClick=\{{\(\)\s*=>\s*{{\s*{re.escape(var_name)}\s*}}\}}',
                                            f'onClick={{{var_name}}}',
                                            fixed_content
                                        )
                                        # Pattern 3: Any handler with the variable
                                        fixed_content = re.sub(
                                            rf'(\w+)=\{{\(\)\s*=>\s*{{\s*{re.escape(var_name)}\s*}}\}}',
                                            rf'\1={{{var_name}}}',
                                            fixed_content
                                        )
                                        
                                        # Add function definition if it doesn't exist
                                        if f"const {var_name}" not in fixed_content and f"function {var_name}" not in fixed_content:
                                            # Find the component function (function ComponentName() or const ComponentName =)
                                            component_match = re.search(r'(function\s+\w+\s*\([^)]*\)\s*\{)', fixed_content)
                                            if component_match:
                                                # Insert function definition right before the component function
                                                insert_pos = component_match.start()
                                                fixed_content = (
                                                    fixed_content[:insert_pos] +
                                                    f"const {var_name} = (e) => {{\n  e.preventDefault();\n  // Add your logic here\n}};\n\n" +
                                                    fixed_content[insert_pos:]
                                                )
                                            else:
                                                # Add after last import statement
                                                import_lines = [m.end() for m in re.finditer(r'import[^;]+;', fixed_content)]
                                                if import_lines:
                                                    last_import_end = max(import_lines)
                                                    fixed_content = (
                                                        fixed_content[:last_import_end] +
                                                        f"\n\nconst {var_name} = (e) => {{\n  e.preventDefault();\n  // Add your logic here\n}};\n" +
                                                        fixed_content[last_import_end:]
                                                    )
                                                else:
                                                    # Fallback: add at the beginning after first line
                                                    first_newline = fixed_content.find("\n")
                                                    if first_newline > 0:
                                                        fixed_content = (
                                                            fixed_content[:first_newline+1] +
                                                            f"\nconst {var_name} = (e) => {{\n  e.preventDefault();\n  // Add your logic here\n}};\n" +
                                                            fixed_content[first_newline+1:]
                                                        )
                                        
                                        fix_code = fixed_content
                                        logger.info(f"Generated fix for undefined variable {var_name} in React file")
                                
                                # For Python files
                                elif actual_file_path.endswith('.py'):
                                    # Check for syntax errors first
                                    issue_lower = issue.lower()
                                    error_msg_lower_py = request.error_message.lower()
                                    
                                    # Handle "expected 'except' or 'finally' block" error
                                    if ("expected 'except' or 'finally' block" in issue_lower or "expected except" in issue_lower or
                                        "expected 'except' or 'finally' block" in error_msg_lower_py or "expected except" in error_msg_lower_py):
                                        # Find try blocks without except/finally
                                        fixed_content = original_content
                                        
                                        # Pattern: try: ... (without except or finally)
                                        # Find all try blocks
                                        try_pattern = r'try\s*:'
                                        try_matches = list(re.finditer(try_pattern, fixed_content))
                                        
                                        for try_match in reversed(try_matches):  # Process from end to start
                                            try_start = try_match.end()
                                            # Find the end of the try block (next except, finally, or function/class definition)
                                            remaining = fixed_content[try_start:]
                                            
                                            # Check if there's an except or finally after this try
                                            has_except = re.search(r'^\s*except', remaining, re.MULTILINE)
                                            has_finally = re.search(r'^\s*finally', remaining, re.MULTILINE)
                                            
                                            if not has_except and not has_finally:
                                                # Find the indentation level of the try block
                                                try_line_start = fixed_content.rfind('\n', 0, try_match.start()) + 1
                                                try_line = fixed_content[try_line_start:try_match.end()]
                                                indent_match = re.match(r'^(\s*)', try_line)
                                                indent = indent_match.group(1) if indent_match else ''
                                                
                                                # Find where the try block ends (next line at same or less indentation, or end of function)
                                                lines = remaining.split('\n')
                                                try_block_end = 0
                                                for i, line in enumerate(lines[1:], 1):  # Skip first line (already part of try)
                                                    stripped = line.lstrip()
                                                    if not stripped or stripped.startswith('#'):
                                                        continue
                                                    line_indent = len(line) - len(line.lstrip())
                                                    try_indent = len(indent)
                                                    # If line has same or less indentation and is not empty, try block ends
                                                    if line_indent <= try_indent and stripped:
                                                        try_block_end = i
                                                        break
                                                
                                                if try_block_end == 0:
                                                    # Try block goes to end of function or file
                                                    # Find next def, class, or end of file
                                                    next_def = re.search(r'\n\s*(def |class |@)', remaining)
                                                    if next_def:
                                                        try_block_end = remaining[:next_def.start()].count('\n')
                                                    else:
                                                        try_block_end = len(lines) - 1
                                                
                                                # Insert except block
                                                insert_pos = try_start + sum(len(lines[i]) + 1 for i in range(try_block_end))
                                                except_block = f"\n{indent}except Exception as e:\n{indent}    # Handle error\n{indent}    pass"
                                                fixed_content = fixed_content[:insert_pos] + except_block + fixed_content[insert_pos:]
                                                logger.info("Added except block to try statement")
                                        
                                        fix_code = fixed_content
                                    # Add function definition for undefined variables
                                    elif f"def {var_name}" not in original_content:
                                        # Find where to insert (after imports, before first function)
                                        insert_pos = original_content.find("\n\n")
                                        if insert_pos > 0:
                                            fix_code = (
                                                original_content[:insert_pos+2] +
                                                f"def {var_name}(*args, **kwargs):\n    # Add your logic here\n    pass\n\n" +
                                                original_content[insert_pos+2:]
                                            )
                                            logger.info(f"Generated fix for undefined function {var_name}")
                                    else:
                                        fix_code = original_content
                    except Exception as e:
                        logger.error(f"Error generating fix: {e}")
                        fix_code = result.get("fix_code", "")
                
                # Validate fix_code is actual code
                is_valid_code = (
                    len(fix_code) > 50 and
                    not fix_code.strip().lower().startswith("ensure") and
                    not fix_code.strip().lower().startswith("you need") and
                    not fix_code.strip().lower().startswith("please") and
                    ("function" in fix_code or "const" in fix_code or "import" in fix_code or 
                     "def " in fix_code or "class " in fix_code or "export" in fix_code or
                     "return" in fix_code or "{" in fix_code or "(" in fix_code)
                )
                
                if is_valid_code:
                    # Apply the fix
                    fix_applied = apply_fix_to_file(actual_file_path, fix_code)
                    
                    if fix_applied:
                        logger.info(f"Fix applied to {actual_file_path}")
                        # Rebuild Docker containers
                        from app.services.code_generator import GENERATED_APPS_DIR
                        base_dir = Path(GENERATED_APPS_DIR)
                        pattern = f"project_{request.project_id}_*"
                        matching_dirs = list(base_dir.glob(pattern))
                        
                        if matching_dirs:
                            project_dir = matching_dirs[0]
                            docker_rebuilt, error_msg = rebuild_docker_containers(project_dir)
                            
                            if docker_rebuilt:
                                # Get application URL from project
                                project = db.query(models.Project).filter(
                                    models.Project.id == request.project_id,
                                    models.Project.user_id == current_user.id
                                ).first()
                                
                                if project and project.application_url:
                                    application_url = project.application_url
                            else:
                                logger.warning(f"Docker rebuild failed: {error_msg}")
                    else:
                        logger.warning(f"Failed to apply fix to {actual_file_path}")
                else:
                    logger.warning(f"Fix code is not valid code. Content preview: {fix_code[:200]}")
                    # Update fix_code in result to show what was attempted
                    result["fix_code"] = f"// Could not auto-generate fix. Original response: {fix_code[:200]}"
            else:
                logger.warning(f"Could not find file to fix. File path from result: {result.get('file_path')}")
        
        return DebugResponse(
            issue_identified=result.get("issue_identified", "Unknown issue"),
            root_cause=result.get("root_cause", "Could not determine root cause"),
            fix_code=result.get("fix_code", ""),
            file_path=result.get("file_path", request.file_path or "unknown"),
            explanation=result.get("explanation", "No explanation provided"),
            confidence=result.get("confidence", 0.5),
            needs_confirmation=False,  # Auto-apply if confidence is high
            fix_applied=fix_applied,
            docker_rebuilt=docker_rebuilt,
            application_url=application_url
        )
    except Exception as e:
        logger.error(f"Error in debug-fix endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze error: {str(e)}"
        )

@router.post("/generate-form-api", response_model=FormAPIResponse)
async def generate_form_api_endpoint(
    request: FormAPIRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate backend API for a form component.
    
    Steps:
    1. Check project backend framework and database configuration
    2. Verify backend structure exists
    3. Read all backend files
    4. Extract form fields from component
    5. Generate database model
    6. Generate API routes
    7. Create database table if needed
    8. Generate test cases
    9. Integrate with frontend form
    10. Return detailed summary
    """
    try:
        # Get project
        project = db.query(models.Project).filter(
            models.Project.id == request.project_id,
            models.Project.user_id == current_user.id
        ).first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Generate API
        result = generate_form_api(
            request.component_id,
            request.component_data,
            request.project_id,
            project,
            db
        )
        
        return FormAPIResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating form API: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate form API: {str(e)}"
        )

