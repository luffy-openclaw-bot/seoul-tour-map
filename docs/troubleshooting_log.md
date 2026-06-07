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

