# 修正聊天機器人載入氣泡顯示「實時搜索中」空間不足之計畫

## 問題分析
目前「實時搜索中」文字在聊天機器人氣泡中顯示空間不足，主要原因如下：
1. **CSS 選擇器衝突**：`static/css/style.css` 中的 `.typing-indicator span` 選擇器過於寬泛，將所有內部的 `span`（包括搜尋狀態的文字）強制設為 `8x8px` 的圓點，導致文字無法正常顯示。
2. **雙重內邊距 (Double Padding)**：`.message .bubble` 與 `.typing-indicator` 同時具有較大的 `padding`，壓縮了內容顯示空間。
3. **缺少換行限制**：搜尋狀態文字若未設定 `white-space: nowrap`，在狹窄的氣泡中可能會發生不必要的換行。

## 擬定變更
### 1. 修改 JavaScript 邏輯
- **檔案**: [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js)
- **變更**: 為 `showTyping()` 函數中生成的預設打字點添加 `dot` class，以便在 CSS 中精確定位。

### 2. 優化基礎樣式
- **檔案**: [style.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/style.css)
- **變更**:
    - 將 `.typing-indicator span` 改為 `.typing-indicator .dot`。
    - 減少 `.typing-indicator` 的 `padding`，避免與外層 `.bubble` 的 `padding` 疊加。

### 3. 增強搜尋載入樣式
- **檔案**: [search_module.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/search_module.css)
- **變更**:
    - 為 `.search-loading` 添加 `white-space: nowrap` 確保文字在一行顯示。
    - 調整字體大小與間距，使其在氣泡中更美觀。
    - 修正 `loading-dots` 動畫，改用 `::after` 偽元素實現更流暢的省略號效果。

## 預期結果
- 聊天機器人在「搜尋中」狀態時，氣泡能自動展開並完整顯示「實時搜索中...」文字。
- 預設的打字動畫（三個點）保持不變，但氣泡高度會更精簡美觀。

## 驗證步驟
1. 觸發聊天機器人的搜尋功能。
2. 觀察載入氣泡的顯示效果，確保文字完整、無換行且樣式正確。
3. 檢查一般對話時的打字動畫是否依然正常運作。
