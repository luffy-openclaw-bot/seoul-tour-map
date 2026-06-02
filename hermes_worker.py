#!/usr/bin/env python3
"""
Hermes worker for Seoul Tour Map.
Processes tasks from the task queue with web search capability.
"""

import os
import json
import time
import uuid
import urllib.request
import urllib.parse
import ssl
import re
from datetime import datetime

# Configuration
HERMES_TASK_DIR = os.getenv('HERMES_TASK_DIR', '/tmp/hermes_tasks')
OLLAMA_API_BASE = os.getenv('OLLAMA_API_BASE', 'https://ollama.com/v1')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'gemma4:31b-cloud')
OLLAMA_API_KEY = os.getenv('OLLAMA_API_KEY', '')
POLL_INTERVAL = 1  # seconds

# SSL context to bypass certificate verification
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

def create_urllib_opener():
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context))
    return opener

def web_search_duckduckgo(query, max_results=5):
    """
    Perform a web search using DuckDuckGo HTML version (no API key needed).
    Returns a list of search results with title, snippet, and URL.
    """
    results = []
    try:
        # Use DuckDuckGo HTML version for simpler parsing
        encoded_query = urllib.parse.quote(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
        
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html'
            }
        )
        
        opener = create_urllib_opener()
        with opener.open(req, timeout=15) as response:
            html = response.read().decode('utf-8')
        
        # Parse HTML for results (simple regex-based parsing)
        # DuckDuckGo HTML has result divs with class 'result'
        result_pattern = r'<a[^>]*class="result__a"[^>]*>(.*?)</a>.*?<a[^>]*class="result__url"[^>]*>(.*?)</a>'
        matches = re.findall(result_pattern, html, re.DOTALL)[:max_results]
        
        for title, url_snippet in matches:
            # Clean HTML tags
            title = re.sub(r'<[^>]+>', '', title).strip()
            # Get URL from href or data-link
            url_match = re.search(r'href="([^"]*)"', url_snippet)
            url = url_match.group(1) if url_match else url_snippet.strip()
            
            if title and url:
                results.append({
                    'title': title,
                    'url': url,
                    'snippet': ''
                })
        
        # Alternative: extract from more specific pattern
        if not results:
            # Try another pattern for DuckDuckGo results
            result_divs = re.findall(r'<div class="result[^"]*"[^>]*>(.*?)</div>\s*</div>', html, re.DOTALL)[:max_results]
            for div in result_divs:
                title_match = re.search(r'<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]+)</a>', div)
                url_match = re.search(r'<a[^>]*class="[^"]*result__url[^"]*"[^>]*>([^<]+)</a>', div)
                snippet_match = re.search(r'<a[^>]*class="[^"]*result__snippet[^"]*"[^>*>([^<]+)</a>', div)
                
                if title_match:
                    title = title_match.group(1).strip()
                    url = url_match.group(1).strip() if url_match else ''
                    snippet = snippet_match.group(1).strip() if snippet_match else ''
                    results.append({'title': title, 'url': url, 'snippet': snippet})
        
        print(f"[{datetime.now()}] Web search found {len(results)} results for: {query}")
        
    except Exception as e:
        print(f"[{datetime.now()}] Web search error: {e}")
    
    return results

def get_weather_from_search(query):
    """
    Search for weather information and return formatted result.
    """
    # Try multiple search queries
    queries = [
        f"{query} Seoul Korea current temperature",
        f"Seoul Korea weather today",
        f"首爾 天氣 今日"
    ]
    
    all_results = []
    for q in queries[:2]:  # Max 2 queries
        results = web_search_duckduckgo(q, max_results=3)
        all_results.extend(results)
        if results:
            break
    
    return all_results

