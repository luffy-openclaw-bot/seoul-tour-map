# 計劃：實現伺服器端位置列表同步與設備指紋功能

本計劃旨在為「首爾旅遊地圖平台」添加伺服器端同步功能，讓用戶可以共享通用的地點列表。每個地點項目將包含一個基於設備特徵的指紋，以標識所有者。

## 當前狀態分析
- **前端**：使用 `localStorage` 存儲 `seoul_tour_wishlist` 和 `seoul_tour_chat_places`。地點項目結構包含 `id`, `name`, `lat`, `lng`, `category`, `price`, `description`, `addedAt`。
- **後端**：`server.py` 是一個基於 `http.server` 的輕量級 Python 伺服器，提供靜態文件和 AI API。目前沒有數據持久化存儲（除了靜態 JSON 文件）。

## 提出的變更

### 1. 設備指紋生成 (Frontend)
- 在 [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js) 中添加 `FingerprintManager` 對象。
- 生成邏輯：`user agent + 首次生成時間戳 + UUID 哈希`。
- UUID 將存儲在 `localStorage` 中以保持跨會話一致性。

### 2. 地點數據結構更新
- 為所有地點項目添加 `ownerFingerprint` 字段。
- 更新 [WishlistManager](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L2615) 的 `add` 方法和 `persistChatPlace` 函數。

### 3. 後端 API (Backend)
- 在 [server.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py) 中新增兩個 API 端點：
    - `POST /api/sync-locations`：接收本地地點列表並合併到伺服器端的共享列表中。
    - `GET /api/get-locations`：獲取伺服器端所有用戶共享的地點列表。
- 使用 `shared_locations.json` 文件作為伺服器端數據庫。

### 4. 同步邏輯 (Frontend)
- 更新 `WishlistManager.save()`，在保存到 `localStorage` 的同時調用 `/api/sync-locations`。
- 在應用啟動時調用 `/api/get-locations`，將伺服器端的項目合併到本地列表中，並更新 UI。

## 修改文件詳情

### [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js)
- 添加 `FingerprintManager`。
- 修改 `persistChatPlace` 以包含指紋。
- 修改 `WishlistManager`：
    - 更新 `add` 方法。
    - 更新 `save` 方法以異步同步到伺服器。
    - 添加 `syncFromServer` 方法。
- 在 `initMap` 或適當的初始化位置調用同步。

### [server.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py)
- 添加 `handle_sync_locations` 處理 POST 請求。
- 添加 `handle_get_locations` 處理 GET 請求。
- 實現簡單的文件讀寫鎖機制（或使用臨時文件原子寫入）以保證 `shared_locations.json` 的一致性。

## 假設與決策
- **共享模式**：所有用戶看到的列表是所有用戶提交的地點的並集。
- **指紋穩定性**：指紋在同一設備/瀏覽器上應保持不變。
- **衝突處理**：基於 `id` (name+coords) 進行去重。

## 驗證步驟
1. 打開地圖，添加一個地點。
2. 檢查 `localStorage` 是否包含 `ownerFingerprint`。
3. 檢查伺服器端是否生成了 `shared_locations.json`。
4. 使用另一個瀏覽器或清除 `localStorage`（模擬另一台設備），刷新頁面，檢查是否能自動加載之前添加的地點。
