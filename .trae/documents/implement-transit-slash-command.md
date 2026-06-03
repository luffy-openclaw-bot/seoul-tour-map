# Plan: Implement /transit Slash Command with Public Data Portal Integration

This plan outlines the steps to implement a `/transit` slash command that fetches real-time bus and subway data from the Korea Public Data Portal (data.go.kr), provides a CORS proxy on the backend, and delivers a rookie-friendly UI for international visitors.

## 1. Current State Analysis
- **Backend (`server.py`)**: A Python HTTP server handling chat, search, and nearby attraction logic. No existing transit API integration.
- **Frontend (`app.js`, `search_module.js`)**: Handles map interaction and chatbot UI. A "bus" search button exists but uses AI knowledge or simple proximity from static files.
- **Data Sources**: Currently relies on `attractions.json` and `subway.json` (static) and AI knowledge.

## 2. Proposed Changes

### A. Backend Integration (`server.py`)
- **New API Endpoint**: Implement `/api/transit` to act as a CORS proxy for `data.go.kr`.
- **API Fetching**:
  - Integrate Seoul Bus Arrival API (`getStationByPos`, `getArriveItByArsId`).
  - Integrate Subway Arrival API (Seoul Open Data Plaza or Public Data Portal).
- **Service Key Management**: Add `DATA_GO_KR_KEY` to `.env` (using a placeholder for now).
- **Data Transformation**: Simplify complex XML/JSON responses from the portal into a "rookie-friendly" format (e.g., "Arriving in X mins" instead of precise timestamps).

### B. Chatbot Logic (`server.py` & `app.js`)
- **Slash Command Recognition**: Update `sendMessage` in `app.js` to detect `/transit` and send it as a specific action to the backend or handle it via a new API call.
- **System Prompt Update**: Modify the AI system prompt in `server.py` to:
  - Recognize transit-related queries.
  - Provide "Transit Basics" (T-money info, transfer rules).
  - Use the new `/api/transit` data when requested.

### C. Frontend UI/UX (`static/js/app.js`, `static/css/style.css`)
- **Transit Info Component**: Create a simplified UI for displaying arrival times.
- **Rookie Guidance**: Add visual cues for transit basics (e.g., small tooltips or a "Transit Guide" section in the chat).
- **Map Integration**: Highlight the bus stops or subway stations on the map when a user queries transit info.

### D. Configuration (`.env`)
- Add `DATA_GO_KR_KEY=YOUR_SERVICE_KEY_HERE`.

## 3. Implementation Steps

### Phase 1: Backend Proxy & API Integration
1.  Add `DATA_GO_KR_KEY` placeholder to `.env`.
2.  In `server.py`, add `handle_transit` method to the `Handler` class.
3.  Implement helper functions to fetch and parse data from `data.go.kr` (Bus and Subway).
4.  Add the `/api/transit` route to `do_POST` or `do_GET`.

### Phase 2: Frontend Command Handling
1.  Modify `static/js/app.js` to detect `/transit` in the chat input.
2.  If detected, trigger a specific UI state or call `/api/transit` directly if coordinates are available.
3.  Implement a `renderTransitInfo` function to display the simplified data in the chat bubble.

### Phase 3: Rookie-Friendly Content
1.  Update the AI system prompt in `server.py` with transit basics.
2.  Add a "Transit Tips" section to the chatbot's initial greeting or as a response to `/transit`.

## 4. Verification Plan
- **CORS Proxy Test**: Use `curl` or a test script to call `/api/transit` and ensure it successfully fetches data from the portal (even with a placeholder key, we can verify the request flow).
- **UI Validation**: Manually test the `/transit` command in the browser to ensure the layout is clear and "rookie-friendly."
- **Data Accuracy**: Verify that the simplified arrival times correctly reflect the raw API data.
