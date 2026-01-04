from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.auth import get_current_user
from app import models
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

class AIResponse(BaseModel):
    changes: dict
    message: str
    explanation: Optional[str] = None
    guess: Optional[str] = None  # Suggested interpretation of the user's request
    needs_clarification: bool = False  # Whether the system needs user confirmation

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

def call_ollama(prompt: str, system_prompt: str = None, model: str = "llama2") -> Optional[str]:
    """
    Call Ollama LLM API running locally.
    Default model can be changed via OLLAMA_MODEL environment variable.
    """
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    ollama_model = os.getenv("OLLAMA_MODEL", model)
    
    try:
        payload = {
            "model": ollama_model,
            "prompt": prompt,
            "stream": False
        }
        
        if system_prompt:
            payload["system"] = system_prompt
        
        response = requests.post(
            f"{ollama_url}/api/generate",
            json=payload,
            timeout=30
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

def call_llm(prompt: str, component_type: Optional[str] = None, current_styles: Optional[dict] = None, current_props: Optional[dict] = None) -> dict:
    """
    Call LLM to process the user's prompt and return component changes (CSS styles, HTML attributes, content, etc.).
    Supports Ollama (local), OpenAI, Anthropic, or pattern-based fallback.
    """
    # Check if Ollama is enabled
    use_ollama = os.getenv("USE_OLLAMA", "false").lower() == "true"
    
    if use_ollama:
        system_prompt = """You are an expert web developer. Convert user requests into component modifications.
You can modify:
1. CSS styles: {"style": {"backgroundColor": "#ff0000", "padding": "20px"}}
2. Component type: {"type": "button"}
3. Content/text: {"props": {"children": "New Text"}}
4. HTML attributes: {"props": {"href": "https://example.com", "className": "my-class"}}
5. Any combination of the above

Return changes in JSON format with keys: "style" (for CSS), "type" (for element type), "props" (for attributes/content).
Example: {"style": {"color": "blue"}, "props": {"children": "Hello"}}
If you cannot understand the request, return an empty JSON object {}."""
        
        user_prompt = f"Component type: {component_type or 'div'}. "
        if current_styles:
            user_prompt += f"Current styles: {json.dumps(current_styles)}. "
        if current_props:
            user_prompt += f"Current props: {json.dumps(current_props)}. "
        user_prompt += f"User request: {prompt}\n\n"
        user_prompt += "IMPORTANT: Do NOT add 'children' property unless the user explicitly requests to change text content. Do NOT add default text like 'New Text'."
        
        llm_response = call_ollama(user_prompt, system_prompt)
        
        if llm_response:
            parsed_changes = parse_llm_response_extended(llm_response)
            if parsed_changes:
                return parsed_changes
    
    # Fallback to pattern-based matching
    return process_prompt_with_llm_logic_extended(prompt, component_type, current_styles, current_props)

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
    
    # Process HTML component changes first (type, content, attributes)
    component_changes = process_html_component_changes(prompt, component_type, current_props)
    if component_changes:
        changes.update(component_changes)
    
    # Then process CSS style changes
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
        # Call LLM (or enhanced pattern matching)
        changes = call_llm(
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
        if changes.get('type'):
            has_changes = True
        if changes.get('props') and len(changes.get('props', {})) > 0:
            has_changes = True
        if changes.get('wrap_in'):
            has_changes = True
        if changes.get('create_modal'):
            has_changes = True
        
        if not has_changes:
            # Generate an intelligent guess about what the user wants
            guess = generate_intelligent_guess(request.prompt, request.component_type)
            
            if guess:
                return AIResponse(
                    changes={},
                    message=f"Did you mean: \"{guess}\"?",
                    explanation="I'm not sure I understood your request correctly. Please confirm if this is what you want.",
                    guess=guess,
                    needs_clarification=True
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
                    needs_clarification=False
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
            explanation=f"Successfully processed your request and applied changes."
        )
        
    except Exception as e:
        logger.error(f"Error processing AI prompt: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing AI prompt: {str(e)}"
        )

