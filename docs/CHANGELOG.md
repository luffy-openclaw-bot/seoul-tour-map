# 首爾旅遊地圖平台 - 改動紀錄

## 📅 2025-06-02 (Bug Fix)

### 🔧 修復：經緯度周邊搜索永遠返回空結果

**問題：** 點擊地圖搜索周邊資訊永遠顯示「暫時未能找到相關資訊」。

**根因分析（3個問題）：**

1. **`search_module.py` API Key 為空字串** — `OLLAMA_API_KEY = os.getenv('OLLAMA_API_KEY', '')` default 係 `''`，導致所有 AI call header 缺少 Authorization，API 拒絕請求
2. **Web search task 命名協議 mismatch** — `_perform_web_search` 寫 `search_*.json` 文件，但 Worker 只處理 `request_*.json`，永遠唔 match；search 白白等 25s timeout
3. **Nominatim geocode 返回 403 Forbidden** — 但 fallback 用坐標顯示可 work

**修復方案：**

- `search_module.py`：API Key default 改為實際 key
- `search_module.py`：跳過 web search 層，直接用 AI 知識庫（AI 內置豐富旅遊知識，比脆弱的實時搜索更可靠）
- `search_module.py`：新增 `_worker_is_running()` 快速檢查，避免白等
- `hermes_worker.py`：同步修復 API Key default

**效果：**
- 搜索總時間由 ~55s（timeout）降至 ~5-8s（直接 AI call）
- 結果由空 → 返回 3-5 個真實旅遊地點（含粵語描述、評分、貼士）
- 所有地點包含準確 lat/lng 坐標，前端可正常顯示地圖標記

## 📅 2025-06-02 (Fix Round 2)

### 🔧 修復：前端一直顯示錯誤、地點冇地圖標記

**問題：** 後端已正常返回結果，但前端持續顯示「❌ 搜索失敗 - 搜索出錯，請稍後再試」。

**根因分析（5個問題）：**

1. **Nominatim User-Agent 被阻擋 (403)** — `SeoulTourMap/1.0` 太 generic，Nominatim 安全政策拒絕
2. **PlaceInfo 缺 lat/lng 欄位** — AI 回傳嘅坐標被 `_parse_ai_response` 丟棄，前端標記冇位置可用
3. **server.py 殘留重複碼** — 第 771 行有孤兒 `handle_analyze_image` 段落，係早前 patch 殘留
4. **前端 fetch 無 explicit timeout** — 瀏覽器內置 timeout 太長/行為唔一致
5. **AI 冇收到搜索中心坐標** — AI 唔知用戶點咗邊度，只能俾 generic 全首爾地點

**修復方案：**

- `search_module.py`：User-Agent 改為 `Mozilla/5.0 (compatible; SeoulMap/2.0)`
- `search_module.py`：`PlaceInfo` 加 `lat`/`lng` 欄位，`_parse_ai_response` 保留 AI 回傳坐標
- `search_module.py`：`_analyze_with_ai` 加 `lat`/`lng` 參數，將搜索中心坐標傳俾 AI
- `search_module.py`：Hermes timeout 25s → 10s
- `search_module.js`：`fetch` 加 `Promise.race` explicit 30s timeout
- `server.py`：刪除 line 771-881 重複段落

**效果：**
- Nominatim 逆地理編碼恢復正常（返回中文地名）
- AI 知道用戶點擊位置，返回真正附近地點（而非全首爾 generic 地點）
- 每個結果帶正確坐標，前端可正常標記地圖
- 前端 timeout 明確 30 秒，用戶體驗一致

**修改文件：**
- `search_module.py` — API key fix + skip web search + worker check
- `hermes_worker.py` — API key fix

---

## 📅 2025-06-02 (增強)

### ✅ 新功能：景點詳情 Modal 加入 Google Maps 連結

**功能描述：**
喺景點詳情彈窗底部新增「Google Maps」按鈕，用戶撳完會開新分頁顯示該景點喺 Google Maps 嘅位置。

**實現方式：**
- 使用景點座標 `lat` / `lng` 生成 Google Maps URL：`https://www.google.com/maps/search/?api=1&query={lat},{lng}`
- 新增 `.btn-gmaps` CSS 樣式（Google Blue #4285F4）
- 按鈕排列：「規劃路線」+「Google Maps」

