# Plan: Separate Pinned Locations and Wishlist

## Summary
The user requested to separate "Pinned location" (用戶釘選) and "願望清單(wishlist)" (Hearted items) into two different types of location items so they do not appear in the same list. Hearted locations will be accessible via a new "願望s" category filter, and the existing Wishlist panel will be repurposed exclusively for "Pinned locations".

## Current State Analysis
- **Data Storage**: `WishlistManager` (backed by localStorage `seoul_tour_wishlist` and synced to the server) currently stores both user-pinned locations (`category: '用戶釘選'`) and hearted items (various categories).
- **UI Panels**: There is a dedicated sidebar panel (`#wishlist-panel`) that displays all items in `WishlistManager`, mixing pinned locations and hearted items.
- **Category Filters**: The main attraction list supports filtering by categories (e.g., "歷史文化", "購物美食"), but does not have a filter for Wishlist/Hearted items.
- **Map Markers**: `wishlistLayerGroup` renders both pinned locations and custom hearted items on the map permanently.

## Proposed Changes

### 1. UI Layout Updates (`index.html`)
- **Rename Panel**: Change the existing `#wishlist-panel` to `#pinned-panel`. Update the title to `<i class="fas fa-thumbtack"></i> 釘選位置`. Change IDs: `wishlist-count` -> `pinned-count`, `wishlist-list` -> `pinned-list`.
- **Add "願望s" Category**: 
  - Add `<button class="cat-btn" data-category="願望s"><i class="fas fa-heart"></i> 願望s</button>` to the desktop category filters.
  - Add `<button class="mobile-tab" data-category="願望s">❤️ 願望s</button>` to the mobile panel tabs.

### 2. Styles (`static/css/style.css`)
- Rename CSS classes associated with the panel: `.wishlist-list` -> `.pinned-list`, `.wishlist-item` -> `.pinned-item`, `.wishlist-remove-btn` -> `.pinned-remove-btn`, etc.
- Add styles for the new "願望s" category button if needed.

### 3. Application Logic (`static/js/app.js`)
- **Constants**:
  - Add `'願望s': '#e74c3c'` to `CATEGORY_COLORS`.
  - Add `'願望s': '❤️'` to `CATEGORY_EMOJIS`.
- **Pinned Locations Panel**:
  - Rename `renderWishlistPanel()` to `renderPinnedPanel()`. Modify it to only render items where `item.category === '用戶釘選'`. Update the empty state text to "沒有釘選位置".
  - Rename `updateWishlistCount()` to `updatePinnedCount()`. Count only `category === '用戶釘選'` items.
  - Update `WishlistManager.updatePanel()` to call these new functions.
- **Map Markers**:
  - Rename `wishlistLayerGroup` to `pinnedLayerGroup`.
  - Update `renderWishlistMarkers()` to `renderPinnedMarkers()`. It will only render map markers for items where `category === '用戶釘選'`.
- **List Rendering (`renderAttractionList` & `renderMobilePanelList`)**:
  - Add logic to handle `activeCategory === '願望s'`. 
  - When selected, retrieve items from `WishlistManager.getAll()` where `category !== '用戶釘選'`. 
  - Map these saved items to match the structure of `attractionsData` (matching with predefined data where possible to recover images) and render them in the main list.
- **Toggle Wishlist**:
  - When `toggleWishlist(btn)` is called, if the current `activeCategory === '願望s'`, trigger a re-render of the attraction list so the added/removed item immediately updates in the view.

## Assumptions & Decisions
- We assume it is safe to keep both pinned and hearted items in the same `WishlistManager` storage (and server sync endpoint) to avoid breaking the existing sync architecture. We will simply distinguish them by `item.category === '用戶釘選'`.
- Custom hearted items (from search results) will no longer be permanently forced on the map via a separate layer. Instead, they will appear in the main list when the "願望s" category is selected.

## Verification Steps
1. Open the application and click a location on the map to add a "釘選位置" (Pinned Location). Verify it appears in the newly renamed "釘選位置" sidebar panel.
2. Click the heart icon on a predefined attraction and a search result to add them to the wishlist. Verify they DO NOT appear in the "釘選位置" panel.
3. Click the new "願望s" category button. Verify the main list updates to show only the hearted items.
4. Un-heart an item while in the "願望s" category. Verify it is removed from the list immediately.