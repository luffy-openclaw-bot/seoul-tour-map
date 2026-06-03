# Plan: Reduce Map Popup Corner Radius

The user requested to make the "bubble" (map popup) rounded corners smaller for a cleaner look.

## Current State Analysis
- General Leaflet popups use a `16px` border-radius in `style.css`.
- Specific location search popups also use a `16px` border-radius in `search_module.css`.
- This radius is relatively large and might look too "bubbly" for some users.

## Proposed Changes

### 1. Update General Leaflet Popup Radius
Modify `static/css/style.css` to reduce the border-radius of map popups.

- **File**: `static/css/style.css`
- **Class**: `.leaflet-popup-content-wrapper`
- **Change**: Set `border-radius: 10px;` (from `16px`).

### 2. Update Location Search Popup Radius
Modify `static/css/search_module.css` to match the new radius.

- **File**: `static/css/search_module.css`
- **Class**: `.location-search-popup .leaflet-popup-content-wrapper`
- **Change**: Set `border-radius: 10px;` (from `16px`).

## Detailed Steps

1. **Step 1: Update style.css**
   - Locate the `.leaflet-popup-content-wrapper` rule.
   - Change `border-radius: 16px;` to `border-radius: 10px;`.

2. **Step 2: Update search_module.css**
   - Locate the `.location-search-popup .leaflet-popup-content-wrapper` rule.
   - Change `border-radius: 16px;` to `border-radius: 10px;`.

## Verification Plan
1. **Visual Inspection**:
   - Start the local server.
   - Click on any attraction marker to see the general popup.
   - Use the chatbot to generate a search marker and click it to see the search popup.
   - Verify that the corners are noticeably smaller (more squared but still rounded) compared to before.
2. **Consistency Check**:
   - Ensure all map popups use the same `10px` radius.
