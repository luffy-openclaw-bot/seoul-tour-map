# Prevent Marker Clicks When Picking Range Center Plan

## Overview
Prevent marker clicks (and popup opening) when in "select center on map" mode for range filter.

## Requirements
When `radiusState.pickingMap` is true, clicking on a marker should NOT open its popup; instead, it should select that position as the range center.

## Analysis
1. Leaflet markers bind popups that open on click, which will still happen even if map click is handled separately, unless we block that behavior.
2. Current radius filter uses `radiusState.pickingMap` to indicate when user is picking a center.
3. Markers are added in `addMarkers()` in `app.js`.

## Implementation Steps
1. **Update addMarkers() in static/js/app.js:
   - For each marker, add a click event listener that checks if radiusState.pickingMap is true
   - If true, call the radius click handling (use marker's latlng to set center, stop further propagation (prevent popup)
2. **Check and also handle search markers (searchMarkersLayerGroup) as well?

## Files to Modify
- static/js/app.js (addMarkers() function)
