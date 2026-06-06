# 首爾旅遊地圖平台 - 改動紀錄

## 📅 2026-06-07 v51 (範圍篩選：防止點擊標記)

### 🛠️ 修復：範圍篩選「在地圖上選取」模式防止點擊標記

**問題描述：**
在啟用範圍篩選的「在地圖上選取」模式時，點擊地圖標記仍然會打開彈窗而不是設定為範圍中心。

**修復內容：**
1. 新增 `handleMarkerClickForRadiusFilter()` 輔助函數，檢查是否正在選取範圍中心
2. 在 `addMarkers()` 中，為所有景點標記新增點擊監聽器，當正在選取範圍時，停止事件傳播，直接設定該標記位置為範圍中心
3. 在 `addSearchMarker()`（搜索標記）和 `renderPinnedMarkers()`（釘選標記）中也新增相同的處理
4. 更新快取版本以確保用戶看到最新代碼

**修改文件：**
- `static/js/app.js`：新增輔助函數、更新標記添加函數
- `index.html`：更新快取版本 v50→v51

---

## 📅 2026-06-07 v50 (範圍篩選功能增強)

### ✨ 功能增強：範圍篩選對話框狀態管理 & 用戶體驗提升

**功能描述：**
對範圍篩選功能進行多項改進，包括圓形覆蓋層顯示控制、聊天機器人自動收起、以及新增使用說明彈窗。

**實現內容：**
1. **對話框狀態管理**：
   - 開啟範圍篩選面板時，自動顯示已有的圓形覆蓋層
   - 關閉範圍篩選面板時，自動隱藏圓形覆蓋層
2. **聊天機器人協調**：
   - 開啟範圍篩選面板時，若聊天機器人處於展開狀態，自動將其收起，避免介面重疊
3. **使用說明資訊**：
   - 在「範圍篩選」標題旁新增資訊圖標 (ℹ️)，點擊後顯示使用說明彈窗
   - 彈窗包含詳細使用步驟：座標輸入、範圍設定、應用/取消篩選
4. **樣式更新**：
   - 新增資訊圖標和彈窗的樣式，包括漸變背景、圓角、陰影等視覺效果
   - 彈窗支援點擊外部區域自動關閉

**修改文件：**
- `index.html`：新增資訊圖標和彈窗的 HTML 結構，更新靜態資源版本 (v44→v45, v49→v50)
- `static/css/style.css`：新增資訊圖標和彈窗的 CSS 樣式
- `static/js/app.js`：更新 `toggleRadiusPanel()` 函數，新增 `toggleRadiusInfoPopover()`、`closeRadiusInfoPopover()` 函數，以及在 `DOMContentLoaded` 中新增事件監聽器

---

## 📅 2026-06-05 v42 (地圖偏好選擇功能)

### ✨ 新功能：Google Maps 與 Naver Map 選擇

**功能描述：**
新增功能允許用戶在點擊地圖連結時選擇他們偏好的地圖應用程式（Google Maps 或 Naver Map），並將選擇記憶下來，以便日後使用。

**實現內容：**
- `index.html`：新增地圖選擇彈窗 `#map-selection-modal`，以及在頂部導航欄和手機版選單新增地圖選擇下拉選單。
- `app.js`：實作 `MapManager`，管理 `localStorage` 中的 `tour_map_preference` 設定，並動態生成對應的地圖連結。
- `app.js` & `search_module.js`：將原有的 Google Maps 連結 `<a>` 標籤改為按鈕 `<button>`，點擊後觸發 `MapManager.openMap()`。
- `style.css` & `search_module.css`：新增並更新地圖按鈕的樣式，將 `btn-gmaps` 重新命名為 `btn-open-map`，並增加 Naver Map 和 Google Maps 按鈕的特定顏色設定。

## 📅 2025-06-04 v38 (價格資訊 + 願望清單功能)

### ✨ 新功能 1：搜索結果價格資訊顯示

