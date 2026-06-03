"""
Location Search Module - 經緯度實時周邊搜索模組
模組化設計，易維護、易重用

功能：
1. 逆地理編碼 (Nominatim)
2. 實時網頁搜索 (Hermes Worker + DuckDuckGo)
3. AI 結果分析 (Ollama Cloud)
"""

# Load .env file before any other imports that read env vars
from dotenv import load_dotenv
load_dotenv()

import json
import urllib.request
import urllib.parse
import os
import ssl
import time
import glob
import uuid
import subprocess
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict

# SSL context 不驗證 cert
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# 配置
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
HERMES_TASK_DIR = '/tmp/hermes_tasks'
HERMES_TIMEOUT = 60  # 秒

OLLAMA_API_BASE = os.getenv('OLLAMA_API_BASE', 'https://ollama.com/v1')
OLLAMA_API_KEY = os.getenv('OLLAMA_API_KEY', 'c309d7242319461783142d44f3949473.Cvsj6THEdCx3lfLBGAwYgtWx')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'gemma4:31b-cloud')


@dataclass
class PlaceInfo:
    """地點資訊數據類"""
    name: str
    category: str
    distance: str
    description: str
    highlights: List[str]
    rating: str
    price: str
    latest_review: str
    tips: str
    source_url: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None


@dataclass
class SearchResult:
    """搜索結果數據類"""
    location_name: str
    places: List[PlaceInfo]
    summary: str
    source: str
    search_query: str
    search_urls: List[str]


