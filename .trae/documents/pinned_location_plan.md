# Plan: Implement "Pinned Location" Section in Sidebar

## 1. Summary
Implement a new "Pinned location" section in the sidebar to display custom user-pinned locations. The data will continue to be managed by the existing `WishlistManager` backend and `localStorage` to ensure persistence, but will be visually separated from regular wishlist attractions. The implementation includes responsive UI updates, loading states during sync operations, and Jest-based unit testing.

## 2. Current State Analysis
- User pins are currently added via `addPinFromMap()` and saved to the `WishlistManager` with the category `'用戶釘選'`.
- They are visually mixed with the regular attractions in the "Wishlist" (`#wishlist-panel`).
- The Wishlist syncs to the server via `/api/sync-locations` (POST) and Server-Sent Events (SSE).
- The project does not currently have a JavaScript unit testing framework or a `package.json`.

## 3. Proposed Changes

### 3.1. Update HTML Structure (`index.html`)
- Add a new panel `<div class="panel" id="pinned-panel">` inside the `.sidebar` `<aside>` element, directly above the existing Wishlist panel.
- The panel will include an `h3` header with an icon, a count badge (`#pinned-count`), and a loading spinner element (`#pinned-loading`) hidden by default.
- Include a list container `<div id="pinned-list" class="wishlist-list"></div>`.

### 3.2. Update JavaScript Logic (`static/js/app.js`)
- **Visual Separation**:
  - Update `renderWishlistPanel()` to filter out items where `category === '用戶釘選'`.
  - Create a new function `renderPinnedPanel()` that filters and renders *only* items where `category === '用戶釘選'`. It will use the same DOM structure as wishlist items but injected into `#pinned-list`.
- **Count Updates**:
  - Modify `updateWishlistCount()` to only count non-pinned items.
  - Create `updatePinnedCount()` to count and display the number of pinned items.
- **Event Hooking**:
  - Update `WishlistManager._notifyChange()` to call `renderPinnedPanel()` and `updatePinnedCount()` alongside the existing wishlist updates.
- **Loading State**:
  - Create a `toggleLoadingState(isSyncing)` function to show/hide the `#pinned-loading` spinner.
  - Call this function in `WishlistManager.syncToServer()` (show before fetch, hide in `finally`) and briefly during `_mergeRemoteLocations()` if new data arrives via SSE.
- **Testability**:
  - Add a conditional CommonJS export at the bottom of `app.js` (`if (typeof module !== 'undefined' && module.exports) { ... }`) to expose functions for Jest testing.

### 3.3. Update CSS (`static/css/style.css`)
- Ensure the new `#pinned-loading` spinner matches the application's design system (e.g., matching the font size and color of other badges/meta text, right-aligned or inline with the header).
- No major structural CSS changes needed as we will reuse `.panel`, `.wishlist-list`, and `.wishlist-item` classes which are already responsive.

### 3.4. Unit Testing Setup
- Initialize an npm project (`npm init -y`).
- Install Jest and JSDOM (`npm install --save-dev jest jest-environment-jsdom`).
- Add a `test` script in `package.json`.
- Create `__tests__/pinned.test.js` to verify:
  - Adding a pin adds it to `WishlistManager` and triggers `renderPinnedPanel`.
  - Removing a pin removes it correctly.
  - `renderWishlistPanel` and `renderPinnedPanel` properly filter items based on the `'用戶釘選'` category.

### 3.5. Documentation
- Create `docs/pinned_location_implementation.md` detailing the component structure, the visual filtering approach used for data flow, and instructions for running the newly added Jest tests.

## 4. Assumptions & Decisions
- **Decision:** Data will remain in the `WishlistManager` storage (`seoul_tour_wishlist` and backend API) but will be visually separated. This fulfills the user's intent without unnecessarily duplicating the complex SSE sync logic.
- **Decision:** We will use Jest + JSDOM for unit testing vanilla JavaScript since there are no existing test frameworks.
- **Assumption:** Mobile responsiveness is automatically inherited by using the existing `.panel` and `.wishlist-list` CSS classes inside `.sidebar`.

## 5. Verification Steps
1. Open the application and add a pin by clicking on the map. Verify it appears in the "Pinned location" section and NOT in the "Wishlist" section.
2. Verify the loading spinner appears briefly when adding a pin (as it syncs to the server).
3. Verify the pin persists across page reloads.
4. Remove the pin from the sidebar and verify it disappears from both the UI and localStorage.
5. Run `npm test` and ensure all Jest unit tests pass.
6. Verify layout on mobile view (by resizing viewport) to ensure the new panel fits correctly within the sliding sidebar.
7. Conduct manual cross-browser checks (Chrome, Firefox, Safari/Edge) to ensure basic rendering and functionality.