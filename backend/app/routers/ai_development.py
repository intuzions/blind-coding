from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.auth import get_current_user
from app import models
from app.services.prebuilt_components import find_matching_prebuilt_component
from app.services.mcp_server import call_mcp_models
import os
import json
import re
import logging
import requests

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai-dev", tags=["ai-development"])

class CodeGenerationRequest(BaseModel):
    description: str
    component_type: Optional[str] = None
    language: Optional[str] = "javascript"  # javascript, typescript, python, etc.
    context: Optional[Dict[str, Any]] = None
    frontend_framework: Optional[str] = None  # react, vue, angular
    backend_framework: Optional[str] = None  # fastapi, express, django

class ComponentGenerationRequest(BaseModel):
    description: str
    component_type: Optional[str] = None
    style_preferences: Optional[Dict[str, Any]] = None
    existing_components: Optional[List[Dict[str, Any]]] = None
    frontend_framework: Optional[str] = None  # react, vue, angular
    backend_framework: Optional[str] = None  # fastapi, express, django

class CodeExplanationRequest(BaseModel):
    code: str
    language: Optional[str] = "javascript"

class BugFixRequest(BaseModel):
    code: str
    error_message: Optional[str] = None
    language: Optional[str] = "javascript"

class PageGenerationRequest(BaseModel):
    description: str
    page_type: Optional[str] = None  # landing, dashboard, form, etc.
    style_preferences: Optional[Dict[str, Any]] = None
    frontend_framework: Optional[str] = None  # react, vue, angular
    backend_framework: Optional[str] = None  # fastapi, express, django

class ApplicationGenerationRequest(BaseModel):
    description: str
    css_framework: Optional[str] = None  # tailwind, bootstrap, none
    frontend_framework: Optional[str] = None  # react, vue, angular
    backend_framework: Optional[str] = None  # fastapi, express, django

class AIResponse(BaseModel):
    result: Any
    explanation: Optional[str] = None
    suggestions: Optional[List[str]] = None
    code: Optional[str] = None

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

def call_ollama(prompt: str, system_prompt: str = None, model: str = "deepseek-coder", timeout: int = None) -> Optional[str]:
    """
    Call Ollama LLM API running locally.
    Default model is DeepSeek Coder for better code generation accuracy.
    Can be changed via OLLAMA_MODEL environment variable.
    
    If MCP_ENABLED is true, this will use the MCP server to query multiple models
    and return the consensus result for more accurate responses.
    
    Recommended models for code generation (best to worst):
    1. deepseek-coder:6.7b - Best accuracy for code generation (RECOMMENDED)
    2. qwen2.5-coder:7b - Excellent code understanding and generation
    3. codellama:13b - Good balance of quality and speed
    4. mistral:7b - Fast and efficient
    5. llama3:8b - General purpose, good for code
    
    Args:
        prompt: The user prompt
        system_prompt: Optional system prompt
        model: Model name (default: deepseek-coder)
        timeout: Request timeout in seconds (default: from env or 300 for large requests)
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
    
    # Use provided timeout, or from env, or default based on request size
    if timeout is None:
        timeout = get_ollama_timeout()  # Default 5 minutes for large requests (300s)
    
    # Estimate request size and adjust timeout if needed
    estimated_size = len(prompt) + (len(system_prompt) if system_prompt else 0)
    if estimated_size > 10000:  # Large request
        timeout = max(timeout, 600)  # At least 10 minutes for very large requests
    
    max_retries = 2
    retry_delay = 5  # seconds
    
    for attempt in range(max_retries + 1):
        try:
            payload = {
                "model": ollama_model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,  # Lower temperature for more accurate, deterministic responses
                    "top_p": 0.9,  # Nucleus sampling for better quality
                    "top_k": 40,  # Limit vocabulary for more focused responses
                    "repeat_penalty": 1.1  # Reduce repetition
                }
            }
            
            if system_prompt:
                payload["system"] = system_prompt
            
            logger.info(f"Calling Ollama API (attempt {attempt + 1}/{max_retries + 1}, timeout: {timeout}s, prompt size: {len(prompt)} chars)")
            
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
                
        except requests.exceptions.Timeout as e:
            if attempt < max_retries:
                logger.warning(f"Ollama API timeout (attempt {attempt + 1}/{max_retries + 1}). Retrying in {retry_delay}s...")
                import time
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                timeout = int(timeout * 1.5)  # Increase timeout for retry
                continue
            else:
                logger.error(f"Ollama API timeout after {max_retries + 1} attempts. Request took longer than {timeout}s. "
                           f"Consider increasing OLLAMA_TIMEOUT environment variable or using a faster model.")
                return None
        except requests.exceptions.ConnectionError:
            if attempt < max_retries:
                logger.warning(f"Connection error (attempt {attempt + 1}/{max_retries + 1}). Retrying in {retry_delay}s...")
                import time
                time.sleep(retry_delay)
                retry_delay *= 2
                continue
            else:
                logger.error(
                    f"Could not connect to Ollama at {ollama_url} after {max_retries + 1} attempts. "
                    f"Make sure Ollama is running: ollama serve"
                )
                return None
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                logger.warning(f"Request error (attempt {attempt + 1}/{max_retries + 1}): {e}. Retrying in {retry_delay}s...")
                import time
                time.sleep(retry_delay)
                retry_delay *= 2
                continue
            else:
                logger.error(f"Error calling Ollama API after {max_retries + 1} attempts: {e}")
                return None
        except Exception as e:
            logger.error(f"Unexpected error calling Ollama: {e}")
            return None
    
    return None

def call_llm_api(prompt: str, system_prompt: str = None, model: str = "deepseek-coder") -> Optional[str]:
    """
    Call LLM API (Ollama with DeepSeek Coder, OpenAI, Anthropic, etc.)
    This function can be configured to use any LLM provider.
    Priority: Ollama with DeepSeek Coder (if enabled) > OpenAI > Anthropic
    Default: DeepSeek Coder via Ollama for better code generation accuracy
    """
    # Check if Ollama is enabled (default to true for local development)
    from app.services.settings_loader import get_use_ollama, get_ollama_model
    use_ollama = get_use_ollama()
    
    if use_ollama:
        # Use CodeLlama by default for code-related tasks
        ollama_model = get_ollama_model() or model
        ollama_response = call_ollama(prompt, system_prompt, ollama_model)
        if ollama_response:
            return ollama_response
    
    # Check if OpenAI API key is available
    from app.services.settings_loader import get_openai_api_key, get_anthropic_api_key
    openai_api_key = get_openai_api_key()
    anthropic_api_key = get_anthropic_api_key()
    
    if openai_api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_api_key)
            
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=2000
            )
            return response.choices[0].message.content
        except ImportError:
            logger.warning("OpenAI library not installed. Install with: pip install openai")
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
    
    if anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_api_key)
            
            # Anthropic API uses system parameter separately, not in messages
            messages = [{"role": "user", "content": prompt}]
            
            response = client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=2000,
                system=system_prompt if system_prompt else "",
                messages=messages
            )
            return response.content[0].text
        except ImportError:
            logger.warning("Anthropic library not installed. Install with: pip install anthropic")
        except Exception as e:
            logger.error(f"Error calling Anthropic API: {e}")
    
    # Fallback: Return a message indicating LLM is not configured
    return None

def generate_code_with_llm(description: str, component_type: Optional[str] = None, 
                           language: str = "javascript", context: Optional[Dict] = None,
                           frontend_framework: Optional[str] = None,
                           backend_framework: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate code using CodeLlama LLM based on description and project frameworks.
    """
    # Determine language based on framework
    if frontend_framework == 'react':
        actual_language = 'javascript' if language == 'javascript' else 'typescript'
        framework_note = "Use React with JSX/TSX syntax. Use functional components with hooks."
    elif frontend_framework == 'vue':
        actual_language = 'javascript'
        framework_note = "Use Vue 3 with Composition API. Use <script setup> syntax."
    elif frontend_framework == 'angular':
        actual_language = 'typescript'
        framework_note = "Use Angular with TypeScript. Use component decorators and class-based components."
    else:
        actual_language = language
        framework_note = ""
    
    backend_note = ""
    if backend_framework == 'fastapi':
        backend_note = "For backend code, use FastAPI with Python. Use async/await patterns."
    elif backend_framework == 'express':
        backend_note = "For backend code, use Express.js with Node.js. Use async/await or promises."
    elif backend_framework == 'django':
        backend_note = "For backend code, use Django with Python. Follow Django best practices."
    
    system_prompt = f"""You are an expert {actual_language} developer with deep understanding of modern programming practices. Your task is to generate clean, production-ready code based on user descriptions.

CRITICAL REQUIREMENTS:
1. Generate ONLY valid, executable {actual_language} code
2. Include all necessary imports and exports
3. Write complete, working code - not snippets or placeholders
4. Follow best practices and conventions for the specified framework
5. Make the code production-ready with proper error handling when appropriate
6. DO NOT include explanations, comments about what you're doing, or meta-commentary
7. Return ONLY the code itself

{f"FRAMEWORK REQUIREMENTS:" if frontend_framework or backend_framework else ""}
{f"Frontend: {frontend_framework.upper()}. {framework_note}" if frontend_framework else ""}
{f"Backend: {backend_framework.upper()}. {backend_note}" if backend_framework else ""}

OUTPUT FORMAT:
- Return ONLY the code
- No markdown code blocks unless the user specifically asks for them
- No explanations before or after the code
- Complete, runnable code"""

    prompt = f"""User Request: {description}

TASK: Generate {actual_language} code that fulfills this request exactly.

IMPORTANT:
- Generate complete, working code
- Include all necessary imports
- Use proper syntax for {actual_language}
- Make it production-ready
- Return ONLY the code - no explanations, no markdown blocks

"""
    if component_type:
        prompt += f"Component Type: {component_type}\n"
    if frontend_framework:
        prompt += f"Frontend Framework: {frontend_framework}\n"
    if backend_framework:
        prompt += f"Backend Framework: {backend_framework}\n"
    if context:
        prompt += f"Additional Context: {json.dumps(context, indent=2)}\n"
    prompt += "\nGenerate the complete code now. Return ONLY the code, nothing else."

    llm_response = call_llm_api(prompt, system_prompt)
    
    if llm_response:
        return {
            "code": llm_response,
            "explanation": f"Generated {language} code based on your description.",
            "suggestions": [
                "Review the generated code before using it",
                "Test the code in your development environment",
                "Customize as needed for your specific use case"
            ]
        }
    else:
        # Fallback to pattern-based generation
        return generate_code_fallback(description, component_type, language)