class LocationSearcher:
    """位置搜索器 - 核心類"""
    
    # 搜索類型模板
    QUERY_TEMPLATES = {
        "attractions": "{location} attractions things to do 2025 travel guide",
        "restaurants": "{location} restaurants food dining recommendation reviews 2025",
        "hotels": "{location} hotels accommodation booking reviews 2025",
        "shopping": "{location} shopping malls markets stores 2025",
        "all": "{location} travel guide attractions restaurants hotels things to do"
    }
    
    # 類別關鍵詞映射（用於 AI 分類）
    CATEGORY_KEYWORDS = {
        "attractions": ["景點", "attraction", "sight", "temple", "palace", "museum", "park", "tower"],
        "restaurants": ["餐廳", "restaurant", "food", "dining", "cafe", "food", "bar"],
        "hotels": ["酒店", "hotel", "accommodation", "hostel", "guesthouse"],
        "shopping": ["購物", "shopping", "mall", "market", "store", "shop"]
    }
    
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl_context)
        )
    
    def search(self, lat: float, lng: float, query_type: str = "all", radius: int = 2000) -> Dict:
        """
        主搜索方法
        
        Args:
            lat: 緯度
            lng: 經度
            query_type: attractions|restaurants|hotels|shopping|all
            radius: 搜索半徑（米）
        
        Returns:
            dict: 標準化搜索結果
        """
        try:
            # Step 1: 逆地理編碼獲取地址
            location_info = self._reverse_geocode(lat, lng)
            if not location_info:
                return self._error_response("無法獲取位置資訊")
            
            location_name = location_info.get('display_name', f"{lat}, {lng}")
            
            # Step 2: 構建搜索查詢
            search_query = self._build_query(location_name, query_type)
            
            # Step 3: 直接使用 AI 知識庫分析（跳過 web search，因 worker 使用不同命名協議）
            # AI 內置豐富旅遊知識，比脆弱的實時搜索更可靠
            places = self._analyze_with_ai(
                {'results': '', 'urls': []}, query_type, location_name, lat, lng
            )
            
            # Step 4: 構建返回結果
            result = SearchResult(
                location_name=location_name,
                places=places,
                summary=self._generate_summary(location_name, places, query_type),
                source="ai_knowledge",
                search_query=search_query,
                search_urls=[]
            )
            
            return self._success_response(result)
            
        except Exception as e:
            return self._error_response(str(e))
    
    def _reverse_geocode(self, lat: float, lng: float) -> Optional[Dict]:
        """
        使用 Nominatim 進行逆地理編碼
        """
        try:
            params = urllib.parse.urlencode({
                'format': 'json',
                'lat': lat,
                'lon': lng,
                'zoom': 18,
                'addressdetails': 1,
                'accept-language': 'zh-TW,zh-CN,en',
                'namedetails': 1
            })
            
            url = f"{NOMINATIM_URL}?{params}"
            
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SeoulMap/2.0; +https://seoul-tour-map.local)',
                    'Accept': 'application/json',
                    'Accept-Language': 'zh-TW,zh-CN,en'
                }
            )
            
            with self.opener.open(req, timeout=15) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                # 提取簡短位置名
                address = data.get('address', {})
                
                # 優先順序：區/市 > 城市 > 國家
                display_parts = []
                if address.get('suburb'):
                    display_parts.append(address['suburb'])
                elif address.get('neighbourhood'):
                    display_parts.append(address['neighbourhood'])
                
                if address.get('city'):
                    display_parts.append(address['city'])
                elif address.get('town'):
                    display_parts.append(address['town'])
                
                if address.get('country'):
                    display_parts.append(address['country'])
                
                # 如果都無，用 display_name
                short_name = ', '.join(display_parts) if display_parts else data.get('display_name', '')
                
                return {
                    'display_name': short_name,
                    'full_name': data.get('display_name', ''),
                    'address': address,
                    'lat': lat,
                    'lng': lng
                }
                
        except Exception as e:
            print(f"[LocationSearcher] Geocoding error: {e}")
            # Fallback: 返回坐標
            return {
                'display_name': f"Location ({lat:.4f}, {lng:.4f})",
                'full_name': f"{lat}, {lng}",
                'address': {},
                'lat': lat,
                'lng': lng
            }
    
    def _build_query(self, location: str, query_type: str) -> str:
        """構建搜索查詢"""
        template = self.QUERY_TEMPLATES.get(query_type, self.QUERY_TEMPLATES['all'])
        
        # 清理位置名（移除過多的地址部分）
        location_clean = location.split(',')[0] if ',' in location else location
        
        return template.format(location=location_clean)
    
    def _worker_is_running(self) -> bool:
        """快速檢查 Hermes Worker 是否在運行"""
        try:
            result = subprocess.run(
                ['pgrep', '-f', 'hermes_worker.py'],
                capture_output=True, text=True, timeout=3
            )
            return result.returncode == 0
        except Exception:
            return False

    def _perform_web_search(self, query: str) -> Dict:
        """
        使用 Hermes Worker 進行實時網頁搜索
        如果 Worker 不可用，直接返回空結果，由 AI 使用知識庫回答
        """
        # 快速檢查 Worker 狀態，唔使白等
        if not self._worker_is_running():
            print(f"[LocationSearcher] Hermes Worker not running, skipping web search")
            return {'results': '', 'urls': []}

        # 將搜索請求寫入任務文件
        task_id = str(uuid.uuid4())
        task_file = os.path.join(HERMES_TASK_DIR, f"search_{task_id}.json")
        
        task_data = {
            'task_id': task_id,
            'type': 'web_search',
            'query': query,
            'timestamp': time.time(),
            'source': 'seoul_tour_search'
        }
        
        try:
            # 確保目錄存在
            os.makedirs(HERMES_TASK_DIR, exist_ok=True)
            
            # 寫入任務
            with open(task_file, 'w', encoding='utf-8') as f:
                json.dump(task_data, f, ensure_ascii=False)
            
            print(f"[LocationSearcher] Web search task created: {task_id}")
            
            # 等待結果（Worker 已運行，用較短 timeout）
            result = self._wait_for_hermes_result(task_id, timeout=10)
            
            # 清理任務文件
            try:
                os.remove(task_file)
            except:
                pass
            
            if result:
                return result
            
            # Worker 無響應，返回空結果
            print(f"[LocationSearcher] Worker timeout, returning empty result")
            return {'results': '', 'urls': []}
            
        except Exception as e:
            print(f"[LocationSearcher] Web search error: {e}")
            return {'results': '', 'urls': []}
    
    def _wait_for_hermes_result(self, task_id: str, timeout: int) -> Optional[Dict]:
        """等待 Hermes Worker 返回結果"""
        result_file = os.path.join(HERMES_TASK_DIR, f"search_{task_id}_result.json")
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            if os.path.exists(result_file):
                try:
                    with open(result_file, 'r', encoding='utf-8') as f:
                        result = json.load(f)
                    
                    # 清理結果文件
                    try:
                        os.remove(result_file)
                    except:
                        pass
                    
                    print(f"[LocationSearcher] Got result for task: {task_id}")
                    return result
                except Exception as e:
                    print(f"[LocationSearcher] Error reading result: {e}")
                    return None
            
            time.sleep(0.5)
        
        print(f"[LocationSearcher] Timeout waiting for task: {task_id}")
        return None
    
    def _analyze_with_ai(self, search_results: Dict, query_type: str, location_name: str,
                          lat: float = None, lng: float = None) -> List[PlaceInfo]:
        """
        使用 Ollama AI 分析搜索結果
        如果無搜索結果，AI 會基於知識庫回答
        """
        results_text = search_results.get('results', '')
        
        try:
            # 構建 AI 分析請求
            system_prompt = self._get_analysis_prompt(query_type, location_name, bool(results_text))
            
            user_content = f"位置：{location_name}\n搜索中心坐標：({lat:.5f}, {lng:.5f})" if lat and lng else f"位置：{location_name}"
            user_content += "\n\n"
            if results_text:
                user_content += f"搜索結果：\n{results_text[:8000]}"
            else:
                user_content += "無實時搜索結果，請基於你的旅遊知識推薦此地點周邊的景點。"
            
            payload = {
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                "stream": False
            }
            
            req = urllib.request.Request(
                f"{OLLAMA_API_BASE}/chat/completions",
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {OLLAMA_API_KEY}'
                }
            )
            
            with self.opener.open(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))
                ai_response = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                # 解析 AI 回應
                return self._parse_ai_response(ai_response)
                
        except Exception as e:
            print(f"[LocationSearcher] AI analysis error: {e}")
            return []
    
    def _get_analysis_prompt(self, query_type: str, location_name: str, has_search_results: bool) -> str:
        """獲取 AI 分析的 system prompt"""
        
        category_focus = {
            "attractions": "旅遊景點、歷史地標、博物館、寺廟",
            "restaurants": "餐廳、美食推薦、咖啡店、酒吧",
            "hotels": "酒店、旅館、民宿、住宿選擇",
            "shopping": "商場、購物街、市場、特色商店",
            "all": "旅遊景點、餐廳、酒店、購物區"
        }
        
        data_source_note = ""
        if not has_search_results:
            data_source_note = "\n\n注意：由於實時搜索暫時不可用，請基於你對首爾的旅遊知識庫推薦附近地點。"
        
        return f"""你係韓國旅遊資訊分析專家。{data_source_note}

請提取 3-5 個最相關嘅{category_focus.get(query_type, '地點')}，並按以下 JSON 格式輸出：

```json
{{
    "places": [
        {{
            "name": "地點名稱（中文或英文）",
            "category": "類別（如：歷史文化、韓式料理、酒店、購物中心）",
            "lat": 37.5796,
            "lng": 126.9770,
            "description": "簡短描述（30-50字）",
            "highlights": ["亮點1", "亮點2"],
            "rating": "評分（如 4.5/5 或 高/中/低）",
            "price": "價格資訊（如：免費、₩3000、₩30000-50000、$$、$$$）",
            "latest_review": "最新評論摘要（如有）",
            "tips": "旅遊貼士（如：最佳造訪時間、交通建議）"
        }}
    ],
    "summary": "整體摘要（50-80字）"
}}
```

注意：
|- 須包含 lat、lng 坐標，方便地圖標記
|- price 欄位必填：景點填門票或免費，餐廳填人均消費（₩），酒店填每晚房價（₩），購物填消費等級（$/$$/$$$）
|- 用粵語（廣東話書面）撰寫所有文字
|- 如果實在不熟悉該位置，可以建議用戶查詢更具體的地區名稱
"""
    
    def _parse_ai_response(self, response: str) -> List[PlaceInfo]:
        """解析 AI 回應提取地點資訊"""
        places = []
        
        try:
            # 嘗試提取 JSON
            # 先搵 ```json ``` 包住的
            if '```json' in response:
                json_str = response.split('```json')[1].split('```')[0].strip()
            elif '```' in response:
                json_str = response.split('```')[1].strip()
            else:
                # 試下直接找 { ... }
                start = response.find('{')
                end = response.rfind('}') + 1
                if start >= 0 and end > start:
                    json_str = response[start:end]
                else:
                    return []
            
            data = json.loads(json_str)
            
            for place_data in data.get('places', []):
                places.append(PlaceInfo(
                    name=place_data.get('name', '未知地點'),
                    category=place_data.get('category', '其他'),
                    distance=place_data.get('distance', '步行可達'),
                    description=place_data.get('description', ''),
                    highlights=place_data.get('highlights', []),
                    rating=place_data.get('rating', ''),
                    price=place_data.get('price', ''),
                    latest_review=place_data.get('latest_review', ''),
                    tips=place_data.get('tips', ''),
                    lat=place_data.get('lat'),
                    lng=place_data.get('lng')
                ))
            
        except Exception as e:
            print(f"[LocationSearcher] Parse error: {e}")
            print(f"Response preview: {response[:500]}")
        
        return places
    
    def _generate_summary(self, location: str, places: List[PlaceInfo], query_type: str) -> str:
        """生成摘要文字"""
        if not places:
            return f"暫時未能找到 {location} 附近嘅相關資訊。"
        
        type_names = {
            "attractions": "景點",
            "restaurants": "餐廳",
            "hotels": "酒店",
            "shopping": "購物地點",
            "all": "旅遊資訊"
        }
        
        return f"{location} 附近有 {len(places)} 個{type_names.get(query_type, '地點')}值得睇。"
    
    def _success_response(self, result: SearchResult) -> Dict:
        """成功響應"""
        return {
            "success": True,
            "data": {
                "location_name": result.location_name,
                "places": [asdict(p) for p in result.places],
                "summary": result.summary,
                "source": result.source,
                "search_query": result.search_query,
                "search_urls": result.search_urls
            }
        }
    
    def _error_response(self, error: str) -> Dict:
        """錯誤響應"""
        return {
            "success": False,
            "error": error,
            "data": {
                "location_name": "",
                "places": [],
                "summary": f"搜索失敗：{error}",
                "source": "error",
                "search_query": "",
                "search_urls": []
            }
        }


# 單例模式
_searcher_instance = None

def get_searcher() -> LocationSearcher:
    """獲取搜索器單例"""
    global _searcher_instance
    if _searcher_instance is None:
        _searcher_instance = LocationSearcher()
    return _searcher_instance


def search_location(lat: float, lng: float, query_type: str = "all", radius: int = 2000) -> Dict:
    """
    簡易接口：搜索指定經緯度周邊資訊
    
    使用示例：
        result = search_location(37.5635, 126.9895, "attractions")
    """
    searcher = get_searcher()
    return searcher.search(lat, lng, query_type, radius)
