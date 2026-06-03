# Plan: Synchronize Desktop and Mobile Location Panels

## Summary
Ensure that both desktop and mobile location panels display the same set of place items, including search results and chat-added places. The mobile panel will be updated to include wishlist buttons and search results, matching the desktop experience.

## Current State Analysis
- **Desktop Panel**: Renders static attractions via `renderAttractionList`. Dynamic search results are added directly to the DOM via `addSearchResultsToList`.
- **Mobile Panel**: Renders only static attractions via `renderMobilePanelList`. It lacks search results and wishlist buttons.
- **Inconsistency**: Search results added to the desktop panel are not added to the mobile panel. Additionally, search results are lost when switching categories because the render functions clear the containers.

## Proposed Changes

### 1. Global State Management (`static/js/app.js`)
- Introduce a global variable `let currentSearchResults = [];` to persist dynamic places.

### 2. Update `addSearchResultsToList` (`static/js/app.js`)
- Store the new places in `currentSearchResults`.
- Instead of manual DOM insertion, update the logic to append to both `#attraction-list` and `#mobile-panel-list`.
- Alternatively, have `renderAttractionList` and `renderMobilePanelList` handle both static and dynamic data.

### 3. Update `renderMobilePanelList` (`static/js/app.js`)
- Modify the template to include a wishlist button (`.wishlist-btn`).
- Ensure it can render search result items (potentially using `thumb-search` icons like desktop).
- Add support for displaying a "Search Results" header in the mobile list.

### 4. Update `renderAttractionList` (`static/js/app.js`)
- Ensure it re-renders search results from `currentSearchResults` if they exist, so they aren't lost when changing categories.

### 5. Update `clearSearchResultsFromList` (`static/js/app.js`)
- Clear the `currentSearchResults` array.
- Refresh both panels.

### 6. CSS Updates (`static/css/style.css`)
- Ensure the wishlist button is properly positioned and styled within `.mobile-attraction-card`.
- Add styles for search result headers in the mobile panel.

## Verification Steps
1. **Search**: Perform a search and check if results appear on both desktop and mobile panels.
2. **Wishlist**: Toggle wishlist on mobile and verify it updates the desktop wishlist panel.
3. **Categories**: Change categories and verify search results stay visible in the "all" category or as persistent search results.
4. **Mobile Layout**: Ensure the new elements (wishlist button, search results) look good on mobile devices.
