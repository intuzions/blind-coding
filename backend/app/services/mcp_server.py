"""
MCP (Model Context Protocol) Server for Multiple Ollama Models
This service queries multiple Ollama models and uses consensus to get the most accurate result.
"""

import os
import json
import re
import requests
import logging
from typing import List, Dict, Optional, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

logger = logging.getLogger(__name__)


class MCPServer:
    """
    MCP Server that manages multiple Ollama models and provides consensus-based responses.
    """
    
    def __init__(self, ollama_url: str = None):
        from app.services.settings_loader import get_ollama_url, get_ollama_timeout, get_setting_int, get_setting
        self.ollama_url = ollama_url or get_ollama_url()
        self.default_models = self._get_default_models()
        self.timeout = get_ollama_timeout()
        self.max_workers = get_setting_int("MCP_MAX_WORKERS", 5)
    
    def _get_default_models(self) -> List[str]:
        """
        Get default list of models to use for consensus.
        Can be configured via MCP_MODELS setting in database (comma-separated).
        """
        from app.services.settings_loader import get_setting
        env_models = get_setting("MCP_MODELS", "")
        if env_models:
            return [m.strip() for m in env_models.split(",") if m.strip()]
        
        # Default models in order of preference
        return [
            "deepseek-coder:6.7b",  # Best for code understanding
            "qwen2.5-coder:7b",     # Excellent for UI/UX
            "mistral:7b",            # Fast and reliable
            "codellama:13b",         # Good balance
            "llama3:8b"              # General purpose
        ]
    
    def get_available_models(self) -> List[str]:
        """
        Get list of available Ollama models from the server.
        """
        try:
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                models = [model.get("name", "") for model in data.get("models", [])]
                return models
        except Exception as e:
            logger.warning(f"Could not fetch Ollama models: {e}")
        return []
    
    def get_active_models(self) -> List[str]:
        """
        Get list of models that are both configured and available.
        """
        available = self.get_available_models()
        active = [model for model in self.default_models if model in available]
        
        if not active:
            logger.warning(f"No configured models are available. Available models: {available}")
            # Fallback to first available model if any
            if available:
                active = [available[0]]
        
        return active
    
    def call_single_model(
        self, 
        prompt: str, 
        system_prompt: Optional[str] = None, 
        model: str = "deepseek-coder",
        timeout: Optional[int] = None
    ) -> Tuple[str, Optional[str], float]:
        """
        Call a single Ollama model and return the response.
        
        Returns:
            Tuple of (model_name, response, response_time)
        """
        if timeout is None:
            timeout = self.timeout
        
        start_time = time.time()
        
        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "top_k": 40,
                    "repeat_penalty": 1.1
                }
            }
            
            if system_prompt:
                payload["system"] = system_prompt
            
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
                timeout=timeout
            )
            
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                result = data.get("response", "")
                return (model, result, response_time)
            else:
                logger.error(f"Ollama API error for {model}: {response.status_code} - {response.text}")
                return (model, None, response_time)
                
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout calling model {model} (>{timeout}s)")
            return (model, None, time.time() - start_time)
        except Exception as e:
            logger.error(f"Error calling model {model}: {e}")
            return (model, None, time.time() - start_time)
    
    def call_multiple_models(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        models: Optional[List[str]] = None,
        strategy: str = "consensus"
    ) -> Dict[str, Any]:
        """
        Call multiple Ollama models in parallel and return consensus result.
        
        Args:
            prompt: User prompt
            system_prompt: System prompt
            models: List of models to use (default: active models)
            strategy: Consensus strategy - "consensus", "majority", "best", "fastest"
        
        Returns:
            Dictionary with:
            - result: The selected best result
            - all_results: All model responses
            - consensus_score: Confidence score
            - strategy_used: Which strategy was used
            - response_time: Total time taken
        """
        if models is None:
            models = self.get_active_models()
        
        if not models:
            return {
                "result": None,
                "all_results": {},
                "consensus_score": 0.0,
                "strategy_used": "none",
                "response_time": 0.0,
                "error": "No models available"
            }
        
        start_time = time.time()
        
        # Call all models in parallel
        results = {}
        with ThreadPoolExecutor(max_workers=min(len(models), self.max_workers)) as executor:
            futures = {
                executor.submit(self.call_single_model, prompt, system_prompt, model): model
                for model in models
            }
            
            for future in as_completed(futures):
                model = futures[future]
                try:
                    model_name, response, response_time = future.result()
                    if response:
                        results[model_name] = {
                            "response": response,
                            "response_time": response_time,
                            "success": True
                        }
                    else:
                        results[model_name] = {
                            "response": None,
                            "response_time": response_time,
                            "success": False
                        }
                except Exception as e:
                    logger.error(f"Error getting result from {model}: {e}")
                    results[model] = {
                        "response": None,
                        "response_time": 0.0,
                        "success": False,
                        "error": str(e)
                    }
        
        total_time = time.time() - start_time
        
        # Filter successful results
        successful_results = {
            k: v for k, v in results.items() 
            if v.get("success") and v.get("response")
        }
        
        if not successful_results:
            return {
                "result": None,
                "all_results": results,
                "consensus_score": 0.0,
                "strategy_used": strategy,
                "response_time": total_time,
                "error": "All models failed"
            }
        
        # Apply consensus strategy
        if strategy == "consensus":
            best_result = self._consensus_strategy(successful_results)
        elif strategy == "majority":
            best_result = self._majority_strategy(successful_results)
        elif strategy == "best":
            best_result = self._best_strategy(successful_results)
        elif strategy == "fastest":
            best_result = self._fastest_strategy(successful_results)
        else:
            # Default to consensus
            best_result = self._consensus_strategy(successful_results)
        
        return {
            "result": best_result["response"],
            "model_used": best_result["model"],
            "all_results": results,
            "consensus_score": best_result.get("score", 0.0),
            "strategy_used": strategy,
            "response_time": total_time,
            "successful_models": len(successful_results),
            "total_models": len(models)
        }
    
    def _consensus_strategy(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """
        Consensus strategy: Find the response that is most similar to others.
        Uses JSON structure similarity for code/JSON responses, text similarity for others.
        """
        if len(results) == 1:
            model, data = next(iter(results.items()))
            return {
                "model": model,
                "response": data["response"],
                "score": 1.0
            }
        
        # Try to parse as JSON for structured responses
        parsed_responses = {}
        for model, data in results.items():
            response = data["response"]
            try:
                # Try to extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', response, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    parsed_responses[model] = {"type": "json", "data": parsed, "original": response}
                else:
                    parsed_responses[model] = {"type": "text", "data": response, "original": response}
            except:
                parsed_responses[model] = {"type": "text", "data": response, "original": response}
        
        # Calculate similarity scores
        scores = {}
        for model1, data1 in parsed_responses.items():
            similarity_sum = 0.0
            count = 0
            
            for model2, data2 in parsed_responses.items():
                if model1 != model2:
                    similarity = self._calculate_similarity(data1, data2)
                    similarity_sum += similarity
                    count += 1
            
            avg_similarity = similarity_sum / count if count > 0 else 0.0
            scores[model1] = avg_similarity
        
        # Return model with highest consensus score
        best_model = max(scores.items(), key=lambda x: x[1])[0]
        return {
            "model": best_model,
            "response": results[best_model]["response"],
            "score": scores[best_model]
        }
    
    def _majority_strategy(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """
        Majority strategy: Group similar responses and return the most common one.
        """
        # For now, use consensus as majority is similar
        return self._consensus_strategy(results)
    
    def _best_strategy(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """
        Best strategy: Prefer models in order of quality (first in default_models list).
        """
        for model in self.default_models:
            if model in results:
                return {
                    "model": model,
                    "response": results[model]["response"],
                    "score": 1.0
                }
        
        # Fallback to first available
        model, data = next(iter(results.items()))
        return {
            "model": model,
            "response": data["response"],
            "score": 0.8
        }
    
    def _fastest_strategy(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """
        Fastest strategy: Return the response from the fastest model.
        """
        fastest_model = min(
            results.items(),
            key=lambda x: x[1].get("response_time", float('inf'))
        )[0]
        
        return {
            "model": fastest_model,
            "response": results[fastest_model]["response"],
            "score": 1.0
        }
    
    def _calculate_similarity(self, data1: Dict, data2: Dict) -> float:
        """
        Calculate similarity between two responses.
        """
        if data1["type"] == "json" and data2["type"] == "json":
            # JSON similarity: compare keys and structure
            keys1 = set(data1["data"].keys())
            keys2 = set(data2["data"].keys())
            
            if not keys1 and not keys2:
                return 1.0
            if not keys1 or not keys2:
                return 0.0
            
            common_keys = keys1.intersection(keys2)
            total_keys = keys1.union(keys2)
            
            key_similarity = len(common_keys) / len(total_keys) if total_keys else 0.0
            
            # Value similarity for common keys
            value_similarity = 0.0
            if common_keys:
                similar_values = 0
                for key in common_keys:
                    val1 = str(data1["data"][key])
                    val2 = str(data2["data"][key])
                    if val1 == val2:
                        similar_values += 1
                    elif val1 and val2:
                        # Simple string similarity
                        similarity = len(set(val1.split()) & set(val2.split())) / max(len(val1.split()), len(val2.split()), 1)
                        similar_values += similarity
                
                value_similarity = similar_values / len(common_keys)
            
            return (key_similarity + value_similarity) / 2
        
        else:
            # Text similarity: simple word overlap
            text1 = str(data1["data"]).lower()
            text2 = str(data2["data"]).lower()
            
            words1 = set(text1.split())
            words2 = set(text2.split())
            
            if not words1 and not words2:
                return 1.0
            if not words1 or not words2:
                return 0.0
            
            common = words1.intersection(words2)
            total = words1.union(words2)
            
            return len(common) / len(total) if total else 0.0


# Global MCP server instance
_mcp_server = None

def get_mcp_server() -> MCPServer:
    """Get or create the global MCP server instance."""
    global _mcp_server
    if _mcp_server is None:
        _mcp_server = MCPServer()
    return _mcp_server


def call_mcp_models(
    prompt: str,
    system_prompt: Optional[str] = None,
    models: Optional[List[str]] = None,
    strategy: str = "consensus"
) -> Optional[str]:
    """
    Convenience function to call MCP server with multiple models.
    
    Args:
        prompt: User prompt
        system_prompt: System prompt
        models: List of models to use (default: active models)
        strategy: Consensus strategy
    
    Returns:
        The best response from the models, or None if all failed
    """
    mcp = get_mcp_server()
    result = mcp.call_multiple_models(prompt, system_prompt, models, strategy)
    
    if result.get("result"):
        logger.info(
            f"MCP consensus: {result['successful_models']}/{result['total_models']} models succeeded, "
            f"strategy: {result['strategy_used']}, score: {result['consensus_score']:.2f}, "
            f"model: {result['model_used']}, time: {result['response_time']:.2f}s"
        )
        return result["result"]
    else:
        logger.warning(f"MCP consensus failed: {result.get('error', 'Unknown error')}")
        return None

