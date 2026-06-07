# 🗺️ 首爾旅遊地圖平台 | Seoul Tour Map

專為首次去韓國、不熟悉首爾嘅旅客設計嘅互動式旅遊地圖平台。

## ✨ 功能特色

### 📍 互動地圖
- 基於 **Leaflet + OpenStreetMap**（免費開源）
- 15個首爾熱門景點標記，按分類顏色區分
- 點擊標記彈出景點卡片
- 縮放、拖動流暢

### 🏛️ 景點資料庫
- **歷史文化**：景福宮、北村韓屋村
- **地標觀景**：南山塔、東大門DDP
- **購物美食**：明洞、仁寺洞、廣藏市場、南大門
- **夜生活文化**：弘大、梨泰院
- **娛樂**：樂天世界、愛寶樂園、COEX水族館
- **休閒**：星空圖書館
- **自然景觀**：清溪川

每個景點包含：
- 中英文+韓文名稱
- 詳細介紹
- 交通資訊（地鐵站+步行時間）
- 門票價格
- 開放時間
- 必睇亮點
- 旅遊貼士

### 💰 價格資訊顯示
- 地圖點擊搜索結果顯示 💰 價格資訊（門票/人均消費/房價等）
- AI 分析自動提取價格範圍（免費、₩3,000、$$ 等）
- 景點列表顯示門票價格標籤
- 搜索結果卡片同地圖 popup 同步顯示價格

### ❤️ 願望清單
- 一鍵收藏景點到個人願望清單（localStorage 持久化）
- ❤️ 按鈕位於景點列表、搜索結果、詳情 Modal
- 側邊欄「願望清單」面板查看所有收藏
- 點擊願望清單項目可飛到地圖位置
- 收藏/移除即時 Toast 通知
- 頁面刷新後願望清單保留

### 🚇 地鐵線顯示
- 顯示首爾主要地鐵線（1-6號線、8號線）
- 車站位置標記
- 轉車站資訊

### 🛣️ 路線規劃
- 選擇起點+終點景點
- 顯示預設交通時間同轉乘資訊
- 地圖上繪製視覺化路線
- 自動計算距離（無預設路線時）

### 🔍 分類篩選
- 一鍵篩選特定分類景點
- 地圖標記同列表同步更新

### 🤖 AI 旅遊助手
- 右下角懸浮對話框
- 可連接 **Ollama Cloud / Hermes AI** 後端
- 離線時自動切換前端知識庫
- 支援查詢：
  - 景點門票/時間/交通
  - 行程規劃建議
  - 分類景點推薦
  - 韓國旅遊常見問題（WiFi、換錢、天氣、機場交通等）
- 用 **粵語（廣東話書面）** 回答

## 🚀 使用方法

### 直接開啟（靜態模式）
```bash
# 用瀏覽器直接打開 index.html
# 或使用任意靜態伺服器
cd seoul-tour-map
python3 -m http.server 8080
```

### 啟用 AI 後端（推薦）
```bash
cd seoul-tour-map

# 方式1：連接本地 Ollama
python3 server.py

# 方式2：連接 Ollama Cloud（設置環境變量）
export OLLAMA_API_URL="https://api.ollama.com"
export OLLAMA_API_KEY="your-api-key"
export OLLAMA_MODEL="kimi-k2.6"
python3 server.py
```

打開瀏覽器訪問：`http://localhost:8092` (或 `.env` 中設定的 PORT)

## 📁 項目結構

```
seoul-tour-map/
├── index.html              # 主頁面
├── server.py               # 輕量後端（Python）
├── search_module.py        # 經緯度搜索模組（AI + 逆地理編碼）
├── hermes_worker.py        # Hermes Worker（DuckDuckGo 實時搜索）
├── static/
│   ├── css/
│   │   ├── style.css           # 主樣式表
│   │   └── search_module.css   # 搜索模組樣式
│   ├── js/
│   │   ├── app.js              # 前端主邏輯 + 願望清單管理
│   │   └── search_module.js    # 搜索模組前端
│   └── data/
│       ├── attractions.json  # 景點資料庫（15個景點）
│       └── subway.json       # 地鐵線路資料
└── docs/
    ├── CHANGELOG.md         # 改動紀錄
    └── README.md            # 本文件
```

## 🛠️ 技術棧

| 技術 | 用途 |
|------|------|
| Leaflet | 地圖引擎 |
| OpenStreetMap | 免費地圖圖層 |
| Font Awesome | 圖標 |
| Vanilla JS | 前端邏輯 |
| localStorage | 願望清單持久化 |
| Python HTTP Server | 輕量後端 |
| Ollama API | AI 對話 |

## 🌐 瀏覽器支援

- Chrome / Edge / Firefox / Safari
- 響應式設計，支援手機瀏覽

## 📝 擴展建議

1. **加入更多景點**：編輯 `static/data/preset_locations.json`
2. **接入外部 API**：
   - Google Places API（景點資料）
   - Naver Map API（真實路線規劃）
   - 韓國觀光公社 API
3. **願望清單增強**：雲端同步、行程排序、分享功能
4. **多語言支援**：加入韓文、英文界面

## 📄 授權

MIT License - 自由使用同修改。
