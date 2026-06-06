
# Range Filter Enhancements Plan

## Overview
This plan outlines the changes to enhance the Range Filter feature.

## Requirements
1. **Dialog state management for range indicator**
   - Hide the orange circle when closing the range filter panel
   - Show the orange circle when opening the range filter panel (if valid filter exists)

2. **Map interaction improvement**
   - When "在地圖上選取" (Select on map) is active, clicking on the map should only select the center point and not trigger any underlying marker click events

3. **Layout coordination**
   - Automatically collapse the chatbot widget when the range filter panel is opened

4. **UI enhancement**
   - Add an info icon next to "範圍篩選" title that opens a popover with detailed usage instructions

## Implementation Steps
1. **Update `toggleRadiusPanel` function in `static/js/app.js`**:
   - Add logic to collapse chatbot when panel is opened
   - Show circle overlay when panel is opened (if radius state is active)
   - Hide circle overlay when panel is closed

2. **Update map click handling**
   - Ensure that when `radiusState.pickingMap` is true, no other click events are triggered

3. **Update HTML in `index.html`**
   - Add an info icon next to the "範圍篩選" title
   - Add a popover element for the info content

4. **Update CSS in `static/css/style.css`**
   - Style the info icon and popover

5. **Add JavaScript for popover handling**
   - Toggle popover visibility when info icon is clicked

## Files to Modify
- `static/js/app.js`
- `index.html`
- `static/css/style.css`

