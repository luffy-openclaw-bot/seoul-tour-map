# 首爾旅遊地圖 - 釘選功能優化計劃

本計劃旨在解決現有「Pin」（釘選）功能中使用的 `prompt()` 函數在自動化測試環境不支援的問題，並提升用戶體驗。我們將使用自定義的 HTML 模態框（Modal）替代原生的 `prompt()`。

## 當前狀態分析
- **功能已實現**：用戶可以點擊地圖並在彈窗中選擇「釘選此位置」。
- **數據持久化**：使用 `WishlistManager` (LocalStorage) 存儲釘選點。
- **渲染邏輯**：釘選點在地圖上顯示為深藍色大頭針（`.pin-marker`）。
- **關鍵問題**：`addPinFromMap` 函數調用了 `prompt()`，這在部分環境（如自動化測試）中會報錯。

## 提議的變更

### 1. 修改 `index.html`
- 確保現有的 `modal` 結構可以被複用。目前已有：
  ```html
  <div id="modal" class="modal hidden">
      <div class="modal-content">
          <button class="modal-close" onclick="closeModal()">
              <i class="fas fa-times"></i>
          </button>
          <div id="modal-body"></div>
      </div>
  </div>
  ```

### 2. 修改 `static/js/app.js`
- **重構 `addPinFromMap(lat, lng)`**：不再直接調用 `prompt()`，而是顯示一個輸入模態框。
- **新增 `savePin(name, lat, lng)`**：封裝存儲邏輯，供模態框確認按鈕調用。
- **更新 `renderWishlistMarkers()`**：確保釘選標記的彈窗邏輯（如移除釘選）運作正常。

### 3. 修改 `static/css/style.css`
- 添加模態框中輸入框的樣式，使其與整體設計風格一致。
- 確保 `.pin-input` 等新類名的樣式正確。

## 具體實施步驟

### 步驟 1: 更新 `app.js` 中的釘選邏輯
將 `addPinFromMap` 改為顯示模態框：
1. 獲取 `modal-body` 元素。
2. 注入包含 `<input>`、確認和取消按鈕的 HTML。
3. 綁定按鈕事件：
   - 「確認」：讀取輸入值並調用 `WishlistManager.add()`。
   - 「取消」：調用 `closeModal()`。

### 步驟 2: 樣式調整
在 `style.css` 中添加：
```css
.pin-input {
    width: 100%;
    padding: 12px;
    margin: 15px 0;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
}
.pin-input:focus {
    border-color: #1e3a8a;
    box-shadow: 0 0 0 2px rgba(30, 58, 138, 0.1);
}
```

## 驗證步驟
1. **手動驗證**：
   - 在地圖上點擊任意位置。
   - 點擊「釘選此位置」。
   - 確認自定義模態框彈出，且 `prompt()` 報錯消失。
   - 輸入名稱並確認，檢查地圖上是否出現標記。
   - 刷新頁面，確認釘選標記仍然存在。
2. **移除驗證**：
   - 點擊地圖上的釘選標記，點擊「移除釘選」。
   - 確認標記消失且 LocalStorage 已更新。

## 假設與決定
- **複用 Modal**：決定複用現有的 `modal` 組件而非創建新的，以減少代碼冗餘並保持 UI 一致性。
- **默認名稱**：如果用戶留空，將使用 `📍 釘選位置 (lat, lng)` 作為默認名稱。
