# Pinned Location Implementation Details

## Overview
The "Pinned location" section has been successfully separated from the main "Wishlist" logic. This document outlines the implementation details, component structure, data flow, and the new testing dependencies introduced.

## Component Structure
1. **Sidebar Updates (`index.html`)**:
   - The `<aside class="sidebar">` now contains a dedicated panel for pinned locations: `#pinned-panel`.
   - The panel features a counter badge (`#pinned-count`) and a loading spinner (`#pinned-loading`), which uses `.sync-loading` for proper visual hierarchy.
   - Pinned items are injected dynamically into the `#pinned-list` container.

2. **JavaScript Logic (`static/js/app.js`)**:
   - `renderPinnedPanel()`: Filters items where `category === '用戶釘選'` and renders them inside `#pinned-list`.
   - `updatePinnedCount()`: Calculates the total count of pinned items and updates the `#pinned-count` badge.
   - `toggleLoadingState(isSyncing)`: Controls the visibility of the `.sync-loading` spinner by toggling the `.hidden` CSS class based on the sync status.

## Data Flow
- **Adding Pins**: When a user clicks a location on the map, `addPinFromMap(lat, lng)` is triggered. Upon confirmation, `savePin()` creates an object with `category: '用戶釘選'` and adds it to the `WishlistManager`.
- **Syncing**: 
  - `WishlistManager.syncToServer()` makes a POST request to `/api/sync-locations`.
  - Before the request starts, `toggleLoadingState(true)` is called, displaying the spinner.
  - In the `finally` block of the fetch request, `toggleLoadingState(false)` is executed to hide the spinner, ensuring it clears regardless of success or error.
- **Persistence**: Data continues to be persisted both locally (`localStorage`) and remotely (`Server-Sent Events`), avoiding duplicate implementations while keeping the visual display separate.

## Unit Testing
- **New Dependencies**: `jest` and `jest-environment-jsdom` have been added to the project via `npm`.
- **Configuration**: A `package.json` was created with a `test` script pointing to Jest.
- **Test Suite**: `__tests__/pinned.test.js` covers:
  - Toggle states of the loading spinner.
  - Addition of items to the WishlistManager specifically with the `'用戶釘選'` category.
  - Ensuring the `updatePinnedCount` badge strictly ignores regular wishlist attractions.
  - Ensuring the `renderPinnedPanel` only displays pinned items.
  - Proper item removal capabilities.

## Execution
To run tests locally:
```bash
npm install
npm test
```