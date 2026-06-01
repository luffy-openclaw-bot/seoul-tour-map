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
            self.send_json({'status': 'ok'})
            return

        # 靜態文件
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/chat':
            self.handle_chat()
            return
        self.send_error(404)

    def handle_chat(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            user_message = data.get('message', '')
            system_prompt = data.get('system', '')

            # 構建系統提示
            full_system = """你係一個韓國首爾旅遊專家 AI 助手，用粵語（廣東話書面）回答。
你非常熟悉首爾嘅景點、交通、美食、購物、文化。
請簡潔、友善咁回答用戶問題，提供實用旅遊建議。
如果問到具體景點資料，請盡量詳細。"""

            if system_prompt:
                full_system += "\n" + system_prompt

            # 檢查是否應該委託給 Hermes Agent 處理複雜查詢
            if self._should_delegate_to_hermes(user_message):
                hermes_reply = self._delegate_to_hermes(user_message, system_prompt)
                if hermes_reply:
                    self.send_json({'reply': hermes_reply, 'source': 'hermes'})
                    return

            # 嘗試使用 Ollama Cloud API
            try:
                ollama_reply = self._call_ollama_api(full_system, user_message)
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


    def _should_delegate_to_hermes(self, user_message):
        """決定是否應該將查詢委託給 Hermes Agent"""
        if not HERMES_ENABLED:
            return False

        # 複雜查詢的關鍵字，表明可能需要工具使用
        complex_indicators = [
            '最新', '今日', '昨天', '新聞', '股票', '匯率', '天氣', '氣溫',  # 需要實時資訊
            '搜索', '找', '查', 'google', '網上',  # 需要網頁搜索
            '計算', '算', '數學', '公式',  # 需要計算
            '圖表', '圖像', '分析',  # 需要視覺處理
            '檔案', '讀取', '寫入', '編輯',  # 需要檔案操作
            '程式', '代碼', '函數', '算法',  # 需要代碼執行
            '比較', '對比', '評價', '推薦',  # 需要綜合分析
            '詳細', '深入', '全面', '綜合'  # 需要深度研究
        ]
        
        message_lower = user_message.lower()
        return any(indicator in message_lower for indicator in complex_indicators)

    def _delegate_to_hermes(self, user_message, system_prompt):
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
                        # 清理任務文件
                        os.remove(request_file)
                        os.remove(response_file)
                        return response_data.get('reply', '')
                    except Exception as e:
                        print(f"Error reading Hermes response: {e}")
                        break
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

    def _call_ollama_api(self, system_prompt, user_message):
        """調用 Ollama Cloud API"""
        # 準備 Ollama API 請求 (OpenAI-compatible format)
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
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

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

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
