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

PORT = 8082
# Ollama Cloud API 設定
API_BASE = 'https://ollama.com/v1'
API_KEY='c309d7242319461783142d44f3949473.Cvsj6THEdCx3lfLBGAwYgtWx'
MODEL = 'gemma4:31b-cloud'  # 使用 Gemma 4 31B Cloud model

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

            # 準備 Ollama API 請求 (OpenAI-compatible format)
            payload = {
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": full_system},
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

            try:
                # 使用 custom opener with SSL context
                opener = create_urllib_opener()
                with opener.open(req, timeout=30) as resp:
                    result = json.loads(resp.read().decode('utf-8'))
                    reply = result.get('choices', [{}])[0].get('message', {}).get('content', 'AI 暫時未能回應，請稍後再試。')
                    self.send_json({'reply': reply})
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
                # 如果 Ollama 唔 available，回退到前端知識庫
                self.send_json({
                    'reply': 'AI 伺服器暫時未能連接，已啟用離線知識庫回答。',
                    'fallback': True
                })

        except Exception as e:
            self.send_json({'reply': f'系統錯誤：{str(e)}', 'error': True})

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
