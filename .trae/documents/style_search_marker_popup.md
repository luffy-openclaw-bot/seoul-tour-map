# Plan: Style search-marker-popup for better readability

This plan aims to improve the visual presentation and readability of the search marker popups on the Seoul Tour Map.

## Current State Analysis
- The `search-marker-popup` is currently styled in `static/css/style.css` with small font sizes (15px for header, 13px for text).
- The HTML is dynamically generated in `static/js/app.js` within the `addSearchMarker` function.
- The current style is functional but lacks modern aesthetic and can be hard to read on smaller screens or high-resolution displays.
- Other popups (like `.place-popup` in `search_module.css`) have a more modern, readable design.

## Proposed Changes

### 1. Update CSS Styling
Modify `static/css/style.css` to enhance the appearance of `.search-marker-popup`.

- **File**: `static/css/style.css`
- **Changes**:
    - Increase `h4` font size to `16px` and improve color contrast using `#2c3e50`.
    - Increase `p` font size to `14px` and line-height to `1.6` for better readability.
    - Add `padding: 12px` to the container.
    - Improve the bottom border of the header to be more subtle or consistent with the app's theme.
    - Add support for dark mode if the app supports it (using `@media (prefers-color-scheme: dark)`).

### 2. Update Popup HTML Structure
Modify `static/js/app.js` to include a visual cue (icon) in the popup.

- **File**: `static/js/app.js`
- **Function**: `addSearchMarker`
- **Changes**:
    - Add a FontAwesome icon (`<i class="fas fa-map-marker-alt"></i>`) before the title in the `<h4>` tag.

## Detailed Steps

1. **Step 1: CSS Refinement**
   - Update `.search-marker-popup` styles in `static/css/style.css`.
   - Ensure consistency with `.place-popup` found in `search_module.css`.

2. **Step 2: JS Enhancement**
   - Locate `addSearchMarker` in `static/js/app.js`.
   - Update the `.bindPopup()` content to include the icon.

## Verification Plan
1. **Visual Inspection**:
   - Start the local development server.
   - Use the chatbot to search for a location (e.g., "Find places in Myeongdong").
   - Click on the generated purple search markers.
   - Verify that the popup is larger, text is clearer, and the icon is visible.
2. **Responsiveness**:
   - Check the popup on different screen sizes (using browser dev tools) to ensure it remains readable and doesn't overflow.
3. **Contrast Check**:
   - Ensure the text is easily readable against the background in both light and dark modes.