**功能描述：**
地圖點擊搜索周邊地點時，AI 分析結果新增 💰 價格欄位，讓用戶一目了然知道消費水平。

**實現內容：**
- 後端 AI prompt 新增必填 `price` 欄位要求（景點填門票/免費、餐廳填人均₩、酒店填每晚₩、購物填$/$$/$$$）
- `PlaceInfo` 資料類新增 `price: str` 欄位
- AI 回應解析器提取 `place_data.get('price', '')`
- 搜索結果卡片顯示 `💰 **價格**：xxx`
- 地圖 popup 標記顯示 `💰 xxx`
- 景點列表項顯示 `💰 ${attr.ticket}` 橙色標籤

### ✨ 新功能 2：願望清單 (Wishlist) 系統

**功能描述：**
完整嘅收藏系統，用戶可一鍵收藏/移除景點，資料持久化喺 localStorage，頁面刷新後保留。

**核心實現：**

| 組件 | 功能 |
|------|------|
| `WishlistManager` | localStorage CRUD：`add()`, `remove()`, `toggle()`, `has()`, `count()`, `getAll()` |
| 唯一 ID | `wl_{name}_{lat.toFixed(4)}_{lng.toFixed(4)}` — 名稱+座標避免重複 |
| `renderWishlistPanel()` | 側邊欄願望清單面板渲染，含 fly-to 同移除按鈕 |
| `toggleWishlist(btn)` | 通用 ❤️ 按鈕處理器，切換收藏狀態 + Toast 通知 |
| `updateAllWishlistButtons()` | 批量更新所有 ❤️ 按鈕外觀 |
| `add_to_wishlist` action | `executeMapAction` 處理搜索結果嘅 JSON action tag |

**❤️ 按鈕位置：**
1. 景點列表 — 右上角圓形心形按鈕（`.wishlist-btn`）
2. 搜索結果 — `add_to_wishlist` JSON action tag（點擊連結觸發）
3. 詳情 Modal — 底部「加入願望清單」/「已收藏」按鈕（`.btn-wishlist-modal`）

**UI 特色：**
- 側邊欄「❤️ 願望清單」面板 + 數量 badge
- 收藏狀態即時切換（空心/fa-heart ↔ 實心/fas fa-heart）
- Toast 通知：「已加入願望清單」/「已從願望清單移除」
- 願望清單面板點擊項目可飛到地圖位置
- 頁面 DOMContentLoaded 自動初始化面板

**修改文件：**

| 文件 | 改動 |
|------|------|
| `search_module.py` | `PlaceInfo` 新增 `price: str`；AI prompt 要求 `price` 必填；解析器提取 price |
| `static/js/search_module.js` | `renderPlaceCard()` 顯示價格 + `add_to_wishlist` action tag；`addPlaceMarker()` popup 顯示價格 |
| `static/js/app.js` | 新增 `WishlistManager` 物件、`renderWishlistPanel()`、`toggleWishlist()`、`updateWishlistButtons()`、`updateWishlistCount()`；景點列表項 + Modal 新增 ❤️ 按鈕；`executeMapAction` 新增 `add_to_wishlist`/`remove_from_wishlist` case；`DOMContentLoaded` 初始化面板 |
| `index.html` | 側邊欄新增 `#wishlist-panel` + `#wishlist-list` + `#wishlist-count`；版本號 v37→v38 |
| `static/css/style.css` | 新增願望清單面板、項目、badge、按鈕、Modal 按鈕、Toast、價格標籤等完整 CSS |
| `static/css/search_module.css` | 新增 `.place-popup` 內 `.place-price` 同 `.place-rating` 樣式 |

---

## 📅 2025-06-04 v36 (手機版底部景點列表 Bottom Sheet)

### ✨ 新功能：手機版景點列表 Bottom Sheet

**功能描述：**
為手機版新增底部滑出式景點列表面板（Bottom Sheet），取代原本需要打開全屏側邊欄才能瀏覽景點的方式。

