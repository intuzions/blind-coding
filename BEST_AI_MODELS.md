# Best AI Models for Code Generation

## Current Default: DeepSeek Coder 6.7B

The system now defaults to **DeepSeek Coder** which provides significantly better accuracy for code and component generation.

## Recommended Models (Best to Good)

### 1. DeepSeek Coder 6.7B (RECOMMENDED - DEFAULT) ⭐
```bash
ollama pull deepseek-coder:6.7b
```
- **Best accuracy** for code generation
- Excellent understanding of component structures
- Great for React, Vue, Angular components
- Good balance of quality and speed
- **Size**: ~4GB RAM

**Why it's best**: Specifically trained on code, understands JSON structures, component hierarchies, and modern frameworks.

### 2. Qwen2.5 Coder 7B
```bash
ollama pull qwen2.5-coder:7b
```
- Excellent code understanding
- Good for complex component generation
- Strong in multiple programming languages
- **Size**: ~4.5GB RAM

### 3. CodeLlama 13B
```bash
ollama pull codellama:13b
```
- Good quality code generation
- Well-tested and stable
- Good for component structures
- **Size**: ~7GB RAM

### 4. Mistral 7B
```bash
ollama pull mistral:7b
```
- Fast inference
- Good for simple to medium complexity
- General purpose, works well for code
- **Size**: ~4GB RAM

### 5. Llama 3 8B
```bash
ollama pull llama3:8b
```
- General purpose model
- Good for code when fine-tuned
- Fast and efficient
- **Size**: ~4.5GB RAM

## Installation & Setup

### Step 1: Install the Recommended Model

```bash
# Install DeepSeek Coder (RECOMMENDED)
ollama pull deepseek-coder:6.7b

# Or install Qwen2.5 Coder (Alternative)
ollama pull qwen2.5-coder:7b
```

### Step 2: Configure Backend

Add to your `backend/.env` file:

```env
# Use DeepSeek Coder (RECOMMENDED)
OLLAMA_MODEL=deepseek-coder:6.7b

# Or use Qwen2.5 Coder
# OLLAMA_MODEL=qwen2.5-coder:7b

# Or use CodeLlama 13B (if you have more RAM)
# OLLAMA_MODEL=codellama:13b
```

### Step 3: Restart Backend

```bash
cd backend
# Restart your FastAPI server
uvicorn app.main:app --reload
```

## Model Comparison

| Model | Accuracy | Speed | RAM | Best For |
|-------|----------|-------|-----|----------|
| **deepseek-coder:6.7b** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 4GB | Code generation, components |
| **qwen2.5-coder:7b** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 4.5GB | Complex code, multi-language |
| **codellama:13b** | ⭐⭐⭐⭐ | ⭐⭐⭐ | 7GB | Stable, well-tested |
| **mistral:7b** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 4GB | Fast, simple tasks |
| **llama3:8b** | ⭐⭐⭐ | ⭐⭐⭐⭐ | 4.5GB | General purpose |

## Why DeepSeek Coder is Better

1. **Code-Specific Training**: Trained specifically on code, not general text
2. **JSON Understanding**: Better at generating valid JSON component structures
3. **Framework Awareness**: Understands React, Vue, Angular patterns
4. **Component Hierarchy**: Better at understanding parent-child relationships
5. **Style Application**: More accurate CSS and style modifications

## Testing the Model

After installing, test with:

```bash
# Test DeepSeek Coder
ollama run deepseek-coder:6.7b "Create a React signup form component in JSON format with email and password fields"
```

## Troubleshooting

### Model Not Found
```bash
# List available models
ollama list

# Pull the model
ollama pull deepseek-coder:6.7b
```

### Out of Memory
- Use a smaller model: `mistral:7b` or `llama3:8b`
- Close other applications
- Use quantization: `deepseek-coder:1.3b` (if available)

### Slow Performance
- Use GPU acceleration (Ollama auto-detects CUDA/Metal)
- Use smaller models for faster inference
- Ensure enough RAM (models need 4-8GB+)

## Advanced: Using Different Models for Different Tasks

You can use different models for different purposes by modifying the code:

```python
# For component generation (needs accuracy)
OLLAMA_MODEL=deepseek-coder:6.7b

# For style modifications (needs speed)
OLLAMA_MODEL_STYLING=mistral:7b
```

## Performance Tips

1. **First Request**: May be slower as model loads into memory
2. **Subsequent Requests**: Much faster (model cached in RAM)
3. **GPU Acceleration**: Automatically used if available
4. **Batch Processing**: Process multiple components together when possible

## Expected Improvements

With DeepSeek Coder, you should see:
- ✅ More accurate component generation
- ✅ Better JSON structure understanding
- ✅ Correct component hierarchies
- ✅ Proper style application
- ✅ Fewer errors and retries
- ✅ Better understanding of user intent

## Migration from CodeLlama

If you're currently using CodeLlama:

1. Install DeepSeek Coder: `ollama pull deepseek-coder:6.7b`
2. Update `.env`: `OLLAMA_MODEL=deepseek-coder:6.7b`
3. Restart backend
4. Test with a component generation request

The system will automatically use the new model!

## Need Help?

If you're still getting poor results:
1. Make sure the model is installed: `ollama list`
2. Check model is being used: Check backend logs
3. Try a different model from the list above
4. Ensure you have enough RAM (4GB+ recommended)


