# 2026-06-10 Hermes multi-add-to-list fix

## Summary
- Bug fix for chatbot replies that mention multiple locations in one message.
- User-facing symptom: the chatbot claimed all mentioned places were added to the Location Panel, but only one item or an incomplete subset appeared.
- Context: this is especially visible in Hermes-backed replies because they often return richer multi-location answers in a single response.

## Symptom
- Example case: Blue Bottle Coffee branches in Seoul were listed in the chatbot response.
- Expected: every mentioned branch with an `add_to_list` action should be added to the left Location Panel.
- Actual: only part of the set appeared, causing a mismatch between the chatbot claim and the panel state.

## Root cause
- In `static/js/app.js`, `fetchAIReply()` parsed action tags with a global regex loop while also mutating the same reply string inside the loop.
- That pattern caused later `【...】` action blocks to be skipped in some multi-action replies.
- As a result, not every `add_to_list` action reached `executeMapAction()`.

## Fix applied
- Refactored action extraction in `fetchAIReply()` to do a single-pass replace over the original reply text.
- Collected all parsed actions first without mutating the source string during regex iteration.
- Executed actions sequentially with `await executeMapAction(...)` so multiple `add_to_list` operations complete in order.
- Bumped `index.html` cache version for `static/js/app.js` from `v=52` to `v=53`.

## Files changed
- `static/js/app.js`
- `index.html`

## Verification
- Code inspection confirms the parser now preserves all valid action tags from one reply.
- Diagnostics check returned no new errors for:
  - `static/js/app.js`
  - `index.html`

## Follow-up rule
- Hermes-related bug fixes should always leave an MD note in the repo, preferably under `docs/plans/` or `docs/troubleshooting_log.md`.