**設計特點：**
- 底部滑出面板，預設只露出 drag handle（📍 景點列表 + 景點數量）
- 點擊或向上拖動即可展開成 70vh 高度嘅景點列表
- 橫向滾動分類 tab 快速篩選（全部/歷史/觀景/美食/夜生活/娛樂/休閒/自然）
- 景點卡片使用 emoji + 顏色標記，簡潔易讀
- 點擊景點卡片 → 地圖飛到該位置 → 自動收起面板
- 分類篩選同桌面版同步
- AI 對話框在手機版避開底部面板（bottom: 56px）
- 拖動手勢支援（向上展開/向下收起）
- 桌面版完全隱藏，唔影響現有 sidebar

**修改文件：**

| 文件 | 改動 |
|------|------|
| `index.html` | 新增 `#mobile-location-panel` HTML 結構（drag handle + 分類 tabs + 景點列表）|
| `static/css/style.css` | 新增 Bottom Sheet 完整 CSS（固定底部、圓角、拖動指示條、分類 tabs、景點卡片、手機版 media queries、AI 對話框避讓）|
| `static/js/app.js` | 新增 `renderMobilePanelList()`、`initMobilePanel()`、`toggleMobilePanel()` 函數；桌面版分類按鈕點擊同步更新 mobile panel；DOMContentLoaded 加入 `initMobilePanel()` |
| `index.html` | 版本號 bump v34 → v35 |

## 📅 2025-06-03 v35 (修正搜索標記同脈動圈對齊)

### 🐛 修正：搜索標記（search-marker）水滴形狀同脈動動畫對齊問題

**問題描述：**
搜索標記（chatbot AI 添加嘅地點 pin）嘅水滴形圖標用咗 `rotate(-45deg)` CSS hack，令到：
1. Pin 形狀唔靚 — 角落唔圓滑、陰影變形、icon 要反轉補償旋轉
2. 脈動（pulse）動畫圈由圖標中心擴散，唔係由針尖擴散，同地圖坐標偏移咗 ~20px
3. 整體視覺效果差，同真正嘅地圖 pin 形狀唔似

**修正方案：**
完全重新設計搜索標記為經典水滴形地釘（Google Maps pin 風格）：
- 上半部：圓形泡泡（`border-radius: 50%`）放白色 icon，白色 3px 邊框
- 下半部：CSS 三角形（`::after` 僞元素用 border trick）作為針尖
- 脈動圈：由針尖（div 底部中心 = iconAnchor）向外擴散
- 用 `filter: drop-shadow()` 取代 `box-shadow`（唔會跟旋轉變形）
- 冇再用 `rotate`，icon 唔使反轉

| 文件 | 改動 |
|------|------|
| `static/css/style.css` | `.search-marker` 改為 48×48px；`.marker-inner` 改為純圓形（top:0, 32×32, border-radius:50%）；加 `::after` 僞元素畫三角針尖；脈動圈 `bottom:0; transform: translate(-50%, 50%)` 對齊針尖；用 `filter: drop-shadow` |
| `static/js/app.js` | `addSearchMarker()` 嘅 `iconSize: [48,48]`、`iconAnchor: [24,48]` 配合新尺寸 |
| `index.html` | Cache-busting v35→v36 |
| `docs/CHANGELOG.md` | 今次改動紀錄 |

## 📅 2025-06-02 v34 (移除 chatbot 紅色「新內容」徽章)

### 🗑️ 移除：chatbot 紅色「新內容」徽章

**功能描述：**
移除搜索時 chatbot header 上出現嘅紅色「新內容」徽章（`new-message-badge`），因為佢佔用太多空間。

**改動內容：**
- `search_module.js`：刪除 `showNewMessageBadge()` 同 `hideNewMessageBadge()` 函數，移除相關調用
- `search_module.css`：刪除 `.new-message-badge`、`.pulse-animation`、`.ai-chat.collapsed .new-message-badge` 等相關樣式
- `index.html`：版本號 v33 → v34（cache-busting）

