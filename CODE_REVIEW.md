# Code Review Documentation

> Historical note: this document captures a dated review snapshot from 2026-06-06 for the range filter and "Pick on map" flow.
> It should be read as review context for that code state, not as a standing guarantee that the current application is fully reviewed end-to-end.

## Review Date
2026-06-06

## Overview
This document summarizes a full code review of the Seoul Tour Map application, focusing on the recently implemented fixes for the Range Filter (範圍篩選) panel and the "Pick on map" (在地圖上選取) feature.

---

## 1. Radius Filter Panel & Styles Implementation
### File: `static/css/style.css`
- **Location: Lines 867–956
- **Status: ✅ Good
- **Review Findings**:
  - Panel styles perfectly mirrors the `.route-panel` implementation, maintaining consistent UI/UX design consistency across all map controls.
  - Added `.btn-secondary` button styling for panel buttons (Clear/Pick on Map) which was completely missing before.
  - Responsive mobile styles added for screen sizes < 768px:
    - Positioned at bottom, full width (like route-panel.
    - Proper font and padding adjustments for small screens.
    - z-index is set to 9999 in media queries, same as route-panel, to ensure it stays on top.
  - Input and selects inside `.radius-field` have proper focus states with purple accent color matching the application's primary color.
  - All flexbox layouts for radius-coord-inputs and radius-dist-inputs have proper spacing and layout.

---

## 2. Map Click Event Handling Logic
### Files: 
1. `static/js/app.js` (original onMapClick function)
2. `static/js/search_module.js` (overridden onMapClick)

- **Review Findings**:
  - `search_module.js` was overrode onMapClick properly saved a reference to the original as window.originalOnMapClick.
  - Added a check at the beginning: `if (typeof radiusState !== 'undefined' && radiusState.pickingMap)` → delegates the event back to window.originalOnMapClick and returns immediately. This prevents SearchPopup.show() from being shown when user is picking a center for range filter.
  - The check is defensive, if radiusState doesn't exist or isn't pickingMap, it shows SearchPopup works as normal.
  - `app.js's `onMapClick` function at line 263‑302 correctly:
    - Checks radiusState.pickingMap is true:
      - Sets the radius-lat and radius-lng inputs
      - Resets the cursor, btn styling, and radiusState.pickingMap
      - Auto applies filter if radius value exists
    - Otherwise shows the default coordinate popup
- **Status**: ✅ Good

---

## 3. Pick on Map Feature End-to-End
### End-to-End Flow
- User journey:
  1. Open range filter panel (点击"範圍篩選" button (desktop or mobile hamburger)
  2. Click "在地圖上選取" (Pick on Map) button
  3. Cursor changes to crosshair (+), btn styles toggle
  4. Click on map location
  5. ✅ Search popup does **not** appear
  6. ✅ Coordinate fields are updated (緯度、經度
  7. ✅ Crosshair removed, btn resets styles, picking state false
  8. ✅ Radius filter automatically applies if value is already set
- **Status**: ✅ Everything works as expected!
- **Related files checked:
  - Index.html: radius panel structure present ✓
  - app.js event listeners: toggleRadiusPanel(), btnRadiusApply, btnRadiusClear and btnRadiusPickMap ✓
  - applyRadiusFilter and clearRadiusFilter ✓
  - toggleRadiusPanel: loads defaults correctly from localStorage ✓

---

## Summary & Recommendations
At the time of this review, no issues were found in the reviewed range-filter and pick-on-map flow. The notes below should remain useful as historical review evidence for that specific implementation state.
