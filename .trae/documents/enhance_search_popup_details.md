# 增強搜索結果氣泡詳情計劃

當用戶在位置面板點擊搜索結果項時，目前地圖上顯示的氣泡（Popup）內容過於簡單（僅有名稱和坐標）。本計劃旨在將搜索結果中的更多詳細信息（如評分、價格、簡介、亮點等）展示在氣泡中。

## 當前狀態分析

1.  **數據存儲**：`addSearchResultsToList` 函數在 `app.js` 中只存儲了 `name`, `lat`, `lng`, `category`, `description`。
2.  **渲染邏輯**：`renderAttractionList` 和 `renderMobilePanelList` 在點擊事件中調用 `flyToSearchResult(lat, lng, name)`。
3.  **彈窗內容**：`flyToSearchResult` 函數目前硬編碼了一個簡單的 HTML 字符串作為彈窗內容。
4.  **現有樣式**：`search_module.css` 中已經定義了 `.place-popup` 等相關樣式，可用於美化彈窗。

## 擬議變更

### 1. 修改 `static/js/app.js` 中的數據存儲

-   更新 `addSearchResultsToList` 函數，將搜索到的 `place` 對象的所有字段存入 `currentSearchResults`。
-   具體包括：`rating`, `price`, `highlights`, `tips`, `latest_review` 等。

### 2. 更新 `static/js/app.js` 中的點擊處理程序

-   修改 `flyToSearchResult` 函數，使其接受一個完整的 `place` 對象作為參數，而不僅僅是 `lat`, `lng`, `name`。
-   如果傳入的是舊格式（三個參數），則進行兼容處理。

### 3. 創建豐富的彈窗內容生成函數

-   在 `app.js` 中創建 `createSearchResultPopupContent(place)` 函數。
-   該函數將利用 `place` 中的豐富字段構建與 `search_module.js` 中一致甚至更詳細的 HTML 結構。
-   使用 `search_module.css` 中已有的類名（如 `.place-popup`, `.place-category`, `.place-rating`, `.place-price`）。

### 4. 更新面板渲染函數

-   更新 `renderAttractionList` (桌面版) 和 `renderMobilePanelList` (移動版) 中對 `flyToSearchResult` 的調用，傳遞整個 `place` 對象。
-   同時更新 `fly-to-btn` 按鈕的 `onclick` 屬性。

## 預期效果

點擊搜索結果後，地圖上的氣泡將顯示：
-   地點名稱
-   分類標籤
-   簡介（適度截斷）
-   評分（如果有）
-   價格信息（如果有）
-   亮點或貼士（如果有）

## 驗證步驟

1.  在側邊欄進行一次搜索（例如搜索“景點”）。
2.  在搜索結果列表中點擊一個項目。
3.  驗證地圖自動跳轉到該位置，並且彈出的氣泡包含詳細信息（而不僅僅是坐標）。
4.  在移動版面板中進行同樣的測試，驗證兼容性。
