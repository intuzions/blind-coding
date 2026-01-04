# AI Development Assistant Setup Guide

This guide explains how to set up and use the LLM-integrated AI Development Assistant feature in the No-Code Platform.

## Features

The AI Development Assistant provides the following capabilities:

1. **Generate Code** - Generate code snippets in various languages (JavaScript, TypeScript, Python, etc.)
2. **Generate Components** - Create React component structures from natural language descriptions
3. **Generate Pages** - Build complete page structures with multiple components
4. **Explain Code** - Get explanations of how code works
5. **Fix Bugs** - Automatically fix bugs in your code

## Backend Setup

### 1. Install Required Dependencies

The backend requires LLM libraries. Install them using:

```bash
cd backend
pip install openai>=1.0.0 anthropic>=0.18.0
```

Or add them to your `requirements.txt` (already included):
```
openai>=1.0.0
anthropic>=0.18.0
```

### 2. Configure API Keys

Add your LLM API keys to the backend `.env` file:

**For OpenAI:**
```env
OPENAI_API_KEY=your_openai_api_key_here
```

**For Anthropic (Claude):**
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

You can use either provider, or both. The system will try OpenAI first, then Anthropic if OpenAI is not available.

### 3. API Endpoints

The following endpoints are available:

- `POST /api/ai-dev/generate-code` - Generate code from description
- `POST /api/ai-dev/generate-component` - Generate React component structure
- `POST /api/ai-dev/generate-page` - Generate complete page structure
- `POST /api/ai-dev/explain-code` - Explain code functionality
- `POST /api/ai-dev/fix-bug` - Fix bugs in code

All endpoints require authentication (JWT token).

## Frontend Usage

### Accessing the AI Assistant

1. Open any project in the editor
2. Click the **"AI Assistant"** button in the navbar (⚡ icon)
3. The AI Development Assistant modal will open

### Using Different Modes

#### 1. Generate Component
- Select "Generate Component" tab
- Describe the component you want (e.g., "Create a modern card component with shadow")
- Click "Generate"
- Click "Add to Canvas" to add the generated component to your project

#### 2. Generate Code
- Select "Generate Code" tab
- Describe the code you need (e.g., "Create a React button component with hover effects")
- Click "Generate"
- Copy the generated code to use in your project

#### 3. Generate Page
- Select "Generate Page" tab
- Describe the page you want (e.g., "Create a landing page with hero section and features")
- Click "Generate"
- Click "Add to Canvas" to add all page components

#### 4. Explain Code
- Select "Explain Code" tab
- Paste the code you want explained
- Click "Generate"
- Read the explanation provided

#### 5. Fix Bugs
- Select "Fix Bugs" tab
- Paste the code with bugs or describe the issue
- Optionally include error messages
- Click "Generate"
- Review the fixed code

## How It Works

### LLM Integration

The system uses a flexible LLM integration that supports:

1. **OpenAI GPT-4/GPT-3.5** - Primary LLM provider
2. **Anthropic Claude** - Alternative LLM provider
3. **Fallback Pattern Matching** - If no LLM is configured, uses pattern-based generation

### Component Generation

When generating components:
- The LLM receives your description and context
- It generates a JSON structure matching the ComponentNode format
- The structure is converted and added to your canvas
- All style properties and nested components are preserved

### Code Generation

When generating code:
- The LLM receives your description and language preference
- It generates production-ready code with proper imports/exports
- Code is formatted and ready to use

## Fallback Behavior

If no LLM API keys are configured:
- The system will use pattern-based fallback generation
- Basic templates will be provided for common component types
- A notification will be shown indicating LLM is not configured

## Best Practices

1. **Be Specific** - Provide detailed descriptions for better results
2. **Include Context** - Mention existing components or styles when relevant
3. **Review Generated Code** - Always review and test generated code before using
4. **Iterate** - Use multiple prompts to refine your components
5. **Combine with Manual Editing** - Use AI generation as a starting point, then customize

## Troubleshooting

### "LLM not configured" message
- Ensure API keys are set in the backend `.env` file
- Restart the backend server after adding API keys
- Check that the required libraries are installed

### Components not appearing on canvas
- Check browser console for errors
- Ensure the component structure is valid JSON
- Try generating a simpler component first

### API errors
- Verify your API keys are correct
- Check your API quota/limits
- Ensure you have internet connectivity

## Security Notes

- API keys are stored server-side only
- All requests require authentication
- Generated code is not executed automatically
- Always review generated code before using in production

## Future Enhancements

Potential future features:
- Support for more LLM providers (Google Gemini, etc.)
- Code completion and suggestions
- Automated testing generation
- Documentation generation
- Performance optimization suggestions




