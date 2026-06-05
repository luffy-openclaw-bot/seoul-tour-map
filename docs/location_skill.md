# Location Retrieval Skill

## Overview
The Location Retrieval Skill is a feature integrated into the Seoul Tour Map chatbot that allows users to ask for their current location and receive a localized, AI-generated response describing their whereabouts and suggesting nearby activities.

## Architecture

1. **Intent Detection (Backend)**
   - When a user types a query like "我喺邊" (Where am I?), the `server.py` backend intercepts it using keyword matching.
   - The backend immediately responds with a system message containing the map action command: `【{"action":"locate_user_and_report"}】`.

2. **Frontend Execution (Frontend)**
   - The `app.js` script parses the map action and calls `locateUserAndReport()`.
   - The browser's `navigator.geolocation.getCurrentPosition()` API is invoked to get high-accuracy GPS coordinates.
   - The frontend places a marker on the map and automatically sends a hidden POST request back to the server with `"[SYSTEM_LOCATION_REPORT]"`, the coordinates (`lat`, `lng`), and the user's `fingerprint`.

3. **Reverse Geocoding & AI Response (Backend)**
   - The backend validates the `fingerprint` to ensure authorization.
   - It uses `search_module.py`'s `_reverse_geocode()` function (powered by Nominatim) to convert the coordinates into a human-readable address.
   - A specialized prompt is sent to the Ollama AI model, asking it to respond in Cantonese and suggest nearby activities.
   - The final AI response is returned and displayed in the chat UI.

## Privacy Compliance
- **In-Memory Processing**: User location data (GPS coordinates) is only stored in memory during the duration of the HTTP request. It is **not** written to disk, databases, or logs.
- **Explicit Permission**: The geolocation API requires explicit browser-level consent from the user before accessing the coordinates.
- **Authorized Access**: Location endpoints validate the device `fingerprint` to prevent unauthorized location spoofing or access.

## Testing
- **Unit Tests**: `test_location_skill.py` (Python backend) and `__tests__/location_skill.test.js` (JavaScript frontend).
- Run Python tests: `python -m unittest test_location_skill.py`
- Run JS tests: `npm test` or `npx jest`