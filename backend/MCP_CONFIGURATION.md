# MCP Server Configuration

The MCP (Model Context Protocol) Server enables querying multiple Ollama models simultaneously and using consensus to get the most accurate results.

## Features

- **Multi-Model Consensus**: Query multiple models in parallel and select the best result
- **Multiple Strategies**: Choose from consensus, majority, best, or fastest strategies
- **Automatic Fallback**: Falls back to single model if MCP fails
- **Parallel Execution**: Models are queried in parallel for faster responses

## Configuration

### Environment Variables

Add these to your `.env` file or environment:

```bash
# Enable/disable MCP server (default: true)
MCP_ENABLED=true

# Consensus strategy: consensus, majority, best, fastest (default: consensus)
MCP_STRATEGY=consensus

# Comma-separated list of models to use (optional, uses defaults if not set)
MCP_MODELS=deepseek-coder:6.7b,qwen2.5-coder:7b,mistral:7b

# Maximum number of parallel workers (default: 5)
MCP_MAX_WORKERS=5

# Ollama URL (default: http://localhost:11434)
OLLAMA_URL=http://localhost:11434

# Timeout for individual model calls (default: 120 seconds)
OLLAMA_TIMEOUT=120
```

## Consensus Strategies

### 1. Consensus (Default)
Finds the response that is most similar to others. Best for accuracy.
- Compares JSON structure for code/JSON responses
- Uses text similarity for other responses
- Returns the response with highest consensus score

### 2. Majority
Groups similar responses and returns the most common one.
- Similar to consensus but focuses on grouping

### 3. Best
Uses models in order of quality preference.
- Prefers models in the order: deepseek-coder:6.7b > qwen2.5-coder:7b > mistral:7b > etc.
- Fastest strategy as it returns the first successful response from preferred models

### 4. Fastest
Returns the response from the fastest model.
- Best for speed when you need quick responses
- May sacrifice accuracy for speed

## Default Models

The system uses these models by default (in order of preference):

1. `deepseek-coder:6.7b` - Best for code understanding
2. `qwen2.5-coder:7b` - Excellent for UI/UX
3. `mistral:7b` - Fast and reliable
4. `codellama:13b` - Good balance
5. `llama3:8b` - General purpose

Only models that are available in your Ollama installation will be used.

## Installation

Make sure you have the required models installed:

```bash
ollama pull deepseek-coder:6.7b
ollama pull qwen2.5-coder:7b
ollama pull mistral:7b
ollama pull codellama:13b
ollama pull llama3:8b
```

## Usage

The MCP server is automatically used when `MCP_ENABLED=true`. All AI assistant endpoints will use multi-model consensus:

- `/api/ai/process-prompt` - Component style modifications
- `/api/ai/process-action` - Action message processing
- `/api/ai/debug-fix` - Error debugging and fixing
- `/api/ai-development/*` - Code generation endpoints

## How It Works

1. **Model Selection**: System checks which configured models are available
2. **Parallel Queries**: All available models are queried simultaneously
3. **Response Collection**: All responses are collected (successful and failed)
4. **Consensus Calculation**: Selected strategy is applied to find the best result
5. **Result Return**: Best result is returned with metadata (model used, consensus score, etc.)

## Monitoring

The system logs detailed information about MCP operations:

```
MCP consensus: 3/5 models succeeded, strategy: consensus, score: 0.85, model: deepseek-coder:6.7b, time: 12.34s
```

This shows:
- How many models succeeded out of total
- Which strategy was used
- Consensus score (0-1, higher is better)
- Which model's response was selected
- Total time taken

## Troubleshooting

### No models available
If you see "No models available", make sure:
1. Ollama is running: `ollama serve`
2. Models are installed: `ollama list`
3. Models match the configured names exactly

### MCP falling back to single model
If MCP fails, it automatically falls back to single model mode. Check logs for:
- Connection errors
- Timeout issues
- Model availability

### Slow responses
- Reduce number of models in `MCP_MODELS`
- Use `fastest` strategy for speed
- Increase `OLLAMA_TIMEOUT` if models are timing out
- Reduce `MCP_MAX_WORKERS` if system is overloaded

## Performance

- **Parallel Execution**: All models queried simultaneously (not sequential)
- **Timeout Handling**: Individual model timeouts don't block others
- **Error Resilience**: Failed models don't prevent consensus from working
- **Resource Usage**: Uses thread pool executor for efficient parallel processing