## 📅 2025-06-02 v32 (搜索結果地點名稱可點擊飛到)

### ✅ 新增：搜索結果地點名稱點擊飛到功能

**功能描述：**
搜索結果中嘅地點名稱（如「明洞 (Myeong-dong) 🗺️」）變成可點擊連結，點擊後地圖會飛到該位置並顯示彈出框，同時添加搜尋標記。

**問題背景：**
搜索結果嘅 `【{"action":"fly_to",...}】` JSON action tags 只係以純文字形式顯示喺 chatbot 入面，用戶冇辦法互動。即使後端 AI 回覆有類似嘅 action tags，`fetchAIReply()` 有解析邏輯但不適用於搜索模組嘅結果。

**實現內容：**

| 文件 | 改動 |
|------|------|
| `static/js/app.js` | `addMessage()` 函數新增 `【...】` action tag 解析邏輯：`fly_to` 轉為可點擊 `<a>` 連結（class `.fly-to-link`），點擊後執行 `map.flyTo()` + `L.popup()` + `addSearchMarker()`；`add_marker` 及其他 action 自動執行並從文字中移除 |
| `static/js/search_module.js` | `renderPlaceCard()` 重組格式：`fly_to` tag 放喺標題行（配合 📍 emoji），`add_marker` tag 單獨放一行，改善 Markdown 可讀性 |
| `static/css/search_module.css` | 新增 `.fly-to-link` 樣式：藍色虛線底連結，hover 變藍底白字，active 加深藍色 |
| `index.html` | 版本號 v31 → v32（cache-busting） |

## 📅 2025-06-02 v31 (系統狀態檢查功能)

### ✅ 新增：啟動時系統狀態檢查

**功能描述：**
頁面載入時自動檢查後端 AI 服務同搜索服務嘅可達性，喺 Chatbot 頭部顯示狀態指示器。

**問題背景：**
AI endpoint 偶爾唔可以訪問，用戶要等好耐先收到錯誤。加載時就想提前知道系統狀態。

**實現內容：**

| 文件 | 改動 |
|------|------|
| `server.py` | `/api/health` endpoint 由簡單 `{"status":"ok"}` 增強為完整狀態檢查：檢查 AI API 可達性（在線/有限/離線）、Hermes Worker 狀態、搜索模組可用性、延遲時間（ms） |
| `static/js/app.js` | 新增 `checkSystemStatus()` 函數，頁面啟動時自動呼叫 `/api/health`，根據結果更新 UI 狀態指示器；單擊狀態圓點展開/收起詳情，雙擊重新檢查 |
| `static/css/style.css` | 新增 `.status-indicator`（狀態圓點）同 `.status-bar`（狀態詳情欄）CSS，含三種狀態顏色（綠=在線、黃=降級、紅=離線）同脈動/旋轉動畫 |
| `index.html` | Chatbot header 加入狀態圓點 `<span id="system-status">` 同狀態詳情欄 `<div id="system-status-bar">`；版本號 v30 → v31 |

**狀態含義：**
- 🟢 在線 (online)：AI API 正常連接並回應
- 🟡 有限 (reachable)：AI API 可連接但有限流/認證問題
- 🟡 基本模式：Hermes Worker 未啟用，只能用基本搜索
- 🔴 離線 (offline)：無法連接 AI API 或伺服器

**API 回應格式 (`GET /api/health`)：**
```json
{
  "status": "ok",      // ok | degraded | unknown
  "server": "running",
  "timestamp": 1717312345,
  "services": {
    "ai": { "status": "online", "latency_ms": 1234, "model": "gemma4:31b-cloud" },
    "hermes": { "status": "idle", "enabled": true },
    "search": { "status": "available" }
  }
}
```

---

## 📅 2025-06-02 v30 (手機版側邊欄開關修復)

### 🐛 修復：手機版側邊欄無法開啟

