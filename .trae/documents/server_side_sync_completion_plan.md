# 計劃：完善伺服器端位置列表同步與嚴格數據驗證

本計劃旨在完成並優化「首爾旅遊地圖平台」的伺服器端同步功能。我們將添加嚴格的數據驗證以防止無效數據導致的崩潰，並根據用戶需求精確調整設備指紋生成邏輯。

## 當前狀態分析
- **已實現**：`FingerprintManager` 指紋生成、`WishlistManager` 的 `syncToServer` 和 `syncFromServer` 方法、以及 `server.py` 中的同步 API。
- **存在問題**：
    - 缺乏數據驗證，曾發生過 `Invalid LatLng` 錯誤。
    - 指紋生成邏輯尚可優化以更精確地符合「UUID 哈希」的需求。
    - 同步邏輯為「全量添加」，缺乏對無效項目的過濾。

## 提出的變更

### 1. 嚴格的後端數據驗證 (Backend)
在 [server.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py) 的 `handle_sync_locations` 中：
- 遍歷接收到的地點列表。
- 驗證每個項目必須包含：`id`, `name`, `lat`, `lng`。
- `lat` 和 `lng` 必須是有效的數字，且在合理範圍內（首爾附近）。
- 拒絕包含無效項目的同步請求或過濾掉無效項目。

### 2. 前端數據驗證與健壯性 (Frontend)
在 [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js) 中：
- **`WishlistManager.syncFromServer`**：在合併遠程數據前，驗證項目完整性，跳過任何無效項目。
- **`WishlistManager.add` & `persistChatPlace`**：在保存前確保數據有效。
- **`FingerprintManager`**：改進指紋生成，確保其包含用戶代理、時間戳和 UUID 的哈希值。

### 3. 精確的指紋生成邏輯
更新 `FingerprintManager`：
- 實現一個簡單的 `_hash` 函數（例如 DJB2 或類似算法）來處理 UUID。
- 指紋組合：`UserAgent + Timestamp + Hash(UUID)`。

## 修改文件詳情

### [server.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py)
- 修改 `handle_sync_locations`：
    - 增加對 `new_locations` 的遍歷驗證。
    - 檢查 `lat`/`lng` 是否為 `float` 且不為 `None`。
    - 確保 `id` 和 `name` 存在。

### [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js)
- 更新 `FingerprintManager.getFingerprint()`：
    - 使用自定義哈希函數處理 UUID。
    - 處理 `btoa` 可能遇到的非 ASCII 字符問題。
- 更新 `WishlistManager.syncFromServer()`：
    - 增加對 `remoteItem` 的屬性檢查。
- 更新 `WishlistManager.add()` 和 `persistChatPlace()`：
    - 在調用 `syncToServer` 前進行基礎驗證。

## 假設與決策
- **數據合併**：繼續使用基於 `id` 的去重邏輯，確保全局列表的唯一性。
- **共享範圍**：維持「全局共享」模式，所有用戶同步的地點都會進入公共池。
- **安全性**：目前的驗證側重於數據完整性和穩定性，暫不涉及複雜的身份驗證。

## 驗證步驟
1. **無效數據測試**：使用 `curl` 向 `/api/sync-locations` 發送缺少 `lat` 的 JSON，確認伺服器能正確處理或拒絕，且前端刷新後不會崩潰。
2. **跨設備同步測試**：
    - 在瀏覽器 A 添加一個地點。
    - 檢查 `shared_locations.json` 是否正確記錄。
    - 打開瀏覽器 B（或隱身模式），確認啟動時自動加載了該地點。
3. **指紋驗證**：在控制台調用 `FingerprintManager.getFingerprint()`，確認生成的字符串符合預期。
