# 聊天機器人地點提取與列表添加功能計畫

## 總結 (Summary)
在聊天機器人中增強地點提取功能，當 AI 回覆提及地點時，透過簡化的單一指令 `add_to_list` 自動在地圖加上標記並加入到景點列表，同時使用模糊比對（Fuzzy Match）確保列表地點的唯一性，最後進行多場景測試以驗證功能穩定性。

## 目前狀態分析 (Current State Analysis)
- 目前 `server.py` 與 `app.js` 的 System Prompt 要求 AI 提及地點時必須同時輸出 `add_marker` 和 `add_to_list` 兩個 JSON 標籤，這容易導致 AI 產生遺漏。
- `app.js` 處理 `add_to_list` 指令時，強制將分類硬編碼為 `自訂景點`，忽略了 AI 傳入的 `category` 參數。
- 目前 `app.js` 中的去重邏輯（位於 `addSearchResultsToList` 和 `persistChatPlace`）採用極為嚴格的名稱和經緯度比對（`Math.abs(p.lat - place.lat) < 0.0001`），AI 每次輸出的坐標或名稱若有微小差異，就會導致同一地點被重複添加。

## 建議變更 (Proposed Changes)

1. **簡化 AI 指令 (修改 `server.py` & `app.js`)**
   - 更新系統提示詞（System Prompt），指示 AI 當提及具體地點時，只需輸出 `add_to_list` 單一指令，告知 AI 該指令會自動處理地圖標記和列表添加。

2. **增強前端 `add_to_list` 處理邏輯 (修改 `app.js`)**
   - 在 `executeMapAction` 的 `add_to_list` 分支中，讀取 `params.category`，若無則預設為 `地標觀景`（移除硬編碼的 `自訂景點`）。
   - 在處理 `add_to_list` 時，除了呼叫 `addSearchResultsToList` 和 `persistChatPlace` 之外，自動呼叫 `addSearchMarker`，在地圖上同步產生標記。

3. **實作模糊去重邏輯 (Fuzzy Match) (修改 `app.js`)**
   - 在 `addSearchResultsToList` 和 `persistChatPlace` 中，優化 `exists` 檢查邏輯：
     - 利用現有的 `getDistance(lat1, lon1, lat2, lon2)` 函數計算距離。
     - 判斷標準：若兩地點距離小於 0.05 公里（50米），且名稱具有包含關係（例如 "Starbucks" 包含於 "Starbucks (明洞)"）或名稱完全相同，則視為同一地點，不重複添加。

## 假設與決策 (Assumptions & Decisions)
- **決策**：採用「合併指令」策略以降低 AI 輸出遺漏率，由前端自動補齊 UI 效果，這是最有效提升提取準確性的方法。
- **決策**：採用模糊比對策略處理地點去重，容許 AI 在坐標和名稱上的微小誤差。
- **假設**：現有的 `getDistance` 函數可以準確計算經緯度距離。

## 驗證步驟與多場景測試 (Verification Steps)
- **場景 1（單一地點提取）**：詢問「景福宮附近有咩好食的餐廳？」，驗證 AI 是否正確回覆並觸發 `add_to_list`，且地圖和左側列表皆有正確顯示。
- **場景 2（模糊去重驗證）**：連續詢問同一地點，或刻意詢問帶有不同後綴的同一個地點（如「星巴克明洞店」），驗證模糊去重邏輯是否成功阻擋重複添加。
- **場景 3（多地點提取）**：詢問「推薦弘大附近的三間咖啡店」，驗證系統是否能準確提取多個地點並無遺漏地添加到列表中。
- **場景 4（持久化測試）**：重新載入網頁，驗證剛才加入的景點是否成功從 `localStorage` 恢復並顯示於列表中。
