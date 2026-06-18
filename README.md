# 🗺️ 首爾旅遊地圖平台 | Seoul Tour Map

專為第一次去韓國、或者想更輕鬆安排行程嘅旅客而設嘅互動式首爾旅遊地圖。
呢個專案唔只係景點地圖，仲結合咗 AI 對話、地圖互動、周邊搜尋、路線與交通資訊、收藏同步，同圖片辨識，幫旅客由「搵地方」一路做到「整理行程」。

## ✨ 目前產品能力

### 📍 地圖與瀏覽 UI
- 基於 **Leaflet + OpenStreetMap** 嘅互動地圖介面
- 桌面版側邊欄可瀏覽景點、分類、收藏、釘選項目
- 手機版提供底部 Bottom Sheet 景點面板，方便單手操作
- 支援地圖縮放、拖動、飛到指定地點、Marker popup、詳細資料視圖
- 可切換地圖開啟偏好（例如 Google Maps / Naver Map）

### 🏛️ 景點與旅遊資料
- 內建 `static/data/preset_locations.json` 預設景點資料
- 支援景點名稱、分類、簡介、票價、交通、開放時間、亮點與備註等旅遊資訊展示
- 可結合 Google Places、韓國觀光/城市資料來源補充景點資訊
- 地鐵資料由 `static/data/subway.json` 提供，方便旅客理解周邊交通

### 🤖 Chatbot 與地圖動作
- 右下角提供 AI 旅遊助手對話框
- Chatbot 唔只答問題，仲可以回傳結構化 map actions，由前端直接執行
- 已實作嘅動作包括：
  - 定位到指定地點
  - 新增搜尋標記或多個地點標記
  - 畫出範圍/多邊形
  - 將 AI 或搜尋結果加入清單
  - 更新地點詳細資料
  - 觸發使用者定位並回報位置
- 適合做景點推薦、路線建議、附近有乜好去、旅遊常見問題等對話式查詢

### ⚙️ 自動化能力
- 點地圖某個位置後，可自動搜尋附近景點、餐廳、酒店、購物、交通節點
- 搜尋結果可自動轉成卡片、標記同景點清單項目
- 啟動時可自動嘗試定位目前位置
- 支援圖片上載分析，辨識地標並將結果回傳到地圖與聊天室
- 支援共享地點同步與 Server-Sent Events 更新

### 🧭 行程互動與規劃工具
- 分類篩選：地圖標記與清單同步更新
- 路線規劃：支援起點終點、步行路線顯示與交通資訊查詢
- 範圍篩選：可輸入座標或者直接喺地圖揀中心點，再按距離篩選景點
- 願望清單、釘選地點、聊天新增地點可持久化保存
- 可由聊天、搜尋結果、列表、地圖 popup 多種入口互相跳轉與操作

### ❤️ 點樣幫到去首爾旅行嘅旅客
- 將「搵景點」、「睇附近有乜」、「問交通/門票/開放時間」、「儲存心水地點」集中喺一個畫面完成
- 對首次去首爾嘅旅客特別有用，因為可以用對話方式問問題，再即時反映到地圖
- 當旅客唔熟韓文地名、地鐵站、行政區時，AI 可以幫手整理成較容易理解嘅建議
- 圖片辨識 + 定位功能有助旅途中即場確認自己喺邊、附近有乜可以安排
- 收藏、釘選、同步功能方便將零散想法變成可回看嘅旅程清單

### 🧠 AI 能力
- `server.py` 目前支援 AI 對話 API、圖片分析 API、地圖 action 執行配合
- 可走 Ollama 風格 chat/vision API
- 可選擇 Hermes 相關委派流程處理較複雜查詢或網路搜尋場景
- 搜尋模組會結合公共資料來源同 AI 摘要，令結果更貼近旅遊場景
- 聊天上下文可帶入使用者偏好、旅程記憶、當前地圖狀態與歷史訊息
- 內建 personalization 設定，為之後做更個人化行程建議打底