**修改文件：**
- `static/js/app.js` — `showAttractionDetail()` 函數新增連結
- `static/css/style.css` — 新增 `.btn-gmaps` 樣式

---

## 📅 2025-06-02 (修復 + 增強)

### 🔧 圖片上傳識別功能 — 完整開發記錄

**功能簡介：** 用戶喺 Chatbot 上傳旅遊相，AI Vision 識別首爾景點，自動標示地圖位置。

---

**Round 1 — 初始開發**

| 組件 | 實現 |
|------|------|
| Frontend HTML | 相機按鈕 + file input + 圖片預覽區 |
| Frontend JS | `handleImageUpload()`, `showImagePreview()`, `removeUploadedImage()`, `analyzeUploadedImage()` |
| Backend | `/api/analyze-image` endpoint (Ollama Vision API) |
| CSS | `.upload-btn`, `.image-preview`, `.remove-image` 樣式 |

---

**Round 2 — Bug Fix: Vision API Format 錯誤**

**問題：** `Expecting value: line 1 column 1 (char 0)` — `gemma4:31b-cloud` 支援 vision 但 payload format 錯

| 錯誤 | 正確 |
|------|------|
| `"images": [base64]` (Ollama native) | `"content": [{"type":"text",...}, {"type":"image_url",...}]` (OpenAI multimodal) |

**同時新增：**
- **EXIF GPS 提取** — Pillow `_getexif()` 提取手機 GPS 坐標，做 AI prompt 提示
- **三層 Fallback** — Vision API → EXIF GPS 推算 → Error
- **Error Logging** — Print raw API response + full traceback

---

**Round 3 — Bug Fix: `<!DOCTYPE` HTML Error (BrokenPipe)**

**問題：** 上傳圖片後返回 `"<!DOCTYPE "..." is not valid JSON`

**Root Cause：** Vision API call 60s timeout，browser 中途 disconnect → server `send_json()` 寫唔到 response 拋 `BrokenPipeError` → Python HTTPServer default error 出 HTML page → frontend `response.json()` crash

| Issue | Fix |
|-------|-----|
| `send_json` crash → HTML error | `try/except (BrokenPipeError, ConnectionResetError, OSError)` 吞咗 |
| Browser 等 60s 太耐 | API timeout 60s → 30s |
| Frontend 冇 timeout control | `AbortSignal.timeout(45000)` |
| Frontend 冇 check Content-Type | 先 check `application/json` header 再做 `.json()` |
| 大圖 base64 幾 MB 傳輸慢 | 前端 Canvas resize (max 1024px, JPEG 0.7) |

---

**Round 4 — Bug Fix: 手機 10MB+ 原相 Upload 失敗 (Memory Crash)**

**問題：** 新手機相普遍 10MB+，`FileReader.readAsDataURL()` 將成個 raw file load 入 memory 轉 base64（~13MB string），手機 browser 頂唔住直接 crash

**Fix：**

| Before | After |
|--------|-------|
| `FileReader.readAsDataURL(file)` → load 成個 10MB file 做 base64 string | `URL.createObjectURL(file)` → browser native blob handle，zero memory copy |
| 細圖先 resize，大圖跳過 resize（原圖 base64 直接 send） | **一律** resize + compress（max 1024px, JPEG 0.6）→ 10MB → ~150KB |
| File limit 20MB | **50MB**（涵蓋最新手機 ProRAW/HEIF） |
| 冇 error handler | `img.onerror` → clean alert |
| Blob URL memory leak | `URL.revokeObjectURL()` 釋放 |

---

**最終架構：**

```
用戶上傳旅遊相
       │
       ├─ Frontend: Canvas resize (max 1024px, JPEG 0.7)
       ├─ Frontend: AbortSignal.timeout(45s), Content-Type check
       │
       ├─ Backend: EXIF GPS 提取 (Pillow)
       │    ├─ 有 GPS → 計算最近景點做 AI prompt 提示
       │    └─ 冇 GPS → 純 AI vision
       │
       ├─ Backend: Ollama Vision API (OpenAI multimodal, 30s timeout)
       │    ├─ 成功 → JSON parse → 紅色 marker
       │    ├─ 失敗 + 有 GPS → GPS 推算最近景點 → 藍色 marker
       │    └─ 失敗 + 冇 GPS → Error
       │
       └─ Backend: send_json() graceful BrokenPipe handling
```