**問題描述：**
手機版（≤768px）點擊頂部「景點」按鈕無法打開側邊欄，因為：

1. CSS 用咗 `.sidebar.open + .sidebar-overlay` 相鄰兄弟選擇器控制 overlay 顯示，但 HTML 結構入面 `.sidebar-overlay` 同 `.sidebar` 唔係相鄰兄弟（中間隔咗 `.map-area`），導致選擇器永遠唔生效
2. `DOMContentLoaded` 入面重複綁定咗 sidebar-toggle click 事件（`bindEvents` 同 `initSidebarToggle` 各綁一次）
3. `closeSidebar()` 沒有處理 overlay 嘅隱藏

**修復內容：**

| 文件 | 改動 |
|------|------|
| `static/css/style.css` | 移除 `.sidebar.open + .sidebar-overlay` CSS 相鄰選擇器規則；新增 `.sidebar-overlay.active { display: block }` 由 JS 控制 |
| `static/js/app.js` | `initSidebarToggle()` 同 `closeSidebar()` 改用 JS 控制 overlay（`classList.toggle('active')`）；移除 `bindEvents()` 入面重複嘅 sidebar-toggle 綁定 |
| `index.html` | 版本號 v29 → v30 (cache-busting) |

---

## 📅 2025-06-02 (地圖點擊彈窗增強)

### ✅ 新增：Google Maps 按鈕

**功能描述：**
用戶點擊地圖後，彈窗顯示坐標同搜索選項。新增 Google Maps 按鈕，一鍵打開該坐標嘅 Google Maps 頁面。

**新增功能：**
- 彈窗 header 新增「Google Maps」按鈕
- 使用 Google Maps URL scheme：`https://www.google.com/maps?q={lat},{lng}`
- 新視窗開啟，不影響當前頁面操作
- 漸變背景樣式（Google 品牌色 #4285F4 → #34A853）
- hover 效果：上移 + 陰影

**技術實現：**

| 組件 | 改動 |
|------|------|
| `search_module.js` | `SearchPopup.show()` 新增 Google Maps URL 生成 |
| `search_module.css` | 新增 `.google-maps-btn` 按鈕樣式 |
| `index.html` | 版本號 v28 → v29 |

**修改文件：**
- `static/js/search_module.js` — 增加按鈕 HTML 同 URL
- `static/css/search_module.css` — 按鈕樣式
- `index.html` — cache-busting 版本號

---

## 📅 2025-06-02 (搜索結果增強)

### ✅ 新增：搜索結果跳轉坐標 + 自動加入景點列表

**功能描述：**
經緯度周邊搜索結果增強，提供更直觀嘅地圖互動體驗。

**新增功能：**

1. **跳轉坐標圖標** 📍
   - 每個搜索結果地點名稱旁邊顯示 📍 圖標（需要有坐標）
   - 使用 `fly_to` action 指令，點擊後地圖自動飛到該位置
   - 顯示彈窗提示地點名稱同坐標

2. **自動添加到景點列表**
   - 搜索結果自動加入左側景點列表頂部
   - 新增「搜索結果」分隔區塊顯示
   - 每個項目帶有「跳轉」按鈕（🎯 圖標）
   - 提供「清除搜索結果」按鈕一鍵移除
   - 點擊搜索結果項目可直接跳轉到地圖位置

**技術實現：**

| 組件 | 改動 |
|------|------|
| `search_module.js` | `renderPlaceCard()` 新增 `fly_to` action 指令、修復 lat/lng 參數 |
| `app.js` | 新增 `fly_to` action 處理、新增 `addSearchResultsToList()`、`flyToSearchResult()`、`clearSearchResultsFromList()` |
| `style.css` | 新增搜索結果列表樣式（`.search-results-header`、`.search-result-item`、`.fly-to-btn`）|

**修改文件：**
- `static/js/search_module.js` — 渲染跳轉指令
- `static/js/app.js` — 新增 3 個全局函數 + 1 個 action handler
- `static/css/style.css` — 新增搜索結果列表樣式
- `index.html` — 版本號 v27→v28