## 🖥️ 介面組成

### 桌面版
- 地圖主視圖
- 左側景點/分類/收藏/釘選面板
- 路線規劃面板
- 範圍篩選面板
- 設定面板
- 懸浮 AI 對話框

### 手機版
- 地圖主視圖
- 可拖拉嘅底部景點清單 Bottom Sheet
- 手機友善按鈕與面板切換
- 聊天框與地圖工具之間有避讓與協調

## 🚀 本地使用方法

### 1. 只開前端靜態頁面
如果你只想睇 UI 或靜態地圖，可直接用靜態伺服器：

```bash
cd seoul-tour-map
python -m http.server 8080
```

然後開啟 `http://localhost:8080`

### 2. 啟用 Python 後端（推薦）
如果要用聊天、圖片分析、交通查詢、共享同步等功能，建議直接開 `server.py`：

```bash
cd seoul-tour-map
python server.py
```

預設會開喺 `http://localhost:8082`
如果有設定 `PORT` 環境變量，會使用指定 port。

### 3. 啟用 Hermes Worker（可選）
如果你需要 Hermes task worker 流程，可以另外開一個 terminal：

```bash
cd seoul-tour-map
python hermes_worker.py
```

### 4. 執行測試

```bash
npm test
```

另外專案內亦包含多個 Python 測試檔，可按需要用 `python -m unittest ...` 執行。

## 🔧 常見環境變量

以下係目前程式會讀取嘅主要設定類型：

- `PORT`
- `OLLAMA_API_BASE`
- `OLLAMA_API_KEY`
- `OLLAMA_MODEL`
- `HERMES_ENABLED`
- `HERMES_TASK_DIR`
- `HERMES_TIMEOUT`
- `HERMES_AGENT_API_URL`
- `HERMES_AGENT_API_KEY`
- `HERMES_AGENT_MODEL`
- `VISIT_KOREA_API_KEY`
- `SEOUL_DATA_API_KEY`
- `ODSAY_API_KEY`
- `GOOGLE_PLACES_API_KEY`

## 📁 目前項目結構

```text
seoul-tour-map/
├── index.html
├── server.py
├── search_module.py
├── hermes_worker.py
├── memory_manager.py
├── static/
│   ├── css/
│   │   ├── style.css
│   │   └── search_module.css
│   ├── js/
│   │   ├── app.js
│   │   └── search_module.js
│   └── data/
│       ├── preset_locations.json
│       └── subway.json
├── docs/
│   ├── CHANGELOG.md
│   ├── location_skill.md
│   ├── pinned_location_implementation.md
│   └── troubleshooting_log.md
├── __tests__/
├── package.json
└── README.md
```

## 🛠️ 技術棧

| 技術 | 用途 |
|------|------|
| Leaflet | 地圖引擎 |
| OpenStreetMap | 地圖圖層 |
| Vanilla JS | 前端互動與 UI 狀態 |
| Python HTTP Server | API 與本地服務 |
| Ollama-compatible API | AI 對話與圖片分析 |
| Hermes Worker / Agent routing | 複雜查詢與委派流程 |
| localStorage | 使用者偏好、聊天、收藏持久化 |
| Server-Sent Events | 共享地點同步 |
| Jest | 前端單元測試 |

## 🌐 瀏覽器支援

- Chrome
- Edge
- Firefox
- Safari
- 響應式設計，支援手機使用

## 📝 文件導覽

- `README.md`: 目前產品總覽與啟動方式
- `docs/CHANGELOG.md`: 主要改動紀錄
- `docs/location_skill.md`: 「我喺邊」定位回報能力說明
- `docs/pinned_location_implementation.md`: 釘選地點實作說明
- `docs/troubleshooting_log.md`: 歷史 troubleshooting 記錄
- `DEVELOPMENT_GUIDELINES.md`: 開發時值得遵守嘅經驗法則
- `CODE_REVIEW.md`: 指定範圍功能嘅歷史 code review 紀錄

## 📄 授權

MIT License
