# Plan: Directional User Location Marker

## Goal
Replace the current static blue circle user marker (`fa-user` icon inside `.user-marker` div) with a directional icon (arrow/cone) that rotates to match the device's compass heading — like Google Maps' blue cone/dot that shows which direction you're facing.

## Current State
- **Marker icon**: `L.divIcon` with HTML `<div class="user-marker"><i class="fas fa-user"></i></div>` — a static blue circle with a user silhouette icon.
- **CSS `.user-marker`**: 30×30px blue circle (`#3388ff`), `border-radius: 50%`, white border, centered icon.
- **Two functions create this marker**:
  1. `locateUser()` (line ~4443) — desktop button click
  2. `locateUserAndReport()` (line ~4548) — chatbot-triggered locate
- **No device orientation handling** exists currently.

## Design

### New Marker Visual
Replace the blue circle with a **blue dot + directional cone** (like Google Maps):
- A solid blue dot (center, ~20px) that stays fixed
- A semi-transparent blue cone/triangle emanating from the dot, pointing in the direction of travel/facing
- The cone rotates via CSS `transform: rotate()` based on the device heading

### Device Orientation API
Use the **DeviceOrientation Event API** (`deviceorientation` event):
- `event.alpha` = compass heading (0° = North, 90° = East, etc.) on devices with an absolute compass
- On iOS 13+, must request permission via `DeviceOrientationEvent.requestPermission()`
- Fallback: if no compass data available, show just the dot (no cone) — graceful degradation

### Architecture
1. **Add a `watchId` for continuous position updates** using `navigator.geolocation.watchPosition()` instead of one-shot `getCurrentPosition()` — this gives us `heading` from `position.coords.heading` (when available from GPS).
2. **Listen to `deviceorientation` events** for real-time compass heading — more responsive than GPS heading, works even when stationary.
3. **Store the latest heading** in a global variable `window.userHeading`.
4. **Update marker rotation** on each orientation event by updating the marker's icon CSS transform.

## Implementation Steps

### Step 1: CSS — New directional marker styles
Add new CSS classes:
- `.user-location-dot` — the fixed blue dot (inner circle)
- `.user-location-cone` — the directional cone/arrow shape
- `.user-location-marker` — container that holds both, rotation applied here

The cone shape: use a CSS triangle (border trick) or a rotated semi-circle. Google Maps style uses a wider cone. We'll use a CSS approach:
```css
.user-location-marker {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease-out; /* smooth rotation */
}
.user-location-dot {
  width: 20px;
  height: 20px;
  background: #3388ff;
  border: 3px solid white;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  position: absolute;
  z-index: 2;
}
.user-location-cone {
  position: absolute;
  width: 0;
  height: 0;
  /* CSS triangle pointing UP (north), will be rotated */
  border-left: 14px solid transparent;
  border-right: 14px solid transparent;
  border-bottom: 30px solid rgba(51, 136, 255, 0.35);
  top: -10px; /* position above dot center */
  z-index: 1;
}
```

### Step 2: JS — New icon factory function
Create `createDirectionalUserIcon(headingDeg)`:
```js
function createDirectionalUserIcon(headingDeg = null) {
  const rotation = headingDeg !== null ? `transform: rotate(${headingDeg}deg)` : '';
  const coneHtml = headingDeg !== null
    ? `<div class="user-location-cone" style="${rotation}"></div>`
    : '';
  return L.divIcon({
    html: `<div class="user-location-marker">${coneHtml}<div class="user-location-dot"></div></div>`,
    className: 'user-location-icon-wrapper',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}
```

### Step 3: JS — Device orientation listener
```js
window.userHeading = null;

function initDeviceOrientation() {
  // iOS 13+ permission request
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // We'll request on first user gesture (locateUser click)
    return;
  }
  window.addEventListener('deviceorientation', handleOrientation);
}

function handleOrientation(event) {
  let heading = null;
  if (event.webkitCompassHeading !== undefined) {
    heading = event.webkitCompassHeading; // iOS
  } else if (event.alpha !== null) {
    heading = (360 - event.alpha) % 360; // Android
  }
  if (heading !== null) {
    window.userHeading = heading;
    updateUserMarkerRotation(heading);
  }
}

function updateUserMarkerRotation(headingDeg) {
  if (!window.userMarker) return;
  const coneEl = window.userMarker.getElement()?.querySelector('.user-location-cone');
  if (coneEl) {
    coneEl.style.transform = `rotate(${headingDeg}deg)`;
  }
}
```

### Step 4: JS — Modify `locateUser()` and `locateUserAndReport()`
- Replace `L.divIcon` creation with `createDirectionalUserIcon(window.userHeading)`
- After marker creation, call `initDeviceOrientation()` if not yet initialized
- On iOS, request permission on the button click (user gesture requirement)

### Step 5: JS — Replace one-shot with `watchPosition`
Currently both functions use `getCurrentPosition()`. Switch to `watchPosition()` for continuous tracking (position + heading from GPS as fallback). Store `window.locationWatchId` and clear on re-locate.

### Step 6: JS — GPS heading fallback
`position.coords.heading` gives heading from GPS when moving. Use as fallback when `deviceorientation` is unavailable:
```js
if (position.coords.heading !== null && position.coords.heading !== undefined) {
  window.userHeading = position.coords.heading;
}
```

### Step 7: Graceful degradation
- No compass → show blue dot only (no cone)
- No geolocation → existing error handling unchanged
- Old browsers → falls back to static marker

## Files to Modify
1. **`static/css/style.css`** — Add `.user-location-marker`, `.user-location-dot`, `.user-location-cone` styles; keep old `.user-marker` for backward compat
2. **`static/js/app.js`** — Add orientation functions, modify `locateUser()` and `locateUserAndReport()`, add `createDirectionalUserIcon()`
3. **`index.html`** — No changes needed (icon is created in JS, button already exists)

## Testing
1. Desktop browser: should show blue dot (no cone, no device orientation)
2. Mobile browser (Android): should show blue dot + cone that rotates with device
3. Mobile browser (iOS): should prompt permission on first locate click, then show cone
4. Test that cone rotation is smooth and correct (points north when facing north)
5. Test that existing locate-user button still works
6. Test that `locateUserAndReport()` (chatbot trigger) also gets directional marker

## Risks / Considerations
- iOS requires user gesture for `DeviceOrientationEvent.requestPermission()` — we handle this by requesting on button click
- `deviceorientation` `event.alpha` on Android may not be absolute (relative to device start orientation) — `event.absolute` flag helps but not all devices support it
- The cone rotation uses CSS transition for smoothness, but rapid updates could cause jank — 0.15s ease-out is a good balance
- Must not break the accuracy circle or popup functionality