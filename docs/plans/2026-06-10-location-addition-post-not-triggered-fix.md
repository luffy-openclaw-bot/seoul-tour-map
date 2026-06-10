# 2026-06-10 location addition POST not triggered fix

## Summary
- Fixed a chatbot-driven location addition bug where the assistant could claim a location was added, but no add request was ever dispatched.
- The issue was most visible with Hermes-style replies that returned JSON-like action content in inconsistent formatting.

## Symptom
- User asks the chatbot to add one or more locations to the list.
- The chatbot responds with success wording such as "done" or "added to list".
- No `POST /api/execute` request is sent, so the location is not actually added.

## Root cause
- Frontend action extraction depended too heavily on strict `【...】` action-tag formatting.
- If the reply contained:
  - raw JSON objects without the wrapper,
  - multiple action objects in one loose block,
  - multiline text inside JSON strings,
  the parser could skip the action before `executeMapAction()` ever ran.
- Because the model’s natural-language success text was rendered separately, the UI could still imply completion even when no request was dispatched.

## Fix applied
- Added shared action extraction logic in `static/js/app.js` and reused it from both `fetchAIReply()` and `addMessage()`.
- Hardened parsing to recover executable action objects from loose Hermes-style JSON fragments.
- Escaped raw newlines inside JSON-like strings before parsing.
- Added structured logging for:
  - raw reply receipt
  - parsed action count
  - pre-dispatch validation failures
  - `/api/execute` dispatch
  - `/api/execute` completion
- Suppressed premature add-success text and replaced it with app-confirmed success messaging after the add request completes.
- Added backend debug logging in `server.py` for `/api/execute` validation visibility.
- Bumped `static/js/app.js` cache version in `index.html` to `v=57`.

## Files changed
- `static/js/app.js`
- `server.py`
- `index.html`

## Verification
- Browser verification on `http://127.0.0.1:8092` confirmed:
  - malformed / loose add-to-list bot replies now trigger `POST /api/execute`
  - follow-up `POST /api/sync-locations` occurs
  - added locations appear in the Location Panel
  - app-generated success text appears only after confirmed completion
- Console verification showed the expected lifecycle:
  - raw reply received
  - action(s) extracted
  - dispatch to `/api/execute`
  - `/api/execute` completed
  - list updated and synced
- Diagnostics returned no new errors for:
  - `static/js/app.js`
  - `server.py`
  - `index.html`