def generate_code_fallback(description: str, component_type: Optional[str] = None, 
                          language: str = "javascript") -> Dict[str, Any]:
    """
    Fallback code generation using pattern matching and templates.
    """
    lower_desc = description.lower()
    code = ""
    
    if "button" in lower_desc or component_type == "button":
        if language in ["javascript", "typescript"]:
            code = """import React from 'react';

const Button = ({ onClick, children, style = {} }) => {
  return (
    <button 
      onClick={onClick}
      style={{
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        ...style
      }}
    >
      {children}
    </button>
  );
};

export default Button;"""
    elif "input" in lower_desc or component_type == "input":
        if language in ["javascript", "typescript"]:
            code = """import React, { useState } from 'react';

const Input = ({ placeholder, type = 'text', onChange, style = {} }) => {
  const [value, setValue] = useState('');
  
  const handleChange = (e) => {
    setValue(e.target.value);
    if (onChange) onChange(e);
  };
  
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      style={{
        padding: '10px',
        borderRadius: '4px',
        border: '1px solid #ddd',
        ...style
      }}
    />
  );
};

export default Input;"""
    elif "card" in lower_desc or component_type == "card":
        if language in ["javascript", "typescript"]:
            code = """import React from 'react';

const Card = ({ children, style = {} }) => {
  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        backgroundColor: '#fff',
        ...style
      }}
    >
      {children}
    </div>
  );
};

export default Card;"""
    else:
        code = f"// Generated code for: {description}\n// Customize this code based on your needs"
    
    return {
        "code": code,
        "explanation": f"Generated {language} code template based on your description.",
        "suggestions": [
            "Customize the code to match your exact requirements",
            "Add proper error handling and validation",
            "Test thoroughly before deploying"
        ]
    }

