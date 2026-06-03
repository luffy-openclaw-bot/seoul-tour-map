# Plan: Include Bus Information in Transportation Search

This plan outlines the steps to integrate bus information into the real-time search module and add a dedicated "Bus" button to the map search popup.

## Current State Analysis
- The transportation search currently uses local data ([subway.json](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/data/subway.json)) to find nearby subway stations.
- There is no local bus data available.
- The `search_module.py` provides a real-time AI-powered search that can find various types of places by searching the web.
- The search popup currently has 6 buttons in a 2x3 grid.

## Proposed Changes

### 1. Backend Search Logic ([search_module.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/search_module.py))
- **Update Templates**: Add a bus-specific query template to `QUERY_TEMPLATES` to search for bus stops and routes:
    - `"bus": "{location} bus stops routes information public transportation"`
- **Add Keywords**: Add bus-related keywords to `CATEGORY_KEYWORDS` for AI categorization:
    - `"bus": ["巴士", "bus", "station", "stop", "route", "transport"]`
- **Refine Prompt**: Update the AI analysis prompt in `_get_analysis_prompt` to better handle transportation results (bus stop names, route numbers, and directions).

### 2. Server Integration ([server.py](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py))
- **Validate Query Type**: Update `handle_location_search` to include `bus` in the `valid_types` list to allow requests for bus information.

### 3. Frontend UI Updates ([search_module.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/search_module.js))
- **Configuration**: Add a `bus` entry to `SearchTypes`:
    - `bus: { icon: '🚌', label: '巴士', color: '#2ecc71' }`
- **Popup Template**: Modify the HTML template in `SearchPopup.show` to:
    - Include the new "Bus" button in the grid.
    - Rearrange the layout so "Transport" (Subway) and "Bus" are in the third row, and "All" remains at the bottom.

### 4. Styling Adjustments ([search_module.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/search_module.css))
- **Grid Layout**: Ensure the `.search-type-grid` handles the additional button gracefully.
- **Button Styling**: Verify that the full-width "All" button still looks good below the 3x2 grid of specific types.

## Assumptions & Decisions
- **AI-Powered**: Since there is no static bus database, we will rely on the AI's real-time search capabilities to find the most up-to-date bus information for any given location in Seoul.
- **Visual Balance**: The grid will be updated to a 3-row layout (2+2+2) with the "All" button as a 4th row or a spanning button.

## Verification Steps
- **Functional**: Click the "Bus" button on the map and verify it triggers a search that returns nearby bus stops and routes in the chatbot.
- **UI/UX**: Check that the new button is correctly aligned and follows the existing design system.
- **Data Accuracy**: Verify that the AI correctly identifies bus stops near the selected coordinates.