def call_ollama_api(system_prompt, user_message, search_context=None, history=None):
    """Call Ollama Cloud API with search context and chat history."""
    # Build the user message with search context if available
    full_message = user_message
    if search_context:
        full_message = f"""用戶問題：{user_message}

以下係搜索到嘅相關資料，請根據呢啲資料回答問題。如果資料有用，請引用來源：

{search_context}

請用粵語（廣東話書面）回答，並喺回答中提及根據搜索結果提供資訊。"""
    
    # Build messages list with history
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add chat history if available
    if history:
        for msg in history:
            messages.append(msg)
    
    # Add current user message
    messages.append({"role": "user", "content": full_message})
    
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": 0.7,
        "max_tokens": 1000
    }
    
    req = urllib.request.Request(
        f"{OLLAMA_API_BASE}/chat/completions",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            **({'Authorization': f'Bearer {OLLAMA_API_KEY}'} if OLLAMA_API_KEY else {})
        }
    )
    
    opener = create_urllib_opener()
    try:
        with opener.open(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get('choices', [{}])[0].get('message', {}).get('content', 'AI 暫時未能回應，請稍後再試。')
    except Exception as e:
        print(f"[{datetime.now()}] Ollama API error: {e}")
        raise

def should_search_web(user_message):
    """
    Determine if the query needs web search.
    Returns True for queries about current/real-time information.
    """
    search_keywords = [
        # Weather and real-time
        '天氣', '氣溫', 'weather', 'temperature', 'forecast',
        '今日', '今日', 'tomorrow', 'today', 'current',
        # News
        '新聞', 'news', '最新', 'latest',
        # Search intent
        'search', '搜尋', 'find', '查找', '查', '找',
        # Prices
        '價格', '價錢', 'price', 'cost', 'ticket', '門票',
        # Hours
        '營業時間', '開放時間', 'hours', 'open', 'close',
        # Events
        '活動', 'event', '展覽', 'exhibition',
        # Transport
        '班次', '時間表', 'schedule', 'timetable',
        # Exchange rates
        '匯率', 'exchange rate', 'currency'
    ]
    
    message_lower = user_message.lower()
    return any(kw in message_lower for kw in search_keywords)

def process_request(request_file):
    """Process a single request file and write response."""
    try:
        with open(request_file, 'r', encoding='utf-8') as f:
            request_data = json.load(f)
        
        task_id = request_data.get('id')
        user_message = request_data.get('message', '')
        system_prompt = request_data.get('system', '')
        context = request_data.get('context', '')
        chat_history = request_data.get('history', [])  # 獲取對話歷史
        
        print(f"[{datetime.now()}] Processing task {task_id}: {user_message[:50]}...")
        
        # Build system prompt for Seoul Tour Map expert
        full_system = """你係一個韓國首爾旅遊專家 AI 助手，用粵語（廣東話書面）回答。
你非常熟悉首爾嘅景點、交通、美食、購物、文化。
請簡潔、友善咁回答用戶問題，提供實用旅遊建議。
如果問到具體景點資料，請盡量詳細。
當有用戶搜索到嘅即時資料時，請根據搜索結果回答並提及資料來源。
請記住對話歷史，可以參考之前嘅對話內容嚟回答問題。"""
        
        if system_prompt:
            full_system += "\n" + system_prompt
        
        # Check if we need to search the web
        search_context = None
        if should_search_web(user_message):
            print(f"[{datetime.now()}] Performing web search for: {user_message}")
            
            # Determine search query
            if 'weather' in user_message.lower() or '天氣' in user_message or '氣溫' in user_message:
                search_results = get_weather_from_search(user_message)
            else:
                search_results = web_search_duckduckgo(f"{user_message} Seoul Korea", max_results=5)
            
            if search_results:
                # Format search results for context
                context_parts = ["搜索結果："]
                for i, result in enumerate(search_results[:5], 1):
                    context_parts.append(f"\n{i}. **{result.get('title', 'N/A')}**")
                    if result.get('url'):
                        context_parts.append(f"   來源：{result.get('url')}")
                    if result.get('snippet'):
                        context_parts.append(f"   摘要：{result.get('snippet')}")
                
                search_context = "\n".join(context_parts)
                print(f"[{datetime.now()}] Found {len(search_results)} relevant search results")
        
        # Call Ollama API with search context and history
        reply = call_ollama_api(full_system, user_message, search_context, chat_history)
        
        # Prepare response
        response_data = {
            "id": task_id,
            "reply": reply,
            "source": "hermes_worker_web_search" if search_context else "hermes_worker",
            "search_performed": search_context is not None,
            "timestamp": time.time()
        }
        
        # Write response file
        response_file = os.path.join(HERMES_TASK_DIR, f'response_{task_id}.json')
        with open(response_file, 'w', encoding='utf-8') as f:
            json.dump(response_data, f, ensure_ascii=False, indent=2)
        
        # Remove request file
        os.remove(request_file)
        print(f"[{datetime.now()}] Completed task {task_id}")
        
    except Exception as e:
        print(f"[{datetime.now()}] Error processing request {request_file}: {e}")
        import traceback
        traceback.print_exc()
        
        # Write error response
        try:
            task_id = 'unknown'
            if 'request_data' in locals():
                task_id = request_data.get('id', 'unknown')
            error_response = {
                "id": task_id,
                "reply": f"處理請求時發生錯誤：{str(e)}",
                "source": "hermes_worker_error",
                "timestamp": time.time()
            }
            response_file = os.path.join(HERMES_TASK_DIR, f'response_{task_id}.json')
            with open(response_file, 'w', encoding='utf-8') as f:
                json.dump(error_response, f, ensure_ascii=False, indent=2)
            if os.path.exists(request_file):
                os.remove(request_file)
        except Exception as e2:
            print(f"[{datetime.now()}] Failed to write error response: {e2}")

def main():
    """Main worker loop."""
    print(f"[{datetime.now()}] Hermes worker for Seoul Tour Map started (with Web Search)")
    print(f"[{datetime.now()}] Task directory: {HERMES_TASK_DIR}")
    print(f"[{datetime.now()}] Ollama base: {OLLAMA_API_BASE}")
    print(f"[{datetime.now()}] Model: {OLLAMA_MODEL}")
    
    # Ensure task directory exists
    os.makedirs(HERMES_TASK_DIR, exist_ok=True)
    
    while True:
        try:
            # List request files
            request_files = []
            for filename in os.listdir(HERMES_TASK_DIR):
                if filename.startswith('request_') and filename.endswith('.json'):
                    request_files.append(os.path.join(HERMES_TASK_DIR, filename))
            
            # Process each request file (sorted by creation time)
            for request_file in sorted(request_files):
                process_request(request_file)
            
            # Sleep before next poll
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print(f"[{datetime.now()}] Worker stopped by user")
            break
        except Exception as e:
            print(f"[{datetime.now()}] Worker error: {e}")
            time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()