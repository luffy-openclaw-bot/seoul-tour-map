# Plan: Remove Detail View Image Section

## Summary
- Remove the hero image from the attraction detail modal because the current image/fallback logic can display unrelated photos and degrades UX.

## Current State Analysis
- The attraction detail modal is defined in [index.html](file:///c:/Users/roger/git/mini-task/seoul-tour-map/index.html#L317-L325) and renders dynamic content into `#modal-body`.
- The modal content is assembled in [showAttractionDetail](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js#L1292-L1387).
- The hero image was previously rendered as `<img class="modal-hero" ...>` using `attr.image` or a category fallback via `getFallbackImage`.
- The close button is absolutely positioned and can overlap content if the hero image is removed without adjusting spacing.

## Proposed Changes
- Update [app.js](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/js/app.js):
  - Remove the hero image element from the `showAttractionDetail(attr)` template.
  - Add `no-hero` marker class to `#modal-body` so CSS can apply the adjusted layout.
- Update [style.css](file:///c:/Users/roger/git/mini-task/seoul-tour-map/static/css/style.css):
  - Add a `#modal-body.no-hero .modal-info { padding-top: 56px; }` rule to ensure the close button doesn’t overlap the title.
  - Remove the unused `.modal-hero` rule if no longer referenced.

## Assumptions & Decisions
- “Detail view” refers to the attraction detail modal rendered by `showAttractionDetail`.
- The desired UX is “no image” in the detail modal (not replacing the image source).

## Verification Steps
- Open the app and open multiple attraction details:
  - Confirm no hero image is shown.
  - Confirm the close button remains clickable and does not overlap the title/content.
  - Confirm all sections and action buttons render as before.
- Check mobile and desktop widths for acceptable spacing.

