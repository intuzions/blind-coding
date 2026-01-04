# Ollama AI Integration Setup Guide

This guide explains how to set up and use Ollama for AI prompts in the No-Code Platform.

## What is Ollama?

Ollama is a tool that allows you to run large language models (LLMs) locally on your machine. This provides:
- **Privacy**: All processing happens locally, no data sent to external APIs
- **Cost-effective**: No API costs
- **Fast**: No network latency
- **Offline**: Works without internet connection

## Installation

### 1. Install Ollama

Visit [https://ollama.ai](https://ollama.ai) and download Ollama for your operating system:
- **macOS**: Download the .dmg file
- **Linux**: Follow installation instructions
- **Windows**: Download the .exe installer

Or use the command line:

**macOS/Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from the website or use winget:
```bash
winget install Ollama.Ollama
```

### 2. Pull a Model

After installing Ollama, you need to download a model. Popular options:

```bash
# Llama 2 (7B parameters, good balance)
ollama pull llama2

# Llama 2 (13B parameters, better quality)
ollama pull llama2:13b

# Mistral (7B, fast and efficient)
ollama pull mistral

# Code Llama (optimized for code generation)
ollama pull codellama

# Llama 3 (latest, recommended)
ollama pull llama3
```

### 3. Start Ollama Server

Ollama runs as a local server. It should start automatically after installation. If not, start it manually:

```bash
ollama serve
```

The server runs on `http://localhost:11434` by default.

### 4. Verify Installation

Test that Ollama is working:

```bash
ollama run llama2 "Hello, how are you?"
```

Or test the API:

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama2",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

## Backend Configuration

### 1. Install Python Dependencies

The `requests` library is already included in `requirements.txt`. Install it:

```bash
cd backend
pip install requests
```

Or install all requirements:

```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Add these to your backend `.env` file:

```env
# Enable Ollama (set to "true" to use Ollama, "false" to use OpenAI/Anthropic)
USE_OLLAMA=true

# Ollama server URL (default: http://localhost:11434)
OLLAMA_URL=http://localhost:11434

# Ollama model to use (default: llama2)
# Options: llama2, llama2:13b, mistral, codellama, llama3, etc.
OLLAMA_MODEL=llama2
```

### 3. Priority Order

The system checks LLM providers in this order:
1. **Ollama** (if `USE_OLLAMA=true`)
2. **OpenAI** (if `OPENAI_API_KEY` is set)
3. **Anthropic** (if `ANTHROPIC_API_KEY` is set)
4. **Pattern-based fallback** (if no LLM is available)

## Usage

### AI Assistant (Component Styling)

The AI Assistant in the Properties Panel uses Ollama to process natural language prompts like:
- "change background to blue"
- "make padding 20px"
- "center the text"

### AI Development Assistant

The AI Development Assistant uses Ollama for:
- **Code Generation**: Generate code from descriptions
- **Component Generation**: Create React components from descriptions
- **Page Generation**: Build complete page structures
- **Code Explanation**: Explain how code works
- **Bug Fixing**: Fix bugs in code

## Testing

### Test the AI Assistant

1. Open a project in the editor
2. Select a component
3. Go to the Properties Panel
4. Click on the "AI" tab
5. Type a prompt like "make background blue"
6. Click "Send"

### Test the AI Development Assistant

1. Click the "AI Assistant" button in the navbar
2. Select a mode (e.g., "Generate Component")
3. Enter a description like "Create a modern card component"
4. Click "Generate"

## Troubleshooting

### Ollama Server Not Running

**Error**: Connection refused or timeout

**Solution**:
```bash
# Start Ollama server
ollama serve

# Or check if it's running
curl http://localhost:11434/api/tags
```

### Model Not Found

**Error**: Model not found

**Solution**:
```bash
# List available models
ollama list

# Pull the model you need
ollama pull llama2
```

### Slow Responses

**Issue**: Ollama is slow

**Solutions**:
1. Use a smaller model (e.g., `llama2` instead of `llama2:13b`)
2. Ensure you have enough RAM (models need 4-8GB+)
3. Use GPU acceleration if available (Ollama supports CUDA)

### Memory Issues

**Issue**: Out of memory errors

**Solutions**:
1. Use a smaller model
2. Close other applications
3. Increase system RAM
4. Use quantization (smaller model variants)

## Model Recommendations

### For Component Styling (AI Assistant)
- **llama2** or **llama3** (7B) - Good balance of speed and quality
- **mistral** - Fast and efficient

### For Code Generation (AI Development)
- **codellama** - Optimized for code
- **llama3** - General purpose, good for code
- **mistral** - Fast code generation

### For Best Quality
- **llama2:13b** or **llama3:70b** - Higher quality but slower
- Requires more RAM (8GB+ for 13B, 40GB+ for 70B)

## Advanced Configuration

### Custom Ollama URL

If Ollama is running on a different machine:

```env
OLLAMA_URL=http://192.168.1.100:11434
```

### Using Different Models for Different Tasks

You can modify the code to use different models for different tasks:

```python
# In ai_assistant.py
ollama_model = os.getenv("OLLAMA_MODEL_STYLING", "llama2")

# In ai_development.py
ollama_model = os.getenv("OLLAMA_MODEL_CODE", "codellama")
```

### Streaming Responses

Ollama supports streaming. To enable it, modify the `call_ollama` function:

```python
payload = {
    "model": ollama_model,
    "prompt": prompt,
    "stream": True  # Enable streaming
}
```

## Performance Tips

1. **Use GPU**: Ollama automatically uses GPU if available (CUDA, Metal, etc.)
2. **Quantized Models**: Use smaller quantized versions for faster inference
3. **Model Caching**: Ollama caches models in memory after first use
4. **Batch Requests**: Process multiple requests together when possible

## Security Notes

- Ollama runs locally, so all data stays on your machine
- No API keys needed
- No data sent to external services
- Perfect for sensitive projects

## Next Steps

1. Install Ollama
2. Pull a model (recommended: `llama2` or `llama3`)
3. Set `USE_OLLAMA=true` in backend `.env`
4. Restart the backend server
5. Test the AI features!

Enjoy using Ollama for AI-powered development! 🚀