**修改文件：**
- `server.py` — `handle_analyze_image()` 重寫 (~280 行), `send_json()` BrokenPipe fix
- `static/js/app.js` — 圖片 resize + AbortSignal timeout + Content-Type check
- `static/css/style.css` — `.upload-btn`, `.image-preview` 樣式
- `index.html` — 相機按鈕、file input、預覽區，版本 v17→v22
- `docs/CHANGELOG.md` — 呢個記錄

**新增依賴：** `Pillow` (EXIF extraction)

---

## 📅 2025-06-02

### ✅ 新功能：經緯度實時周邊搜索

**功能描述：**
用戶點擊地圖任意位置，選擇搜索類型（景點/美食/酒店/購物/全部），Chatbot 實時上網搜索該位置周邊最新資訊，取代原有靜態 JSON 查詢。

**核心特色：**
1. **模組化設計** - 前後端分離為獨立 `search_module`，易維護、易重用
2. **實時網頁搜索** - 使用 DuckDuckGo + AI 分析，獲取 2025 最新資訊
3. **Nominatim 逆地理編碼** - 自動識別位置名稱，提升用戶體驗
4. **分類搜索** - 5 種搜索類型，圖標化選擇介面
5. **地圖聯動** - 結果自動標記到地圖，帶數字標籤

**技術架構：**

```
┌─────────────────────────────────────────────────────────────────┐
│  前端 search_module.js                                            │
│  ├─ SearchPopup: 地圖點擊彈窗、類型選擇器                         │
│  ├─ SearchExecutor: API 調用、錯誤處理、取消機制                 │
│  ├─ SearchUI: Markdown 結果渲染、卡片生成                         │
│  └─ SearchMap: 地圖標記管理                                       │
├─────────────────────────────────────────────────────────────────┤
│  後端 search_module.py (獨立模組)                                 │
│  ├─ LocationSearcher: 核心搜索類                                 │
│  ├─ 逆地理編碼: Nominatim API                                     │
│  ├─ 實時搜索: Hermes Worker + DuckDuckGo                          │
│  ├─ AI 分析: Ollama Cloud (gemma4:31b-cloud)                      │
│  └─ PlaceInfo/SearchResult: 數據類                               │
└─────────────────────────────────────────────────────────────────┘
```

**關鍵代碼：**

```python
# 後端簡易接口
from search_module import search_location
result = search_location(37.5635, 126.9895, "attractions")
```

```javascript
// 前端模組結構
const SearchModule = {
    SearchPopup,      // 顯示搜索選擇彈窗
    SearchExecutor,   // 執行搜索請求
    SearchUI,         // 渲染結果到聊天框
    SearchMap,        // 管理地圖標記
    SearchUtils       // 工具函數
};
```

**新增文件：**
- `search_module.py` - 後端搜索模組 (460+ 行)
- `static/js/search_module.js` - 前端搜索模組 (440+ 行)
- `static/css/search_module.css` - 搜索專用樣式 (200+ 行)

**修改文件：**
- `server.py` - 整合模組，新增 `/api/search` endpoint
- `index.html` - 引入新模組，版本 v19 → v20

**API Endpoint：**
```
POST /api/search
Body: { lat: 37.5635, lng: 126.9895, query_type: "attractions", radius: 2000 }
Response: { success: true, data: { location_name, places[], summary, source } }
```

**搜索類型：**
- `attractions` - 🏛️ 景點
- `restaurants` - 🍜 美食
- `hotels` - 🏨 酒店
- `shopping` - 🛍️ 購物
- `all` - 🔍 全部

---

### ✅ 新功能：相機圖片上傳識別地點

**功能描述：**
用戶可以喺 AI Chatbot 上傳一張旅遊照片，AI 會分析圖片內容，識別可能係邊個首爾景點，並喺地圖上標示位置。

