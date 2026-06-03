#!/usr/bin/env python3
"""
首爾旅遊地圖平台 - 輕量級伺服器
提供靜態文件服務 + AI 聊天 API
"""

# Load .env file before any other imports that read env vars
from dotenv import load_dotenv
load_dotenv()

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import os
import sys
import time
import glob

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
else:
    search_location = None

PORT = 8082
# Ollama Cloud API 設定 - 可通過環境變數覆蓋
API_BASE = os.getenv('OLLAMA_API_BASE', 'https://ollama.com/v1')
API_KEY = os.getenv('OLLAMA_API_KEY', 'c309d7242319461783142d44f3949473.Cvsj6THEdCx3lfLBGAwYgtWx')
MODEL = os.getenv('OLLAMA_MODEL', 'gemma4:31b-cloud')  # 使用 Gemma 4 31B Cloud model

# Hermes Agent 任務隊列設定
HERMES_ENABLED = os.getenv('HERMES_ENABLED', 'false').lower() == 'true'
HERMES_TASK_DIR = '/tmp/hermes_tasks'
HERMES_TIMEOUT = 120  # 秒

# SSL context 不驗證 cert（因 Ollama Cloud cert 可能過期）
import ssl
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# 使用 custom opener with SSL context
def create_urllib_opener():
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context))
    return opener

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 設置工作目錄為 seoul-tour-map
        self.workdir = os.path.join(os.path.dirname(__file__), '..', 'seoul-tour-map')
        super().__init__(*args, directory=self.workdir, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        # API 端點
        if self.path == '/api/health':
            self.handle_health_check()
            return

        # 靜態文件
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/chat':
            self.handle_chat()
            return
        if self.path == '/api/nearby':
            self.handle_nearby()
            return
        if self.path == '/api/execute':
            self.handle_execute()
            return
        if self.path == '/api/analyze-image':
            self.handle_analyze_image()
            return
        if self.path == '/api/search':
            self.handle_location_search()
            return
        self.send_error(404)

    def handle_chat(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            user_message = data.get('message', '')
            system_prompt = data.get('system', '')
            chat_history = data.get('history', [])  # 獲取對話歷史

            # 構建系統提示
            full_system = """你係一個韓國首爾旅遊專家 AI 助手，用粵語（廣東話書面）回答。
你非常熟悉首爾嘅景點、交通、美食、購物、文化。
請簡潔、友善咁回答用戶問題，提供實用旅遊建議。
如果問到具體景點資料，請盡量詳細。

【地圖控制指令】
當用家需要睇地圖、想知道位置、或想去某個地方，你可以喺回覆尾加上一個特殊指令。
指令格式：將以下 JSON 放喺【...】內，例如 【{"action":"center","params":{"lat":37.5635,"lng":126.9895,"zoom":15}}】

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

9. add_to_list：將提及嘅地點永久加入景點列表
   用途：每次提及具體地點（咖啡店、酒店、景點、餐廳等）時，除咗加地圖標記，仲要將佢加入左側景點列表，方便用戶之後搵返
   示例：「機場有 Starbucks」→ 除咗 add_marker，仲要加【{"action":"add_to_list","params":{"name":"Starbucks（仁川機場）","lat":37.4602,"lng":126.4407,"category":"購物美食","description":"機場內連鎖咖啡店"}}】
   參數：name（地點名稱）, lat, lng（坐標）, category（分類，用現有分類名：地標觀景/購物美食/自然公園/文化藝術/夜生活/住宿/交通）, description（簡短描述，可選）, color（顏色，可選）

注意：
- 用戶問具體景點位置（如「景福宮喺邊」），用 center + add_marker 組合
- 用戶問區域（如「明洞有咩玩」），用 add_polygon 顯示範圍
- 每次新查詢，先加 clear_search_markers 清除之前標記
- 只喺需要移動地圖、顯示位置、顯示範圍時先用呢啲指令。唔好每個回覆都加指令。
- 提及具體地點時（咖啡店、酒店、餐廳、景點等），必須用 add_to_list 將佢加入景點列表，同時用 add_marker 喺地圖標示位置。兩個動作組合使用。
"""

            if system_prompt:
                full_system += "\n" + system_prompt

            # 檢查是否應該委託給 Hermes Agent 處理複雜查詢
            should_delegate = self._should_delegate_to_hermes(user_message)
            if should_delegate:
                hermes_reply = self._delegate_to_hermes(user_message, full_system, chat_history)
                if hermes_reply:
                    self.send_json({'reply': hermes_reply, 'source': 'hermes'})
                    return

            # 嘗試使用 Ollama Cloud API
            try:
                ollama_reply = self._call_ollama_api(full_system, user_message, chat_history)
                if ollama_reply:
                    self.send_json({'reply': ollama_reply, 'source': 'ollama'})
                    return
            except Exception as e:
                print(f"Ollama API failed: {e}")

            # 回退到離線知識庫
            offline_reply = self._generate_offline_reply(user_message)
            self.send_json({'reply': offline_reply, 'source': 'offline'})

        except Exception as e:
            self.send_json({'reply': f'系統錯誤：{str(e)}', 'error': True})

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
            attractions_file = os.path.join(self.workdir, 'static/data/attractions.json')
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
                        'name_ko': attr.get('name_ko'),
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
                    reply += f"**{i}. {attr['name']}** ({attr['name_ko']})\n"
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

            # 白名單驗證
            ALLOWED_ACTIONS = {
                'center': {'lat': float, 'lng': float, 'zoom': int},
                'focus_attraction': {'id': str},
                'highlight_category': {'category': str},
                'locate_user': {},
                'show_route': {'from': str, 'to': str},
                'add_marker': {'lat': float, 'lng': float, 'title': str, 'color': str, 'popup': str, 'pulse': bool},
                'add_polygon': {'name': str, 'color': str, 'coords': list},
                'clear_search_markers': {},
                'add_to_list': {'name': str, 'lat': float, 'lng': float, 'category': str, 'description': str, 'color': str},
            }

            if action not in ALLOWED_ACTIONS:
                self.send_json({'success': False, 'error': f'Unknown action: {action}'}, status=400)
                return

            # 參數類型驗證
            expected = ALLOWED_ACTIONS[action]
            for key, expected_type in expected.items():
                if key in params:
                    try:
                        params[key] = expected_type(params[key])
                    except (ValueError, TypeError):
                        self.send_json({'success': False, 'error': f'Invalid type for {key}'}, status=400)
                        return

            self.send_json({'success': True, 'action': action, 'params': params})

        except json.JSONDecodeError:
            self.send_json({'success': False, 'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def _should_delegate_to_hermes(self, user_message):
        """決定是否應該將查詢委託給 Hermes Agent"""
        if not HERMES_ENABLED:
            return False

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
            '詳細', '深入', '全面', '綜合'
        ]
        
        message_lower = user_message.lower()
        return any(indicator in message_lower for indicator in complex_indicators)

    def _delegate_to_hermes(self, user_message, system_prompt, history=None):
        """將任務委託給 Hermes Agent 並等待回覆"""
        try:
            # 生成唯一任務ID
            import uuid
            task_id = str(uuid.uuid4())
            
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
            
            # 等待響應（帶超時）
            start_time = time.time()
            response_file = os.path.join(HERMES_TASK_DIR, f'response_{task_id}.json')
            
            while time.time() - start_time < HERMES_TIMEOUT:
                if os.path.exists(response_file):
                    try:
                        with open(response_file, 'r', encoding='utf-8') as f:
                            response_data = json.load(f)
                        # 清理任務文件（忽略文件不存在錯誤）
                        try:
                            if os.path.exists(request_file):
                                os.remove(request_file)
                            os.remove(response_file)
                        except FileNotFoundError:
                            pass  # Worker 可能已經刪除咗
                        return response_data.get('reply', '')
                    except Exception as e:
                        print(f"Error reading Hermes response: {e}")
                time.sleep(0.5)  # 每500ms檢查一次
            
            # 超時
            print(f"Hermes delegation timeout for task {task_id}")
            # 清理請求文件
            if os.path.exists(request_file):
                os.remove(request_file)
            return None
            
        except Exception as e:
            print(f"Hermes delegation failed: {e}")
            return None

    def _call_ollama_api(self, system_prompt, user_message, history=None):
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
            "temperature": 0.7,
            "max_tokens": 800
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
        """Generate offline knowledge base reply"""
        return 'AI 伺服器暫時未能連接，已啟用離線知識庫回答。'

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
                        print(f"[Image] EXIF GPS found: {lat}, {lng}")
            except Exception as exif_err:
                print(f"[Image] EXIF extraction skipped: {exif_err}")
            # =========================================================================
            
            # =========================================================================
            # Step 2: Read attractions data for AI context
            # =========================================================================
            attractions_list = []  # Initialize to avoid scope issues
            try:
                attractions_file = os.path.join(self.workdir, 'static/data/attractions.json')
                with open(attractions_file, 'r', encoding='utf-8') as f:
                    attractions_list = json.load(f).get('attractions', [])
                    attractions_info = '\n'.join([
                        f"- {a['name']}({a['name_ko']}): lat={a['lat']}, lng={a['lng']}, {a['description'][:50]}..."
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
                nearby_hint = ', '.join([f"{a['name']}({a['name_ko']})" for _, a in nearest_attrs[:5]])
                gps_hint = f"\n\n【重要提示】呢張相嘅 GPS 坐標係 ({exif_gps['lat']:.4f}, {exif_gps['lng']:.4f})，附近最近嘅景點係：{nearby_hint}。請用呢個 GPS 坐標作為參考。"
            
            vision_prompt = f"""你係一個首爾旅遊景點識別專家。請仔細觀察呢張圖片，判斷呢係邊個首爾景點。

可參考嘅首爾景點：
{attractions_info}{gps_hint}

請以 JSON 格式回覆：
{{
    "landmark_name": "景點中文名稱",
    "landmark_name_ko": "韓文名稱",
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
                    print(f"[Image] API raw response (first 300 chars): {raw_body[:300]}")
                    result = json.loads(raw_body)
                
                ai_reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                print(f"[Image] AI reply (first 200 chars): {ai_reply[:200]}")
                
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
                        print(f"[Image] Using EXIF GPS as fallback: {exif_gps['lat']}, {exif_gps['lng']}")
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
                                     f"{analysis.get('landmark_name_ko', '')}<br>"
                                     f"信心度: {float(analysis.get('confidence', 0)):.0%}<br>"
                                     f"{analysis.get('description', '')}"
                                     f"{'<br>📡 GPS定位' if exif_gps else ''}",
                            'pulse': True
                        }
                    }
                })
                
            except Exception as vision_error:
                print(f"[Image] Vision analysis failed: {type(vision_error).__name__}: {vision_error}")
                
                # =====================================================================
                # Fallback: if vision fails but we have EXIF GPS, return the GPS location
                # =====================================================================
                if exif_gps:
                    # Read attractions fresh (avoid scope issues with attractions_list)
                    import math
                    fallback_attrs = []
                    try:
                        attractions_file = os.path.join(self.workdir, 'static/data/attractions.json')
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
                                'landmark_name_ko': nearest['name_ko'],
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
                                    'popup': f"<b>{nearest['name']} (GPS推算)</b><br>{nearest['name_ko']}<br>📡 從GPS定位推算<br>信心度: 50%",
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
                                'landmark_name_ko': '',
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
            print(f"[Image] FATAL: {traceback.format_exc()}")
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
            valid_types = ['attractions', 'restaurants', 'hotels', 'shopping', 'all']
            if query_type not in valid_types:
                query_type = 'all'
            
            print(f"[handle_location_search] lat={lat}, lng={lng}, type={query_type}")
            
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
            print(f"[handle_location_search] Error: {e}")
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

    def handle_health_check(self):
        """啟動時狀態檢查：檢查 AI backend 同 Hermes Worker 可達性"""
        import time
        result = {
            'status': 'ok',
            'server': 'running',
            'timestamp': int(time.time()),
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

        self.send_json(result)

    def log_message(self, format, *args):
        # 靜音日誌
        pass

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(__file__), '..', 'seoul-tour-map'))

    # 使用 ThreadingHTTPServer 單獨線程處理 request，避免阻塞
    from http.server import HTTPServer
    from socketserver import ThreadingMixIn

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    with ThreadingHTTPServer(("", PORT), Handler) as httpd:
        print(f"🗺️  首爾旅遊地圖平台已啟動：http://localhost:{PORT}")
        print(f"   按 Ctrl+C 停止伺服器")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已停止")
            sys.exit(0)
