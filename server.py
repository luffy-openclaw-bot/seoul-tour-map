#!/usr/bin/env python3
"""
首爾旅遊地圖平台 - 輕量級伺服器
提供靜態文件服務 + AI 聊天 API
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import os
import sys
import time
import glob
import xml.etree.ElementTree as ET
import threading
from dotenv import load_dotenv
from memory_manager import memory_manager

# Ollama consecutive failure counter (circuit breaker) — thread-safe wrapper
class _CircuitBreaker:
    """Thread-safe circuit breaker for Ollama failures.
    
    Opens after `open_after` consecutive failures, blocking further requests.
    Auto-resets (half-open) after `cooldown_seconds` so the next request
    gets a chance to prove the API is healthy again.
    """
    def __init__(self, open_after=3, cooldown_seconds=60):
        self._lock = threading.Lock()
        self._failures = 0
        self._open_after = open_after
        self._cooldown_seconds = cooldown_seconds
        self._last_failure_time = 0  # epoch seconds of the failure that opened the circuit

    def is_open(self):
        with self._lock:
            # Auto-half-open after cooldown: allow one probe request
            if self._failures >= self._open_after:
                import time as _time
                elapsed = _time.time() - self._last_failure_time
                if elapsed >= self._cooldown_seconds:
                    self._failures = self._open_after - 1  # allow one more try
                    return False
            return self._failures >= self._open_after

    def record_failure(self):
        with self._lock:
            import time as _time
            self._failures += 1
            self._last_failure_time = _time.time()
            return self._failures

    def record_success(self):
        with self._lock:
            self._failures = 0

    def get_failures(self):
        with self._lock:
            return self._failures


_ollama_breaker = _CircuitBreaker(open_after=3, cooldown_seconds=60)

# Health check cache — avoid hammering Ollama API on every /api/health call
_health_cache = {'result': None, 'timestamp': 0}
_HEALTH_CACHE_TTL = 15  # seconds


def _safe_print(*args, **kwargs):
    """Print that survives Windows cp1252 console encoding (Chinese/emoji)."""
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        # Fallback: encode with backslashreplace so non-ASCII doesn't crash
        msg = " ".join(str(a) for a in args)
        try:
            print(msg.encode("ascii", "backslashreplace").decode("ascii"), **kwargs)
        except Exception:
            pass

# 使用絕對路徑
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_safe_print(f"DEBUG: BASE_DIR={BASE_DIR}")


def _load_project_env():
    """Load repo .env first, then .env.local overrides for local debugging."""
    loaded = []
    env_path = os.path.join(BASE_DIR, '.env')
    env_local_path = os.path.join(BASE_DIR, '.env.local')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        loaded.append('.env')
    if os.path.exists(env_local_path):
        load_dotenv(env_local_path, override=True)
        loaded.append('.env.local')
    return loaded


LOADED_ENV_FILES = _load_project_env()
_safe_print(f"DEBUG: dotenv loaded files={LOADED_ENV_FILES}")
SHARED_LOCATIONS_FILE = os.path.join(BASE_DIR, 'shared_locations.json')
USER_PROFILES_DIR = os.path.join(BASE_DIR, 'user_profiles')
file_lock = threading.Lock()

# Create user profiles directory if it doesn't exist
os.makedirs(USER_PROFILES_DIR, exist_ok=True)

# 導入搜索模組
import importlib.util
import sys

# 加載 search_module.py
module_path = os.path.join(os.path.dirname(__file__), 'search_module.py')
if os.path.exists(module_path):
    spec = importlib.util.spec_from_file_location("search_module", module_path)
    search_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(search_module)
    search_location = search_module.search_location
    get_google_location_info = getattr(search_module, 'get_google_location_info', None)
else:
    search_location = None
    get_google_location_info = None

PORT = int(os.getenv('PORT', 8082))
# Ollama Cloud API 設定 - 可通過環境變數覆蓋
API_BASE = os.getenv('OLLAMA_API_BASE', 'https://ollama.com/v1')
API_KEY = os.getenv('OLLAMA_API_KEY', 'c309d7242319461783142d44f3949473.Cvsj6THEdCx3lfLBGAwYgtWx')
MODEL = os.getenv('OLLAMA_MODEL', 'gemma4:31b-cloud')  # 使用 Gemma 4 31B Cloud model
DATA_GO_KR_KEY = os.getenv('DATA_GO_KR_KEY', 'YOUR_SERVICE_KEY_HERE')
VISIT_KOREA_API_KEY = os.getenv('VISIT_KOREA_API_KEY', 'YOUR_VISIT_KOREA_KEY_HERE')
SEOUL_DATA_API_KEY = os.getenv('SEOUL_DATA_API_KEY', 'YOUR_SEOUL_DATA_KEY_HERE')
ODSAY_API_KEY = os.getenv('ODSAY_API_KEY', 'YOUR_ODSAY_KEY_HERE')

# Radius Filter Defaults
RADIUS_DEFAULT_VAL = os.getenv('RADIUS_DEFAULT_VAL', '5')
RADIUS_DEFAULT_UNIT = os.getenv('RADIUS_DEFAULT_UNIT', 'km')
RADIUS_DEFAULT_CENTER_LAT = os.getenv('RADIUS_DEFAULT_CENTER_LAT', '37.5665')
RADIUS_DEFAULT_CENTER_LNG = os.getenv('RADIUS_DEFAULT_CENTER_LNG', '126.9780')

# Hermes Agent 任務隊列設定
HERMES_ENABLED = os.getenv('HERMES_ENABLED', 'false').lower() == 'true'
_safe_print(f"DEBUG: HERMES_ENABLED={HERMES_ENABLED}")
HERMES_TASK_DIR = os.getenv('HERMES_TASK_DIR', os.path.join(BASE_DIR, '.hermes_tasks'))
os.makedirs(HERMES_TASK_DIR, exist_ok=True)
HERMES_TIMEOUT = 300  # 秒 (TEMPORARY for testing worker response time)
_safe_print(f"DEBUG: HERMES_TIMEOUT={HERMES_TIMEOUT}s")

# Hermes Agent 雲端 API 設定 (api-hermes.apihubs.dev)
# 如果 key 冇設定，server.py 會 skip 個 endpoint 直接落 worker / ollama / offline
HERMES_AGENT_API_KEY = os.getenv('HERMES_AGENT_API_KEY', '')
HERMES_AGENT_API_URL = os.getenv('HERMES_AGENT_API_URL', 'https://api-hermes.apihubs.dev/v1')
HERMES_AGENT_MODEL = os.getenv('HERMES_AGENT_MODEL', 'glm-5.1')
HERMES_AGENT_AUTH_MODE = os.getenv('HERMES_AGENT_AUTH_MODE', 'bearer')
HERMES_AGENT_AUTH_HEADER = os.getenv('HERMES_AGENT_AUTH_HEADER', '')
HERMES_AGENT_TIMEOUT = int(os.getenv('HERMES_AGENT_TIMEOUT', '10'))
_safe_print(f"DEBUG: HERMES_AGENT_API_KEY configured: {bool(HERMES_AGENT_API_KEY)}")
_safe_print(f"DEBUG: HERMES_AGENT_API_URL={HERMES_AGENT_API_URL}")
_safe_print(f"DEBUG: HERMES_AGENT_MODEL={HERMES_AGENT_MODEL}")
_safe_print(f"DEBUG: HERMES_AGENT_AUTH_MODE={HERMES_AGENT_AUTH_MODE}")
_safe_print(f"DEBUG: HERMES_AGENT_AUTH_HEADER={HERMES_AGENT_AUTH_HEADER or 'default'}")
_safe_print(f"DEBUG: HERMES_AGENT_TIMEOUT={HERMES_AGENT_TIMEOUT}s")

try:
    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    def create_urllib_opener():
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context))
        return opener
except ImportError:
    ssl = None
    ssl_context = None
    def create_urllib_opener():
        return urllib.request.build_opener()

def rbac_required(role_required="user"):
    def decorator(func):
        def wrapper(self, *args, **kwargs):
            role = self.headers.get('X-Role', 'user')
            if role_required == "admin" and role != "admin":
                self.send_json({'error': 'Forbidden: Admin access required'}, status=403)
                return
            return func(self, *args, **kwargs)
        return wrapper
    return decorator

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 設置工作目錄為當前目錄 (seoul-tour-map)
        self.workdir = os.path.dirname(os.path.abspath(__file__))
        super().__init__(*args, directory=self.workdir, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        # 解析路徑以忽略查詢參數或完整 URI
        parsed_path = urllib.parse.urlparse(self.path).path
        parsed_query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

        _safe_print(f"DEBUG: do_GET path='{self.path}' parsed_path='{parsed_path}'")

        # API 端點
        if parsed_path == '/api/config':
            self.handle_get_config()
            return
        if parsed_path == '/api/health':
            self.handle_health_check()
            return
        if parsed_path == '/api/get-locations':
            self.handle_get_locations()
            return
        if parsed_path == '/api/stream-locations':
            self.handle_stream_locations()
            return
        if parsed_path == '/api/user-profile':
            self.handle_get_user_profile(parsed_query)
            return
        if parsed_path == '/api/memory':
            self.handle_get_memory(parsed_query)
            return

        # 如果是 /api/ 路徑但未被處理，返回 JSON 404
        if parsed_path.startswith('/api/'):
            self.send_json({'success': False, 'error': f'API endpoint not found: {parsed_path}'}, status=404)
            return

        # 靜態文件
        super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path).path
        _safe_print(f"DEBUG: do_POST path='{self.path}' parsed_path='{parsed_path}'")
        if parsed_path == '/api/chat':
            self.handle_chat()
            return
        if parsed_path == '/api/nearby':
            self.handle_nearby()
            return
        if parsed_path == '/api/execute':
            self.handle_execute()
            return
        if parsed_path == '/api/analyze-image':
            self.handle_analyze_image()
            return
        if parsed_path == '/api/search':
            self.handle_location_search()
            return
        if parsed_path == '/api/transit':
            self.handle_transit()
            return
        if parsed_path == '/api/sync-locations':
            self.handle_sync_locations()
            return
        if parsed_path == '/api/geocode':
            self.handle_geocode()
            return
        if parsed_path == '/api/reverse-geocode':
            self.handle_reverse_geocode()
            return
        if parsed_path == '/api/google-places':
            self.handle_google_places()
            return
        if parsed_path == '/api/user-profile':
            self.handle_set_user_profile()
            return
        if parsed_path == '/api/memory':
            self.handle_set_memory()
            return
            
        # 如果是 /api/ 路徑但未被處理，返回 JSON 404
        if parsed_path.startswith('/api/'):
            self.send_json({'success': False, 'error': f'API endpoint not found: {parsed_path}'}, status=404)
            return

        self.send_error(404)

    def do_DELETE(self):
        parsed_path = urllib.parse.urlparse(self.path).path
        parsed_query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        _safe_print(f"DEBUG: do_DELETE path='{self.path}' parsed_path='{parsed_path}'")
        if parsed_path == '/api/memory':
            self.handle_delete_memory(parsed_query)
            return

        # 如果是 /api/ 路徑但未被處理，返回 JSON 404
        if parsed_path.startswith('/api/'):
            self.send_json({'success': False, 'error': f'API endpoint not found: {parsed_path}'}, status=404)
            return

        self.send_error(404)

    def handle_get_user_profile(self, parsed_query):
        """處理獲取用戶資料的請求"""
        try:
            fingerprint = parsed_query.get('fingerprint', [''])[0]
            if not fingerprint:
                self.send_json({'success': False, 'error': 'Missing fingerprint'}, status=400)
                return

            # 防止路徑遍歷
            safe_fingerprint = "".join(c for c in fingerprint if c.isalnum() or c in ('-', '_'))
            profile_path = os.path.join(USER_PROFILES_DIR, f"{safe_fingerprint}.json")

            default_profile = {
                "fingerprint": safe_fingerprint,
                "preferences": {
                    "accuracy": 50,
                    "speed": 50,
                    "personalization": 50,
                    "use_web_search": True,
                    "use_offline_fallback": True,
                    "use_map_commands": True,
                    "verbosity": "normal"
                },
                "trip_data": {
                    "planned_places": [],
                    "visited_places": [],
                    "interests": [],
                    "start_date": "",
                    "end_date": ""
                }
            }

            if os.path.exists(profile_path):
                with file_lock:
                    with open(profile_path, 'r', encoding='utf-8') as f:
                        profile_data = json.load(f)
                # Merge with default to ensure all fields exist
                merged_profile = default_profile.copy()
                if "preferences" in profile_data:
                    merged_profile["preferences"].update(profile_data["preferences"])
                if "trip_data" in profile_data:
                    merged_profile["trip_data"].update(profile_data["trip_data"])
                self.send_json({'success': True, 'profile': merged_profile})
            else:
                self.send_json({'success': True, 'profile': default_profile})

        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_set_user_profile(self):
        """處理儲存用戶資料的請求"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            fingerprint = data.get('fingerprint', '')
            profile = data.get('profile', {})

            if not fingerprint:
                self.send_json({'success': False, 'error': 'Missing fingerprint'}, status=400)
                return

            # 防止路徑遍歷
            safe_fingerprint = "".join(c for c in fingerprint if c.isalnum() or c in ('-', '_'))
            profile_path = os.path.join(USER_PROFILES_DIR, f"{safe_fingerprint}.json")

            # 確保儲存的資料有 fingerprint
            profile['fingerprint'] = safe_fingerprint

            with file_lock:
                with open(profile_path, 'w', encoding='utf-8') as f:
                    json.dump(profile, f, ensure_ascii=False, indent=2)

            self.send_json({'success': True, 'message': 'Profile saved successfully'})

        except json.JSONDecodeError:
            self.send_json({'success': False, 'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    @rbac_required("user")
    def handle_get_memory(self, parsed_query):
        try:
            user_id = parsed_query.get('user_id', [''])[0]
            if not user_id:
                self.send_json({'success': False, 'error': 'Missing user_id'}, status=400)
                return
            
            # Admins can access any user's memory, users can only access their own.
            # In a real app we'd verify the token matches the user_id. Here we just trust the header if it's admin.
            role = self.headers.get('X-Role', 'user')
            token_user = self.headers.get('X-User-Id', user_id) # Simplify for now
            if role != "admin" and token_user != user_id:
                self.send_json({'success': False, 'error': 'Forbidden'}, status=403)
                return

            memory = memory_manager.read_memory(user_id)
            self.send_json({'success': True, 'memory': memory})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    @rbac_required("user")
    def handle_set_memory(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            user_id = data.get('user_id', '')
            memory_data = data.get('memory', {})

            if not user_id:
                self.send_json({'success': False, 'error': 'Missing user_id'}, status=400)
                return

            role = self.headers.get('X-Role', 'user')
            token_user = self.headers.get('X-User-Id', user_id)
            if role != "admin" and token_user != user_id:
                self.send_json({'success': False, 'error': 'Forbidden'}, status=403)
                return

            memory_manager.write_memory(user_id, memory_data)
            self.send_json({'success': True, 'message': 'Memory saved successfully'})

        except json.JSONDecodeError:
            self.send_json({'success': False, 'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    @rbac_required("user")
    def handle_delete_memory(self, parsed_query):
        try:
            user_id = parsed_query.get('user_id', [''])[0]
            if not user_id:
                self.send_json({'success': False, 'error': 'Missing user_id parameter'}, status=400)
                return

            role = self.headers.get('X-Role', 'user')
            token_user = self.headers.get('X-User-Id', user_id)
            if role != "admin" and token_user != user_id:
                self.send_json({'success': False, 'error': 'Forbidden'}, status=403)
                return

            memory_manager.delete_memory(user_id)
            self.send_json({'success': True, 'message': 'Memory deleted successfully'})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_chat(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            user_message = data.get('message', '')
            system_prompt = data.get('system', '')
            chat_history = data.get('history', [])  # 獲取對話歷史
            fingerprint = data.get('fingerprint', '') # 獲取指紋授權
            user_prefs = data.get('preferences', {}) # 獲取用戶偏好
            trip_data = data.get('trip_data', {}) # 獲取用戶旅行資料

            # Start background thread to extract memory attributes
            if fingerprint and user_message and not user_message.startswith("[SYSTEM"):
                def extract_and_update_memory():
                    extracted_res = memory_manager.extract_attributes(user_message, API_BASE, API_KEY, MODEL)
                    attributes = extracted_res.get("attributes", {})
                    if attributes:
                        memory = memory_manager.read_memory(fingerprint)
                        if 'extracted_attributes' not in memory:
                            memory['extracted_attributes'] = {}
                        if 'flagged_for_confirmation' not in memory:
                            memory['flagged_for_confirmation'] = {}
                            
                        for k, v in attributes.items():
                            conf = v.get("confidence", 0.0) if isinstance(v, dict) else 1.0
                            if conf >= 0.8:
                                memory['extracted_attributes'][k] = v
                            else:
                                memory['flagged_for_confirmation'][k] = v
                        
                        if 'raw_notes' not in memory:
                            memory['raw_notes'] = []
                        # Keep recent notes
                        memory['raw_notes'].append(user_message)
                        memory['raw_notes'] = memory['raw_notes'][-50:]
                        
                        memory_manager.write_memory(fingerprint, memory)
                        _safe_print(f"[CHAT LOG] Memory updated with new extracted attributes for user {fingerprint}")
                
                threading.Thread(target=extract_and_update_memory, daemon=True).start()

            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | handle_chat | User message received: {user_message[:100]}{'...' if len(user_message) > 100 else ''}")
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | handle_chat | system_prompt={'provided' if system_prompt else 'empty'}, history={len(chat_history)} messages, fingerprint={'provided' if fingerprint else 'none'}, preferences={'provided' if user_prefs else 'none'}")

            # 處理系統定位報告
            if user_message == "[SYSTEM_LOCATION_REPORT]":
                if not fingerprint:
                    self.send_json({'reply': '❌ 未授權存取位置資料。請確認您的設備指紋有效。', 'error': True}, status=403)
                    return
                
                lat = data.get('lat')
                lng = data.get('lng')
                
                # Reverse geocode
                address_name = "未知地點"
                if search_location and hasattr(search_module, 'get_searcher'):
                    searcher = search_module.get_searcher()
                    address_data = searcher._reverse_geocode(lat, lng)
                    if address_data and 'display_name' in address_data:
                        address_name = address_data['display_name']
                
                location_system = f"""你係一個韓國首爾旅遊專家 AI 助手。
用戶啱啱分享咗佢嘅實時 GPS 位置：緯度 {lat}, 經度 {lng}。
系統逆向地理編碼解析出嘅地址大約係：{address_name}。

請用粵語（廣東話）友善地話俾用戶知佢而家大概喺邊，並且根據呢個位置，推薦 1-2 個附近值得去嘅景點或活動。
注意：呢個係實時位置資料，基於私隱安全，系統只會喺記憶體中短暫處理，唔會記錄低。"""
                
                try:
                    ollama_reply = self._call_ollama_api(location_system, "我而家喺邊度？附近有咩好去處？", [])
                    self.send_json({'reply': ollama_reply, 'source': 'ollama'})
                except Exception as e:
                    self.send_json({'reply': f'已經收到你嘅位置 ({lat}, {lng})，但 AI 分析出錯：{str(e)}', 'error': True})
                return

            # NLP 位置查詢檢測
            location_keywords = ['我在哪', '我在哪裡', '我喺邊', 'where am i', 'my location', 'current location', '定位']
            if any(kw in user_message.lower() for kw in location_keywords):
                # 立即返回定位指令
                self.send_json({
                    'reply': '幫緊你定位，請稍等...【{"action":"locate_user_and_report"}】',
                    'source': 'system'
                })
                return

            # 構建系統提示
            full_system = """你係一個韓國首爾旅遊專家 AI 助手，用粵語（廣東話書面）回答。
你非常熟悉首爾嘅景點、交通、美食、購物、文化。
請簡潔、友善咁回答用戶問題，提供實用旅遊建議。
如果問到具體景點資料，請盡量詳細。

【地圖控制指令】
當用家需要睇地圖、想知道位置、或想去某個地方，你可以喺回覆尾加上一個特殊指令。
指令格式：將以下 JSON 放喺【...】內，例如 【{"action":"center","params":{"lat":37.5635,"lng":126.9895,"zoom":15}}】"""

            # 根據偏好設定控制地圖指令
            use_map_commands = user_prefs.get('use_map_commands', True)
            if not use_map_commands:
                full_system += "\n\n注意：用戶目前已停用自動地圖控制，請純文字回答，不要輸出任何地圖指令。"
            else:
                full_system += """
可用動作：
1. center：飛去指定坐標 (lat, lng, zoom)
   示例：「去明洞」→【{"action":"center","params":{"lat":37.5635,"lng":126.9895,"zoom":15}}】
   
2. focus_attraction：顯示景點詳情 (id)
   示例：「景福宮係邊」→【{"action":"focus_attraction","params":{"id":"gyeongbokgung"}}】
   
3. highlight_category：篩選景點分類 (category)
   示例：「美食景點有哪些」→【{"action":"highlight_category","params":{"category":"購物美食"}}】
   
4. add_marker：喺地圖加醒目標記（目的地指示）
   用途：用戶問「XX喺邊」、「點去XX」時，除咗移動地圖，再加個醒目標記
   示例：「景福宮喺邊」→【{"action":"center","params":{"lat":37.5796,"lng":126.9770,"zoom":15}}, 然後加【{"action":"add_marker","params":{"lat":37.5796,"lng":126.9770,"title":"景福宮","color":"#e74c3c","popup":"景福宮 - 朝鮮王朝正宮"}}】
   參數：lat, lng, title（標題）, color（顏色，可選）, popup（彈窗內容，可選）, pulse（脈動效果，默認true）
   
5. add_polygon：顯示範圍區域（約略位置，唔係精確邊界）
   用途：介紹區域性質地點如「明洞購物區」、「弘大夜生活區」時顯示大概範圍
   示例：「明洞有咩買」→【{"action":"add_polygon","params":{"name":"明洞購物區","color":"#f39c12","coords":[[37.5619,126.9860],[37.5640,126.9860],[37.5640,126.9890],[37.5619,126.9890]]}}】
   參數：name（區域名）, color（顏色）, coords（多邊形坐標數組，順時針或逆時針）
   
   常用區域坐標：
   - 明洞購物區：[[37.5619,126.9860],[37.5640,126.9860],[37.5640,126.9890],[37.5619,126.9890]]
   - 弘大夜生活區：[[37.5530,126.9180],[37.5570,126.9180],[37.5570,126.9280],[37.5530,126.9280]]
   - 聖水洞咖啡街：[[37.5440,127.0550],[37.5470,127.0550],[37.5470,127.0580],[37.5440,127.0580]]
   - 北村韓屋村：[[37.5780,126.9810],[37.5810,126.9810],[37.5810,126.9850],[37.5780,126.9850]]
   - 梨泰院：[[37.5340,126.9920],[37.5370,126.9920],[37.5370,126.9980],[37.5340,126.9980]]
   - 東大門：[[37.5660,127.0070],[37.5690,127.0070],[37.5690,127.0120],[37.5660,127.0120]]
   
6. clear_search_markers：清除所有搜索標記（新查詢前用）
   
7. show_route：顯示路線 (from, to 可用景點名或ID)
   示例：「由明洞去弘大」→【{"action":"show_route","params":{"from":"明洞","to":"弘大"}}】
   
8. locate_user：定位用戶位置（無參數）

9. transit_info：獲取當前地圖中心附近嘅實時巴士/地鐵資訊
   示例：「我想睇附近巴士」→【{"action":"transit_info","params":{"type":"bus"}}】

10. add_to_list：將提及嘅地點標示在地圖並永久加入景點列表
   用途：每次提及具體地點（咖啡店、酒店、景點、餐廳等）時，使用此指令可自動在地圖加上標記，同時將其加入左側景點列表，方便用戶之後搵返。
   示例：「機場有 Starbucks」→【{"action":"add_to_list","params":{"name":"Starbucks（仁川機場）","lat":37.4602,"lng":126.4407,"address":"仁川廣域市中區運西洞 2851","category":"購物美食","description":"機場內連鎖咖啡店"}}】
   參數：name（地點名稱）, lat, lng（坐標）, address（詳細地址）, category（分類，用現有分類名：地標觀景/購物美食/自然公園/文化藝術/夜生活/住宿/交通）, description（簡短描述，可選）, color（顏色，可選）

注意：
- 用戶問具體景點位置（如「景福宮喺邊」），用 center + add_marker 組合
- 用戶問區域（如「明洞有咩玩」），用 add_polygon 顯示範圍
- 每次新查詢，先加 clear_search_markers 清除之前標記
- 只喺需要移動地圖、顯示位置、顯示範圍時先用呢啲指令。唔好每個回覆都加指令。
- 提及具體地點時（咖啡店、酒店、餐廳、景點等），必須使用 add_to_list，系統會自動處理地圖標記與列表添加，不需要再輸出 add_marker。"""

            full_system += """

【韓國交通基本知識 (Rookie Tips)】
- T-money 卡：最方便嘅支付方式，便利店（如 GS25, CU）有售，可用於巴士、地鐵同的士。
- 轉乘優惠：巴士同地鐵之間 30 分鐘內轉乘免費（夜晚 9 點到朝早 7 點為 1 小時內）。記住每次上落車都要拍卡！
- 巴士：前門上車拍卡，後門落車拍卡。落車前要撳紅色「STOP」鐘。
- 地鐵：留意月台方向（通常標示終點站）。入錯閘唔使驚，5 分鐘內同站出閘係免費嘅。
- Slash Command：你可以叫用家輸入 `/transit` 嚟睇地圖中心附近嘅實時巴士同地鐵資訊。
- Slash Command：你可以叫用家輸入 `/places` 或 `/places [半徑]` 嚟搜尋地圖中心附近嘅 Google 地點資訊（預設半徑 500m）。
- 導航建議：推薦用家下載 Naver Map 或 KakaoMap，因為 Google Maps 喺韓國嘅步行導航唔太準確。
"""
            
            # 加入用戶行程與偏好作為個人化上下文
            if trip_data or user_prefs:
                full_system += "\n【用戶個人化資料】\n"
                
                if user_prefs.get('verbosity') == 'concise':
                    full_system += "- 對話風格：請非常簡潔直接地回答，不要說多餘的廢話。\n"
                elif user_prefs.get('verbosity') == 'detailed':
                    full_system += "- 對話風格：請詳細地回答，並提供豐富的背景資訊。\n"
                    
                if trip_data.get('start_date') or trip_data.get('end_date'):
                    full_system += f"- 行程日期：{trip_data.get('start_date', '未知')} 至 {trip_data.get('end_date', '未知')}\n"
                
                interests = trip_data.get('interests', [])
                if interests:
                    full_system += f"- 旅遊興趣：{', '.join(interests)}\n"
                    
                planned = trip_data.get('planned_places', [])
                if planned:
                    full_system += f"- 已計畫前往的地點：{', '.join(planned)}\n"
                    
                visited = trip_data.get('visited_places', [])
                if visited:
                    full_system += f"- 已去過的地點：{', '.join(visited)}\n"
                    
                full_system += "\n請根據以上的個人化資料，提供最適合這位用戶的建議（例如避免推薦已經去過的地方，或根據興趣推薦）。\n"

            if system_prompt:
                full_system += "\n" + system_prompt

            if fingerprint:
                try:
                    memory = memory_manager.read_memory(fingerprint)
                    
                    explicit_prefs = memory.get('preferences', {})
                    if explicit_prefs:
                        full_system += "\n【用戶明確設定的偏好】\n"
                        for k, v in explicit_prefs.items():
                            full_system += f"- {k}: {v}\n"
                            
                    travel_plans = memory.get('travel_plans', {})
                    if travel_plans:
                        full_system += "\n【用戶旅遊計畫】\n"
                        for k, v in travel_plans.items():
                            full_system += f"- {k}: {v}\n"
                            
                    bg_context = memory.get('background_context', {})
                    if bg_context:
                        full_system += "\n【用戶背景資訊】\n"
                        for k, v in bg_context.items():
                            full_system += f"- {k}: {v}\n"
                            
                    extracted_attrs = memory.get('extracted_attributes', {})
                    if extracted_attrs:
                        full_system += "\n【用戶自動提取的偏好】\n"
                        for k, v in extracted_attrs.items():
                            val = v.get("value") if isinstance(v, dict) else v
                            full_system += f"- {k}: {val}\n"
                except Exception as e:
                    _safe_print(f"[CHAT LOG] Error reading memory for system prompt: {e}")

            # ─── 第一層：Hermes Agent 雲端 API (api-hermes.apihubs.dev) ───
            # 如果用戶啟用咗 web search + query 係複雜 + HERMES_AGENT_API_KEY 有設定，先試
            should_delegate = False
            # First calculate should_delegate regardless of cloud API key
            if user_prefs.get('use_web_search', True):
                should_delegate = self._should_delegate_to_hermes(user_message)
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | Should delegate to Hermes? {should_delegate}")
            else:
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | Skipped Hermes (use_web_search=False)")
            
            # Try cloud API if should_delegate and key is set
            if should_delegate and HERMES_AGENT_API_KEY:
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | Trying Hermes Cloud API...")
                cloud_result = self._try_hermes_agent_api(user_message, full_system, chat_history)
                if cloud_result and cloud_result.get('reply'):
                    result_source = cloud_result.get('source', 'hermes_agent_api')
                    if result_source == 'hermes_agent':
                        api_source = 'hermes_agent_api'
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ✅ Using Hermes Cloud API")
                    elif result_source == 'ollama_fallback':
                        api_source = 'ollama_fallback'
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ⚠️ Hermes Cloud failed auth/transport; using Ollama fallback from Hermes client")
                    else:
                        api_source = result_source
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ⚠️ Hermes path returned unexpected source={result_source}")
                    _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | handle_chat | Response sent to client (source={api_source}, reply_len={len(cloud_result['reply'])})")
                    self.send_json({'reply': cloud_result['reply'], 'source': api_source})
                    return
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ❌ Hermes Cloud failed, falling through to worker")

            # ─── 第二層：File-queue worker (hermes_worker.py: DuckDuckGo + Ollama) ───
            if should_delegate and HERMES_ENABLED:
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | Trying Hermes Worker (with DuckDuckGo)...")
                hermes_reply = self._delegate_to_hermes(user_message, full_system, chat_history)
                if hermes_reply:
                    _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ✅ Using Hermes Worker (may have used DuckDuckGo)")
                    _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | handle_chat | Response sent to client (source=hermes_worker, reply_len={len(hermes_reply)})")
                    self.send_json({'reply': hermes_reply, 'source': 'hermes_worker'})
                    return

            # ─── 第三層：直接打 Ollama ───
            circuit_open = _ollama_breaker.is_open()
            if circuit_open:
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | Ollama circuit open, skipping")
            try:
                if not circuit_open:
                    _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | Trying Ollama direct API...")
                    # 根據速度/準確度偏好調整模型參數 (speed=0-100)
                    speed_pref = user_prefs.get('speed', 50)
                    temp = 0.7
                    max_tokens = 1500
                    if speed_pref > 70:
                        temp = 0.8
                        max_tokens = 800 # 較短回覆更快
                    elif speed_pref < 30:
                        temp = 0.3 # 較準確
                        max_tokens = 2000

                    ollama_reply = self._call_ollama_api(full_system, user_message, chat_history, temperature=temp, max_tokens=max_tokens)
                    if ollama_reply:
                        _ollama_breaker.record_success()
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ✅ Using Ollama direct API (no web search)")
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | ollama_api | Response received (reply_len={len(ollama_reply)}): {ollama_reply[:100]}{'...' if len(ollama_reply) > 100 else ''}")
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | handle_chat | Response sent to client (source=ollama)")
                        self.send_json({'reply': ollama_reply, 'source': 'ollama'})
                        return
            except Exception as e:
                failures = _ollama_breaker.record_failure()
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | ollama_api | Error: {e} (failures={failures})")
                if failures >= 3 and failures == 3:
                    _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | ollama_api | Circuit OPENED — next requests skip Ollama")

            # 回退到離線知識庫
            use_offline_fallback = user_prefs.get('use_offline_fallback', True)
            if use_offline_fallback:
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | backend_selection | ❌ All backends failed, using offline fallback")
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | offline_kb | Falling back to offline knowledge base...")
                offline_reply = self._generate_offline_reply(user_message)
                _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | handle_chat | Response sent to client (source=offline)")
                self.send_json({'reply': offline_reply, 'source': 'offline'})
            else:
                self.send_json({'reply': '抱歉，系統暫時未能連接 AI 伺服器，且離線回退功能已被停用。', 'error': True})

        except Exception as e:
            self.send_json({'reply': f'系統錯誤：{str(e)}', 'error': True})

    def handle_geocode(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            query = data.get('query', '')
            
            if not query:
                self.send_json({'error': 'No query provided'}, status=400)
                return
                
            params = urllib.parse.urlencode({
                'format': 'json',
                'q': query,
                'limit': 1,
                'accept-language': 'zh-TW,zh-CN,en'
            })
            
            url = f"https://nominatim.openstreetmap.org/search?{params}"
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SeoulMap/2.0; +https://seoul-tour-map.local)'
                }
            )
            
            opener = create_urllib_opener()
            with opener.open(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))
                self.send_json(result)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_reverse_geocode(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            lat = data.get('lat')
            lng = data.get('lng')
            
            if lat is None or lng is None:
                self.send_json({'error': 'Missing lat or lng parameters'}, status=400)
                return
                
            params = urllib.parse.urlencode({
                'format': 'json',
                'lat': lat,
                'lon': lng,
                'accept-language': 'zh-TW,zh-CN,en',
                'zoom': 18
            })
            
            url = f"https://nominatim.openstreetmap.org/reverse?{params}"
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SeoulMap/2.0; +https://seoul-tour-map.local)'
                }
            )
            
            opener = create_urllib_opener()
            with opener.open(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))
                self.send_json(result)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_nearby(self):
        """處理附近景點查詢"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            lat = data.get('lat', 0)
            lng = data.get('lng', 0)
            radius = data.get('radius', 2000)  # 預設 2km

            # 讀取景點數據
            attractions_file = os.path.join(self.workdir, 'static/data/preset_locations.json')
            with open(attractions_file, 'r', encoding='utf-8') as f:
                attractions_data = json.load(f)

            # 簡單距離計算（使用 Haversine 公式近似）
            import math
            def haversine(lat1, lon1, lat2, lon2):
                R = 6371000  # 地球半徑（米）
                phi1 = math.radians(lat1)
                phi2 = math.radians(lat2)
                delta_phi = math.radians(lat2 - lat1)
                delta_lambda = math.radians(lon2 - lon1)
                a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                return R * c

            # 搵附近景點
            nearby = []
            for attr in attractions_data.get('attractions', []):
                dist = haversine(lat, lng, attr.get('lat', 0), attr.get('lng', 0))
                if dist <= radius:
                    nearby.append({
                        'name': attr.get('name'),
                        'local_name': attr.get('local_name'),
                        'category': attr.get('category'),
                        'distance': round(dist),
                        'description': attr.get('description', '')[:100]
                    })

            # 按距離排序
            nearby.sort(key=lambda x: x['distance'])

            if not nearby:
                reply = "附近 2 公里內未有記錄景點。你可以試下擴大搜尋範圍或者去市中心景點看看！"
            else:
                reply = f"**附近 {len(nearby)} 個景點：**\n\n"
                for i, attr in enumerate(nearby[:5], 1):  # 只顯示最近 5 個
                    reply += f"**{i}. {attr['name']}** ({attr['local_name']})\n"
                    reply += f"   - 類別：{attr['category']}\n"
                    reply += f"   - 距離：約 {attr['distance']} 米\n"
                    reply += f"   - 簡介：{attr['description']}...\n\n"

            self.send_json({'reply': reply, 'count': len(nearby), 'source': 'nearby'})

        except Exception as e:
            self.send_json({'reply': f'查詢附近景點時出錯：{str(e)}', 'error': True})

    def handle_execute(self):
        """執行 AI 發出嘅地圖控制指令"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            action = data.get('action', '')
            params = data.get('params', {})
            _safe_print(f"[EXECUTE] action={action} params={json.dumps(params, ensure_ascii=False)}")

            # 白名單驗證
            ALLOWED_ACTIONS = {
                'center': {'lat': float, 'lng': float, 'zoom': int},
                'focus_attraction': {'id': str},
                'highlight_category': {'category': str},
                'locate_user': {},
                'locate_user_and_report': {},
                'show_route': {'from': str, 'to': str},
                'add_marker': {'lat': float, 'lng': float, 'title': str, 'color': str, 'popup': str, 'pulse': bool},
                'add_polygon': {'name': str, 'color': str, 'coords': list},
                'clear_search_markers': {},
                'add_to_list': {'name': str, 'lat': float, 'lng': float, 'address': str, 'category': str, 'description': str, 'color': str},
                'update_attraction_detail': {'id': str, 'name': str, 'description': str, 'highlights': list, 'local_cuisine': list, 'best_seasons': list, 'stay_duration': str, 'visitor_insights': str, 'transport': dict, 'ticket': str, 'hours': str, 'tips': str},
            }

            if action not in ALLOWED_ACTIONS:
                _safe_print(f"[EXECUTE] rejected unknown action={action}")
                self.send_json({'success': False, 'error': f'Unknown action: {action}'}, status=400)
                return

            # 參數類型驗證
            expected = ALLOWED_ACTIONS[action]
            for key, expected_type in expected.items():
                if key in params:
                    try:
                        params[key] = expected_type(params[key])
                    except (ValueError, TypeError):
                        _safe_print(f"[EXECUTE] invalid param type action={action} key={key} value={params.get(key)} expected={expected_type}")
                        self.send_json({'success': False, 'error': f'Invalid type for {key}'}, status=400)
                        return

            _safe_print(f"[EXECUTE] accepted action={action}")
            self.send_json({'success': True, 'action': action, 'params': params})

        except json.JSONDecodeError:
            _safe_print("[EXECUTE] invalid JSON payload")
            self.send_json({'success': False, 'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            _safe_print(f"[EXECUTE] unexpected error: {e}")
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def _should_delegate_to_hermes(self, user_message):
        """決定是否應該將查詢委託給 Hermes Agent"""
        if not HERMES_ENABLED:
            return False
        _safe_print(f"[CHAT LOG] should_delegate | hermes_enabled={HERMES_ENABLED}, checking: {user_message[:50]}")

        message_lower = user_message.lower()
        # Allow explicit "Hermes" mentions to force the Hermes path during manual testing.
        if 'hermes' in message_lower:
            return True

        # 複雜查詢的關鍵字，表明可能需要工具使用
        complex_indicators = [
            # 需要實時資訊
            '最新', '今日', '昨天', '新聞', '股票', '匯率', '天氣', '氣溫',
            'latest', 'today', 'news', 'weather', 'temperature',
            # 需要網頁搜索
            '搜索', '找', '查', 'google', '網上',
            'search', 'find', 'look up', 'web',
            # 需要計算
            '計算', '算', '數學', '公式',
            'calculate', 'math', 'formula',
            # 需要視覺處理
            '圖表', '圖像', '分析',
            'chart', 'image', 'analyze', 'analysis',
            # 需要檔案操作
            '檔案', '讀取', '寫入', '編輯',
            'file', 'read', 'write', 'edit',
            # 需要代碼執行
            '程式', '代碼', '函數', '算法',
            'code', 'function', 'algorithm',
            # 需要綜合分析
            '比較', '對比', '評價', '推薦',
            'compare', 'recommend', 'review',
            # 需要深度研究
            '詳細', '深入', '全面', '綜合',
            # 旅行行程（多天、多景點路線規劃，需要 web search + 推理）
            '日', '天', '行程', '路線', '幾日', '幾天',
            'days', 'day trip', 'itinerary', 'route', 'plan',
            '景點', '全部', '最少', '盡量', '所有',
            'visit all', 'as many as possible', 'all famous',
            'all the places', 'everything', 'everywhere'
        ]

        return any(indicator in message_lower for indicator in complex_indicators)

    def _delegate_to_hermes(self, user_message, system_prompt, history=None):
        """將任務委託給 Hermes Agent 並等待回覆"""
        try:
            # 生成唯一任務ID
            import uuid
            task_id = str(uuid.uuid4())
            
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | Task created: task_id={task_id}")
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | user_message: {user_message[:80]}{'...' if len(user_message) > 80 else ''}")
            
            # 創建任務請求文件
            task_request = {
                'id': task_id,
                'message': user_message,
                'system': system_prompt,
                'history': history or [],  # 加入對話歷史
                'timestamp': time.time(),
                'context': 'seoul-tour-map chatbot'
            }
            
            request_file = os.path.join(HERMES_TASK_DIR, f'request_{task_id}.json')
            with open(request_file, 'w', encoding='utf-8') as f:
                json.dump(task_request, f, ensure_ascii=False, indent=2)
            
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | Waiting for response (timeout={HERMES_TIMEOUT}s)...")
            
            # 等待響應（帶超時）
            start_time = time.time()
            response_file = os.path.join(HERMES_TASK_DIR, f'response_{task_id}.json')
            
            while time.time() - start_time < HERMES_TIMEOUT:
                if os.path.exists(response_file):
                    try:
                        with open(response_file, 'r', encoding='utf-8') as f:
                            response_data = json.load(f)
                        reply = response_data.get('reply', '')
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | Response received (reply_len={len(reply)})")
                        # 清理任務文件（忽略文件不存在錯誤，避免 race with worker）
                        try:
                            if os.path.exists(request_file):
                                os.remove(request_file)
                            if os.path.exists(response_file):
                                os.remove(response_file)
                        except FileNotFoundError:
                            pass  # Worker 可能已經刪除咗
                        return reply
                    except Exception as e:
                        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | Error reading response: {e}")
                time.sleep(1.0)  # 每1s檢查一次 (worker poll interval 係5s, 0.5s冇實際好處)

            # 超時
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | Timeout after {HERMES_TIMEOUT}s")
            # 清理請求文件 (idempotent: 用 exists() 避免 race)
            try:
                if os.path.exists(request_file):
                    os.remove(request_file)
            except FileNotFoundError:
                pass
            return None

        except Exception as e:
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | delegate_to_hermes | Delegation failed: {e}")
            return None

    def _try_hermes_agent_api(self, user_message, system_prompt, history=None):
        """第一層：直接 call api-hermes.apihubs.dev (cloud Hermes Agent)。

        Returns:
            dict: {reply, source, error} on success, None on failure / no key / timeout
        """
        if not HERMES_AGENT_API_KEY:
            return None

        try:
            # Lazy import — 避免 import time 影響 server 啟動
            from hermes_agent_client import HermesAgentClient
        except Exception as e:
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | try_hermes_agent_api | Failed to import HermesAgentClient: {e}")
            return None

        # Build messages for cloud call
        messages = []
        if history:
            for m in history:
                if m.get('role') in ('user', 'assistant', 'system'):
                    messages.append({'role': m['role'], 'content': m.get('content', '')})
        messages.append({'role': 'user', 'content': user_message})

        client = HermesAgentClient(api_key=HERMES_AGENT_API_KEY, api_url=HERMES_AGENT_API_URL)
        try:
            result = client.chat(system_prompt, user_message, chat_history=messages[:-1], force_mode='hermes')
        except Exception as e:
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | try_hermes_agent_api | Exception: {e}")
            return None

        if not result or not result.get('success'):
            err = (result or {}).get('error') or 'unknown'
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | try_hermes_agent_api | Failed: {err}")
            return None

        reply = result.get('reply', '').strip()
        if not reply:
            return None
        # Safety net: detect error messages that slipped through the client
        if 'Error code:' in reply and 'error' in reply.lower():
            _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | try_hermes_agent_api | Error in reply body, discarding: {reply[:200]}")
            return None
        source = result.get('source', 'unknown')
        _safe_print(f"[CHAT LOG] {time.strftime('%Y-%m-%d %H:%M:%S')} | try_hermes_agent_api | Success (source={source}, reply_len={len(reply)})")
        return {
            'reply': reply,
            'source': source,
            'error': result.get('error')
        }

    def _call_ollama_api(self, system_prompt, user_message, history=None, temperature=0.7, max_tokens=800):
        """調用 Ollama Cloud API"""
        # 構建訊息列表，加入對話歷史
        messages = [{"role": "system", "content": system_prompt}]
        
        # 加入對話歷史
        if history:
            for msg in history:
                messages.append(msg)
        
        # 加入當前用戶訊息
        messages.append({"role": "user", "content": user_message})
        
        payload = {
            "model": MODEL,
            "messages": messages,
            "stream": False,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        req = urllib.request.Request(
            f"{API_BASE}/chat/completions",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                **({'Authorization': f'Bearer {API_KEY}'} if API_KEY else {})
            }
        )

        # 使用 custom opener with SSL context
        opener = create_urllib_opener()
        with opener.open(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get('choices', [{}])[0].get('message', {}).get('content', 'AI 暫時未能回應，請稍後再試。')

    def _generate_offline_reply(self, user_message):
        """Generate offline knowledge base reply with keyword-matched Seoul attractions."""

        # Hardcoded popular Seoul attractions for offline fallback
        seoul_attractions = [
            {"name": "景福宮", "lat": 37.5796, "lng": 126.9770, "category": "歷史文化", "description": "朝鮮王朝正宮，旅客必到"},
            {"name": "明洞", "lat": 37.5635, "lng": 126.9895, "category": "購物美食", "description": "首爾購物天堂"},
            {"name": "弘大", "lat": 37.5568, "lng": 126.9245, "category": "夜生活", "description": "年輕人藝術與音樂勝地"},
            {"name": "南山塔", "lat": 37.5511, "lng": 126.9882, "category": "地標觀景", "description": "首爾地標，可俯瞰全市夜景"},
            {"name": "仁寺洞", "lat": 37.5755, "lng": 126.9858, "category": "歷史文化", "description": "傳統韓屋與工藝品街道"},
            {"name": "北村韓屋村", "lat": 37.5799, "lng": 126.9831, "category": "歷史文化", "description": "傳統韓屋建築群"},
            {"name": "東大門設計廣場", "lat": 37.5657, "lng": 127.0105, "category": "地標觀景", "description": "未來感建築地標"},
            {"name": "清溪川", "lat": 37.5678, "lng": 127.0047, "category": "自然公園", "description": "市區清溪川散步徑"},
            {"name": "首爾塔", "lat": 37.5511, "lng": 126.9882, "category": "地標觀景", "description": "南山塔夜景"},
            {"name": "江南", "lat": 37.5048, "lng": 127.0248, "category": "購物美食", "description": "高端購物與時尚區"},
            {"name": "三清洞", "lat": 37.5777, "lng": 126.9833, "category": "歷史文化", "description": "美術館與咖啡街"},
            {"name": "益善洞", "lat": 37.5668, "lng": 126.9927, "category": "歷史文化", "description": "首爾最古老韓屋村"},
            {"name": "聖水洞", "lat": 37.5456, "lng": 127.0546, "category": "購物美食", "description": "潮牌咖啡與藝術聖地"},
            {"name": "梨泰院", "lat": 37.5352, "lng": 126.9955, "category": "夜生活", "description": "多元文化與異國美食"},
            {"name": "乙支路", "lat": 37.5661, "lng": 127.0033, "category": "購物美食", "description": "年輕人潮流街"},
        ]

        msg_lower = user_message.lower()
        matched = []
        for attr in seoul_attractions:
            if any(kw in msg_lower for kw in [attr["name"], attr["category"]]):
                matched.append(attr)
            elif any(kw in msg_lower for kw in ["景點", "推薦", "好玩", "值得", "全部", "所有", "日", "天", "遊覽"]):
                matched.append(attr)
            if len(matched) >= 5:
                break

        # Fallback: show top picks if nothing matched
        if not matched:
            matched = seoul_attractions[:5]

        action_parts = []
        for a in matched:
            action_parts.append(
                f'【{{"action":"add_to_list","params":{{"name":"{a["name"]}","lat":{a["lat"]},"lng":{a["lng"]},"category":"{a["category"]}","description":"{a["description"]}"}}}}】'
            )

        attractions_text = "\n".join(
            f"- **{a['name']}**（{a['category']}）：{a['description']}"
            for a in matched
        )

        return f"""⚠️ AI 伺服器暫時未能連接（離線模式）。

以下係首爾人氣景點，或許幫到你：

{attractions_text}

{chr(10).join(action_parts)}

你可以繼續操作地圖，點擊左側景點列表睇更多地點。AI 恢復後我會繼續為你服務！"""

    def handle_analyze_image(self):
        """處理圖片上傳並使用 AI Vision 識別地點"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            image_base64 = data.get('image', '')
            
            if not image_base64:
                self.send_json({'error': '冇提供圖片'}, status=400)
                return
            
            # =========================================================================
            # Step 1: Extract EXIF GPS coordinates if available (phone photos usually have GPS)
            # =========================================================================
            exif_gps = None
            try:
                import base64 as b64
                from PIL import Image
                from PIL.ExifTags import TAGS, GPSTAGS
                import io
                
                image_bytes = b64.b64decode(image_base64)
                img = Image.open(io.BytesIO(image_bytes))
                exif_data = img._getexif()
                
                if exif_data:
                    gps_info = {}
                    for tag_id, value in exif_data.items():
                        tag_name = TAGS.get(tag_id, tag_id)
                        if tag_name == 'GPSInfo':
                            for gps_tag_id, gps_value in value.items():
                                gps_tag_name = GPSTAGS.get(gps_tag_id, gps_tag_id)
                                gps_info[gps_tag_name] = gps_value
                    
                    if 'GPSLatitude' in gps_info and 'GPSLongitude' in gps_info:
                        def dms_to_decimal(dms, ref):
                            degrees = float(dms[0])
                            minutes = float(dms[1])
                            seconds = float(dms[2])
                            decimal = degrees + minutes/60 + seconds/3600
                            if ref in ('S', 'W'):
                                decimal = -decimal
                            return decimal
                        
                        lat = dms_to_decimal(gps_info['GPSLatitude'], gps_info.get('GPSLatitudeRef', 'N'))
                        lng = dms_to_decimal(gps_info['GPSLongitude'], gps_info.get('GPSLongitudeRef', 'E'))
                        exif_gps = {'lat': lat, 'lng': lng}
                        _safe_print(f"[Image] EXIF GPS found: {lat}, {lng}")
            except Exception as exif_err:
                _safe_print(f"[Image] EXIF extraction skipped: {exif_err}")
            # =========================================================================
            
            # =========================================================================
            # Step 2: Read attractions data for AI context
            # =========================================================================
            attractions_list = []  # Initialize to avoid scope issues
            try:
                attractions_file = os.path.join(self.workdir, 'static/data/preset_locations.json')
                with open(attractions_file, 'r', encoding='utf-8') as f:
                    attractions_list = json.load(f).get('attractions', [])
                    attractions_info = '\n'.join([
                        f"- {a['name']}({a['local_name']}): lat={a['lat']}, lng={a['lng']}, {a['description'][:50]}..."
                        for a in attractions_list[:20]
                    ])
            except:
                attractions_info = "景福宮(경복궁)、明洞(명동)、弘大(홍대)、東大門(동대문)、南山塔(남산타워)、仁寺洞(인사동)、北村韓屋村(북촌한옥마을)、聖水洞(성수동)"
            
            # =========================================================================
            # Step 3: Build vision prompt (with EXIF GPS hint if available)
            # =========================================================================
            gps_hint = ""
            if exif_gps:
                # Calculate nearest known attractions to GPS hint
                nearest_attrs = []
                import math
                for a in attractions_list[:20]:
                    dist = math.sqrt((a['lat'] - exif_gps['lat'])**2 + (a['lng'] - exif_gps['lng'])**2)
                    nearest_attrs.append((dist, a))
                nearest_attrs.sort(key=lambda x: x[0])
                nearby_hint = ', '.join([f"{a['name']}({a['local_name']})" for _, a in nearest_attrs[:5]])
                gps_hint = f"\n\n【重要提示】呢張相嘅 GPS 坐標係 ({exif_gps['lat']:.4f}, {exif_gps['lng']:.4f})，附近最近嘅景點係：{nearby_hint}。請用呢個 GPS 坐標作為參考。"
            
            vision_prompt = f"""你係一個首爾旅遊景點識別專家。請仔細觀察呢張圖片，判斷呢係邊個首爾景點。

可參考嘅首爾景點：
{attractions_info}{gps_hint}

請以 JSON 格式回覆：
{{
    "landmark_name": "景點中文名稱",
    "landmark_local_name": "韓文名稱",
    "confidence": 0.85,
    "lat": 37.5796,
    "lng": 126.9770,
    "description": "簡短描述為何認為係呢個地方",
    "nearby_attractions": "附近其他景點"
}}

如果你唔確定係邊個具體景點，請估計一個最可能嘅位置同坐標（喺首爾範圍內），confidence 可以低少少但要有數值。

**重要**：只返回純 JSON，唔好加任何其他文字說明。"""
            
            # =========================================================================
            # Step 4: Call Ollama Cloud Vision API (OpenAI multimodal format)
            # =========================================================================
            try:
                # OpenAI multimodal format: content is an array of text + image parts
                payload = {
                    "model": MODEL,
                    "messages": [
                        {"role": "system", "content": "你係首爾旅遊景點識別專家，專門從照片認出首爾地標建築、景點位置。"},
                        {"role": "user", "content": [
                            {"type": "text", "text": vision_prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                        ]}
                    ],
                    "stream": False,
                    "temperature": 0.3,
                    "max_tokens": 500
                }
                
                req = urllib.request.Request(
                    f"{API_BASE}/chat/completions",
                    data=json.dumps(payload).encode('utf-8'),
                    headers={
                        'Content-Type': 'application/json',
                        **({'Authorization': f'Bearer {API_KEY}'} if API_KEY else {})
                    }
                )
                
                opener = create_urllib_opener()
                with opener.open(req, timeout=30) as resp:
                    raw_body = resp.read().decode('utf-8')
                    _safe_print(f"[Image] API raw response (first 300 chars): {raw_body[:300]}")
                    result = json.loads(raw_body)
                
                ai_reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                _safe_print(f"[Image] AI reply (first 200 chars): {ai_reply[:200]}")
                
                if not ai_reply or not ai_reply.strip():
                    raise ValueError(f'AI 返回空白回覆。Raw: {raw_body[:200]}')
                
                # =========================================================================
                # Step 5: Parse JSON from AI response
                # =========================================================================
                import re
                
                # Try to extract JSON from the response
                json_match = re.search(r'\{[^{}]*"landmark_name"[^{}]*\}', ai_reply, re.DOTALL)
                if not json_match:
                    json_match = re.search(r'(\{[^{}]*\})', ai_reply, re.DOTALL)
                
                analysis = None
                if json_match:
                    try:
                        analysis = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        pass
                
                if not analysis:
                    # Try direct parse
                    try:
                        analysis = json.loads(ai_reply)
                    except json.JSONDecodeError:
                        pass
                
                if not analysis:
                    raise ValueError(f'無法從 AI 回覆解析 JSON。AI 回覆: {ai_reply[:300]}')
                
                # Validate essential fields
                if 'lat' not in analysis or 'lng' not in analysis:
                    # If we have EXIF GPS, use it as fallback lat/lng
                    if exif_gps:
                        analysis['lat'] = exif_gps['lat']
                        analysis['lng'] = exif_gps['lng']
                        _safe_print(f"[Image] Using EXIF GPS as fallback: {exif_gps['lat']}, {exif_gps['lng']}")
                    else:
                        raise ValueError('AI 回覆缺少坐標')
                
                # Build response
                self.send_json({
                    'success': True,
                    'analysis': analysis,
                    'source': 'ollama_vision',
                    'has_gps': exif_gps is not None,
                    'map_action': {
                        'action': 'add_marker',
                        'params': {
                            'lat': float(analysis['lat']),
                            'lng': float(analysis['lng']),
                            'title': analysis.get('landmark_name', '可能位置'),
                            'color': '#e74c3c',
                            'popup': f"<b>{analysis.get('landmark_name', '未知地點')}</b><br>"
                                     f"{analysis.get('landmark_local_name', '')}<br>"
                                     f"信心度: {float(analysis.get('confidence', 0)):.0%}<br>"
                                     f"{analysis.get('description', '')}"
                                     f"{'<br>📡 GPS定位' if exif_gps else ''}",
                            'pulse': True
                        }
                    }
                })
                
            except Exception as vision_error:
                _safe_print(f"[Image] Vision analysis failed: {type(vision_error).__name__}: {vision_error}")
                
                # =====================================================================
                # Fallback: if vision fails but we have EXIF GPS, return the GPS location
                # =====================================================================
                if exif_gps:
                    # Read attractions fresh (avoid scope issues with attractions_list)
                    import math
                    fallback_attrs = []
                    try:
                        attractions_file = os.path.join(self.workdir, 'static/data/preset_locations.json')
                        with open(attractions_file, 'r', encoding='utf-8') as f:
                            fallback_attrs = json.load(f).get('attractions', [])
                    except:
                        pass
                    
                    # Find nearest known attraction
                    nearest = None
                    nearest_dist = float('inf')
                    for a in fallback_attrs:
                        dist = math.sqrt((a['lat'] - exif_gps['lat'])**2 + (a['lng'] - exif_gps['lng'])**2)
                        if dist < nearest_dist:
                            nearest_dist = dist
                            nearest = a
                    
                    if nearest:
                        self.send_json({
                            'success': True,
                            'analysis': {
                                'landmark_name': f"{nearest['name']} (GPS推算)",
                                'landmark_local_name': nearest['local_name'],
                                'confidence': 0.5,
                                'lat': nearest['lat'],
                                'lng': nearest['lng'],
                                'description': f'根據 GPS 坐標推算最近景點為 {nearest["name"]}（距離約 {int(nearest_dist*111000)} 米）',
                                'nearby_attractions': nearest['name']
                            },
                            'source': 'gps_fallback',
                            'has_gps': True,
                            'map_action': {
                                'action': 'add_marker',
                                'params': {
                                    'lat': nearest['lat'],
                                    'lng': nearest['lng'],
                                    'title': nearest['name'],
                                    'color': '#3498db',
                                    'popup': f"<b>{nearest['name']} (GPS推算)</b><br>{nearest['local_name']}<br>📡 從GPS定位推算<br>信心度: 50%",
                                    'pulse': True
                                }
                            }
                        })
                    else:
                        # GPS but no known attraction nearby → show GPS location directly
                        self.send_json({
                            'success': True,
                            'analysis': {
                                'landmark_name': f'GPS位置 ({exif_gps["lat"]:.4f}, {exif_gps["lng"]:.4f})',
                                'landmark_local_name': '',
                                'confidence': 0.3,
                                'lat': exif_gps['lat'],
                                'lng': exif_gps['lng'],
                                'description': '無法辨識具體景點，但根據GPS定位顯示此位置',
                                'nearby_attractions': '未知'
                            },
                            'source': 'gps_fallback',
                            'has_gps': True,
                            'map_action': {
                                'action': 'add_marker',
                                'params': {
                                    'lat': exif_gps['lat'],
                                    'lng': exif_gps['lng'],
                                    'title': 'GPS拍攝位置',
                                    'color': '#3498db',
                                    'popup': f"📡 GPS定位<br>({exif_gps['lat']:.5f}, {exif_gps['lng']:.5f})<br>無法辨識具體景點",
                                    'pulse': False
                                }
                            }
                        })
                else:
                    # No GPS, no vision → real failure
                    self.send_json({
                        'success': False,
                        'error': f'圖片分析失敗：{str(vision_error)}',
                        'fallback': True
                    })
                
        except Exception as e:
            import traceback
            _safe_print(f"[Image] FATAL: {traceback.format_exc()}")
            self.send_json({'error': f'處理圖片時出錯：{str(e)}'}, status=500)

    def handle_location_search(self):
        """
        處理經緯度實時周邊搜索
        POST /api/search
        Body: { lat, lng, query_type, radius }
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            # 驗證參數
            lat = data.get('lat')
            lng = data.get('lng')
            query_type = data.get('query_type', 'all')  # attractions|restaurants|hotels|shopping|all
            radius = data.get('radius', 2000)
            
            if lat is None or lng is None:
                self.send_json({
                    'success': False,
                    'error': '缺少經緯度參數 (lat, lng)',
                    'data': None
                }, status=400)
                return
            
            # 驗證 query_type
            valid_types = ['attractions', 'restaurants', 'hotels', 'shopping', 'bus', 'all']
            if query_type not in valid_types:
                query_type = 'all'
            
            _safe_print(f"[handle_location_search] lat={lat}, lng={lng}, type={query_type}")
            
            # 檢查搜索模組是否已加載
            if search_location is None:
                self.send_json({
                    'success': False,
                    'error': '搜索模組未加載',
                    'data': {
                        'location_name': f"({lat}, {lng})",
                        'places': [],
                        'summary': '系統錯誤：搜索功能暫時不可用',
                        'source': 'error'
                    }
                }, status=500)
                return
            
            # 調用搜索模組
            result = search_location(float(lat), float(lng), query_type, int(radius))
            
            self.send_json(result)
            
        except json.JSONDecodeError:
            self.send_json({
                'success': False,
                'error': '無效的 JSON 數據',
                'data': None
            }, status=400)
        except Exception as e:
            _safe_print(f"[handle_location_search] Error: {e}")
            self.send_json({
                'success': False,
                'error': str(e),
                'data': {
                    'location_name': '',
                    'places': [],
                    'summary': f'搜索出錯：{str(e)}',
                    'source': 'error'
                }
            }, status=500)

    def handle_transit(self):
        """
        處理公共交通查詢 (ODsay API 代理)
        POST /api/transit
        Body: { lat, lng, type: 'bus'|'subway' }
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            _safe_print(f"Transit request body: {body}")
            data = json.loads(body)
            
            lat = data.get('lat')
            lng = data.get('lng')
            transit_type = data.get('type', 'bus')
            
            _safe_print(f"Transit type: {transit_type}, lat: {lat}, lng: {lng}")
            
            if not lat or not lng:
                self.send_json({'success': False, 'error': '缺少經緯度'}, status=400)
                return

            # 如果沒有 ODsay Key，返回模擬數據
            if ODSAY_API_KEY == 'YOUR_ODSAY_KEY_HERE':
                self.send_json({
                    'success': True,
                    'is_demo': True,
                    'data': self._get_demo_transit_data(lat, lng, transit_type)
                })
                return

            # 使用 ODsay API 獲取數據
            result = self._fetch_odsay_data(lat, lng, transit_type)
            
            self.send_json({'success': True, 'data': result})
            
        except Exception as e:
            import traceback
            _safe_print(f"Transit handle error: {traceback.format_exc()}")
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_google_places(self):
        """
        處理 Google Places 查詢
        POST /api/google-places
        Body: { lat, lng, radius }
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            lat = data.get('lat')
            lng = data.get('lng')
            radius = data.get('radius', 500)
            
            _safe_print(f"Google Places request: lat={lat}, lng={lng}, radius={radius}")
            
            if lat is None or lng is None:
                self.send_json({'success': False, 'error': '缺少經緯度參數 (lat, lng)'}, status=400)
                return

            if get_google_location_info is None:
                self.send_json({'success': False, 'error': 'Google Places 功能未啟用或未正確載入'}, status=503)
                return

            # 調用 Google Places 方法
            result = get_google_location_info(lat, lng, radius)
            
            if result.get('success'):
                self.send_json({'success': True, 'data': result})
            else:
                # 即使 success 為 False，也可能是有 count: 0，這不是錯誤
                if 'count' in result and result['count'] == 0:
                    self.send_json({'success': True, 'data': result})
                else:
                    self.send_json({'success': False, 'error': '無法從 Google Places 獲取資料', 'details': result}, status=500)
                
        except Exception as e:
            import traceback
            _safe_print(f"Google Places handle error: {traceback.format_exc()}")
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def _get_demo_transit_data(self, lat, lng, transit_type):
        """當沒有 API Key 時返回模擬數據"""
        if transit_type == 'bus':
            return {
                'stations': [
                    {
                        'name': '明洞站 巴士站 (Myeong-dong Stn)',
                        'id': '02150',
                        'distance': 120,
                        'arrivals': [
                            {'line': '100', 'time': '2 分鐘', 'status': '即將抵達'},
                            {'line': '143', 'time': '7 分鐘', 'status': '正常'}
                        ]
                    }
                ],
                'tips': self._get_transit_tips('bus')
            }
        else:
            return {
                'stations': [
                    {
                        'name': '明洞站 (Myeong-dong)',
                        'line': '4 號線',
                        'distance': 180,
                        'arrivals': [
                            {'line': '4 號線', 'dest': '烏耳島 (Oido)', 'time': '3 分鐘', 'status': '即將抵達'},
                            {'line': '4 號線', 'dest': '榛接 (Jinjeop)', 'time': '6 分鐘', 'status': '正常'}
                        ]
                    }
                ],
                'tips': self._get_transit_tips('subway')
            }

    def _fetch_odsay_data(self, lat, lng, transit_type):
        """從 ODsay 獲取大眾運輸數據"""
        try:
            # 1. 搜尋半徑內的所有車站
            # stationClass: 1:巴士, 2:地鐵, 0:全部
            station_class = "1" if transit_type == 'bus' else "2"
            search_url = f"https://api.odsay.com/v1/api/pointBusStation?apiKey={ODSAY_API_KEY}&x={lng}&y={lat}&radius=400&stationClass={station_class}"
            
            req = urllib.request.Request(search_url)
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                
                if 'result' not in res_data or 'station' not in res_data['result']:
                    return {'stations': [], 'tips': self._get_transit_tips(transit_type)}
                
                stations = []
                # 只取最近 3 個站
                raw_stations = res_data['result']['station'][:3]
                
                for s in raw_stations:
                    station_id = s.get('stationID')
                    station_name = s.get('stationName')
                    dist = s.get('distance')
                    
                    arrivals = []
                    if transit_type == 'bus':
                        arrivals = self._fetch_odsay_bus_arrivals(station_id)
                    else:
                        arrivals = self._fetch_odsay_subway_arrivals(station_id)
                        
                    stations.append({
                        'name': station_name,
                        'id': station_id,
                        'distance': dist,
                        'arrivals': arrivals
                    })
                
                return {
                    'stations': stations,
                    'tips': self._get_transit_tips(transit_type)
                }
        except Exception as e:
            _safe_print(f"ODsay API Error: {e}")
            return {'error': f'無法獲取交通資訊: {str(e)}', 'stations': []}

    def _fetch_odsay_bus_arrivals(self, station_id):
        """獲取巴士實時到站資訊"""
        try:
            url = f"https://api.odsay.com/v1/api/realtimeStation?apiKey={ODSAY_API_KEY}&stationID={station_id}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                
                arrivals = []
                if 'result' in res_data and 'realtime' in res_data['result']:
                    for arr in res_data['result']['realtime']:
                        line_no = arr.get('routeNm')
                        # 處理到站時間 (ODsay 返回秒數或訊息)
                        arrival_msg = arr.get('arrivalMsg', '未知')
                        
                        # 簡化時間顯示
                        time_display = arrival_msg
                        status = '正常'
                        if '分鐘' in arrival_msg:
                            time_display = arrival_msg
                        elif '秒' in arrival_msg:
                            try:
                                # 嘗試轉換為分鐘
                                seconds = int(arrival_msg.replace('秒', ''))
                                time_display = f"{max(1, seconds // 60)} 分鐘"
                            except:
                                pass
                        elif '약' in arrival_msg: # "約..."
                            time_display = arrival_msg.replace('약', '約').replace('분', ' 分鐘')
                        
                        if '곧 도착' in arrival_msg or '即將' in arrival_msg:
                            status = '即將抵達'
                            time_display = '即將抵達'

                        arrivals.append({
                            'line': line_no,
                            'time': time_display,
                            'status': status
                        })
                return arrivals[:5]
        except:
            return []

    def _fetch_odsay_subway_arrivals(self, station_id):
        """獲取地鐵實時到站資訊 (ODsay subwayStationInfo)"""
        try:
            # 注意：ODsay 的 realtimeStation 對地鐵支援可能較限於特定城市，
            # 這裡先用 subwayStationInfo 獲取基本資訊，如果需要實時則需要另外處理
            url = f"https://api.odsay.com/v1/api/subwayStationInfo?apiKey={ODSAY_API_KEY}&stationID={station_id}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                
                arrivals = []
                if 'result' in res_data:
                    # ODsay subwayStationInfo 返回的是靜態資訊，實時資訊在 realtimeStation
                    # 嘗試再次呼叫 realtimeStation 獲取地鐵實時數據
                    rt_url = f"https://api.odsay.com/v1/api/realtimeStation?apiKey={ODSAY_API_KEY}&stationID={station_id}"
                    with urllib.request.urlopen(urllib.request.Request(rt_url), timeout=5) as rt_resp:
                        rt_data = json.loads(rt_resp.read().decode('utf-8'))
                        if 'result' in rt_data and 'realtime' in rt_data['result']:
                            for arr in rt_data['result']['realtime']:
                                dest = arr.get('endpointName', '未知')
                                msg = arr.get('arrivalMsg', '正常')
                                arrivals.append({
                                    'line': res_data['result'].get('laneName', '地鐵'),
                                    'dest': dest,
                                    'time': msg,
                                    'status': '即將抵達' if '곧 도착' in msg else '正常'
                                })
                return arrivals[:4]
        except:
            return []

    def _get_transit_tips(self, transit_type):
        """獲取 Rookie-friendly 交通貼士"""
        if transit_type == 'bus':
            return [
                '💡 使用 T-money 卡轉乘可享優惠。',
                '🚌 韓國巴士前門上車、後門落車，記住落車要拍卡！',
                '📱 巴士站牌通常有 QR Code 可以掃描查看更詳細嘅實時位置。'
            ]
        else:
            return [
                '🚇 韓國地鐵入閘後，5 分鐘內同站出閘係免費嘅（入錯邊可以用呢招）。',
                '🚉 轉乘站步行距離可能好長，請跟住地面或天花板嘅顏色線行。',
                '💳 唔夠錢可以喺站內「自動充值機」加錢落 T-money 卡。'
            ]
    
    def handle_sync_locations(self):
        """同步地點列表到伺服器"""
        _safe_print(f"DEBUG: handle_sync_locations called")
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            new_locations = json.loads(body)
            
            if not isinstance(new_locations, list):
                self.send_json({'success': False, 'error': 'Invalid data format, expected list'}, status=400)
                return

            # 嚴格數據驗證
            validated_locations = []
            for loc in new_locations:
                # 必填字段檢查
                if not all(k in loc for k in ('id', 'name', 'lat', 'lng')):
                    _safe_print(f"DEBUG: Skipping invalid location (missing fields): {loc.get('name', 'Unknown')}")
                    continue
                
                # 類型與數值範圍檢查
                try:
                    lat = float(loc['lat'])
                    lng = float(loc['lng'])
                    # 簡單範圍檢查 (首爾大致範圍: 37.4~37.7, 126.7~127.2)
                    # 放寬一點以兼容周邊地區
                    if not (30 < lat < 45 and 120 < lng < 135):
                        _safe_print(f"DEBUG: Skipping invalid location (out of range): {loc['name']} ({lat}, {lng})")
                        continue
                    
                    # 確保類型正確
                    validated_loc = {
                        'id': str(loc['id']),
                        'name': str(loc['name']),
                        'lat': lat,
                        'lng': lng,
                        'category': str(loc.get('category', '地標觀景')),
                        'description': str(loc.get('description', '')),
                        'address': str(loc.get('address', '')),
                        'price': str(loc.get('price', '')),
                        'addedAt': int(loc.get('addedAt', time.time() * 1000)),
                        'updatedAt': int(loc.get('updatedAt', time.time() * 1000)),
                        'ownerFingerprint': str(loc.get('ownerFingerprint', 'unknown')),
                        'wish': bool(loc.get('wish', False)),
                        'pinned': bool(loc.get('pinned', False)),
                        'visited': bool(loc.get('visited', False)),
                        'myRemark': str(loc.get('myRemark', '')),
                        'deleted': bool(loc.get('deleted', False))
                    }
                    validated_locations.append(validated_loc)
                except (ValueError, TypeError):
                    _safe_print(f"DEBUG: Skipping invalid location (type error): {loc.get('name', 'Unknown')}")
                    continue

            with file_lock:
                shared_data = []
                if os.path.exists(SHARED_LOCATIONS_FILE):
                    with open(SHARED_LOCATIONS_FILE, 'r', encoding='utf-8') as f:
                        try:
                            shared_data = json.load(f)
                        except json.JSONDecodeError:
                            shared_data = []
                
                # 合併數據，基於 ID 去重與更新
                existing_map = {loc['id']: i for i, loc in enumerate(shared_data)}
                changed = False
                for loc in validated_locations:
                    if loc['id'] not in existing_map:
                        shared_data.append(loc)
                        existing_map[loc['id']] = len(shared_data) - 1
                        changed = True
                    else:
                        idx = existing_map[loc['id']]
                        # 基於 updatedAt 判斷是否需要更新（時間戳較新的獲勝）
                        old_loc = shared_data[idx]
                        
                        # 強制轉換兩者為整數進行比較，處理可能的歷史字串數據
                        try:
                            new_ts = int(loc.get('updatedAt', loc.get('addedAt', 0)))
                            old_ts = int(old_loc.get('updatedAt', old_loc.get('addedAt', 0)))
                            
                            if new_ts > old_ts:
                                shared_data[idx] = loc
                                changed = True
                                _safe_print(f"DEBUG: Updating {loc['name']} ({loc['id']}): {old_ts} -> {new_ts}")
                        except (ValueError, TypeError):
                            # 如果舊數據損壞，直接覆蓋
                            shared_data[idx] = loc
                            changed = True
                            _safe_print(f"DEBUG: Overwriting corrupted/old data for {loc['name']}")
                
                if changed:
                    # 原子寫入
                    temp_file = SHARED_LOCATIONS_FILE + '.tmp'
                    with open(temp_file, 'w', encoding='utf-8') as f:
                        json.dump(shared_data, f, ensure_ascii=False, indent=2)
                    os.replace(temp_file, SHARED_LOCATIONS_FILE)
                    _safe_print(f"DEBUG: Saved changes to {SHARED_LOCATIONS_FILE}")
                
            self.send_json({'success': True, 'count': len(shared_data), 'updated': changed})
        except Exception as e:
            _safe_print(f"DEBUG: handle_sync_locations error: {e}")
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_get_locations(self):
        """獲取所有共享地點"""
        try:
            with file_lock:
                if os.path.exists(SHARED_LOCATIONS_FILE):
                    with open(SHARED_LOCATIONS_FILE, 'r', encoding='utf-8') as f:
                        shared_data = json.load(f)
                else:
                    shared_data = []
            self.send_json({'success': True, 'locations': shared_data})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_stream_locations(self):
        """SSE endpoint for real-time location updates"""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_cors_headers()
        self.end_headers()

        last_mtime = 0
        try:
            while True:
                current_mtime = 0
                if os.path.exists(SHARED_LOCATIONS_FILE):
                    current_mtime = os.path.getmtime(SHARED_LOCATIONS_FILE)

                if current_mtime > last_mtime or last_mtime == 0:
                    with file_lock:
                        if os.path.exists(SHARED_LOCATIONS_FILE):
                            try:
                                with open(SHARED_LOCATIONS_FILE, 'r', encoding='utf-8') as f:
                                    shared_data = json.load(f)
                            except json.JSONDecodeError:
                                shared_data = []
                        else:
                            shared_data = []
                            
                    payload = json.dumps({'success': True, 'locations': shared_data}, ensure_ascii=False)
                    self.wfile.write(f"data: {payload}\n\n".encode('utf-8'))
                    self.wfile.flush()
                    last_mtime = current_mtime if current_mtime > 0 else 1
                
                time.sleep(2)
        except (BrokenPipeError, ConnectionResetError, OSError):
            # Client disconnected gracefully
            pass
        except Exception as e:
            _safe_print(f"DEBUG: handle_stream_locations error: {e}")

    def send_json(self, data, status=200):
        """Send JSON response, gracefully handle broken pipes"""
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        except (BrokenPipeError, ConnectionResetError, OSError):
            # Client disconnected - nothing we can do
            pass

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def handle_get_config(self):
        """Return frontend configuration (radius defaults, etc.)"""
        config = {
            'radius': {
                'default_val': RADIUS_DEFAULT_VAL,
                'default_unit': RADIUS_DEFAULT_UNIT,
                'default_center_lat': RADIUS_DEFAULT_CENTER_LAT,
                'default_center_lng': RADIUS_DEFAULT_CENTER_LNG
            }
        }
        self.send_json(config)

    def handle_health_check(self):
        """啟動時狀態檢查：檢查 AI backend 同 Hermes Worker 可達性"""
        import time
        global _health_cache
        
        # Return cached result if still fresh
        now = time.time()
        if _health_cache['result'] and (now - _health_cache['timestamp']) < _HEALTH_CACHE_TTL:
            self.send_json(_health_cache['result'])
            return

        result = {
            'status': 'ok',
            'server': 'running',
            'timestamp': int(now),
            'services': {}
        }

        # 檢查 Ollama Cloud AI API 可達性
        ai_status = 'unknown'
        ai_latency_ms = None
        try:
            start = time.time()
            # 發送輕量級 API 測試請求（只檢查連通性，用最短 prompt）
            test_payload = {
                "model": MODEL,
                "messages": [{"role": "user", "content": "hi"}],
                "stream": False,
                "max_tokens": 1
            }
            req = urllib.request.Request(
                f"{API_BASE}/chat/completions",
                data=json.dumps(test_payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    **({'Authorization': f'Bearer {API_KEY}'} if API_KEY else {})
                }
            )
            opener = create_urllib_opener()
            with opener.open(req, timeout=10) as resp:
                ai_latency_ms = int((time.time() - start) * 1000)
                ai_status = 'online'
        except urllib.error.HTTPError as e:
            # 401/403 = API reachable but auth issue; 429 = rate limited but reachable
            ai_latency_ms = int((time.time() - start) * 1000)
            if e.code in (401, 403, 429, 400):
                ai_status = 'reachable'  # API 可連接但認證/限流問題
            else:
                ai_status = 'error'
        except Exception as e:
            ai_latency_ms = None
            ai_status = 'offline'

        result['services']['ai'] = {
            'status': ai_status,
            'latency_ms': ai_latency_ms,
            'model': MODEL
        }

        # 檢查 Hermes Worker 狀態（通過任務隊列判斷是否有 worker 在監聽）
        hermes_status = 'disabled'
        if HERMES_ENABLED:
            # 檢查是否有 response 文件（表示 worker 存在並在處理）
            try:
                if os.path.isdir(HERMES_TASK_DIR):
                    response_files = [f for f in os.listdir(HERMES_TASK_DIR) if f.startswith('response_')]
                    pending_files = [f for f in os.listdir(HERMES_TASK_DIR) if f.startswith('request_')]
                    if len(response_files) > 0:
                        hermes_status = 'busy'  # 有正在處理的任務
                    elif len(pending_files) > 5:
                        hermes_status = 'overloaded'  # 積壓太多任務
                    else:
                        hermes_status = 'idle'
                else:
                    hermes_status = 'not_configured'
            except Exception:
                hermes_status = 'error'
        
        result['services']['hermes'] = {
            'status': hermes_status,
            'enabled': HERMES_ENABLED
        }

        # 檢查搜索模組
        result['services']['search'] = {
            'status': 'available' if search_location else 'unavailable'
        }

        # 整體狀態判斷
        if ai_status in ('online', 'reachable'):
            result['status'] = 'ok'
        elif ai_status == 'offline':
            result['status'] = 'degraded'  # 伺服器在行但 AI 唔通
        else:
            result['status'] = 'unknown'

        # Cache the result
        _health_cache['result'] = result
        _health_cache['timestamp'] = time.time()

        self.send_json(result)

    def log_message(self, format, *args):
        # 只打印到控制台，避免文件權限問題
        _safe_print(format % args)

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # 使用 ThreadingHTTPServer 單獨線程處理 request，避免阻塞
    from http.server import HTTPServer
    from socketserver import ThreadingMixIn

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    with ThreadingHTTPServer(("", PORT), Handler) as httpd:
        _safe_print(f"🗺️  首爾旅遊地圖平台已啟動：http://localhost:{PORT}")
        _safe_print(f"   按 Ctrl+C 停止伺服器")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            _safe_print("\n伺服器已停止")
            sys.exit(0)
