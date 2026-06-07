# Plan: Show Remark In Marker Bubble

## Summary
Show the user-entered remark (備註 / `myRemark`) inside the Leaflet marker popup bubble, so users can immediately see their saved note when clicking markers.

## Current State Analysis
- The "儲存位置" modal captures remark text and saves it as `myRemark` via `saveLocationData(...)`.
- Marker popups are generated in:
  - `createPopupContent(attr)` for normal/preset attraction markers
  - `renderPinnedMarkers()` for pinned custom markers
- Before this change, popup HTML did not render `myRemark`, so remarks were not visible from the map popup.

## Proposed Changes
- `static/js/app.js`
  - Update `createPopupContent(attr)`
    - Read `customData` from `WishlistManager.get(attr.name, attr.lat, attr.lng)`
    - If `customData.myRemark` is non-empty, render a remark line under the description
    - Make description rendering safer by guarding `attr.description` before using `.substring(...)`
  - Update `renderPinnedMarkers()`
    - When generating pinned marker popup HTML, render `item.myRemark` under the coordinates line when present

## Assumptions & Decisions
- Keep the existing popup layout and classes, and render remark as an additional `.popup-desc` line.
- Use a visually distinct style (`color: #d35400; font-weight: 500;`) so remarks stand out from the default description/coordinates.
- Do not remove the default description/coordinates; remark is additive.

## Verification Steps
1. Save a location with a non-empty remark in the "儲存位置" modal.
2. Click the marker on the map and confirm the popup displays “備註：<remark>”.
3. Pin the same location and confirm the pinned marker popup also displays the remark.
4. Check a preset attraction without remark and confirm the popup still renders normally.

