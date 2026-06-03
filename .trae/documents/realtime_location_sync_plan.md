# Real-time Location Sync Plan

## Summary
To make shared places appear on every online user's device in real-time, we will implement Server-Sent Events (SSE). This allows the Python backend to continuously push updates to all connected frontend clients whenever the shared location list changes, eliminating the need for manual page refreshes.

## Current State Analysis
- Currently, when a user adds a location, it is saved to `shared_locations.json` on the server via a POST request to `/api/sync-locations`.
- Other users only see these new locations if they refresh the page, because `app.js` only calls `WishlistManager.syncFromServer()` once during `DOMContentLoaded`.
- The backend is built with Python's lightweight `http.server.ThreadingHTTPServer`, which can support SSE by keeping the connection thread open.

## Proposed Changes

### 1. Backend: Add SSE Endpoint in `server.py`
- **What**: Create a new `handle_stream_locations` method.
- **Why**: To keep a connection open and push data to the client whenever `shared_locations.json` is modified.
- **How**:
  - Add `/api/stream-locations` to the `do_GET` routing.
  - Send SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).
  - Implement a `while True` loop that checks `os.path.getmtime(SHARED_LOCATIONS_FILE)`.
  - If the modification time changes, read the file and send the payload as `data: {...}\n\n`, followed by `self.wfile.flush()`.
  - Use `time.sleep(2)` to prevent high CPU usage.
  - Catch `BrokenPipeError`, `ConnectionResetError`, and `OSError` to gracefully exit the loop when the client disconnects.

### 2. Frontend: Connect to SSE in `static/js/app.js`
- **What**: Update `WishlistManager` to use `EventSource`.
- **Why**: To listen to the server's real-time updates and update the UI immediately.
- **How**:
  - Extract the merging logic from `syncFromServer()` into a new helper method `_mergeRemoteLocations(remoteLocations)`.
  - Add a `startSyncStream()` method in `WishlistManager` that initializes `new EventSource('/api/stream-locations')`.
  - In the `EventSource.onmessage` handler, parse the incoming JSON and pass the locations to `_mergeRemoteLocations()`.
  - In `DOMContentLoaded`, replace the `WishlistManager.syncFromServer()` call with `WishlistManager.startSyncStream()`.

## Assumptions & Decisions
- **Decision**: We chose SSE over WebSocket because it's natively supported by the browser via `EventSource` and is much simpler to implement with Python's built-in `http.server` without adding third-party dependencies (like `websockets`).
- **Assumption**: The merging strategy remains "append-only" (as currently implemented on both client and server). Deletions are not actively synchronized to remove items from other users' screens, preserving the existing logic scope.

## Verification Steps
1. Open the application in two different browser windows/tabs (simulating two users).
2. In Window A, add a new place to the location list.
3. Observe Window B: The new place should automatically appear in the location list and on the map within ~2 seconds without refreshing the page.