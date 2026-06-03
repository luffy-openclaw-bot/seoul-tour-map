# Plan: Implement Transportation Search Button in Search Popup

This plan outlines the steps to add a fully functional, interactive transportation search button to the `search-popup-container` within the Seoul Tour Map application.

## Current State Analysis
- The `search-popup-container` is defined in [search_module.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/search_module.js) and styled in [search_module.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/search_module.css).
- The popup currently contains a 2x2 grid for Attractions, Restaurants, Hotels, and Shopping, plus a full-width button for "Search All".
- Transportation search logic already exists as `searchNearbyTransport(lat, lng)` in [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js), but it is not linked to the new search popup.
- Clicking any button in the current popup closes it immediately and triggers a search in the chatbot.

## Proposed Changes

### 1. Styling Updates ([search_module.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/search_module.css))
- Add styles for `.search-type-btn.is-loading` to show a loading spinner and disable interactions.
- Modify `.search-type-grid` and `.search-all-btn` to support a 2x3 grid layout where the "Transport" and "All" buttons occupy the third row.
- Ensure responsive behavior for the new 2x3 grid layout across mobile and desktop.

### 2. Configuration Updates ([search_module.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/search_module.js))
- Update `SearchTypes` to include a `transport` category with a suitable icon (🚇), label (交通資訊), and color (#2ecc71).

### 3. UI Template Updates ([search_module.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/search_module.js))
- Update the HTML template in `SearchPopup.show` to:
    - Include the "Transport" button in the `.search-type-grid`.
    - Move the "All" button into the `.search-type-grid` for a uniform 2x3 layout.
    - Add `aria-label` and `tabindex` for accessibility.

### 4. Logic & Interactivity Updates ([search_module.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/search_module.js))
- Modify `SearchPopup.bindEvents` to:
    - Add a loading state to the clicked button.
    - Prevent multiple clicks while loading.
    - `await` the completion of the search before closing the popup (as requested by the user).
- Update `SearchExecutor.execute` to handle the `transport` type by calling the existing `searchNearbyTransport` function from `app.js`.

### 5. Integration ([app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js))
- Ensure `searchNearbyTransport` is properly async and works with the new search module's loading state.

## Assumptions & Decisions
- **Layout**: A 2x3 grid will be used for all 6 buttons (Attractions, Restaurants, Hotels, Shopping, Transport, All) to maintain visual balance.
- **Loading State**: The button will show a spinner icon and the popup will remain open until the search results are posted to the chat.
- **Accessibility**: Standard keyboard navigation (Tab, Enter/Space) will be supported by using `<button>` elements and ensuring they are reachable.

## Verification Steps
- **Functional**: Click the "Transport" button and verify it triggers `searchNearbyTransport` and displays results in the chatbot.
- **UI/UX**: Check the loading state animation on the button. Verify the popup closes only after the search finishes.
- **Responsive**: Test the popup on different screen sizes (using browser dev tools) to ensure the 2x3 grid looks good.
- **Accessibility**: Verify the button can be focused using Tab and activated using Enter.
