# Seoul Tour Map Development Guidelines

## Lessons Learned & Best Practices
**Date of Guidelines**: 2026-06-06  
**Last Issue Fixed**: Missing global scope exposure for radiusState caused pick-on-map to fail even though logic was "reviewed".

---

## Rule 1: **NEVER declare a fix "complete" without testing E2E first**
- **What happened**: I declared "Review complete - everything works!" but didn't actually test if the pick-on-map feature actually set coordinates. Always, actually test the user's exact complaint flow!
- **Action Item**: Test end-to-end before declaring a fix done.

---

## Rule 2: Always check variable scope (window vs module scope)
- **What happened**: `radiusState` was declared with `let` in `app.js` but wasn't exposed on `window`, so `search_module.js` couldn't read `radiusState.pickingMap`!
- **Best Practice**: If a variable needs to be accessed across modules (like `search_module.js` accessing `app.js` variables), it must be explicitly assigned to `window`!
- **Example**:
  ```javascript
  let radiusState = { /* ... */ };
  window.radiusState = radiusState; // Always do this for cross-module access
  ```
- **Also**: When checking variables in other modules, explicitly access them via the window object!
  ```javascript
  // ✅ Good: Explicit window access
  if (typeof window.radiusState !== 'undefined' && window.radiusState.pickingMap) { }

  // ❌ Bad: May reference undefined if variable not exposed
  if (typeof radiusState !== 'undefined' && radiusState.pickingMap) { }
  ```

---

## Rule 3: Always bump cache versions when you update JS/CSS files
- **Action Item**: Whenever modifying static assets (`static/js/*.js` or `static/css/*.css`), increment their `?v=` number in `index.html` to force browser cache reload!
  ```html
  <!-- Before -->
  <script src="static/js/app.js?v=45"></script>
  <!-- After (increment by one) -->
  <script src="static/js/app.js?v=46"></script>
  ```

---

## Rule 4: Do a **code flow walkthrough** before declaring "fixed"
- **Example for pick-on-map flow**:
  1. User clicks `toggleRadiusFilter` → opens panel ✅
  2. User clicks `btn-radius-pick-map` → sets `radiusState.pickingMap = true`, cursor crosshair ✅
  3. User clicks map → event caught by `search_module.js` `onMapClick`
  4. `search_module.js` checks `window.radiusState.pickingMap` → calls `window.originalOnMapClick(e)`
  5. `window.originalOnMapClick` updates DOM elements `radius-lat` and `radius-lng`, reset `pickingMap`
  - Walk through **all these steps** mentally before declaring "done".

---

## Rule 5: Always check both files when dealing with overridden functions
- If one module overrides a function from another (like `search_module.js` overrides `onMapClick` from `app.js`):
  - Check original function scope!
  - Check if variables accessed by both functions are exposed globally!
  - Check if the override correctly delegates when needed!
