from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.auth import get_current_user
from app import models
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

class ComponentGenerationRequest(BaseModel):
    description: str
    component_type: Optional[str] = None
    style_preferences: Optional[Dict[str, Any]] = None
    existing_components: Optional[List[Dict[str, Any]]] = None

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
            timeout=60
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

def call_llm_api(prompt: str, system_prompt: str = None, model: str = "gpt-4") -> Optional[str]:
    """
    Call LLM API (Ollama, OpenAI, Anthropic, etc.)
    This function can be configured to use any LLM provider.
    Priority: Ollama (if enabled) > OpenAI > Anthropic
    """
    # Check if Ollama is enabled (default to true for local development)
    use_ollama = os.getenv("USE_OLLAMA", "true").lower() == "true"
    
    if use_ollama:
        ollama_response = call_ollama(prompt, system_prompt, model)
        if ollama_response:
            return ollama_response
    
    # Check if OpenAI API key is available
    openai_api_key = os.getenv("OPENAI_API_KEY")
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    
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
                           language: str = "javascript", context: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Generate code using LLM based on description.
    """
    system_prompt = f"""You are an expert {language} developer. Generate clean, production-ready code based on user descriptions.
Return only valid {language} code. If the user asks for React components, return JSX/TSX code.
Always return code that is ready to use, with proper imports and exports."""

    prompt = f"""Generate {language} code for: {description}
"""
    if component_type:
        prompt += f"Component type: {component_type}\n"
    if context:
        prompt += f"Context: {json.dumps(context, indent=2)}\n"
    prompt += "\nReturn only the code, no explanations unless specifically asked."

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
                                existing_components: Optional[List] = None) -> Dict[str, Any]:
    """
    Generate React component structure using LLM.
    """
    system_prompt = """You are an expert React developer. Generate React component structures in JSON format.
Return a JSON object with:
- type: component type (div, button, input, form, etc.)
- props: object with style and other properties
- children: array of child components (for nested structures) or string content (for text)

CRITICAL RULES:
1. You MUST generate an actual component structure, NOT the user's description text
2. NEVER return the user's request as text - always create a component structure
3. For forms (signup, registration, login), use type "form" with proper form structure
4. Include all form fields as children array with proper labels and inputs
5. Use proper input types: "text", "email", "password", etc.
6. Include labels for accessibility
7. Add proper styling for a modern, clean look
8. For signup/registration forms, include: name, email, password, confirm password fields
9. Always return valid JSON structure, not text descriptions
10. The component must have a "type" field and "props" field at minimum

The JSON should be valid and ready to be used in a no-code editor.
Example format:
{
  "type": "div",
  "props": {
    "style": {"padding": "20px"},
    "children": "Hello World"
  }
}"""

    prompt = f"""Generate a React component structure for: {description}

CRITICAL INSTRUCTIONS:
- You MUST create an actual component structure in JSON format
- DO NOT return the description text "{description}" as the response
- DO NOT explain what you're going to create - just create it
- Return ONLY valid JSON with "type" and "props" fields
- For forms, include all fields as children array
- Add appropriate styling for a modern look

"""
    if component_type:
        prompt += f"Component type: {component_type}\n"
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
                return generate_component_fallback(description, component_type, style_preferences)
            
            # Clean the response - remove markdown code blocks if present
            cleaned_response = llm_response.strip()
            if cleaned_response.startswith('```'):
                # Remove markdown code blocks
                cleaned_response = re.sub(r'^```(?:json)?\s*', '', cleaned_response, flags=re.MULTILINE)
                cleaned_response = re.sub(r'\s*```\s*$', '', cleaned_response, flags=re.MULTILINE)
            
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
                            return generate_component_fallback(description, component_type, style_preferences)
                        
                        return {
                            "result": component_structure,
                            "explanation": "Generated component structure using AI.",
                            "suggestions": [
                                "Review the generated structure",
                                "Adjust styles and properties as needed",
                                "Test the component in your editor"
                            ]
                        }
            except json.JSONDecodeError:
                pass
            
            # If direct parse fails, try to extract JSON object
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
                            return generate_component_fallback(description, component_type, style_preferences)
                        
                        return {
                            "result": component_structure,
                            "explanation": "Generated component structure using AI.",
                            "suggestions": [
                                "Review the generated structure",
                                "Adjust styles and properties as needed",
                                "Test the component in your editor"
                            ]
                        }
                except json.JSONDecodeError:
                    pass
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse LLM response as JSON: {e}")
            logger.debug(f"LLM response was: {llm_response[:500]}")
            pass
    
    # Fallback - always use fallback if LLM didn't return valid component
    logger.info(f"Using fallback component generation for: {description}")
    return generate_component_fallback(description, component_type, style_preferences)

def generate_component_fallback(description: str, component_type: Optional[str] = None,
                                style_preferences: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Fallback component generation.
    """
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
    Explain code using LLM.
    """
    system_prompt = f"""You are an expert {language} developer. Explain code clearly and concisely.
