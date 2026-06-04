# Plan: Integrate Public Tourism and City Data APIs

This plan outlines the integration of official public APIs (VisitKorea, Seoul Open Data, and Data.go.kr) into the Seoul Tour Map. Since these services do not require a Korean citizen ID for registration, they are ideal for international developers. We will adopt an **API-First Enrichment** approach, where raw data is fetched from these APIs and then summarized/enriched by AI.

## 1. Summary
Enhance the search functionality by fetching real-time, authoritative data from official Korean public services. This will replace or supplement the current AI-only knowledge base with accurate information on attractions, events, and city status.

## 2. Current State Analysis
- **`search_module.py`**: Currently relies on Nominatim for geocoding and Ollama AI's internal knowledge for place recommendations. It skips real-time web searching.
- **`server.py`**: Already handles ODsay for transit but lacks integration for general tourism and city status APIs.
- **`.env`**: Contains placeholders for `DATA_GO_KR_KEY` and `ODSAY_API_KEY`, but missing keys for VisitKorea and Seoul Open Data.

## 3. Proposed Changes

### Configuration Updates
- **`.env`**: Add `VISIT_KOREA_API_KEY` and `SEOUL_DATA_API_KEY`.
- **`server.py`**: Add constants to load these keys from environment variables.

### API Client Development (`search_module.py`)
- Implement a new class or methods within `LocationSearcher` to handle requests to:
    - **VisitKorea (TourAPI 4.0)**: Fetch nearby tourism information (attractions, festivals, food) based on coordinates.
    - **Seoul Open Data Plaza**: Fetch real-time city status (e.g., cultural events, zone congestion) for major districts.
    - **Data.go.kr**: Fetch general facility or landmark data.
- Ensure all requests use a robust error-handling mechanism and a custom `urllib` opener that handles SSL certificate issues common with government endpoints.

### Search Logic Enhancement (`search_module.py`)
- Modify `LocationSearcher.search` to:
    1. Perform reverse geocoding to get the location name.
    2. Concurrent with geocoding (or sequentially), call the relevant public APIs based on the `query_type`.
    3. Aggregate the raw JSON/XML responses.
    4. Pass the aggregated data into the AI `system_prompt` as context.
    5. Update the AI prompt to prioritize the provided API data over its internal knowledge.

### UI Improvements (`static/js/search_module.js`)
- Update the search results display to indicate when data is sourced from official public APIs.
- Add a "Source: VisitKorea" or "Source: Seoul Open Data" badge to the results summary.

## 4. Specific File Changes

### [search_module.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/search_module.py)
- Add API endpoint constants for TourAPI 4.0 and Seoul Data Plaza.
- Implement `_fetch_visit_korea_data(lat, lng, type)` and `_fetch_seoul_city_data(lat, lng)`.
- Update `search()` method to integrate these calls.
- Update `_get_analysis_prompt()` to include placeholders for the fetched API data.

### [server.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py)
- Load new environment variables.
- Ensure the `/api/search` endpoint correctly invokes the updated `search_location` function.

### [.env](file:///c:/Users/roger/git/mini-task/seoul-tour-map/.env)
- Add placeholders for the new API keys.

## 5. Verification Steps
- **Unit Testing**: Create a small script to verify each API client method independently with mock/real keys.
- **Integration Testing**: Perform a search in the UI and verify that the results contain information that matches the API data (e.g., specific operating hours or event titles).
- **Log Review**: Check server logs to ensure API calls are successful and data is being passed correctly to the AI.
