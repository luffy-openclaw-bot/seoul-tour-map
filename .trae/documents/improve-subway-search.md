# Plan: Improve Subway Search Coverage and Reliability

This plan addresses the issue where the transportation search fails to find subway stations due to a restrictive search radius and incomplete station data.

## Current State Analysis
- The `searchNearbyTransport` function in [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js) has a hardcoded search radius of **1000m** (1km).
- The nearest station to the user's coordinates (`37.5702, 127.0274`) is **Dongmyo Station**, which is calculated to be **1012m** away, thus missing the 1km threshold by only 12 meters.
- The [subway.json](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/data/subway.json) file lacks several major stations in the eastern part of the city, such as **Sinseol-dong** and **Jegi-dong**.

## Proposed Changes

### 1. Data Updates ([subway.json](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/data/subway.json))
- Add **Sinseol-dong** and **Jegi-dong** stations to Line 1 and Line 2 (Sinseol-dong is a transfer station).
- Coordinates to add:
    - Sinseol-dong: `37.5753, 127.0248`
    - Jegi-dong: `37.5781, 127.0348`

### 2. Logic Updates ([app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js))
- Increase the subway search radius from **1000m** to **2000m** (2km) to provide a more comprehensive list of nearby options.
- Update the "No results" message to be more helpful, suggesting the user try the **Bus** search for real-time local transportation info if no subway stations are nearby.

### 3. Frontend Integration ([search_module.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/search_module.js))
- Ensure the `transport` search (labeled "地鐵") in the search popup remains responsive and provides clear feedback even when local data is sparse.

## Assumptions & Decisions
- **Radius**: A 2km radius is reasonable for a "nearby" search in a dense city like Seoul, as it covers a 20-25 minute walk or a short bus ride.
- **Data Completeness**: While we cannot add every station in Seoul manually, adding the ones immediately adjacent to the current coverage area will significantly improve the user experience for the reported coordinates.

## Verification Steps
- **Functional**: Trigger a transportation search for the coordinates `37.5702, 127.0274` and verify that **Sinseol-dong** and **Dongmyo** are now found.
- **UX**: Verify that the new fallback message appears correctly when a search is performed in an area with absolutely no subway coverage.