Focus on what the code does, how it works, and any important concepts."""

    prompt = f"""Explain this {language} code:

```{language}
{code}
```

Provide a clear explanation of what the code does, how it works, and any important concepts."""

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
    Fix bugs in code using LLM.
    """
    system_prompt = f"""You are an expert {language} developer and debugger. Fix bugs in code.
Return the fixed code with explanations of what was wrong and how you fixed it."""

    prompt = f"""Fix the bugs in this {language} code:

```{language}
{code}
```
"""
    if error_message:
        prompt += f"\nError message: {error_message}\n"
    prompt += "\nReturn the fixed code and explain what was wrong and how you fixed it."

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
                           style_preferences: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Generate a full page structure using LLM.
    """
    system_prompt = """You are an expert web developer. Generate complete page structures in JSON format.
Return a JSON object representing a page with multiple components arranged in a logical structure.
Include headers, content sections, and footers as appropriate."""

    prompt = f"""Generate a complete page structure for: {description}
"""
    if page_type:
        prompt += f"Page type: {page_type}\n"
    if style_preferences:
        prompt += f"Style preferences: {json.dumps(style_preferences, indent=2)}\n"
    prompt += "\nReturn a JSON structure with an array of components that make up the page."

    llm_response = call_llm_api(prompt, system_prompt)
    
    if llm_response:
        try:
            json_match = re.search(r'\[.*\]|\{.*\}', llm_response, re.DOTALL)
            if json_match:
                page_structure = json.loads(json_match.group())
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
    
    # Fallback
    return generate_page_fallback(description, page_type, style_preferences)

def generate_page_fallback(description: str, page_type: Optional[str] = None,
                           style_preferences: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Fallback page generation.
    """
    page_structure = [
        {
            "type": "header",
            "props": {
                "style": {
                    "padding": "20px",
                    "backgroundColor": "#667eea",
                    "color": "white"
                },
                "children": "Page Header"
            }
        },
        {
            "type": "div",
            "props": {
                "style": {
                    "padding": "40px",
                    "minHeight": "400px"
                },
                "children": description
            }
        },
        {
            "type": "footer",
            "props": {
                "style": {
                    "padding": "20px",
                    "backgroundColor": "#f5f5f5",
                    "textAlign": "center"
                },
                "children": "Page Footer"
            }
        }
    ]
    
    return {
        "result": page_structure,
        "explanation": "Generated basic page structure.",
        "suggestions": [
            "Add more components to the page",
            "Customize styling and layout",
            "Add interactive elements"
        ]
    }

@router.post("/generate-code", response_model=AIResponse)
async def generate_code(
    request: CodeGenerationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Generate code based on natural language description."""
    try:
        result = generate_code_with_llm(
            request.description,
            request.component_type,
            request.language,
            request.context
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
    """Generate React component structure based on description."""
    try:
        result = generate_component_with_llm(
            request.description,
            request.component_type,
            request.style_preferences,
            request.existing_components
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
    """Generate a complete page structure based on description."""
    try:
        result = generate_page_with_llm(
            request.description,
            request.page_type,
            request.style_preferences
        )
        return AIResponse(**result)
    except Exception as e:
        logger.error(f"Error generating page: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating page: {str(e)}"
        )

