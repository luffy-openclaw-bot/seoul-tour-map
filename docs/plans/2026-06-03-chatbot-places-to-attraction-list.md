# Chatbot Places → 景點列表 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** When the AI chatbot mentions specific places (cafes, hotels, attractions, etc.) in its response, automatically add them to the "📍 景點列表" sidebar list as persistent entries — not just map pins.

**Architecture:** Add a new `add_to_list` map action type. The AI emits `【{"action":"add_to_list","params":{...}}】` tags alongside existing `add_marker` tags. The frontend's `executeMapAction()` handler calls `addSearchResultsToList()` plus persists items in localStorage. On page reload, persisted items are restored into the list.

**Tech Stack:** Python (server.py), Vanilla JS (app.js), localStorage for persistence

---

### Task 1: Add `add_to_list` to server.py action whitelist

**Objective:** Allow the new `add_to_list` action through the server-side validation so the `/api/execute` endpoint accepts it.

**Files:**
- Modify: `server.py:251-260` (ALLOWED_ACTIONS dict)

**Step 1: Add the new action entry**

In the `ALLOWED_ACTIONS` dict (line 251), add after `clear_search_markers`:

```python
'add_to_list': {'name': str, 'lat': float, 'lng': float, 'category': str, 'description': str, 'color': str},
```

The full dict becomes:
```python
ALLOWED_ACTIONS = {
    'center': {'lat': float, 'lng': float, 'zoom': int},
    'focus_attraction': {'id': str},
    'highlight_category': {'category': str},
    'locate_user': {},
    'show_route': {'from': str, 'to': str},
    'add_marker': {'lat': float, 'lng': float, 'title': str, 'color': str, 'popup': str, 'pulse': bool},
    'add_polygon': {'name': str, 'color': str, 'coords': list},
    'clear_search_markers': {},
    'add_to_list': {'name': str, 'lat': float, 'lng': float, 'category': str, 'description': str, 'color': str},
}
```

**Step 2: Verify**

Run: `python3 -c "import ast; ast.parse(open('server.py').read()); print('OK')"`  
Expected: `OK`

---

### Task 2: Add `add_to_list` to server.py system prompt

**Objective:** Teach the AI model to emit `add_to_list` actions when it mentions specific places.

**Files:**
- Modify: `server.py:114-153` (system prompt in `handle_chat`)

**Step 1: Add action #9 to the system prompt**

After action 8 (`locate_user`) around line 148, add:

```
9. add_to_list：將提及嘅地點永久加入景點列表
   用途：每次提及具體地點（咖啡店、酒店、景點、餐廳等）時，除咗加地圖標記，仲要將佢加入左側景點列表，方便用戶之後搵返
   示例：「機場有 Starbucks」→ 除咗 add_marker，仲要加【{"action":"add_to_list","params":{"name":"Starbucks（仁川機場）","lat":37.4602,"lng":126.4407,"category":"購物美食","description":"機場內連鎖咖啡店"}}】
   參數：name（地點名稱）, lat, lng（坐標）, category（分類，用現有分類名：地標觀景/購物美食/自然公園/文化藝術/夜生活/住宿/交通）, description（簡短描述，可選）, color（顏色，可選）
```

And update the 注意 section (around line 150-153) to add:

```
- 提及具體地點時（咖啡店、酒店、餐廳、景點等），必須用 add_to_list 將佢加入景點列表，同時用 add_marker 喺地圖標示位置。兩個動作組合使用。
```

**Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('server.py').read()); print('OK')"`  
Expected: `OK`

---

### Task 3: Add `add_to_list` to frontend system context (`getSystemContext`)

**Objective:** The client-side system prompt (sent via `getSystemContext()`) also needs to instruct the AI about the new action.

**Files:**
- Modify: `static/js/app.js:1015-1040` (getSystemContext function)

**Step 1: Add action #8 to the JS system prompt**

After line 1028 (`7. clear_search_markers...`), add:

```javascript
8. add_to_list (將提及嘅地點加入景點列表)：【{"action":"add_to_list","params":{"name":"地點名稱","lat":37.46,"lng":126.44,"category":"購物美食","description":"簡短描述"}}】
```

And update the 重要使用指引 section (around line 1036-1040) to add a new rule:

```javascript
- 提及具體地點（咖啡店、酒店、餐廳、景點等）時，必須同時使用 add_to_list 將地點加入左側景點列表，以及 add_marker 喺地圖標示位置
```

**Step 2: Verify** — Open browser, check no JS errors in console.

---

### Task 4: Add `add_to_list` handler in `executeMapAction()` (frontend)

**Objective:** When the frontend receives an `add_to_list` action, add the place to the sidebar attraction list and persist it to localStorage.

**Files:**
- Modify: `static/js/app.js:1580-1596` (executeMapAction switch, before `default`)

**Step 1: Add the case handler**

Before the `default:` case (line 1587), insert:

```javascript
case 'add_to_list':
    // 將地點加入景點列表並持久化
    if (params.name && params.lat !== undefined && params.lng !== undefined) {
        const listPlace = {
            name: params.name,
            lat: parseFloat(params.lat),
            lng: parseFloat(params.lng),
            category: params.category || '地標觀景',
            description: params.description || ''
        };
        // 1. Add to visual list (using existing function)
        addSearchResultsToList([listPlace], 'all');
        // 2. Persist to localStorage
        persistChatPlace(listPlace);
        console.log(`[Map Action] Added to list: ${params.name}`);
    }
    break;
```

