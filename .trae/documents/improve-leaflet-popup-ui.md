# Plan: Improve Leaflet Popup UI and Style

This plan aims to modernize the "leaflet-popup" UI to make it more tidy, readable, and visually appealing across the entire application.

## Current State Analysis
- **Locations**: Popups are used in `app.js` (attractions, coordinates) and `search_module.js` (location search).
- **Styles**: Defined in [style.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/style.css) and [search_module.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/search_module.css).
- **Issues**:
    - Typography is small (13-16px) and lacks sufficient line-height.
    - Buttons use heavy linear gradients that feel outdated.
    - Padding and spacing are tight, making the content feel crowded.
    - Shadows are either default or too prominent.
    - Hover states are inconsistent or missing.

## Proposed Changes

### 1. Global Popup Refinement ([style.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/style.css))
- **Shadows & Borders**: Update `.leaflet-popup-content-wrapper` with a softer, multi-layered shadow and a 16px border radius.
- **Tip (Arrow)**: Style the `.leaflet-popup-tip` to match the popup background.
- **Content Spacing**: Ensure `.leaflet-popup-content` has consistent margins.

### 2. Attraction Card Modernization ([style.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/style.css))
- **Hierarchy**:
    - `.popup-name`: Increase to 18px, use a darker color (#1a1a1a).
    - `.popup-ko`: Improve contrast and spacing.
- **Badges**: Transform `.popup-cat` into a modern pill badge with subtle background colors based on categories.
- **Description**: Increase line-height to 1.6 and use a softer gray (#555).
- **Buttons**:
    - Replace gradients with a solid, modern primary color (e.g., #4f46e5).
    - Add smooth transitions and hover effects (scale/shadow).
    - Ensure buttons are full-width or centered with better padding.

### 3. Coordinate Popup Improvement ([style.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/style.css))
- Clean up the `.coord-popup` layout.
- Use a more distinct style for the coordinate text (monospace or semi-bold).
- Refine the action buttons to be more consistent with the attraction buttons.

### 4. Search Module Popup Update ([search_module.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/search_module.css))
- Update `.location-search-popup` to match the global popup's shadow and border-radius.
- Refine the `.search-type-grid` and `.search-type-btn` for a cleaner look.
- Use softer backgrounds for inactive buttons and clear primary colors for active/hover states.

## Verification Steps
1. **Visual Check**:
    - Open the map and click on various attraction markers to verify the new card design.
    - Click on an empty map area to check the coordinate popup.
    - Use the search module to verify search-related popups.
2. **Interactive Check**:
    - Ensure all buttons are clickable and hover effects work as expected.
    - Verify that popups are still responsive on smaller screens.
3. **Console Check**:
    - Check for any CSS-related errors or broken icon links in the console.
