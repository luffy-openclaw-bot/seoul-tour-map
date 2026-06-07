# Plan Record: Shared locations sometimes show no delete button

## Summary
Some entries present in `shared_locations.json` were not deletable from the UI because the trash/delete control is only shown when the row can be matched to a local wishlist record. The original match logic was ID-based (`name + lat.toFixed(4) + lng.toFixed(4)`), so small coordinate mismatches (preset vs shared/custom precision) prevented the UI from finding the record, hiding the delete button.

The chosen fix keeps the existing **soft delete** behavior (`deleted: true`) and keeps permissions as **any user can delete any shared entry**, but makes matching more robust.

## Current State Analysis
- Deletion is implemented as a soft delete on the client (`WishlistManager.remove(id)` sets `deleted: true`).
  - [app.js:remove](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L4502-L4513)
- The server persists whatever the client sends and merges by `id` with `updatedAt` conflict resolution; it does not hard-delete.
  - [server.py:handle_sync_locations](file:///c:/Users/roger/git/mini-task/seoul-tour-map/server.py#L1159-L1261)
- The delete (trash) button in the attraction list is only rendered when `WishlistManager.get(attr.name, attr.lat, attr.lng)` returns a record.
  - [app.js:trash button rendering](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L1036-L1096)

## Proposed Changes
### 1) Fuzzy match fallback in `WishlistManager.get`
**File**: [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js)

- Keep exact ID lookup first.
- If not found, do a fallback match:
  - Same trimmed name
  - lat and lng both within tolerance (~10m, `0.0001`)
  - If multiple matches, choose nearest

### 2) Make dedupe logic use both lat and lng
**File**: [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js)

- When merging preset + custom items in `getFilteredAttractions`, use both latitude and longitude within the same tolerance.

### 3) Regression tests
**Files**
- Add `__tests__/wishlist_fuzzy_match.test.js`
- Update existing tests to reflect soft-delete behavior and new marker event binding requirements in mocks.

## Assumptions & Decisions
- Delete semantics remain **soft delete** (`deleted: true`).
- Any user can delete any shared entry (no owner enforcement).
- “Same place” tolerance: **~10m** (`0.0001` degrees) and requires both lat and lng to be within tolerance.

## Implementation Notes (What was changed)
- Added fuzzy match fallback in `WishlistManager.get`.
  - [app.js:WishlistManager.get](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L4516-L4547)
- Hardened `_generateId` numeric casting.
  - [app.js:_generateId](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L4442-L4448)
- Updated dedupe logic in `getFilteredAttractions` to check both lat and lng.
  - [app.js:getFilteredAttractions](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L854-L891)
- Added tests for fuzzy matching.
  - [wishlist_fuzzy_match.test.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/__tests__/wishlist_fuzzy_match.test.js)

## Verification
- `npm test` (Jest) passes.