**Action 指令格式：**
```json
// 飛到坐標
{"action":"fly_to","params":{"lat":37.5796,"lng":126.9770,"title":"景福宮"}}

// 添加標記
{"action":"add_marker","params":{"lat":37.5796,"lng":126.9770,"title":"景福宮","color":"#e74c3c","pulse":true}}
```

---

## 📅 2025-06-02 (UX 改進 - Chatbot 搜索指示)

### ✅ 新增：Chatbot Widget 搜索狀態指示

**問題：** 用戶點擊地圖開始搜索坐標時，如果 chatbot widget 喺收起狀態，用戶唔會知道有新內容正在載入，錯過搜索結果。

**解決方案：**
1. **自動展開 Chatbot** — 搜索開始時自動展開收起嘅 chatbot widget
2. **新消息徽章** — 喺 chat header 顯示紅色「新內容」徽章，吸引用戶注意
3. **圖標脈動動畫** — chatbot 圖標以金色↔紅色脈動效果吸引眼球
4. **結果顯示後自動清除** — 搜索結果顯示或錯誤後自動移除徽章同動畫

**修改文件：**
- `static/js/search_module.js` — 新增 `showNewMessageBadge()`、`hideNewMessageBadge()` 方法，搜索開始時自動展開 widget
- `static/css/search_module.css` — 新增徽章樣式、脈動動畫（`.new-message-badge`、`.pulse-animation`）

**效果：**
- 用戶點擊地圖搜索 → chatbot 自動展開 + header 顯示「🔴 新內容」徽章 + 機器人圖標閃爍
- 搜索結果出現後 → 徽章自動移除，恢復正常狀態
- 即使 chatbot 本來收起，用戶都能即時看到有新內容

---

## 📅 2025-06-02 (UI 改進 - Burger Menu)

### ✅ 新增：手機版 Burger Menu 選單

**問題：** 手機版 AppBar 按鈕太多（地鐵線、交通、重置、English、定位），排版擠迫，影響用戶體驗。

**解決方案：**
- 新增 Burger Menu 按鈕（`☰` 圖標），只喺手機版（<=768px）顯示
- 桌面版（>=769px）繼續顯示原本嘅按鈕列
- Burger Menu 選單包含：地鐵線、交通規劃、English 地圖、我的定位、重置地圖
- 地鐵線同交通規劃有 Toggle 開關狀態同步
- 點擊外部自動關閉選單

**修改文件：**
- `index.html` — 新增 Burger Menu HTML 結構（v26）
- `static/css/style.css` — 新增 Burger Menu 樣式（v26）
- `static/js/app.js` — 新增 Burger Menu 事件處理（v26）

**效果：**
- 手機版 AppBar 更簡潔，只顯示「景點」同「☰」兩個按鈕
- 桌面版不變，繼續顯示所有按鈕
- Burger Menu 下拉選單有動畫效果（fade + slide）

---

## 📅 2025-06-02 (UI 改進)

### ✅ 改進：移除地圖標記 Modal 彈窗

**問題：** 用戶點擊地圖標記時，會彈出 modal 對話框顯示詳情，同時 popup 氣泡都會顯示。雙重顯示過於繁複。

**解決方案：**
- 移除 `marker.on('click')` 入面嘅 `showAttractionDetail(attr)` 調用
- 保留 `bindPopup()` 顯示簡短描述氣泡
- 用戶想睇詳情時，可撳 popup 氣泡入面嘅「查看詳情」按鈕

**修改文件：**
- `static/js/app.js` — 移除 marker click handler（第 200-202 行）
- `index.html` — version bump to v25

**效果：**
- 點擊地圖標記 → 只顯示 L.popup 氣泡（簡短描述 + 圖片 + 「查看詳情」按鈕）
- 用戶可主動選擇是否進入 modal 詳情頁

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