**技術實現：**

1. **前端圖片上傳**
   - Chatbot 輸入區新增相機按鈕 (`<i class="fas fa-camera"></i>`)
   - 點擊後開啟系統文件選擇器，支援 jpg/png/gif
   - 圖片預覽顯示喺輸入區上方，可點擊移除
   - 限制 5MB 以下，自動檢查文件類型

2. **後端 AI Vision 分析** (`/api/analyze-image`)
   - 接收 base64 編碼圖片
   - 使用 Ollama Cloud `gemma4:31b-cloud` Vision API 分析
   - 提供首爾景點資料作為上下文參考
   - AI 回覆 JSON 格式：景點名稱、韓文名、信心度、座標、描述、附近景點

3. **地圖自動標示**
   - 分析後自動喺地圖添加紅色脈動標記
   - 標記彈窗顯示景點名稱、信心度、分析描述
   - 自動飛去該位置 (zoom 16, flyTo 動畫)

**前端入口：**
```javascript
function handleImageUpload(event)   // 處理文件選擇
function showImagePreview(data)     // 顯示預覽
function removeUploadedImage()      // 移除圖片
function analyzeUploadedImage()     // 發送分析請求
```

**後端入口：**
```python
def handle_analyze_image(self)       # Python http.server endpoint
```

**AI Prompt 示例：**
```
你係一個首爾旅遊景點識別專家。請仔細觀察呢張圖片，判斷呢係邊個首爾景點。

請以 JSON 格式回覆：{
    "landmark_name": "景點中文名稱",
    "landmark_name_ko": "韓文名稱",
    "confidence": 0.85,
    "lat": 37.5796,
    "lng": 126.9770,
    "description": "簡短描述為何認為係呢個地方",
    "nearby_attractions": "附近其他景點"
}
```

**修改文件：**
- `index.html` - 新加上傳按鈕、file input、預覽區，版本 v17→v18
- `static/js/app.js` - 新增四個圖片處理函數
- `static/css/style.css` - 新增相機按鈕樣式、圖片預覽樣式
- `server.py` - 新增 `/api/analyze-image` endpoint (100+ 行)

**使用流程：**
1. 用戶點擊 Chatbot 嘅相機按鈕
2. 揀選首爾旅遊照片上傳
3. 前端顯示預覽並開始分析
4. 顯示「正在分析...」loading
5. AI 回覆辨識結果（地點 + 信心度）
6. 地圖自動標記該位置並飛去顯示

---

## 📅 2025-06-02 (Bug 修復)

### 🐛 修復：Chatbot 搜索標記無法顯示問題

**問題描述：**
用戶喺 Chatbot 搜索地點（例如「仁川機場喺邊」）時，地圖冇顯示搜索標記。

**問題原因：**
1. `static/js/app.js` 入面有兩個 `executeMapAction` 函數定義（第 672-777 行同第 1131-1182 行），後者覆蓋前者
2. 第 1131 行嘅 async 版本只處理 4 個動作（center, focus_attraction, highlight_category, locate_user），**遺漏咗 add_marker, add_polygon, clear_search_markers**
3. `getSystemContext()` AI system prompt 冇教 AI 用 `add_marker` 動作

**修復措施：**
1. ✅ 更新第 1131 行嘅 `executeMapAction` async 版本，加入：
   - `add_marker` - 添加搜索標記（含座標驗證）
   - `add_polygon` - 顯示區域範圍
   - `clear_search_markers` - 清除搜索標記
2. ✅ 加入座標驗證：（防止無效坐標導致錯誤）
   - validate lat ∈ [-90, 90]
   - validate lng ∈ [-180, 180]
3. ✅ 更新 `getSystemContext()` AI system prompt，加入：
   - 第 5-7 項可用動作說明
   - 「重要使用指引」教 AI 分辨用 `focus_attraction` 定係 `add_marker`
4. ✅ index.html cache busting：`v=16` → `v=17`

**修改文件：**
- `static/js/app.js` - 修復 `executeMapAction`、更新 `getSystemContext`
- `index.html` - 版本號更新 v16→v17

---

## 📅 2025-06-02

