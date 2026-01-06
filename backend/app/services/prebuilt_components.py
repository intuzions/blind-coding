"""
Service to match user requests with prebuilt components.
If a prebuilt component matches the request, return it instead of using AI.
"""
from typing import Optional, Dict, Any, List
import re
import logging

logger = logging.getLogger(__name__)

# Prebuilt component definitions with keywords for matching
PREBUILT_COMPONENTS = {
    # Charts
    "line-chart": {
        "keywords": ["line chart", "line graph", "line", "chart", "graph"],
        "type": "div",
        "defaultProps": {
            "className": "chart-container",
            "data-chart-type": "line",
            "data-chart-data": '{"labels":["Jan","Feb","Mar","Apr","May","Jun"],"datasets":[{"label":"Sales","data":[10,20,15,25,30,28]},{"label":"Revenue","data":[5,15,10,20,25,22]}]}',
            "style": {
                "width": "500px",
                "height": "300px",
                "backgroundColor": "#ffffff",
                "border": "1px solid #e0e0e0",
                "borderRadius": "4px",
                "padding": "10px"
            }
        }
    },
    "bar-chart": {
        "keywords": ["bar chart", "bar graph", "bar"],
        "type": "div",
        "defaultProps": {
            "className": "chart-container",
            "data-chart-type": "bar",
            "data-chart-data": '{"labels":["Jan","Feb","Mar","Apr","May","Jun"],"datasets":[{"label":"Sales","data":[10,20,15,25,30,28]},{"label":"Revenue","data":[5,15,10,20,25,22]}]}',
            "style": {
                "width": "500px",
                "height": "300px",
                "backgroundColor": "#ffffff",
                "border": "1px solid #e0e0e0",
                "borderRadius": "4px",
                "padding": "10px"
            }
        }
    },
    "pie-chart": {
        "keywords": ["pie chart", "pie"],
        "type": "div",
        "defaultProps": {
            "className": "chart-container",
            "data-chart-type": "pie",
            "data-chart-data": '{"labels":["Desktop","Mobile","Tablet","Other"],"datasets":[{"label":"Users","data":[45,30,15,10]}]}',
            "style": {
                "width": "400px",
                "height": "400px",
                "backgroundColor": "#ffffff",
                "border": "1px solid #e0e0e0",
                "borderRadius": "4px",
                "padding": "10px"
            }
        }
    },
    # Cards
    "user-card": {
        "keywords": ["user card", "user", "card"],
        "type": "div",
        "defaultProps": {
            "className": "card-container",
            "style": {
                "background": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                "color": "white",
                "padding": "24px",
                "borderRadius": "12px",
                "boxShadow": "0 4px 12px rgba(102, 126, 234, 0.3)",
                "display": "flex",
                "flexDirection": "column",
                "alignItems": "center",
                "gap": "12px",
                "minWidth": "250px",
                "minHeight": "180px"
            },
            "children": [
                {
                    "type": "div",
                    "props": {
                        "style": {"fontSize": "32px", "marginBottom": "8px"},
                        "children": "👤"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {"fontSize": "28px", "fontWeight": "bold", "textAlign": "center"},
                        "children": "1,234"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {"fontSize": "14px", "opacity": "0.9", "textAlign": "center"},
                        "children": "Total Users"
                    }
                }
            ]
        }
    },
    "stats-card": {
        "keywords": ["stats card", "statistics card", "stat card"],
        "type": "div",
        "defaultProps": {
            "className": "card-container",
            "style": {
                "background": "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
                "color": "white",
                "padding": "24px",
                "borderRadius": "12px",
                "boxShadow": "0 4px 12px rgba(67, 233, 123, 0.3)",
                "display": "flex",
                "flexDirection": "column",
                "alignItems": "center",
                "gap": "12px",
                "minWidth": "250px",
                "minHeight": "180px"
            },
            "children": [
                {
                    "type": "div",
                    "props": {
                        "style": {"fontSize": "32px", "marginBottom": "8px"},
                        "children": "📈"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {"fontSize": "28px", "fontWeight": "bold", "textAlign": "center"},
                        "children": "+12.5%"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {"fontSize": "14px", "opacity": "0.9", "textAlign": "center"},
                        "children": "Growth Rate"
                    }
                }
            ]
        }
    },
    # Buttons
    "primary-button": {
        "keywords": ["button", "primary button", "btn"],
        "type": "button",
        "defaultProps": {
            "style": {
                "padding": "12px 24px",
                "backgroundColor": "#667eea",
                "color": "white",
                "border": "none",
                "borderRadius": "8px",
                "cursor": "pointer",
                "fontSize": "1rem",
                "fontWeight": "600"
            },
            "children": "Click Me"
        }
    },
    # Forms
    "login-form": {
        "keywords": ["login", "login form", "sign in", "signin"],
        "type": "form",
        "defaultProps": {
            "style": {
                "display": "flex",
                "flexDirection": "column",
                "gap": "1rem",
                "padding": "2rem",
                "border": "1px solid #e0e0e0",
                "borderRadius": "12px",
                "backgroundColor": "#ffffff",
                "maxWidth": "400px",
                "width": "100%"
            },
            "children": [
                {
                    "type": "h2",
                    "props": {
                        "style": {"margin": "0 0 1rem 0", "fontSize": "1.75rem", "fontWeight": "700", "color": "#333", "textAlign": "center"},
                        "children": "Login"
                    }
                },
                {
                    "type": "input",
                    "props": {
                        "type": "email",
                        "placeholder": "Email",
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
                },
                {
                    "type": "input",
                    "props": {
                        "type": "password",
                        "placeholder": "Password",
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
                },
                {
                    "type": "button",
                    "props": {
                        "type": "submit",
                        "style": {
                            "padding": "0.75rem",
                            "backgroundColor": "#667eea",
                            "color": "white",
                            "border": "none",
                            "borderRadius": "6px",
                            "fontSize": "1rem",
                            "fontWeight": "600",
                            "cursor": "pointer"
                        },
                        "children": "Login"
                    }
                }
            ]
        }
    },
    "signup-form": {
        "keywords": ["signup", "sign up", "sign-up", "registration", "register", "registration form"],
        "type": "form",
        "defaultProps": {
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
            "method": "post",
            "children": [
                {
                    "type": "h2",
                    "props": {
                        "style": {"margin": "0 0 1rem 0", "fontSize": "1.75rem", "fontWeight": "700", "color": "#333", "textAlign": "center"},
                        "children": "Sign Up"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {"display": "flex", "flexDirection": "column", "gap": "0.5rem"},
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {"fontSize": "0.9rem", "fontWeight": "600", "color": "#555"},
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
                        "style": {"display": "flex", "flexDirection": "column", "gap": "0.5rem"},
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {"fontSize": "0.9rem", "fontWeight": "600", "color": "#555"},
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
                        "style": {"display": "flex", "flexDirection": "column", "gap": "0.5rem"},
                        "children": [
                            {
                                "type": "label",
                                "props": {
                                    "style": {"fontSize": "0.9rem", "fontWeight": "600", "color": "#555"},
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
                            "padding": "0.75rem",
                            "backgroundColor": "#667eea",
                            "color": "white",
                            "border": "none",
                            "borderRadius": "6px",
                            "fontSize": "1rem",
                            "fontWeight": "600",
                            "cursor": "pointer",
                            "width": "100%"
                        },
                        "children": "Sign Up"
                    }
                }
            ]
        }
    },
    # Navbar
    "navbar": {
        "keywords": ["navbar", "navigation", "nav", "menu", "header"],
        "type": "nav",
        "defaultProps": {
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
                        "style": {"fontSize": "1.5rem", "fontWeight": "700"},
                        "children": "Logo"
                    }
                },
                {
                    "type": "div",
                    "props": {
                        "style": {"display": "flex", "gap": "1.5rem"},
                        "children": [
                            {
                                "type": "a",
                                "props": {
                                    "href": "#",
                                    "style": {"color": "white", "textDecoration": "none"},
                                    "children": "Home"
                                }
                            },
                            {
                                "type": "a",
                                "props": {
                                    "href": "#",
                                    "style": {"color": "white", "textDecoration": "none"},
                                    "children": "About"
                                }
                            },
                            {
                                "type": "a",
                                "props": {
                                    "href": "#",
                                    "style": {"color": "white", "textDecoration": "none"},
                                    "children": "Contact"
                                }
                            }
                        ]
                    }
                }
            ]
        }
    }
}

def find_matching_prebuilt_component(description: str, component_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Find a prebuilt component that matches the user's request.
    
    Args:
        description: User's description of the component they want
        component_type: Optional explicit component type
        
    Returns:
        Matching prebuilt component structure or None if no match found
    """
    if not description:
        return None
    
    lower_desc = description.lower().strip()
    
    # If component_type is provided, prioritize exact matches
    if component_type:
        component_type_lower = component_type.lower()
        for comp_id, comp_data in PREBUILT_COMPONENTS.items():
            if component_type_lower in comp_id or comp_id in component_type_lower:
                # Check if description also matches keywords
                keywords = comp_data.get("keywords", [])
                if any(keyword in lower_desc for keyword in keywords):
                    logger.info(f"Found prebuilt component match: {comp_id} (by type: {component_type})")
                    return {
                        "type": comp_data["type"],
                        "props": comp_data["defaultProps"]
                    }
    
    # Score each component based on keyword matches
    best_match = None
    best_score = 0
    
    for comp_id, comp_data in PREBUILT_COMPONENTS.items():
        keywords = comp_data.get("keywords", [])
        score = 0
        
        # Check for exact keyword matches
        for keyword in keywords:
            if keyword in lower_desc:
                # Longer keywords get higher scores
                score += len(keyword) * 2
                # Exact matches get bonus
                if keyword == lower_desc.strip():
                    score += 100
        
        # Check for partial matches
        for keyword in keywords:
            if any(word in lower_desc for word in keyword.split()):
                score += 1
        
        if score > best_score:
            best_score = score
            best_match = comp_id
    
    # Only return if we have a reasonable match (score > 0)
    if best_match and best_score > 0:
        comp_data = PREBUILT_COMPONENTS[best_match]
        logger.info(f"Found prebuilt component match: {best_match} (score: {best_score})")
        return {
            "type": comp_data["type"],
            "props": comp_data["defaultProps"]
        }
    
    logger.info(f"No prebuilt component match found for: {description}")
    return None


