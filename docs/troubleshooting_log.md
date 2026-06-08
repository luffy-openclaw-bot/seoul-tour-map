# Troubleshooting Log - Hermes Agent Timeout (2026-06-08)

## Symptom
All queries that should delegate to Hermes Agent (e.g. "search the current weather") result in the server waiting 120s then falling back to the offline knowledge base. The user sees "⚠️ 已切換至離線模式".

## Root Cause
The Hermes worker process was **never running**. The server correctly:
1. Detects delegation keywords (`Decision: True`)
2. Creates `request_*.json` in `.hermes_tasks/`
3. Polls for `response_*.json` every 0.5s
4. Times out after `HERMES_TIMEOUT` (120s)

But the worker was not started, so `response_*.json` was never written.

## Investigation Steps Taken
1. [x] Reproduced the issue with full logging
2. [x] Confirmed `should_delegate_to_hermes()` correctly detects "weather" → `Decision: True`
3. [x] Confirmed server creates `request_*.json` in `.hermes_tasks/`
4. [x] Confirmed no `response_*.json` appears (worker never processed the file)
5. [x] Confirmed worker process was not started

## Fixes Applied
1. [x] **HERMES_TIMEOUT**: reduced from `120s` → `15s` in `server.py:64`
2. [x] **Worker structured logging**: added detailed stage logs at every processing step:
   - Task found / processing started
   - `should_search_web` result
   - Web search query used (weather vs generic)
   - Number of search results returned
   - Ollama API call (model, timeout, has_context)
   - Response file written
   - Any errors + full traceback
3. [x] **Worker error handler fix**: `request_data` and `task_id` now initialized to `None` before the try block so error responses can be written even when the JSON parse fails
4. [x] **Worker startup logging**: now logs Ollama base, model, API key presence, task directory, and poll interval

## How to Restart Correctly
```bash
# Terminal 1: Start Hermes worker
python hermes_worker.py

# Terminal 2: Start server
python server.py
```

## Expected Worker Logs on Startup
```
[2026-06-08 ...] Hermes worker for Seoul Tour Map started (with Web Search)
[2026-06-08 ...] Config — Task dir: C:\...\seoul-tour-map\.hermes_tasks
[2026-06-08 ...] Config — Ollama base: https://ollama.com/v1
[2026-06-08 ...] Config — Model: minimax-m2.7:cloud
[2026-06-08 ...] Config — API key set: True
[2026-06-08 ...] Config — Poll interval: 1s
[2026-06-08 ...] Task dir exists: True
```

## Expected Worker Logs on Delegated Request
```
[2026-06-08 ...] Found 1 pending task(s): ['request_xxx.json']
[2026-06-08 ...] Task xxx: Processing started — 'search the current weather.'
[2026-06-08 ...] Task xxx: should_search_web=True
[2026-06-08 ...] Task xxx: Using weather search
[2026-06-08 ...] Task xxx: Calling Ollama API (model=minimax-m2.7:cloud, timeout=15s, has_context=True)...
[2026-06-08 ...] Task xxx: Ollama reply received (len=xxx)
[2026-06-08 ...] Task xxx: Response file written → response_xxx.json
[2026-06-08 ...] Task xxx: Completed successfully
```

## Configuration Reference
| Setting | File | Value |
|---------|------|-------|
| `HERMES_ENABLED` | .env | `true` |
| `HERMES_TIMEOUT` | server.py:64 | `15` |
| Worker Ollama timeout | hermes_worker.py:165 | `15` |
| Worker web search timeout | hermes_worker.py:58 | `30` |
| Frontend abort timeout | static/js/app.js:2588 | `90000` |

---

# Troubleshooting Log - Chatbot Button Persistence Bug

## Initial Assessment
- **Bug Description**: The "Go there again" button (`go-there-again-btn`) disappears after the page is reloaded, even though chat history is preserved.
- **Expected Behavior**: Buttons should be reconstructed when chat history is loaded from `localStorage`.
- **Current State**: Chat history (role and content) is saved and loaded. `addMessage` handles bot actions, but buttons seem missing after restore.

## Investigation Steps
1. [ ] Review `addMessage` in `static/js/app.js` to ensure `lastBotMessageElement` is updated correctly during `isRestore`.
2. [ ] Verify `recreateMapActionButton` logic and ensure it handles all action types correctly.
3. [ ] Check the sequence of initialization in `DOMContentLoaded` to ensure `loadChatHistory` runs at the right time.
4. [ ] Investigate if `marked.parse` or other text processing is interfering with tag extraction during restoration.
5. [ ] Verify if `attractionsData` is fully available when buttons are being reconstructed.

## Findings
1.  **Missing `fly_to` tracking**: `fly_to` actions were handled for inline links but not added to `autoActions`, so they were skipped during restoration.
2.  **Race Condition in Button Attachment**: `addLocationButtonToLastBotMessage` used a global `lastBotMessageElement`, which could point to a newer message if an `async` map action for an older message completed later.
3.  **Missing Robustness**: `recreateMapActionButton` did not `parseFloat` coordinates, which could lead to errors if parameters were strings.

## Hypothesis
- By explicitly passing the message element (`div`) from `addMessage` to both `recreateMapActionButton` (for restore) and `executeMapAction` (for new messages), we eliminate the race condition and ensure buttons are attached to the correct bubbles.
- Adding `fly_to` to `autoActions` ensures these buttons are also reconstructed during reload.

## Resolution
- [x] Refactored `addLocationButtonToLastBotMessage` to accept an explicit `targetElement`.
- [x] Updated `addMessage` to track `fly_to` in `autoActions`.
- [x] Updated `recreateMapActionButton` and `executeMapAction` to pass and use the specific message element.
- [x] Added `parseFloat` to coordinate parsing in `recreateMapActionButton`.