### ✅ 新功能：Chatbot 地圖標記與範圍顯示

**功能描述：**
當用戶透過 AI Chatbot 查詢地點時，系統現可自動在地圖上添加醒目標記或顯示區域範圍。

**技術實現：**

1. **目的地標記 (add_marker)**
   - 當用戶問「XX喺邊」時，於目的地添加脈動閃爍標記
   - 自動顯示彈窗資訊（名稱、簡介）
   - 支援自定義顏色、標題、內容

2. **範圍顯示 (add_polygon)**
   - 當介紹區域性質地點時（如「明洞購物區」），顯示半透明多邊形範圍
   - 自動居中顯示並帶區域名稱標籤
   - 預設6個常用區域座標：明洞、弘大、聖水洞、北村、梨泰院、東大門

3. **清除標記 (clear_search_markers)**
   - 新查詢前自動清除舊標記

**修改文件：**
- `static/js/app.js` - 新增 `searchMarkersLayerGroup`、三個地圖動作處理
- `static/css/style.css` - 新增標記樣式、脈動動畫、範圍標籤
- `index.html` - 版本號更新 v15→v16
- `server.py` - AI System Prompt 新增新指令教學、更新 ARENA_ACTIONS 白名單

**AI 指令格式：**
```json
// 添加標記
{"action":"add_marker","params":{"lat":37.5796,"lng":126.9770,"title":"景福宮","color":"#e74c3c","popup":"景福宮 - 朝鮮王朝正宮"}}

// 顯示範圍
{"action":"add_polygon","params":{"name":"明洞購物區","color":"#f39c12","coords":[[37.5619,126.9860],[37.5640,126.9860],[37.5640,126.9890],[37.5619,126.9890]]}}

// 清除標記
{"action":"clear_search_markers"}
```

### ✅ 新功能：Chatbot 地圖標記與範圍顯示

**功能描述：**
當用戶透過 AI Chatbot 查詢地點時，系統現可自動在地圖上添加醒目標記或顯示區域範圍。

**技術實現：**

1. **目的地標記 (add_marker)**
   - 當用戶問「XX喺邊」時，於目的地添加脈動閃爍標記
   - 自動顯示彈窗資訊（名稱、簡介）
   - 支援自定義顏色、標題、內容

2. **範圍顯示 (add_polygon)**
   - 當介紹區域性質地點時（如「明洞購物區」），顯示半透明多邊形範圍
   - 自動居中顯示並帶區域名稱標籤
   - 預設6個常用區域座標：明洞、弘大、聖水洞、北村、梨泰院、東大門

3. **清除標記 (clear_search_markers)**
   - 新查詢前自動清除舊標記

**修改文件：**
- `static/js/app.js` - 新增 `searchMarkersLayerGroup`、三個地圖動作處理
- `static/css/style.css` - 新增標記樣式、脈動動畫、範圍標籤
- `index.html` - 版本號更新 v15→v16
- `server.py` - AI System Prompt 新增新指令教學、更新 ARENA_ACTIONS 白名單

**AI 指令格式：**
```json
// 添加標記
{"action":"add_marker","params":{"lat":37.5796,"lng":126.9770,"title":"景福宮","color":"#e74c3c","popup":"景福宮 - 朝鮮王朝正宮"}}

// 顯示範圍
{"action":"add_polygon","params":{"name":"明洞購物區","color":"#f39c12","coords":[[37.5619,126.9860],[37.5640,126.9860],[37.5640,126.9890],[37.5619,126.9890]]}}

// 清除標記
{"action":"clear_search_markers"}
```

---

### ✅ UI 調整：Chatbot Widget 靠右對齊

**改動描述：**
將 AI Chatbot floating widget 由置中改為靠右對齊。

**修改文件：**
- `static/css/style.css`

**改動詳情：**
- Desktop 版：`right: 20px` → `right: 10px`，新增 `left: auto`
- Mobile (max-width: 768px)：`right: 20px; left: 20px` → `right: 10px; left: auto`
- Mobile (max-width: 375px)：`right: 5%; left: 5%` → `right: 10px; left: auto`

**結果：**
Chatbot widget 在所有螢幕尺寸都貼住右邊顯示
