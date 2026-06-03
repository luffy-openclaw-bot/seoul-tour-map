# Plan: Implement Transit Slash Command with ODsay API

This plan outlines the steps to pivot the transit information system from the Public Data Portal (`data.go.kr`) to **ODsay LAB**, which is more accessible to international developers. The goal is to provide a "rookie-friendly" transit information experience for visitors to Seoul.

## Current State Analysis
- **Backend**: `server.py` has a `/api/transit` endpoint that currently uses `data.go.kr` XML APIs (Bus only, Subway is a placeholder).
- **Frontend**: `app.js` has basic `/transit` command handling and a demo rendering function.
- **Problem**: The user cannot register for `data.go.kr` as a foreigner.

## Proposed Changes

### 1. Environment Configuration
- Update `.env` to include `ODSAY_API_KEY`.
- Update `server.py` to read this key.

### 2. Backend Enhancements (`server.py`)
- **Replace `_fetch_bus_data`**: Use ODsay's `pointBusStation` and `realtimeStation` JSON APIs.
- **Implement `_fetch_subway_data`**: Use ODsay's `subwayStationInfo` and `subwayPath` APIs.
- **Data Normalization**: Transform ODsay's JSON response into a simplified, rookie-friendly format:
    - `line`: Bus number or Subway line name.
    - `time`: Human-readable arrival time (e.g., "3 mins").
    - `status`: Simplified status (e.g., "Arriving soon", "Normal").
- **CORS Proxy**: The existing `handle_transit` already acts as a proxy, so just updating the fetch logic is enough.

### 3. Frontend Enhancements (`static/js/app.js`)
- **Update `renderTransitResults`**:
    - Improve the UI for bus and subway results.
    - Add "Rookie Tips" section (T-money usage, transfer rules, etc.).
    - Display station names in both Korean and English (ODsay provides both in some endpoints).
- **Update `handleTransitCommand`**: Ensure it handles the updated data structure from the backend.

### 4. System Prompt Update
- Update the AI's system prompt in `server.py` to include more "Transit Basics" and how to guide users to use the `/transit` command.

## Assumptions & Decisions
- **Data Source**: Using ODsay LAB's "Basic" free tier (1,000 calls/day).
- **Language**: Basic tier might return mostly Korean. I will use the AI or simple string manipulation to provide English context where possible.
- **Coverage**: Focus on Seoul/Metropolitan area as it's the most reliable in ODsay for real-time data.

## Verification Steps
1. **API Connectivity**: Test the ODsay API calls from the backend with a dummy/real key.
2. **CORS Test**: Verify that the frontend can successfully call `/api/transit` and get data without CORS errors.
3. **UI/UX Check**: Verify that the transit results are clear, simplified, and helpful for "rookie" users.
4. **Integration Test**: Run the `/transit` command from the chatbot and check the output.