**Step 2: Verify** — no syntax errors in app.js.

---

### Task 5: Add localStorage persistence functions for chat-added places

**Objective:** Create `persistChatPlace()` and `loadChatPlaces()` so chat-added places survive page reloads.

**Files:**
- Modify: `static/js/app.js` (add new functions near the `addSearchResultsToList` area, ~line 2192)

**Step 1: Add persistence functions**

After `addSearchResultsToList()` (after line 2191), add:

```javascript
// ==================== 聊天添加地點持久化 ====================
const CHAT_PLACES_KEY = 'seoul_tour_chat_places';

function persistChatPlace(place) {
    const places = JSON.parse(localStorage.getItem(CHAT_PLACES_KEY) || '[]');
    // 避免重複（按名稱+坐標）
    const exists = places.some(p =>
        p.name === place.name &&
        Math.abs(p.lat - place.lat) < 0.0001 &&
        Math.abs(p.lng - place.lng) < 0.0001
    );
    if (!exists) {
        places.push({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            category: place.category || '地標觀景',
            description: place.description || '',
            addedAt: Date.now()
        });
        localStorage.setItem(CHAT_PLACES_KEY, JSON.stringify(places));
    }
}

function loadChatPlaces() {
    const places = JSON.parse(localStorage.getItem(CHAT_PLACES_KEY) || '[]');
    if (places.length > 0) {
        addSearchResultsToList(places, 'all');
        console.log(`[ChatPlaces] Restored ${places.length} chat-added places`);
    }
}

function clearChatPlaces() {
    localStorage.removeItem(CHAT_PLACES_KEY);
}
```

**Step 2: Call `loadChatPlaces()` on startup**

In the initialization block (where `loadData()` is called), add `loadChatPlaces()` after `addSearchResultsToList` is defined (or in the DOMContentLoaded handler). Find where the app initializes and add the call after data is loaded.

Search for the init pattern — likely near `loadData()` call or `window.onload` / `DOMContentLoaded`:

```javascript
// After loadData completes and renderAttractionList is called:
loadChatPlaces();
```

**Step 3: Verify** — reload page, check localStorage key exists, check items appear in list.

---

### Task 6: Add "清除聊天地點" button to search results header

**Objective:** Allow users to clear chat-added places from the list.

**Files:**
- Modify: `static/js/app.js` (in `addSearchResultsToList` or nearby)

**Step 1: Update the clear button in the search results header**

The existing header (line 2133-2141) already has a "清除搜索結果" button. Add a second button:

In the `search-results-title` div, after the existing clear button, add:

```html
<button class="clear-chat-places" onclick="clearChatPlaces(); clearSearchResultsFromList();" title="清除聊天添加的地點">
    <i class="fas fa-comment-slash"></i>
</button>
```

Alternatively, extend `clearSearchResultsFromList()` to also clear chat places from localStorage.

**Step 2: Update `clearSearchResultsFromList()`**

Find this function and add at the end:

```javascript
// Also clear persisted chat places
clearChatPlaces();
```

---

### Task 7: Integration test — verify end-to-end flow

**Objective:** Confirm that asking the chatbot about a place results in it appearing in the景點列表 and surviving page reload.

**Steps:**
1. Start the server: `cd /home/node/workspace/seoul-tour-map && python3 server.py`
2. Open browser to `http://localhost:8092`
3. Open the chatbot widget
4. Type: "airport cafe"
5. **Verify:** The AI response should contain `add_to_list` action tags for mentioned places (Starbucks, Paris Baguette, etc.)
6. **Verify:** The mentioned places appear in the left sidebar "📍 景點列表" under a "🔍 搜索結果" header
7. **Verify:** Map markers also appear for each place (from `add_marker`)
8. Reload the page
9. **Verify:** Chat-added places are still in the list (from localStorage)
10. Click "清除搜索結果" button
11. **Verify:** Chat places are cleared from both list and localStorage

---

### Edge Cases & Pitfalls

- **AI model compliance:** The AI may not always emit `add_to_list` tags. This depends on model quality and prompt adherence. If the model ignores instructions, consider adding a post-processing step in `fetchAIReply()` that detects place names and auto-generates `add_to_list` actions.
- **Duplicate prevention:** Both `addSearchResultsToList()` and `persistChatPlace()` have dedup logic, but the patterns differ (DOM-based vs data-based). Both are needed.
- **Category mapping:** Chat-added places may have arbitrary categories. The `typeToCategory` map in `addSearchResultsToList` maps query types; for `add_to_list` the AI provides the category directly. Ensure it matches one of the CATEGORY_COLORS keys.
- **The duplicate `executeMapAction` function:** app.js has two definitions of `executeMapAction` (lines ~571 and ~1444). The second one overrides the first. ALL changes must go in the SECOND definition (around line 1444).
- **The server-side `add_marker` name field:** The server whitelist uses `title` for `add_marker`, but `add_to_list` uses `name`. These are different param names — don't confuse them.