#!/usr/bin/env python3
"""
Hermes Agent API Client - Seoul Tour Map Integration
Supports fallback to Ollama Cloud API when Hermes Agent is unavailable.
"""

import os
import json
import urllib.request
import urllib.error
import ssl
from datetime import datetime

# Configuration
HERMES_AGENT_API_KEY = os.getenv('HERMES_AGENT_API_KEY', '')
HERMES_AGENT_API_URL = os.getenv('HERMES_AGENT_API_URL', 'https://api-hermes.apihubs.dev/v1')
OLLAMA_API_BASE = os.getenv('OLLAMA_API_BASE', 'https://ollama.com/v1')
OLLAMA_API_KEY = os.getenv('OLLAMA_API_KEY', '')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'gemma4:31b-cloud')

# SSL context for environments with cert issues
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

class HermesAgentClient:
    """Client for interacting with Hermes Agent API with fallback support."""
    
    def __init__(self, api_key=None, api_url=None):
        self.api_key = api_key or HERMES_AGENT_API_KEY
        self.api_url = api_url or HERMES_AGENT_API_URL
        self.use_hermes = bool(self.api_key)
        self.last_error = None
        
    def _create_opener(self):
        """Create urllib opener with SSL context."""
        return urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl_context)
        )
    
    def _should_use_hermes(self, message):
        """
        Determine if query should use Hermes Agent API.
        Complex queries (multi-step, tool-needed, reasoning) -> Hermes
        Simple queries -> Ollama direct
        """
        complex_keywords = [
            'search', 'find', 'look up', '查', '搜尋', '找',
            'compare', '比較', '對比',
            'plan', '行程', '規劃', 'planning',
            'tool', '工具', '使用',
            'multiple', '幾個', '多個',
            'step by step', '逐步', 'steps',
        ]
        
        message_lower = message.lower()
        is_complex = any(kw in message_lower for kw in complex_keywords)
        
        # Use Hermes if API key exists AND query is complex
        return self.use_hermes and is_complex
    
    def call_hermes_agent(self, system_prompt, messages, tools=None):
        """
        Call Hermes Agent API.
        Returns (success: bool, response: str, source: str)
        """
        if not self.api_key:
            return False, "No API key configured", "error"
        
        endpoint = f"{self.api_url}/chat/completions"
        
        payload = {
            "model": "hermes-agent",
            "messages": messages,
            "stream": False
        }
        
        if tools:
            payload["tools"] = tools
        
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}',
                'User-Agent': 'HermesWorker/1.0',
                'Accept': 'application/json'
            }
        )
        
        try:
            opener = self._create_opener()
            with opener.open(req, timeout=60) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                return True, content, "hermes_agent"
                
        except urllib.error.HTTPError as e:
            error_msg = f"Hermes Agent API error {e.code}"
            try:
                error_body = e.read().decode('utf-8')
                error_msg += f": {error_body}"
            except:
                pass
            self.last_error = error_msg
            return False, error_msg, "error"
            
        except Exception as e:
            error_msg = f"Hermes Agent API connection error: {str(e)}"
            self.last_error = error_msg
            return False, error_msg, "error"
    
    def call_ollama(self, system_prompt, messages, model=None):
        """
        Call Ollama Cloud API as fallback.
        Returns (success: bool, response: str, source: str)
        """
        model = model or OLLAMA_MODEL
        endpoint = f"{OLLAMA_API_BASE}/chat/completions"
        
        # Ensure system message is included
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend([m for m in messages if m.get('role') != 'system'])
        
        payload = {
            "model": model,
            "messages": full_messages,
            "stream": False,
            "temperature": 0.7,
            "max_tokens": 1000
        }
        
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                **({'Authorization': f'Bearer {OLLAMA_API_KEY}'} if OLLAMA_API_KEY else {})
            }
        )
        
        try:
            opener = self._create_opener()
            with opener.open(req, timeout=60) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                return True, content, "ollama_fallback"
                
        except Exception as e:
            error_msg = f"Ollama API error: {str(e)}"
            return False, error_msg, "error"
    
    def chat(self, system_prompt, user_message, chat_history=None, force_mode=None):
        """
        Main chat method with automatic backend selection.
        
        Args:
            system_prompt: System prompt for the AI
            user_message: Current user message
            chat_history: List of previous messages (optional)
            force_mode: 'hermes', 'ollama', or None (auto)
        
        Returns:
            dict with keys: reply, source, success, error
        """
        # Build messages
        messages = []
        if chat_history:
            messages.extend(chat_history)
        messages.append({"role": "user", "content": user_message})
        
        # Determine mode
        if force_mode == 'hermes':
            use_hermes = True
        elif force_mode == 'ollama':
            use_hermes = False
        else:
            use_hermes = self._should_use_hermes(user_message)
        
        # Try Hermes Agent first if appropriate
        if use_hermes:
            success, reply, source = self.call_hermes_agent(system_prompt, messages)
            if success:
                return {
                    "reply": reply,
                    "source": source,
                    "success": True,
                    "error": None
                }
            # Fall back to Ollama on failure
            print(f"[{datetime.now()}] Hermes Agent failed: {self.last_error}")
            print(f"[{datetime.now()}] Falling back to Ollama...")
        
        # Use Ollama (either forced or fallback)
        success, reply, source = self.call_ollama(system_prompt, messages)
        return {
            "reply": reply,
            "source": source,
            "success": success,
            "error": None if success else reply
        }


# Convenience function for direct usage
def chat_with_fallback(system_prompt, user_message, chat_history=None, force_mode=None):
    """
    One-shot chat function with automatic fallback.
    """
    client = HermesAgentClient()
    return client.chat(system_prompt, user_message, chat_history, force_mode)


if __name__ == '__main__':
    # Test script
    print("Testing Hermes Agent Client...")
    print(f"Hermes API URL: {HERMES_AGENT_API_URL}")
    print(f"Hermes API Key configured: {'Yes' if HERMES_AGENT_API_KEY else 'No'}")
    print("-" * 50)
    
    # Quick connectivity test
    client = HermesAgentClient()
    
    # Test with simple query
    system = "你係一個友好嘅助手。"
    query = "你好！請問你係邊個？"
    
    result = client.chat(system, query)
    print(f"Success: {result['success']}")
    print(f"Source: {result['source']}")
    print(f"Reply: {result['reply'][:200]}...")
    if result['error']:
        print(f"Error: {result['error']}")