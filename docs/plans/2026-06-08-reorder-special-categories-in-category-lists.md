# Plan: Reorder Wishlist/Pinned/Visited to Front

## Summary
- Move the three “virtual” categories (Wishlist, Pinned, Visited) to the front of the category lists shown in the location panel UI.
- Keep “All” as the first entry, then show Wishlist → Pinned → Visited, then the remaining categories.
- Apply the same ordering to both desktop sidebar and mobile bottom-sheet tabs to keep the UI consistent.

## Current State Analysis
- Desktop sidebar category list is hard-coded in [index.html](file:///c:/Users/roger/git/mini-task/seoul-tour-map/index.html#L75-L113) under `.category-filters`.
  - Previously: All → (History…Nature) → Wishlist → Pinned → Visited.
- Mobile location panel tab list is hard-coded in [index.html](file:///c:/Users/roger/git/mini-task/seoul-tour-map/index.html#L291-L303) under `#mobile-panel-tabs`.
  - Previously: All → (History…Nature) → Wishlist → Pinned → Visited.
- Filtering logic already supports these special categories (as virtual filters) in [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L854-L976); reordering does not require JS logic changes.

## Proposed Changes
- Update [index.html](file:///c:/Users/roger/git/mini-task/seoul-tour-map/index.html):
  - Desktop: move `cat-wishlist`, `cat-pinned`, `cat-visited` buttons to immediately after `cat-all`.
  - Mobile: move `cat-wishlist`, `cat-pinned`, `cat-visited` tabs to immediately after `cat-all`.
- No CSS/JS changes required because click binding targets elements by class and uses `dataset.category` rather than positional indexing.

## Assumptions & Decisions
- Reorder both desktop and mobile lists (not one-only).
- Preserve “All” as the first category.
- Keep the remaining categories in their existing order.

## Verification Steps
- Desktop:
  - Confirm order is All → Wishlist → Pinned → Visited → remaining categories.
  - Click Wishlist/Pinned/Visited and confirm attraction list + markers filter correctly.
- Mobile:
  - Confirm tab order matches desktop.
  - Tap Wishlist/Pinned/Visited and confirm mobile list filters correctly and active state sync remains correct.

## Implementation Notes (Completed)
- Implemented by reordering HTML blocks in:
  - [index.html:L75-L113](file:///c:/Users/roger/git/mini-task/seoul-tour-map/index.html#L75-L113)
  - [index.html:L291-L303](file:///c:/Users/roger/git/mini-task/seoul-tour-map/index.html#L291-L303)
- Automated verification: `npm test` (Jest) passes.