def generate_component_with_llm(description: str, component_type: Optional[str] = None,
                                style_preferences: Optional[Dict] = None,
                                existing_components: Optional[List] = None,
                                frontend_framework: Optional[str] = None,
                                backend_framework: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate component structure using CodeLlama LLM, respecting the project's frontend framework.
    First checks if a prebuilt component matches the request, otherwise uses AI.
    """
    # First, check if a prebuilt component matches the request
    prebuilt_match = find_matching_prebuilt_component(description, component_type)
    if prebuilt_match:
        framework_name = frontend_framework.upper() if frontend_framework else "React"
        return {
            "result": prebuilt_match,
            "explanation": f"Using prebuilt component matching your request.",
            "suggestions": [
                "Component added from prebuilt library",
                "You can customize it in the properties panel",
                "All prebuilt components are optimized and tested"
            ],
            "source": "prebuilt"
        }
    framework_name = frontend_framework.upper() if frontend_framework else "React"
    framework_notes = ""
    if frontend_framework == 'vue':
        framework_notes = "Note: Generate components that can be mapped to Vue.js. Use standard HTML elements that work with Vue."
    elif frontend_framework == 'angular':
        framework_notes = "Note: Generate components that can be mapped to Angular. Use standard HTML elements that work with Angular."
    else:
        framework_notes = "Note: Generate components that can be mapped to React. Use standard HTML elements that work with React."
    
    system_prompt = f"""You are an expert {framework_name} developer specialized in generating component structures in JSON format. You have deep understanding of React, Vue, Angular, and modern web development practices.

YOUR TASK: Generate a valid JSON component structure based on user descriptions.

OUTPUT FORMAT - JSON object with:
- type: component type (div, button, input, form, h1, h2, p, img, nav, header, footer, etc.)
- props: object containing:
  - style: object with CSS properties (camelCase: padding, backgroundColor, etc.)
  - other HTML attributes (id, className, placeholder, etc.)
  - children: array of child components OR string for text content

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. ALWAYS generate actual component structure - NEVER return the user's description as text
2. NEVER echo back the request - CREATE the component
3. Return ONLY valid JSON - no explanations, no markdown, no code blocks
4. Component MUST have "type" and "props" fields
5. For forms: use type "form" with all fields as children array
6. Include proper input types: "text", "email", "password", "number", etc.
7. Add labels for all form inputs (accessibility)
8. Use modern, clean styling with proper spacing and colors
9. For signup/registration: include name, email, password, confirm password fields
10. Follow {framework_name} best practices
11. {framework_notes}

VALID JSON EXAMPLE:
{{
  "type": "div",
  "props": {{
    "style": {{
      "padding": "20px",
      "backgroundColor": "#ffffff",
      "borderRadius": "8px"
    }},
    "children": [
      {{
        "type": "h2",
        "props": {{
          "style": {{"margin": "0 0 10px 0", "color": "#333"}},
          "children": "Title"
        }}
      }}
    ]
  }}
}}

INVALID - DO NOT DO THIS:
- Returning text like "Create a button component"
- Explaining what you'll create
- Using markdown code blocks
- Missing "type" or "props" fields"""

    prompt = f"""USER REQUEST: {description}

TASK: Generate a {framework_name} component structure in JSON format that matches this request exactly.

SPECIFIC REQUIREMENTS:
1. Create the ACTUAL component structure - DO NOT describe what you'll create
2. Return ONLY valid JSON - no explanations, no markdown code blocks, no text before/after
3. Include proper styling with modern CSS properties
4. Make it complete and functional
5. Use appropriate HTML element types (div, button, input, form, h1, h2, p, etc.)
6. For interactive elements, include proper attributes (type, placeholder, etc.)

EXAMPLES OF CORRECT OUTPUT:

For "create a button":
{{
  "type": "button",
  "props": {{
    "style": {{
      "padding": "12px 24px",
      "backgroundColor": "#667eea",
      "color": "white",
      "border": "none",
      "borderRadius": "8px",
      "cursor": "pointer"
    }},
    "children": "Click Me"
  }}
}}

For "create a card":
{{
  "type": "div",
  "props": {{
    "style": {{
      "padding": "24px",
      "borderRadius": "12px",
      "boxShadow": "0 2px 8px rgba(0,0,0,0.1)",
      "backgroundColor": "#ffffff"
    }},
    "children": [
      {{
        "type": "h3",
        "props": {{
          "style": {{"margin": "0 0 12px 0", "fontSize": "1.5rem", "fontWeight": "600"}},
          "children": "Card Title"
        }}
      }},
      {{
        "type": "p",
        "props": {{
          "style": {{"margin": "0", "color": "#666"}},
          "children": "Card content"
        }}
      }}
    ]
  }}
}}

NOW GENERATE THE COMPONENT FOR: {description}

"""
    if component_type:
        prompt += f"Component type: {component_type}\n"
    if frontend_framework:
        prompt += f"Frontend Framework: {frontend_framework}\n"
    if backend_framework:
        prompt += f"Backend Framework: {backend_framework}\n"
    if style_preferences:
        prompt += f"Style preferences: {json.dumps(style_preferences, indent=2)}\n"
    if existing_components:
        prompt += f"Existing components context: {json.dumps(existing_components, indent=2)}\n"
    prompt += "\nReturn ONLY the JSON component structure. No explanations, no text, just JSON."

    llm_response = call_llm_api(prompt, system_prompt)
    
    if llm_response:
        try:
            # Check if response is just the description (common LLM mistake)
            cleaned_description = description.strip().lower()
            cleaned_response_lower = llm_response.strip().lower()
            
            # If response is too similar to description, it's likely just echoing
            if cleaned_description in cleaned_response_lower and len(cleaned_response_lower) < len(cleaned_description) * 2:
                logger.warning(f"LLM response appears to be just the description. Using fallback.")
                return generate_component_fallback(description, component_type, style_preferences, frontend_framework)
            
            # Clean the response - remove markdown code blocks if present
            cleaned_response = llm_response.strip()
            
            # Remove markdown code blocks (more aggressive cleaning)
            cleaned_response = re.sub(r'^```(?:json|javascript|js)?\s*\n?', '', cleaned_response, flags=re.MULTILINE)
            cleaned_response = re.sub(r'\n?\s*```\s*$', '', cleaned_response, flags=re.MULTILINE)
            cleaned_response = cleaned_response.strip()
            
            # Remove any leading/trailing text that's not JSON
            # Try to find JSON object boundaries
            json_start = cleaned_response.find('{')
            json_end = cleaned_response.rfind('}')
            
            if json_start != -1 and json_end != -1 and json_end > json_start:
                cleaned_response = cleaned_response[json_start:json_end + 1]
            
            # Try to extract JSON from response - look for complete JSON objects
            # First try to parse the entire cleaned response
            try:
                component_structure = json.loads(cleaned_response)
                # Validate it's actually a component structure, not just text
                if isinstance(component_structure, dict) and 'type' in component_structure:
                    # Additional validation: ensure it's not just the description
                    if 'props' in component_structure:
                        # Check if props.children is just the description
                        props = component_structure.get('props', {})
                        children = props.get('children', '')
                        if isinstance(children, str) and children.lower().strip() == cleaned_description:
                            logger.warning(f"Component children is just the description. Using fallback.")
                            return generate_component_fallback(description, component_type, style_preferences, frontend_framework)
                        
                        # Validate structure is complete
                        if component_structure.get('type') and isinstance(component_structure.get('props'), dict):
                            return {
                                "result": component_structure,
                                "explanation": f"Generated {framework_name} component structure using AI.",
                                "suggestions": [
                                    "Review the generated structure",
                                    "Adjust styles and properties as needed",
                                    "Test the component in your editor"
                                ]
                            }
            except json.JSONDecodeError:
                pass
            
            # If direct parse fails, try to extract JSON object using regex
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned_response, re.DOTALL)
            if json_match:
                try:
                    component_structure = json.loads(json_match.group())
                    # Validate it's actually a component structure
                    if isinstance(component_structure, dict) and 'type' in component_structure and 'props' in component_structure:
                        # Check if it's not just the description
                        props = component_structure.get('props', {})
                        children = props.get('children', '')
                        if isinstance(children, str) and children.lower().strip() == cleaned_description:
                            logger.warning(f"Component children is just the description. Using fallback.")
                            return generate_component_fallback(description, component_type, style_preferences, frontend_framework)
                        
                        # Validate structure is complete
                        if isinstance(component_structure.get('props'), dict):
                            return {
                                "result": component_structure,
                                "explanation": f"Generated {framework_name} component structure using AI.",
                                "suggestions": [
                                    "Review the generated structure",
                                    "Adjust styles and properties as needed",
                                    "Test the component in your editor"
                                ]
                            }
                except json.JSONDecodeError:
                    pass
        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            logger.warning(f"Failed to parse LLM response as JSON: {e}")
            logger.debug(f"LLM response was: {llm_response[:500]}")
            pass
    
    # Fallback - always use fallback if LLM didn't return valid component
    logger.info(f"Using fallback component generation for: {description}")
    return generate_component_fallback(description, component_type, style_preferences, frontend_framework)

def generate_component_fallback(description: str, component_type: Optional[str] = None,
                                style_preferences: Optional[Dict] = None,
                                frontend_framework: Optional[str] = None) -> Dict[str, Any]:
    """
    Fallback component generation.
    First checks prebuilt components, then uses pattern-based generation.
    """
    # Check prebuilt components first
    prebuilt_match = find_matching_prebuilt_component(description, component_type)
    if prebuilt_match:
        framework_name = frontend_framework.upper() if frontend_framework else "React"
        return {
            "result": prebuilt_match,
            "explanation": f"Using prebuilt component matching your request.",
            "suggestions": [
                "Component added from prebuilt library",
                "You can customize it in the properties panel",
                "All prebuilt components are optimized and tested"
            ],
            "source": "prebuilt"
        }
    
    lower_desc = description.lower()
    
    # First, check component_type if explicitly provided (highest priority)
    if component_type:
        component_type_lower = component_type.lower()
        if component_type_lower == "button":
            component = {
                "type": "button",
                "props": {
                    "style": {
                        "padding": "12px 24px",
                        "borderRadius": "8px",
                        "backgroundColor": "#667eea",
                        "color": "white",
                        "border": "none",
                        "cursor": "pointer",
                        "fontSize": "1rem",
                        "fontWeight": "600"
                    },
                    "children": "Click Me"
                }
            }
        elif component_type_lower == "input":
            component = {
                "type": "input",
                "props": {
                    "type": "text",
                    "placeholder": "Enter text...",
                    "style": {
                        "padding": "10px",
                        "borderRadius": "4px",
                        "border": "1px solid #ddd",
                        "width": "100%",
                        "fontSize": "1rem"
                    }
                }
            }
        elif component_type_lower == "card":
            component = {
                "type": "div",
                "props": {
                    "style": {
                        "padding": "24px",
                        "borderRadius": "12px",
                        "boxShadow": "0 2px 8px rgba(0,0,0,0.1)",
                        "backgroundColor": "#ffffff",
                        "maxWidth": "400px",
                        "width": "100%"
                    },
                    "children": [
                        {
                            "type": "h3",
                            "props": {
                                "style": {
                                    "margin": "0 0 12px 0",
                                    "fontSize": "1.5rem",
                                    "fontWeight": "600",
                                    "color": "#333"
                                },
                                "children": "Card Title"
                            }
                        },
                        {
                            "type": "p",
                            "props": {
                                "style": {
                                    "margin": "0",
                                    "color": "#666",
                                    "lineHeight": "1.6"
                                },
                                "children": "Card content goes here"
                            }
                        }
                    ]
                }
            }
        else:
            # For other component types, fall through to description matching
            component = None
    else:
        component = None
    
    # If component_type didn't match, try description matching
    if component is None:
        # Signup/Registration Form - use more specific matching to avoid false positives
        # Only match if it's clearly about signup/registration, not just "register" as a verb
        signup_keywords = ["signup", "sign up", "sign-up", "registration form", "registration page"]
        is_signup = any(keyword in lower_desc for keyword in signup_keywords) or \
                   (("registration" in lower_desc or "register" in lower_desc) and 
                    ("form" in lower_desc or "page" in lower_desc or "component" in lower_desc))
        
        if is_signup:
            component = {
                "type": "form",
            "props": {
                "style": {
                    "display": "flex",
                    "flexDirection": "column",
                    "gap": "1.5rem",
                    "padding": "2rem",
                    "border": "1px solid #e0e0e0",
                    "borderRadius": "12px",
                    "backgroundColor": "#ffffff",
                    "maxWidth": "500px",
                    "width": "100%",
                    "boxSizing": "border-box"
                },
                "action": "#",
                "method": "post"
            },
            "children": [
                {
                    "type": "h2",
                    "props": {
                        "style": {
                            "margin": "0 0 1rem 0",
                            "fontSize": "1.75rem",
                            "fontWeight": "700",
                            "color": "#333",
                            "textAlign": "center"
                        },
                        "children": "Sign Up"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {
                            "display": "flex",
                            "flexDirection": "column",
                            "gap": "0.5rem"
                        },
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {
                                        "fontSize": "0.9rem",
                                        "fontWeight": "600",
                                        "color": "#555"
                                    },
                                    "children": "Full Name",
                                    "htmlFor": "fullname"
                                }
                            },
                            {
                                "type": "input",
                                "props": {
                                    "type": "text",
                                    "id": "fullname",
                                    "name": "fullname",
                                    "placeholder": "Enter your full name",
                                    "required": True,
                                    "style": {
                                        "padding": "0.75rem",
                                        "border": "1px solid #ddd",
                                        "borderRadius": "6px",
                                        "fontSize": "1rem",
                                        "width": "100%",
                                        "boxSizing": "border-box"
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {
                            "display": "flex",
                            "flexDirection": "column",
                            "gap": "0.5rem"
                        },
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {
                                        "fontSize": "0.9rem",
                                        "fontWeight": "600",
                                        "color": "#555"
                                    },
                                    "children": "Email",
                                    "htmlFor": "email"
                                }
                            },
                            {
                                "type": "input",
                                "props": {
                                    "type": "email",
                                    "id": "email",
                                    "name": "email",
                                    "placeholder": "Enter your email",
                                    "required": True,
                                    "style": {
                                        "padding": "0.75rem",
                                        "border": "1px solid #ddd",
                                        "borderRadius": "6px",
                                        "fontSize": "1rem",
                                        "width": "100%",
                                        "boxSizing": "border-box"
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {
                            "display": "flex",
                            "flexDirection": "column",
                            "gap": "0.5rem"
                        },
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {
                                        "fontSize": "0.9rem",
                                        "fontWeight": "600",
                                        "color": "#555"
                                    },
                                    "children": "Password",
                                    "htmlFor": "password"
                                }
                            },
                            {
                                "type": "input",
                                "props": {
                                    "type": "password",
                                    "id": "password",
                                    "name": "password",
                                    "placeholder": "Enter your password",
                                    "required": True,
                                    "style": {
                                        "padding": "0.75rem",
                                        "border": "1px solid #ddd",
                                        "borderRadius": "6px",
                                        "fontSize": "1rem",
                                        "width": "100%",
                                        "boxSizing": "border-box"
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {
                            "display": "flex",
                            "flexDirection": "column",
                            "gap": "0.5rem"
                        },
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {
                                        "fontSize": "0.9rem",
                                        "fontWeight": "600",
                                        "color": "#555"
                                    },
                                    "children": "Confirm Password",
                                    "htmlFor": "confirmPassword"
                                }
                            },
                            {
                                "type": "input",
                                "props": {
                                    "type": "password",
                                    "id": "confirmPassword",
                                    "name": "confirmPassword",
                                    "placeholder": "Confirm your password",
                                    "required": True,
                                    "style": {
                                        "padding": "0.75rem",
                                        "border": "1px solid #ddd",
                                        "borderRadius": "6px",
                                        "fontSize": "1rem",
                                        "width": "100%",
                                        "boxSizing": "border-box"
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "button",
                    "props": {
                        "type": "submit",
                        "style": {
                            "padding": "0.875rem 1.5rem",
                            "backgroundColor": "#667eea",
                            "color": "white",
                            "border": "none",
                            "borderRadius": "8px",
                            "fontSize": "1rem",
                            "fontWeight": "600",
                            "cursor": "pointer",
                            "marginTop": "0.5rem",
                            "transition": "background-color 0.2s"
                        },
                        "children": "Sign Up"
                    }
                }
            ]
        }
        # Login Form
        elif any(keyword in lower_desc for keyword in ["login", "sign in", "sign-in"]):
            component = {
                "type": "form",
            "props": {
                "style": {
                    "display": "flex",
                    "flexDirection": "column",
                    "gap": "1.5rem",
                    "padding": "2rem",
                    "border": "1px solid #e0e0e0",
                    "borderRadius": "12px",
                    "backgroundColor": "#ffffff",
                    "maxWidth": "400px",
                    "width": "100%",
                    "boxSizing": "border-box"
                },
                "action": "#",
                "method": "post"
            },
            "children": [
                {
                    "type": "h2",
                    "props": {
                        "style": {
                            "margin": "0 0 1rem 0",
                            "fontSize": "1.75rem",
                            "fontWeight": "700",
                            "color": "#333",
                            "textAlign": "center"
                        },
                        "children": "Login"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {
                            "display": "flex",
                            "flexDirection": "column",
                            "gap": "0.5rem"
                        },
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {
                                        "fontSize": "0.9rem",
                                        "fontWeight": "600",
                                        "color": "#555"
                                    },
                                    "children": "Email",
                                    "htmlFor": "email"
                                }
                            },
                            {
                                "type": "input",
                                "props": {
                                    "type": "email",
                                    "id": "email",
                                    "name": "email",
                                    "placeholder": "Enter your email",
                                    "required": True,
                                    "style": {
                                        "padding": "0.75rem",
                                        "border": "1px solid #ddd",
                                        "borderRadius": "6px",
                                        "fontSize": "1rem",
                                        "width": "100%",
                                        "boxSizing": "border-box"
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {
                            "display": "flex",
                            "flexDirection": "column",
                            "gap": "0.5rem"
                        },
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {
                                        "fontSize": "0.9rem",
                                        "fontWeight": "600",
                                        "color": "#555"
                                    },
                                    "children": "Password",
                                    "htmlFor": "password"
                                }
                            },
                            {
                                "type": "input",
                                "props": {
                                    "type": "password",
                                    "id": "password",
                                    "name": "password",
                                    "placeholder": "Enter your password",
                                    "required": True,
                                    "style": {
                                        "padding": "0.75rem",
                                        "border": "1px solid #ddd",
                                        "borderRadius": "6px",
                                        "fontSize": "1rem",
                                        "width": "100%",
                                        "boxSizing": "border-box"
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "button",
                    "props": {
                        "type": "submit",
                        "style": {
                            "padding": "0.875rem 1.5rem",
                            "backgroundColor": "#667eea",
                            "color": "white",
                            "border": "none",
                            "borderRadius": "8px",
                            "fontSize": "1rem",
                            "fontWeight": "600",
                            "cursor": "pointer",
                            "marginTop": "0.5rem"
                        },
                        "children": "Login"
                    }
                }
            ]
        }
        elif "button" in lower_desc:
            component = {
            "type": "button",
            "props": {
                "style": {
                    "padding": "12px 24px",
                    "borderRadius": "8px",
                    "backgroundColor": "#667eea",
                    "color": "white",
                    "border": "none",
                        "cursor": "pointer",
                        "fontSize": "1rem",
                        "fontWeight": "600"
                },
                "children": "Click Me"
            }
        }
        elif "input" in lower_desc:
            component = {
                "type": "input",
                "props": {
                    "type": "text",
                    "placeholder": "Enter text...",
                    "style": {
                        "padding": "10px",
                        "borderRadius": "4px",
                        "border": "1px solid #ddd",
                        "width": "100%",
                        "fontSize": "1rem"
                    }
                }
            }
        elif "card" in lower_desc:
            component = {
                "type": "div",
                "props": {
                    "style": {
                        "padding": "24px",
                        "borderRadius": "12px",
                        "boxShadow": "0 2px 8px rgba(0,0,0,0.1)",
                        "backgroundColor": "#ffffff",
                        "maxWidth": "400px",
                    "width": "100%"
                    },
                    "children": [
                        {
                            "type": "h3",
                            "props": {
                                "style": {
                                    "margin": "0 0 12px 0",
                                    "fontSize": "1.5rem",
                                    "fontWeight": "600",
                                    "color": "#333"
                                },
                                "children": "Card Title"
                            }
                        },
                        {
                            "type": "p",
                            "props": {
                                "style": {
                                    "margin": "0",
                                    "color": "#666",
                                    "lineHeight": "1.6"
                                },
                                "children": "Card content goes here"
                            }
                        }
                    ]
                }
            }
        elif "modal" in lower_desc or "dialog" in lower_desc:
            component = {
                "type": "div",
                "props": {
                    "style": {
                        "position": "fixed",
                        "top": "50%",
                        "left": "50%",
                        "transform": "translate(-50%, -50%)",
                        "padding": "24px",
                        "borderRadius": "12px",
                        "backgroundColor": "#ffffff",
                        "boxShadow": "0 4px 20px rgba(0,0,0,0.2)",
                        "maxWidth": "500px",
                        "width": "90%",
                        "zIndex": "1000"
                    },
                    "children": [
                        {
                            "type": "h3",
                            "props": {
                                "style": {
                                    "margin": "0 0 16px 0",
                                    "fontSize": "1.5rem",
                                    "fontWeight": "600"
                                },
                                "children": "Modal Title"
                            }
                        },
                        {
                            "type": "p",
                            "props": {
                                "style": {
                                    "margin": "0 0 20px 0",
                                    "color": "#666"
                                },
                                "children": "Modal content"
                            }
                        },
                        {
                            "type": "button",
                            "props": {
                                "style": {
                                    "padding": "10px 20px",
                                    "backgroundColor": "#667eea",
                                    "color": "white",
                                    "border": "none",
                                    "borderRadius": "6px",
                                    "cursor": "pointer"
                                },
                                "children": "Close"
                            }
                        }
                    ]
                }
            }
        elif "navbar" in lower_desc or "navigation" in lower_desc or "nav" in lower_desc:
            component = {
                "type": "nav",
                "props": {
                    "style": {
                        "display": "flex",
                        "justifyContent": "space-between",
                        "alignItems": "center",
                        "padding": "1rem 2rem",
                        "backgroundColor": "#667eea",
                        "color": "white"
                    },
                    "children": [
                    {
                        "type": "div",
                        "props": {
                            "style": {
                                "fontSize": "1.5rem",
                                "fontWeight": "700"
                            },
                            "children": "Logo"
                        }
                    },
                    {
                        "type": "div",
                        "props": {
                            "style": {
                                "display": "flex",
                                "gap": "1.5rem"
                            },
                            "children": [
                                {
                                    "type": "a",
                                    "props": {
                                        "href": "#",
                                        "style": {
                                            "color": "white",
                                            "textDecoration": "none"
                                        },
                                        "children": "Home"
                                    }
                                },
                                {
                                    "type": "a",
                                    "props": {
                                        "href": "#",
                                        "style": {
                                            "color": "white",
                                            "textDecoration": "none"
                                        },
                                        "children": "About"
                                    }
                                },
                                {
                                    "type": "a",
                                    "props": {
                                        "href": "#",
                                        "style": {
                                            "color": "white",
                                            "textDecoration": "none"
                                        },
                                        "children": "Contact"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
        elif "header" in lower_desc:
            component = {
                "type": "header",
                "props": {
                    "style": {
                        "padding": "3rem 2rem",
                        "textAlign": "center",
                        "backgroundColor": "#f8f9fa"
                    },
                    "children": [
                    {
                        "type": "h1",
                        "props": {
                            "style": {
                                "fontSize": "2.5rem",
                                "fontWeight": "700",
                                "margin": "0 0 1rem 0",
                                "color": "#333"
                            },
                            "children": "Welcome"
                        }
                    },
                    {
                        "type": "p",
                        "props": {
                            "style": {
                                "fontSize": "1.2rem",
                                "color": "#666",
                                "margin": "0"
                            },
                            "children": "Header subtitle"
                        }
                    }
                ]
            }
        }
        elif "footer" in lower_desc:
            component = {
                "type": "footer",
                "props": {
                "style": {
                    "padding": "2rem",
                    "textAlign": "center",
                    "backgroundColor": "#333",
                    "color": "white"
                },
                "children": "© 2024 All rights reserved"
            }
        }
    else:
        # For generic requests, create a proper component structure instead of just text
        # Extract a meaningful title from description
        title = description.split()[0:3] if len(description.split()) > 2 else ["Component"]
        title_text = " ".join(title).title()
        
        component = {
            "type": "div",
            "props": {
                "style": {
                        "padding": "24px",
                        "borderRadius": "8px",
                        "backgroundColor": "#ffffff",
                        "border": "1px solid #e0e0e0",
                        "boxShadow": "0 2px 4px rgba(0,0,0,0.1)"
                    },
                    "children": [
                        {
                            "type": "h3",
                            "props": {
                                "style": {
                                    "margin": "0 0 12px 0",
                                    "fontSize": "1.5rem",
                                    "fontWeight": "600",
                                    "color": "#333"
                                },
                                "children": title_text
                            }
                        },
                        {
                            "type": "p",
                            "props": {
                                "style": {
                                    "margin": "0",
                                    "color": "#666",
                                    "lineHeight": "1.6"
                                },
                                "children": "Component content"
                            }
                        }
                    ]
            }
        }
    
    if style_preferences:
        if "props" in component and "style" in component["props"]:
            component["props"]["style"].update(style_preferences)
    
    return {
        "result": component,
        "explanation": "Generated component structure based on your description.",
        "suggestions": [
            "Customize the component properties",
            "Add more styling as needed",
            "Test the component functionality"
        ]
    }

def explain_code_with_llm(code: str, language: str = "javascript") -> Dict[str, Any]:
    """
    Explain code using CodeLlama LLM.
    """
    system_prompt = f"""You are CodeLlama, an expert {language} developer. Your task is to explain code clearly and accurately.

EXPLANATION REQUIREMENTS:
1. Explain what the code does (purpose and functionality)
2. Explain how it works (step-by-step logic)
3. Identify important concepts, patterns, or techniques used
4. Point out any potential issues or improvements
5. Be clear, concise, and accurate
6. Use examples when helpful"""

    prompt = f"""Explain this {language} code:

```{language}
{code}
```

Provide a comprehensive explanation covering:
- What the code does
- How it works (step-by-step)
- Important concepts and patterns
- Any notable features or potential issues"""

    llm_response = call_llm_api(prompt, system_prompt)
    
    if llm_response:
        return {
            "result": llm_response,
            "explanation": "Code explanation generated using AI.",
            "suggestions": [
                "Review the explanation",
                "Ask follow-up questions if needed",
                "Use this understanding to improve your code"
            ]
        }
    else:
        return {
            "result": f"This {language} code appears to be a custom implementation. Review it carefully to understand its functionality.",
            "explanation": "Basic code analysis.",
            "suggestions": [
                "Read through the code line by line",
                "Check for comments in the code",
                "Test the code to understand its behavior"
            ]
        }

def fix_bug_with_llm(code: str, error_message: Optional[str] = None, 
                     language: str = "javascript") -> Dict[str, Any]:
    """
    Fix bugs in code using CodeLlama LLM.
    """
    system_prompt = f"""You are CodeLlama, an expert {language} developer and debugger. Your task is to fix bugs in code.

DEBUGGING PROCESS:
1. Carefully analyze the code to identify all bugs
2. Consider the error message (if provided)
3. Identify the root cause of each issue
4. Provide a clean, working solution
5. Explain what was wrong and how you fixed it
6. Ensure the fixed code follows best practices and is production-ready"""

    prompt = f"""Fix the bugs in this {language} code:

```{language}
{code}
```
"""
    if error_message:
        prompt += f"\nError Message: {error_message}\n"
    prompt += "\nTASK:\n1. Identify all bugs in the code\n2. Fix them completely\n3. Return the corrected code\n4. Explain what was wrong and how you fixed it"

    llm_response = call_llm_api(prompt, system_prompt)
    
    if llm_response:
        # Try to extract code block
        code_match = re.search(r'```(?:javascript|typescript|js|ts)?\n(.*?)```', llm_response, re.DOTALL)
        fixed_code = code_match.group(1) if code_match else llm_response
        
        return {
            "result": fixed_code,
            "code": fixed_code,
            "explanation": llm_response,
            "suggestions": [
                "Review the fixed code carefully",
                "Test the fix in your environment",
                "Ensure all edge cases are handled"
            ]
        }
    else:
        return {
            "result": code,
            "code": code,
            "explanation": "Unable to automatically fix. Please review the code manually.",
            "suggestions": [
                "Check for syntax errors",
                "Verify variable names and types",
                "Review error messages carefully"
            ]
        }

def generate_page_with_llm(description: str, page_type: Optional[str] = None,
                           style_preferences: Optional[Dict] = None,
                           frontend_framework: Optional[str] = None,
                           backend_framework: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate a full page structure using CodeLlama LLM, respecting the project's frameworks.
    """
    framework_name = frontend_framework.upper() if frontend_framework else "React"
    system_prompt = f"""You are an expert web developer with deep understanding of modern web development. Generate complete page structures in JSON format.

YOUR TASK: Generate a FULL PAGE structure with multiple sections/components.

OUTPUT FORMAT: Return a JSON ARRAY of components (not a single component).

REQUIRED SECTIONS for a complete page:
1. Header/Navigation - navigation bar with logo and menu items
2. Hero/Main Content Section - main content area with title and description
3. Features/Content Sections - multiple content sections
4. Footer - footer with copyright/links

Each component in the array should have:
- type: HTML element type (header, nav, div, section, footer, etc.)
- props: object with style and other properties
- children: array of child components OR string for text

CRITICAL RULES:
1. Return an ARRAY of components, not a single component
2. Include at least 3-5 major sections (header, hero, content, footer)
3. Each section should have proper styling and content
4. Use semantic HTML elements (header, nav, section, footer, etc.)
5. Create a complete, functional page structure
6. Return ONLY valid JSON array - no explanations, no markdown

EXAMPLE FORMAT:
[
  {{
    "type": "header",
    "props": {{
      "style": {{"padding": "1rem", "backgroundColor": "#333", "color": "white"}},
      "children": [
        {{"type": "h1", "props": {{"style": {{"margin": "0"}}, "children": "Logo"}}}}
      ]
    }}
  }},
  {{
    "type": "section",
    "props": {{
      "style": {{"padding": "3rem", "textAlign": "center"}},
      "children": [
        {{"type": "h2", "props": {{"style": {{"fontSize": "2rem"}}, "children": "Welcome"}}}},
        {{"type": "p", "props": {{"style": {{"margin": "1rem 0"}}, "children": "Page description"}}}}
      ]
    }}
  }},
  {{
    "type": "footer",
    "props": {{
      "style": {{"padding": "2rem", "textAlign": "center", "backgroundColor": "#f5f5f5"}},
      "children": "© 2024 All rights reserved"
    }}
  }}
]"""

    prompt = f"""USER REQUEST: Create a complete React page for: {description}

TASK: Generate a FULL PAGE structure as a JSON ARRAY with multiple sections.

REQUIREMENTS:
- Return a JSON ARRAY (starts with [ and ends with ])
- Include at least: Header, Main Content Section, Footer
- Each section should be a separate component in the array
- Add proper styling for a modern, professional look
- Include actual content, not just empty divs
- Make it a complete, functional page

"""
    if page_type:
        prompt += f"Page Type: {page_type}\n"
    if frontend_framework:
        prompt += f"Frontend Framework: {frontend_framework}\n"
    if backend_framework:
        prompt += f"Backend Framework: {backend_framework}\n"
    if style_preferences:
        prompt += f"Style Preferences: {json.dumps(style_preferences, indent=2)}\n"
    prompt += "\nGenerate the complete page structure now. Return ONLY the JSON array, nothing else."

    llm_response = call_llm_api(prompt, system_prompt)
    
    if llm_response:
        try:
            # Clean the response
            cleaned_response = llm_response.strip()
            
            # Remove markdown code blocks
            cleaned_response = re.sub(r'^```(?:json|javascript|js)?\s*\n?', '', cleaned_response, flags=re.MULTILINE)
            cleaned_response = re.sub(r'\n?\s*```\s*$', '', cleaned_response, flags=re.MULTILINE)
            cleaned_response = cleaned_response.strip()
            
            # Find JSON array boundaries
            array_start = cleaned_response.find('[')
            array_end = cleaned_response.rfind(']')
            
            if array_start != -1 and array_end != -1 and array_end > array_start:
                cleaned_response = cleaned_response[array_start:array_end + 1]
            
            # Try to parse as JSON array
            try:
                page_structure = json.loads(cleaned_response)
                
                # Validate it's an array with components
                if isinstance(page_structure, list) and len(page_structure) > 0:
                    # Validate each component has type and props
                    valid_components = []
                    for comp in page_structure:
                        if isinstance(comp, dict) and 'type' in comp and 'props' in comp:
                            valid_components.append(comp)
                    
                    if valid_components:
                        return {
                            "result": valid_components,
                            "explanation": f"Generated complete page structure with {len(valid_components)} sections using AI.",
                            "suggestions": [
                                "Review the generated page structure",
                                "Customize components as needed",
                                "Add interactivity and functionality"
                            ]
                        }
                elif isinstance(page_structure, dict) and 'type' in page_structure:
                    # If single component returned, wrap it in array
                    return {
                        "result": [page_structure],
                        "explanation": "Generated page component. Consider adding more sections.",
                        "suggestions": [
                            "Add header and footer sections",
                            "Add more content sections",
                            "Customize styling as needed"
                        ]
                    }
            except json.JSONDecodeError:
                # Try regex extraction
                json_match = re.search(r'\[.*?\]', cleaned_response, re.DOTALL)
                if json_match:
                    try:
                        page_structure = json.loads(json_match.group())
                        if isinstance(page_structure, list) and len(page_structure) > 0:
                            return {
                                "result": page_structure,
                                "explanation": "Generated page structure using AI.",
                                "suggestions": [
                                    "Review the generated structure",
                                    "Customize components as needed",
                                    "Add interactivity and functionality"
                                ]
                            }
                    except json.JSONDecodeError:
                        pass
        except json.JSONDecodeError:
            pass
        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            logger.warning(f"Failed to parse page generation response: {e}")
            logger.debug(f"LLM response was: {llm_response[:500]}")
    
    # Fallback - create a proper page structure
    logger.info(f"Using fallback page generation for: {description}")
    return generate_page_fallback(description, page_type, style_preferences, frontend_framework)

def generate_page_fallback(description: str, page_type: Optional[str] = None,
                           style_preferences: Optional[Dict] = None,
                           frontend_framework: Optional[str] = None) -> Dict[str, Any]:
    """
    Fallback page generation - creates a complete page structure.
    """
    lower_desc = description.lower()
    
    # Determine page type from description
    is_landing = any(kw in lower_desc for kw in ["landing", "home", "main"])
    is_dashboard = "dashboard" in lower_desc
    is_about = "about" in lower_desc
    is_contact = "contact" in lower_desc
    
    # Create appropriate page structure based on type
    if is_landing:
        page_structure = [
        {
            "type": "header",
            "props": {
                "style": {
                        "display": "flex",
                        "justifyContent": "space-between",
                        "alignItems": "center",
                        "padding": "1.5rem 2rem",
                    "backgroundColor": "#667eea",
                    "color": "white"
                },
                    "children": [
                        {
                            "type": "h1",
                            "props": {
                                "style": {"margin": "0", "fontSize": "1.5rem", "fontWeight": "700"},
                                "children": "My App"
                            }
                        },
                        {
                            "type": "nav",
                            "props": {
                                "style": {"display": "flex", "gap": "2rem"},
                                "children": [
                                    {"type": "a", "props": {"href": "#", "style": {"color": "white", "textDecoration": "none"}, "children": "Home"}},
                                    {"type": "a", "props": {"href": "#", "style": {"color": "white", "textDecoration": "none"}, "children": "About"}},
                                    {"type": "a", "props": {"href": "#", "style": {"color": "white", "textDecoration": "none"}, "children": "Contact"}}
                                ]
                            }
                        }
                    ]
                }
            },
            {
                "type": "section",
                "props": {
                    "style": {
                        "padding": "5rem 2rem",
                        "textAlign": "center",
                        "background": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        "color": "white"
                    },
                    "children": [
                        {
                            "type": "h1",
                            "props": {
                                "style": {"fontSize": "3rem", "fontWeight": "700", "margin": "0 0 1rem 0"},
                                "children": "Welcome to Our Platform"
                            }
                        },
                        {
                            "type": "p",
                            "props": {
                                "style": {"fontSize": "1.25rem", "margin": "0 0 2rem 0", "opacity": "0.9"},
                                "children": "Build amazing applications with our no-code platform"
                            }
                        },
                        {
                            "type": "button",
                            "props": {
                                "style": {
                                    "padding": "1rem 2rem",
                                    "fontSize": "1.1rem",
                                    "backgroundColor": "white",
                                    "color": "#667eea",
                                    "border": "none",
                                    "borderRadius": "8px",
                                    "cursor": "pointer",
                                    "fontWeight": "600"
                                },
                                "children": "Get Started"
                            }
                        }
                    ]
                }
            },
            {
                "type": "section",
                "props": {
                    "style": {
                        "padding": "4rem 2rem",
                        "maxWidth": "1200px",
                        "margin": "0 auto"
                    },
                    "children": [
                        {
                            "type": "h2",
                            "props": {
                                "style": {"textAlign": "center", "fontSize": "2.5rem", "margin": "0 0 3rem 0"},
                                "children": "Features"
            }
        },
        {
            "type": "div",
            "props": {
                "style": {
                                    "display": "grid",
                                    "gridTemplateColumns": "repeat(auto-fit, minmax(300px, 1fr))",
                                    "gap": "2rem"
                                },
                                "children": [
                                    {
                                        "type": "div",
                                        "props": {
                                            "style": {
                                                "padding": "2rem",
                                                "borderRadius": "12px",
                                                "boxShadow": "0 2px 8px rgba(0,0,0,0.1)",
                                                "backgroundColor": "white"
                                            },
                                            "children": [
                                                {"type": "h3", "props": {"style": {"margin": "0 0 1rem 0"}, "children": "Feature 1"}},
                                                {"type": "p", "props": {"style": {"margin": "0", "color": "#666"}, "children": "Description of feature 1"}}
                                            ]
                                        }
                                    },
                                    {
                                        "type": "div",
                                        "props": {
                                            "style": {
                                                "padding": "2rem",
                                                "borderRadius": "12px",
                                                "boxShadow": "0 2px 8px rgba(0,0,0,0.1)",
                                                "backgroundColor": "white"
                                            },
                                            "children": [
                                                {"type": "h3", "props": {"style": {"margin": "0 0 1rem 0"}, "children": "Feature 2"}},
                                                {"type": "p", "props": {"style": {"margin": "0", "color": "#666"}, "children": "Description of feature 2"}}
                                            ]
                                        }
                                    },
                                    {
                                        "type": "div",
                                        "props": {
                                            "style": {
                                                "padding": "2rem",
                                                "borderRadius": "12px",
                                                "boxShadow": "0 2px 8px rgba(0,0,0,0.1)",
                                                "backgroundColor": "white"
                                            },
                                            "children": [
                                                {"type": "h3", "props": {"style": {"margin": "0 0 1rem 0"}, "children": "Feature 3"}},
                                                {"type": "p", "props": {"style": {"margin": "0", "color": "#666"}, "children": "Description of feature 3"}}
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    ]
            }
        },
        {
            "type": "footer",
            "props": {
                "style": {
                        "padding": "2rem",
                        "textAlign": "center",
                        "backgroundColor": "#333",
                        "color": "white"
                    },
                    "children": "© 2024 All rights reserved"
                }
            }
        ]
    elif is_dashboard:
        page_structure = [
            {
                "type": "header",
                "props": {
                    "style": {
                        "padding": "1rem 2rem",
                        "backgroundColor": "#667eea",
                        "color": "white",
                        "display": "flex",
                        "justifyContent": "space-between",
                        "alignItems": "center"
                    },
                    "children": [
                        {"type": "h1", "props": {"style": {"margin": "0", "fontSize": "1.5rem"}, "children": "Dashboard"}},
                        {"type": "div", "props": {"style": {"display": "flex", "gap": "1rem"}, "children": [
                            {"type": "button", "props": {"style": {"padding": "0.5rem 1rem", "backgroundColor": "white", "color": "#667eea", "border": "none", "borderRadius": "4px", "cursor": "pointer"}, "children": "Settings"}}
                        ]}}
                    ]
                }
            },
            {
                "type": "div",
                "props": {
                    "style": {
                        "display": "grid",
                        "gridTemplateColumns": "250px 1fr",
                        "minHeight": "calc(100vh - 80px)"
                    },
                    "children": [
                        {
                            "type": "aside",
                            "props": {
                                "style": {
                                    "padding": "2rem",
                                    "backgroundColor": "#f8f9fa",
                                    "borderRight": "1px solid #e0e0e0"
                                },
                                "children": [
                                    {"type": "h3", "props": {"style": {"margin": "0 0 1rem 0"}, "children": "Menu"}},
                                    {"type": "nav", "props": {"style": {"display": "flex", "flexDirection": "column", "gap": "0.5rem"}, "children": [
                                        {"type": "a", "props": {"href": "#", "style": {"padding": "0.75rem", "color": "#333", "textDecoration": "none", "borderRadius": "4px", "backgroundColor": "#e3f2fd"}, "children": "Overview"}},
                                        {"type": "a", "props": {"href": "#", "style": {"padding": "0.75rem", "color": "#666", "textDecoration": "none", "borderRadius": "4px"}, "children": "Analytics"}},
                                        {"type": "a", "props": {"href": "#", "style": {"padding": "0.75rem", "color": "#666", "textDecoration": "none", "borderRadius": "4px"}, "children": "Reports"}}
                                    ]}}
                                ]
                            }
                        },
                        {
                            "type": "main",
                            "props": {
                                "style": {"padding": "2rem"},
                                "children": [
                                    {"type": "h2", "props": {"style": {"margin": "0 0 2rem 0", "fontSize": "2rem"}, "children": "Dashboard Overview"}},
                                    {"type": "div", "props": {"style": {"display": "grid", "gridTemplateColumns": "repeat(auto-fit, minmax(250px, 1fr))", "gap": "1.5rem"}, "children": [
                                        {"type": "div", "props": {"style": {"padding": "1.5rem", "backgroundColor": "white", "borderRadius": "8px", "boxShadow": "0 2px 4px rgba(0,0,0,0.1)"}, "children": [
                                            {"type": "h3", "props": {"style": {"margin": "0 0 0.5rem 0", "color": "#666", "fontSize": "0.9rem"}, "children": "Total Users"}},
                                            {"type": "p", "props": {"style": {"margin": "0", "fontSize": "2rem", "fontWeight": "700", "color": "#333"}, "children": "1,234"}}
                                        ]}},
                                        {"type": "div", "props": {"style": {"padding": "1.5rem", "backgroundColor": "white", "borderRadius": "8px", "boxShadow": "0 2px 4px rgba(0,0,0,0.1)"}, "children": [
                                            {"type": "h3", "props": {"style": {"margin": "0 0 0.5rem 0", "color": "#666", "fontSize": "0.9rem"}, "children": "Revenue"}},
                                            {"type": "p", "props": {"style": {"margin": "0", "fontSize": "2rem", "fontWeight": "700", "color": "#333"}, "children": "$12,345"}}
                                        ]}}
                                    ]}}
                                ]
                            }
                        }
                    ]
                }
            }
        ]
    else:
        # Generic page structure
        page_structure = [
            {
                "type": "header",
                "props": {
                    "style": {
                        "padding": "1.5rem 2rem",
                        "backgroundColor": "#667eea",
                        "color": "white",
                        "display": "flex",
                        "justifyContent": "space-between",
                        "alignItems": "center"
                    },
                    "children": [
                        {"type": "h1", "props": {"style": {"margin": "0", "fontSize": "1.5rem", "fontWeight": "700"}, "children": "My Website"}},
                        {"type": "nav", "props": {"style": {"display": "flex", "gap": "2rem"}, "children": [
                            {"type": "a", "props": {"href": "#", "style": {"color": "white", "textDecoration": "none"}, "children": "Home"}},
                            {"type": "a", "props": {"href": "#", "style": {"color": "white", "textDecoration": "none"}, "children": "About"}},
                            {"type": "a", "props": {"href": "#", "style": {"color": "white", "textDecoration": "none"}, "children": "Contact"}}
                        ]}}
                    ]
                }
            },
            {
                "type": "main",
                "props": {
                    "style": {
                        "padding": "3rem 2rem",
                        "maxWidth": "1200px",
                        "margin": "0 auto",
                        "minHeight": "60vh"
                    },
                    "children": [
                        {
                            "type": "h1",
                            "props": {
                                "style": {"fontSize": "2.5rem", "fontWeight": "700", "margin": "0 0 1rem 0", "color": "#333"},
                                "children": description.split()[0:5] if len(description.split()) > 4 else description
                            }
                        },
                        {
                            "type": "p",
                            "props": {
                                "style": {"fontSize": "1.1rem", "lineHeight": "1.8", "color": "#666", "margin": "0 0 2rem 0"},
                                "children": "This is the main content area. Add your content here."
                            }
                        },
                        {
                            "type": "section",
                            "props": {
                                "style": {"marginTop": "3rem"},
                                "children": [
                                    {"type": "h2", "props": {"style": {"fontSize": "2rem", "margin": "0 0 1rem 0"}, "children": "Content Section"}},
                                    {"type": "p", "props": {"style": {"color": "#666", "lineHeight": "1.8"}, "children": "Add more content sections as needed."}}
                                ]
                            }
                        }
                    ]
                }
            },
            {
                "type": "footer",
                "props": {
                    "style": {
                        "padding": "2rem",
                        "textAlign": "center",
                        "backgroundColor": "#333",
                        "color": "white"
                    },
                    "children": "© 2024 All rights reserved"
            }
        }
    ]
    
    return {
        "result": page_structure,
        "explanation": f"Generated complete page structure with {len(page_structure)} sections.",
        "suggestions": [
            "Review the generated page structure",
            "Customize components and styling as needed",
            "Add more interactive elements"
        ]
    }

@router.post("/generate-code", response_model=AIResponse)
async def generate_code(
    request: CodeGenerationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Generate code based on natural language description, respecting project frameworks."""
    try:
        result = generate_code_with_llm(
            request.description,
            request.component_type,
            request.language,
            request.context,
            request.frontend_framework,
            request.backend_framework
        )
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error generating code: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating code: {str(e)}"
        )

@router.post("/generate-component", response_model=AIResponse)
async def generate_component(
    request: ComponentGenerationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Generate component structure based on description, respecting project frameworks."""
    try:
        result = generate_component_with_llm(
            request.description,
            request.component_type,
            request.style_preferences,
            request.existing_components,
            request.frontend_framework,
            request.backend_framework
        )
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error generating component: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating component: {str(e)}"
        )

@router.post("/explain-code", response_model=AIResponse)
async def explain_code(
    request: CodeExplanationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Explain code functionality using AI."""
    try:
        result = explain_code_with_llm(request.code, request.language)
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error explaining code: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error explaining code: {str(e)}"
        )

@router.post("/fix-bug", response_model=AIResponse)
async def fix_bug(
    request: BugFixRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Fix bugs in code using AI."""
    try:
        result = fix_bug_with_llm(request.code, request.error_message, request.language)
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error fixing bug: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fixing bug: {str(e)}"
        )

@router.post("/generate-page", response_model=AIResponse)
async def generate_page(
    request: PageGenerationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Generate a complete page structure based on description, respecting project frameworks."""
    try:
        result = generate_page_with_llm(
            request.description,
            request.page_type,
            request.style_preferences,
            request.frontend_framework,
            request.backend_framework
        )
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error generating page: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating page: {str(e)}"
        )

def generate_application_with_llm(description: str, css_framework: Optional[str] = None,
                                  frontend_framework: Optional[str] = None,
                                  backend_framework: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate a complete multi-page application with signup, login, and landing pages.
    Supports Tailwind CSS and Bootstrap styling.
    """
    framework_name = frontend_framework.upper() if frontend_framework else "React"
    css_framework_name = css_framework.upper() if css_framework else "Custom CSS"
    
    # Detect which pages are needed from description
    lower_desc = description.lower()
    needs_signup = "signup" in lower_desc or "sign up" in lower_desc or "registration" in lower_desc
    needs_login = "login" in lower_desc
    needs_landing = "landing" in lower_desc or "home" in lower_desc or "main" in lower_desc
    
    # Default to all pages if not specified
    if not needs_signup and not needs_login and not needs_landing:
        needs_signup = True
        needs_login = True
        needs_landing = True
    
    # Determine CSS framework from description or parameter
    use_tailwind = css_framework and css_framework.lower() == "tailwind" or "tailwind" in lower_desc
    use_bootstrap = css_framework and css_framework.lower() == "bootstrap" or "bootstrap" in lower_desc
    
    pages = []
    
    # Generate Landing Page with Navbar
    if needs_landing:
        landing_page = generate_landing_page_with_navbar(use_tailwind, use_bootstrap, description)
        pages.append({"page_type": "landing", "components": landing_page})
    
    # Generate Signup Page
    if needs_signup:
        signup_page = generate_signup_page(use_tailwind, use_bootstrap)
        pages.append({"page_type": "signup", "components": signup_page})
    
    # Generate Login Page
    if needs_login:
        login_page = generate_login_page(use_tailwind, use_bootstrap)
        pages.append({"page_type": "login", "components": login_page})
    
    return {
        "result": pages,
        "explanation": f"Generated complete {framework_name} application with {len(pages)} pages using {css_framework_name} styling.",
        "suggestions": [
            "All pages have been generated and added to canvas",
            "Review and customize each page as needed",
            "Pages are ready to use with proper styling"
        ]
    }

def generate_landing_page_with_navbar(use_tailwind: bool, use_bootstrap: bool, description: str) -> List[Dict]:
    """Generate landing page with navbar."""
    # Extract navbar options from description
    lower_desc = description.lower()
    nav_items = []
    if "home" in lower_desc:
        nav_items.append("Home")
    if "service" in lower_desc or "services" in lower_desc:
        nav_items.append("Services")
    if "product" in lower_desc or "products" in lower_desc:
        nav_items.append("Products")
    if "about" in lower_desc:
        nav_items.append("About")
    if "contact" in lower_desc:
        nav_items.append("Contact")
    
    # Default nav items if none specified
    if not nav_items:
        nav_items = ["Home", "Services", "Products", "About"]
    
    if use_tailwind:
        return generate_tailwind_landing_page(nav_items)
    elif use_bootstrap:
        return generate_bootstrap_landing_page(nav_items)
    else:
        return generate_custom_landing_page(nav_items)

def generate_tailwind_landing_page(nav_items: List[str]) -> List[Dict]:
    """Generate landing page with Tailwind CSS classes."""
    return [
        {
            "type": "nav",
            "props": {
                "className": "bg-white shadow-md",
                "style": {"padding": "1rem 2rem"}
            },
            "children": [
                {
                    "type": "div",
                    "props": {
                        "className": "container mx-auto flex justify-between items-center",
                        "children": [
                            {
                                "type": "div",
                                "props": {
                                    "className": "text-2xl font-bold text-blue-600",
                                    "children": "Logo"
                                }
                            },
                            {
                                "type": "ul",
                                "props": {
                                    "className": "flex space-x-6",
                                    "children": [
                                        {
                                            "type": "li",
                                            "props": {
                                                "className": "cursor-pointer hover:text-blue-600 transition",
                                                "children": item
                                            }
                                        } for item in nav_items
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        },
        {
            "type": "section",
            "props": {
                "className": "bg-gradient-to-r from-blue-500 to-purple-600 text-white py-20",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "container mx-auto text-center",
                            "children": [
                                {
                                    "type": "h1",
                                    "props": {
                                        "className": "text-5xl font-bold mb-4",
                                        "children": "Welcome to Our Platform"
                                    }
                                },
                                {
                                    "type": "p",
                                    "props": {
                                        "className": "text-xl mb-8",
                                        "children": "Build amazing applications with ease"
                                    }
                                },
                                {
                                    "type": "button",
                                    "props": {
                                        "className": "bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition",
                                        "children": "Get Started"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        },
        {
            "type": "section",
            "props": {
                "className": "py-16 bg-gray-50",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "container mx-auto",
                            "children": [
                                {
                                    "type": "h2",
                                    "props": {
                                        "className": "text-3xl font-bold text-center mb-12",
                                        "children": "Our Services"
                                    }
                                },
                                {
                                    "type": "div",
                                    "props": {
                                        "className": "grid grid-cols-1 md:grid-cols-3 gap-8",
                                        "children": [
                                            {
                                                "type": "div",
                                                "props": {
                                                    "className": "bg-white p-6 rounded-lg shadow-md",
                                                    "children": [
                                                        {"type": "h3", "props": {"className": "text-xl font-semibold mb-2", "children": "Service 1"}},
                                                        {"type": "p", "props": {"className": "text-gray-600", "children": "Description of service 1"}}
                                                    ]
                                                }
                                            },
                                            {
                                                "type": "div",
                                                "props": {
                                                    "className": "bg-white p-6 rounded-lg shadow-md",
                                                    "children": [
                                                        {"type": "h3", "props": {"className": "text-xl font-semibold mb-2", "children": "Service 2"}},
                                                        {"type": "p", "props": {"className": "text-gray-600", "children": "Description of service 2"}}
                                                    ]
                                                }
                                            },
                                            {
                                                "type": "div",
                                                "props": {
                                                    "className": "bg-white p-6 rounded-lg shadow-md",
                                                    "children": [
                                                        {"type": "h3", "props": {"className": "text-xl font-semibold mb-2", "children": "Service 3"}},
                                                        {"type": "p", "props": {"className": "text-gray-600", "children": "Description of service 3"}}
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
        },
        {
            "type": "footer",
            "props": {
                "className": "bg-gray-800 text-white py-8",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "container mx-auto text-center",
                            "children": "© 2024 All rights reserved"
                        }
                    }
                ]
            }
        }
    ]

def generate_bootstrap_landing_page(nav_items: List[str]) -> List[Dict]:
    """Generate landing page with Bootstrap classes."""
    return [
        {
            "type": "nav",
            "props": {
                "className": "navbar navbar-expand-lg navbar-light bg-light",
                "style": {"padding": "1rem 2rem"}
            },
            "children": [
                {
                    "type": "div",
                    "props": {
                        "className": "container-fluid",
                        "children": [
                            {
                                "type": "a",
                                "props": {
                                    "className": "navbar-brand fw-bold text-primary",
                                    "href": "#",
                                    "children": "Logo"
                                }
                            },
                            {
                                "type": "ul",
                                "props": {
                                    "className": "navbar-nav ms-auto",
                                    "children": [
                                        {
                                            "type": "li",
                                            "props": {
                                                "className": "nav-item",
                                                "children": [
                                                    {
                                                        "type": "a",
                                                        "props": {
                                                            "className": "nav-link",
                                                            "href": "#",
                                                            "children": item
                                                        }
                                                    }
                                                ]
                                            }
                                        } for item in nav_items
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        },
        {
            "type": "section",
            "props": {
                "className": "bg-primary text-white py-5",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "container text-center",
                            "children": [
                                {
                                    "type": "h1",
                                    "props": {
                                        "className": "display-4 fw-bold mb-4",
                                        "children": "Welcome to Our Platform"
                                    }
                                },
                                {
                                    "type": "p",
                                    "props": {
                                        "className": "lead mb-4",
                                        "children": "Build amazing applications with ease"
                                    }
                                },
                                {
                                    "type": "button",
                                    "props": {
                                        "className": "btn btn-light btn-lg",
                                        "children": "Get Started"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        },
        {
            "type": "section",
            "props": {
                "className": "py-5",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "container",
                            "children": [
                                {
                                    "type": "h2",
                                    "props": {
                                        "className": "text-center mb-5",
                                        "children": "Our Services"
                                    }
                                },
                                {
                                    "type": "div",
                                    "props": {
                                        "className": "row g-4",
                                        "children": [
                                            {
                                                "type": "div",
                                                "props": {
                                                    "className": "col-md-4",
                                                    "children": [
                                                        {
                                                            "type": "div",
                                                            "props": {
                                                                "className": "card h-100",
                                                                "children": [
                                                                    {
                                                                        "type": "div",
                                                                        "props": {
                                                                            "className": "card-body",
                                                                            "children": [
                                                                                {"type": "h5", "props": {"className": "card-title", "children": "Service 1"}},
                                                                                {"type": "p", "props": {"className": "card-text", "children": "Description of service 1"}}
                                                                            ]
                                                                        }
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                            {
                                                "type": "div",
                                                "props": {
                                                    "className": "col-md-4",
                                                    "children": [
                                                        {
                                                            "type": "div",
                                                            "props": {
                                                                "className": "card h-100",
                                                                "children": [
                                                                    {
                                                                        "type": "div",
                                                                        "props": {
                                                                            "className": "card-body",
                                                                            "children": [
                                                                                {"type": "h5", "props": {"className": "card-title", "children": "Service 2"}},
                                                                                {"type": "p", "props": {"className": "card-text", "children": "Description of service 2"}}
                                                                            ]
                                                                        }
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                            {
                                                "type": "div",
                                                "props": {
                                                    "className": "col-md-4",
                                                    "children": [
                                                        {
                                                            "type": "div",
                                                            "props": {
                                                                "className": "card h-100",
                                                                "children": [
                                                                    {
                                                                        "type": "div",
                                                                        "props": {
                                                                            "className": "card-body",
                                                                            "children": [
                                                                                {"type": "h5", "props": {"className": "card-title", "children": "Service 3"}},
                                                                                {"type": "p", "props": {"className": "card-text", "children": "Description of service 3"}}
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
                            ]
                        }
                    }
                ]
            }
        },
        {
            "type": "footer",
            "props": {
                "className": "bg-dark text-white text-center py-4",
                "children": "© 2024 All rights reserved"
            }
        }
    ]

def generate_custom_landing_page(nav_items: List[str]) -> List[Dict]:
    """Generate landing page with custom CSS styling."""
    return [
        {
            "type": "nav",
            "props": {
                "style": {
                    "display": "flex",
                    "justifyContent": "space-between",
                    "alignItems": "center",
                    "padding": "1rem 2rem",
                    "backgroundColor": "#ffffff",
                    "boxShadow": "0 2px 4px rgba(0,0,0,0.1)"
                },
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "style": {
                                "fontSize": "1.5rem",
                                "fontWeight": "700",
                                "color": "#667eea"
                            },
                            "children": "Logo"
                        }
                    },
                    {
                        "type": "ul",
                        "props": {
                            "style": {
                                "display": "flex",
                                "listStyle": "none",
                                "gap": "2rem",
                                "margin": "0",
                                "padding": "0"
                            },
                            "children": [
                                {
                                    "type": "li",
                                    "props": {
                                        "style": {
                                            "cursor": "pointer",
                                            "fontSize": "1rem",
                                            "color": "#333",
                                            "transition": "color 0.3s"
                                        },
                                        "children": item
                                    }
                                } for item in nav_items
                            ]
                        }
                    }
                ]
            }
        },
        {
            "type": "section",
            "props": {
                "style": {
                    "background": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    "color": "white",
                    "padding": "5rem 2rem",
                    "textAlign": "center"
                },
                "children": [
                    {
                        "type": "h1",
                        "props": {
                            "style": {
                                "fontSize": "3rem",
                                "fontWeight": "700",
                                "margin": "0 0 1rem 0"
                            },
                            "children": "Welcome to Our Platform"
                        }
                    },
                    {
                        "type": "p",
                        "props": {
                            "style": {
                                "fontSize": "1.25rem",
                                "margin": "0 0 2rem 0",
                                "opacity": "0.9"
                            },
                            "children": "Build amazing applications with ease"
                        }
                    },
                    {
                        "type": "button",
                        "props": {
                            "style": {
                                "padding": "1rem 2rem",
                                "fontSize": "1.1rem",
                                "backgroundColor": "white",
                                "color": "#667eea",
                                "border": "none",
                                "borderRadius": "8px",
                                "cursor": "pointer",
                                "fontWeight": "600",
                                "transition": "transform 0.2s"
                            },
                            "children": "Get Started"
                        }
                    }
                ]
            }
        },
        {
            "type": "section",
            "props": {
                "style": {
                    "padding": "4rem 2rem",
                    "backgroundColor": "#f8f9fa"
                },
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "style": {
                                "maxWidth": "1200px",
                                "margin": "0 auto"
                            },
                            "children": [
                                {
                                    "type": "h2",
                                    "props": {
                                        "style": {
                                            "fontSize": "2.5rem",
                                            "fontWeight": "700",
                                            "textAlign": "center",
                                            "margin": "0 0 3rem 0",
                                            "color": "#333"
                                        },
                                        "children": "Our Services"
                                    }
                                },
                                {
                                    "type": "div",
                                    "props": {
                                        "style": {
                                            "display": "grid",
                                            "gridTemplateColumns": "repeat(auto-fit, minmax(300px, 1fr))",
                                            "gap": "2rem"
                                        },
                                        "children": [
                                            {
                                                "type": "div",
                                                "props": {
                                                    "style": {
                                                        "backgroundColor": "white",
                                                        "padding": "2rem",
                                                        "borderRadius": "12px",
                                                        "boxShadow": "0 2px 8px rgba(0,0,0,0.1)"
                                                    },
                                                    "children": [
                                                        {"type": "h3", "props": {"style": {"fontSize": "1.5rem", "fontWeight": "600", "margin": "0 0 1rem 0", "color": "#333"}, "children": "Service 1"}},
                                                        {"type": "p", "props": {"style": {"margin": "0", "color": "#666", "lineHeight": "1.6"}, "children": "Description of service 1"}}
                                                    ]
                                                }
                                            },
                                            {
                                                "type": "div",
                                                "props": {
                                                    "style": {
                                                        "backgroundColor": "white",
                                                        "padding": "2rem",
                                                        "borderRadius": "12px",
                                                        "boxShadow": "0 2px 8px rgba(0,0,0,0.1)"
                                                    },
                                                    "children": [
                                                        {"type": "h3", "props": {"style": {"fontSize": "1.5rem", "fontWeight": "600", "margin": "0 0 1rem 0", "color": "#333"}, "children": "Service 2"}},
                                                        {"type": "p", "props": {"style": {"margin": "0", "color": "#666", "lineHeight": "1.6"}, "children": "Description of service 2"}}
                                                    ]
                                                }
                                            },
                                            {
                                                "type": "div",
                                                "props": {
                                                    "style": {
                                                        "backgroundColor": "white",
                                                        "padding": "2rem",
                                                        "borderRadius": "12px",
                                                        "boxShadow": "0 2px 8px rgba(0,0,0,0.1)"
                                                    },
                                                    "children": [
                                                        {"type": "h3", "props": {"style": {"fontSize": "1.5rem", "fontWeight": "600", "margin": "0 0 1rem 0", "color": "#333"}, "children": "Service 3"}},
                                                        {"type": "p", "props": {"style": {"margin": "0", "color": "#666", "lineHeight": "1.6"}, "children": "Description of service 3"}}
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
        },
        {
            "type": "footer",
            "props": {
                "style": {
                    "backgroundColor": "#333",
                    "color": "white",
                    "padding": "2rem",
                    "textAlign": "center"
                },
                "children": "© 2024 All rights reserved"
            }
        }
    ]

def generate_signup_page(use_tailwind: bool, use_bootstrap: bool) -> List[Dict]:
    """Generate signup page."""
    if use_tailwind:
        return [{
            "type": "div",
            "props": {
                "className": "min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "max-w-md w-full bg-white rounded-lg shadow-md p-8",
                            "children": [
                                {"type": "h2", "props": {"className": "text-3xl font-bold text-center mb-6", "children": "Sign Up"}},
                                {
                                    "type": "form",
                                    "props": {
                                        "className": "space-y-4",
                                        "children": [
                                            {"type": "input", "props": {"type": "text", "className": "w-full px-4 py-2 border rounded-lg", "placeholder": "Full Name", "required": True}},
                                            {"type": "input", "props": {"type": "email", "className": "w-full px-4 py-2 border rounded-lg", "placeholder": "Email", "required": True}},
                                            {"type": "input", "props": {"type": "password", "className": "w-full px-4 py-2 border rounded-lg", "placeholder": "Password", "required": True}},
                                            {"type": "button", "props": {"type": "submit", "className": "w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700", "children": "Sign Up"}}
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }]
    elif use_bootstrap:
        return [{
            "type": "div",
            "props": {
                "className": "container d-flex align-items-center justify-content-center",
                "style": {"minHeight": "100vh"},
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "card",
                            "style": {"width": "100%", "maxWidth": "400px"},
                            "children": [
                                {
                                    "type": "div",
                                    "props": {
                                        "className": "card-body p-4",
                                        "children": [
                                            {"type": "h2", "props": {"className": "card-title text-center mb-4", "children": "Sign Up"}},
                                            {
                                                "type": "form",
                                                "props": {
                                                    "children": [
                                                        {"type": "input", "props": {"type": "text", "className": "form-control mb-3", "placeholder": "Full Name", "required": True}},
                                                        {"type": "input", "props": {"type": "email", "className": "form-control mb-3", "placeholder": "Email", "required": True}},
                                                        {"type": "input", "props": {"type": "password", "className": "form-control mb-3", "placeholder": "Password", "required": True}},
                                                        {"type": "button", "props": {"type": "submit", "className": "btn btn-primary w-100", "children": "Sign Up"}}
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
        }]
    else:
        return [{
            "type": "div",
            "props": {
                "style": {
                    "minHeight": "100vh",
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "backgroundColor": "#f8f9fa",
                    "padding": "2rem"
                },
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "style": {
                                "maxWidth": "400px",
                                "width": "100%",
                                "backgroundColor": "white",
                                "padding": "2rem",
                                "borderRadius": "12px",
                                "boxShadow": "0 4px 12px rgba(0,0,0,0.1)"
                            },
                            "children": [
                                {"type": "h2", "props": {"style": {"fontSize": "2rem", "fontWeight": "700", "textAlign": "center", "margin": "0 0 2rem 0", "color": "#333"}, "children": "Sign Up"}},
                                {
                                    "type": "form",
                                    "props": {
                                        "style": {"display": "flex", "flexDirection": "column", "gap": "1rem"},
                                        "children": [
                                            {"type": "input", "props": {"type": "text", "style": {"padding": "0.75rem", "border": "1px solid #ddd", "borderRadius": "6px", "fontSize": "1rem"}, "placeholder": "Full Name", "required": True}},
                                            {"type": "input", "props": {"type": "email", "style": {"padding": "0.75rem", "border": "1px solid #ddd", "borderRadius": "6px", "fontSize": "1rem"}, "placeholder": "Email", "required": True}},
                                            {"type": "input", "props": {"type": "password", "style": {"padding": "0.75rem", "border": "1px solid #ddd", "borderRadius": "6px", "fontSize": "1rem"}, "placeholder": "Password", "required": True}},
                                            {"type": "button", "props": {"type": "submit", "style": {"padding": "0.75rem", "backgroundColor": "#667eea", "color": "white", "border": "none", "borderRadius": "6px", "fontSize": "1rem", "fontWeight": "600", "cursor": "pointer"}, "children": "Sign Up"}}
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }]

def generate_login_page(use_tailwind: bool, use_bootstrap: bool) -> List[Dict]:
    """Generate login page."""
    if use_tailwind:
        return [{
            "type": "div",
            "props": {
                "className": "min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4",
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "max-w-md w-full bg-white rounded-lg shadow-md p-8",
                            "children": [
                                {"type": "h2", "props": {"className": "text-3xl font-bold text-center mb-6", "children": "Login"}},
                                {
                                    "type": "form",
                                    "props": {
                                        "className": "space-y-4",
                                        "children": [
                                            {"type": "input", "props": {"type": "email", "className": "w-full px-4 py-2 border rounded-lg", "placeholder": "Email", "required": True}},
                                            {"type": "input", "props": {"type": "password", "className": "w-full px-4 py-2 border rounded-lg", "placeholder": "Password", "required": True}},
                                            {"type": "button", "props": {"type": "submit", "className": "w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700", "children": "Login"}}
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }]
    elif use_bootstrap:
        return [{
            "type": "div",
            "props": {
                "className": "container d-flex align-items-center justify-content-center",
                "style": {"minHeight": "100vh"},
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "className": "card",
                            "style": {"width": "100%", "maxWidth": "400px"},
                            "children": [
                                {
                                    "type": "div",
                                    "props": {
                                        "className": "card-body p-4",
                                        "children": [
                                            {"type": "h2", "props": {"className": "card-title text-center mb-4", "children": "Login"}},
                                            {
                                                "type": "form",
                                                "props": {
                                                    "children": [
                                                        {"type": "input", "props": {"type": "email", "className": "form-control mb-3", "placeholder": "Email", "required": True}},
                                                        {"type": "input", "props": {"type": "password", "className": "form-control mb-3", "placeholder": "Password", "required": True}},
                                                        {"type": "button", "props": {"type": "submit", "className": "btn btn-primary w-100", "children": "Login"}}
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
        }]
    else:
        return [{
            "type": "div",
            "props": {
                "style": {
                    "minHeight": "100vh",
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "backgroundColor": "#f8f9fa",
                    "padding": "2rem"
                },
                "children": [
                    {
                        "type": "div",
                        "props": {
                            "style": {
                                "maxWidth": "400px",
                                "width": "100%",
                                "backgroundColor": "white",
                                "padding": "2rem",
                                "borderRadius": "12px",
                                "boxShadow": "0 4px 12px rgba(0,0,0,0.1)"
                            },
                            "children": [
                                {"type": "h2", "props": {"style": {"fontSize": "2rem", "fontWeight": "700", "textAlign": "center", "margin": "0 0 2rem 0", "color": "#333"}, "children": "Login"}},
                                {
                                    "type": "form",
                                    "props": {
                                        "style": {"display": "flex", "flexDirection": "column", "gap": "1rem"},
                                        "children": [
                                            {"type": "input", "props": {"type": "email", "style": {"padding": "0.75rem", "border": "1px solid #ddd", "borderRadius": "6px", "fontSize": "1rem"}, "placeholder": "Email", "required": True}},
                                            {"type": "input", "props": {"type": "password", "style": {"padding": "0.75rem", "border": "1px solid #ddd", "borderRadius": "6px", "fontSize": "1rem"}, "placeholder": "Password", "required": True}},
                                            {"type": "button", "props": {"type": "submit", "style": {"padding": "0.75rem", "backgroundColor": "#667eea", "color": "white", "border": "none", "borderRadius": "6px", "fontSize": "1rem", "fontWeight": "600", "cursor": "pointer"}, "children": "Login"}}
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }]

@router.post("/generate-application", response_model=AIResponse)
async def generate_application(
    request: ApplicationGenerationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Generate a complete multi-page application with signup, login, and landing pages."""
    try:
        result = generate_application_with_llm(
            request.description,
            request.css_framework,
            request.frontend_framework,
            request.backend_framework
        )
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error generating application: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating application: {str(e)}"
        )

