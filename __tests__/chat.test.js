/**
 * @jest-environment jsdom
 */

global.EventSource = class {
    constructor() { this.onmessage = null; this.onerror = null; }
    close() {}
};

global.map = {
    closePopup: jest.fn(),
    flyTo: jest.fn(),
    removeLayer: jest.fn(),
    addLayer: jest.fn()
};

global.L = {
    popup: () => ({
        setLatLng: () => ({
            setContent: () => ({
                openOn: jest.fn()
            })
        })
    }),
    divIcon: jest.fn(() => ({})),
    marker: jest.fn(() => ({
        addTo: jest.fn(() => ({
            bindPopup: jest.fn()
        }))
    }))
};

global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

// Mock marked
global.marked = {
    parse: jest.fn(text => `<p>${text}</p>`)
};

global.executeMapAction = jest.fn();

document.body.innerHTML = `
    <div id="chat-messages">
        <div class="message bot">Welcome message</div>
    </div>
    <!-- Elements required by app.js global bindings -->
    <div id="pinned-list"></div>
    <span id="pinned-count"></span>
    <span id="pinned-loading" class="hidden"></span>
    <div id="modal" class="hidden"><div id="modal-body"></div></div>
    <button id="calculate-route"></button>
    <button id="reset-map"></button>
    <div id="ai-chat"></div>
    <input id="chat-input" />
    <button id="send-btn"></button>
    <div id="sidebar-toggle"></div>
    <div id="locate-user"></div>
    <div id="route-panel"></div>
    <div id="route-result"></div>
    <button id="toggle-subway"></button>
    <button id="toggle-traffic"></button>
`;

global.CATEGORY_COLORS = { '用戶釘選': '#1e3a8a' };
global.FingerprintManager = { getFingerprint: () => 'test-fp' };
global.renderAttractionList = jest.fn();
global.renderMobilePanelList = jest.fn();
global.addMarkers = jest.fn();
global.activeCategory = 'all';

const app = require('../static/js/app.js');
const {
    addMessage,
    buildUpdateDetailFallbackAction,
    extractActionCommands,
    saveChatHistory,
    loadChatHistory,
    getChatHistory,
    CHAT_HISTORY_KEY,
    setAttractionsDataForTest,
    showAttractionDetailById,
    WishlistManager,
    removeFromWishlistFromModal
} = app;

describe('Chat History Persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        document.getElementById('chat-messages').innerHTML = '<div class="message bot">Welcome message</div>';
        
        // Use a trick to clear chatHistory by saving empty array and loading it, 
        // since we cannot reassign the variable directly from here
        // Wait, loadChatHistory only clears if parsed is not empty.
        // We'll just run loadChatHistory with a dummy msg and then clear it
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([{ role: 'user', content: 'dummy' }]));
        loadChatHistory(); // This resets chatHistory and adds dummy
        // Now chatHistory has 1 item. We can't easily clear it without modifying app.js.
        // Wait, I can just clear the chatHistory array directly since we can get the reference.
        const history = getChatHistory();
        history.length = 0; // Clear the array in place!
        
        localStorage.clear();
        document.getElementById('chat-messages').innerHTML = '<div class="message bot">Welcome message</div>';
        jest.clearAllMocks();
    });

    test('addMessage saves history to localStorage when isRestore is false', () => {
        addMessage('Hello', 'user');
        
        const history = getChatHistory();
        expect(history.length).toBe(1);
        expect(history[0].content).toBe('Hello');
        expect(history[0].role).toBe('user');
        
        const saved = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY));
        expect(saved.length).toBe(1);
        expect(saved[0].content).toBe('Hello');
    });

    test('loadChatHistory restores messages from localStorage and clears welcome message', () => {
        const fakeHistory = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello there' }
        ];
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(fakeHistory));
        
        loadChatHistory();
        
        const container = document.getElementById('chat-messages');
        expect(container.innerHTML).not.toContain('Welcome message');
        expect(container.innerHTML).toContain('Hi');
        expect(container.innerHTML).toContain('Hello there');
        
        const history = getChatHistory();
        expect(history.length).toBe(2);
    });

    test('isRestore = true prevents saveChatHistory and autoActions execution', () => {
        const executeMapActionSpy = jest.spyOn(global, 'executeMapAction');
        const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
        
        addMessage('Test message 【{"action":"add_marker"}】', 'bot', true);
        
        expect(executeMapActionSpy).not.toHaveBeenCalled();
        expect(setItemSpy).not.toHaveBeenCalledWith(CHAT_HISTORY_KEY, expect.any(String));
        
        executeMapActionSpy.mockRestore();
        setItemSpy.mockRestore();
    });

    test('visibilitychange event triggers saveChatHistory', () => {
        const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
        
        Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            writable: true
        });
        
        document.dispatchEvent(new Event('visibilitychange'));
        
        expect(setItemSpy).toHaveBeenCalledWith(CHAT_HISTORY_KEY, expect.any(String));
        
        setItemSpy.mockRestore();
    });

    test('pagehide event triggers saveChatHistory', () => {
        const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
        
        window.dispatchEvent(new Event('pagehide'));
        
        expect(setItemSpy).toHaveBeenCalledWith(CHAT_HISTORY_KEY, expect.any(String));
        
        setItemSpy.mockRestore();
    });
});

describe('Chat-added location detail modal', () => {
    beforeEach(() => {
        localStorage.clear();
        document.getElementById('modal').className = 'hidden';
        document.getElementById('modal-body').innerHTML = '';
        setAttractionsDataForTest([]);
    });

    test('showAttractionDetailById opens modal for minimal chat-added locations', () => {
        setAttractionsDataForTest([
            {
                id: 'chat_blue_bottle_cheonggye',
                name: 'Blue Bottle 清溪川店',
                lat: 37.5691,
                lng: 126.9846,
                category: '購物美食',
                description: '美國超人氣精品咖啡品牌，新世界站。'
            }
        ]);

        expect(() => showAttractionDetailById('chat_blue_bottle_cheonggye')).not.toThrow();
        expect(document.getElementById('modal').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('modal-body').textContent).toContain('Blue Bottle 清溪川店');
        expect(document.getElementById('modal-body').textContent).toContain('暫無亮點資料');
    });

    test('detail modal shows trash button when location has a saved active record', () => {
        setAttractionsDataForTest([
            {
                id: 'chat_saved_blue_bottle',
                name: 'Blue Bottle 三清洞店',
                lat: 37.5817,
                lng: 126.9825,
                category: '購物美食',
                description: '三清洞人氣咖啡店。'
            }
        ]);
        WishlistManager.add({
            name: 'Blue Bottle 三清洞店',
            lat: 37.5817,
            lng: 126.9825,
            category: '購物美食',
            description: '三清洞人氣咖啡店。',
            wish: true
        });

        showAttractionDetailById('chat_saved_blue_bottle');

        const deleteBtn = document.querySelector('.btn-delete-modal');
        expect(deleteBtn).not.toBeNull();
        expect(deleteBtn.textContent).toContain('從清單移除');
        expect(deleteBtn.getAttribute('aria-label')).toContain('Blue Bottle 三清洞店');
    });

    test('detail modal hides trash button when location has no saved record', () => {
        setAttractionsDataForTest([
            {
                id: 'chat_unsaved_blue_bottle',
                name: 'Blue Bottle 北村店',
                lat: 37.5822,
                lng: 126.9831,
                category: '購物美食',
                description: '北村韓屋附近分店。'
            }
        ]);

        showAttractionDetailById('chat_unsaved_blue_bottle');

        expect(document.querySelector('.btn-delete-modal')).toBeNull();
    });

    test('confirmed modal delete soft-deletes the item and closes the modal', () => {
        setAttractionsDataForTest([
            {
                id: 'chat_delete_blue_bottle',
                name: 'Blue Bottle 現代首爾店',
                lat: 37.5251,
                lng: 126.9280,
                category: '購物美食',
                description: '現代百貨內分店。'
            }
        ]);
        WishlistManager.add({
            name: 'Blue Bottle 現代首爾店',
            lat: 37.5251,
            lng: 126.9280,
            category: '購物美食',
            description: '現代百貨內分店。',
            wish: true
        });
        showAttractionDetailById('chat_delete_blue_bottle');

        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
        const deleteBtn = document.querySelector('.btn-delete-modal');

        expect(removeFromWishlistFromModal(deleteBtn)).toBe(true);

        const savedItem = WishlistManager.getAll().find(item => item.name === 'Blue Bottle 現代首爾店');
        expect(confirmSpy).toHaveBeenCalled();
        expect(savedItem.deleted).toBe(true);
        expect(document.getElementById('modal').classList.contains('hidden')).toBe(true);

        confirmSpy.mockRestore();
    });
});

describe('AI attraction detail updates', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        });
    });

    test('extractActionCommands parses update_attraction_detail from a markdown reply', () => {
        const reply = `### 通仁市場介紹

而家幫你更新介紹頁：

【{"action":"update_attraction_detail","params":{"id":"chat_tongin_market","name":"通仁市場","description":"傳統市場介紹","highlights":["銅錢飯盒體驗"],"local_cuisine":["糖餅"],"best_seasons":["春季"],"stay_duration":"1-1.5 小時","visitor_insights":"夠 local","transport":{"subway":"景福宮站 2 號出口","time_from_station":"步行約 5 分鐘"},"ticket":"免費","hours":"07:00-21:00","tips":"避開中午高峰"}}】`;

        const parsed = extractActionCommands(reply, 'test');

        expect(parsed.actions).toHaveLength(1);
        expect(parsed.actions[0].action).toBe('update_attraction_detail');
        expect(parsed.actions[0].params.id).toBe('chat_tongin_market');
    });

    test('buildUpdateDetailFallbackAction synthesizes update action from structured markdown reply', () => {
        const userText = '叫Hermes介紹 通仁市場 並更新介紹頁 (ID: chat_tongin_market)';
        const reply = `### 🏮 通仁市場（통인시장）介紹

### 📍 基本資料
| 項目 | 資料 |
|------|------|
| 市場名稱 | 通仁市場 |
| 地址 | 首爾鐘路區紫霞門路 15 街 18 號 |
| 交通 | 地鐵 3 號線 景福宮站 2 號出口，步行約 5 分鐘 |
| 營業時間 | 07:00-21:00 |
| 入場費 | 免費 |
| 建議逗留 | 1-1.5 小時 |

### ✨ 市場亮點
| 亮點 | 說明 |
|------|------|
| 銅錢飯盒體驗 | 特色體驗 |
| 80 年歷史 | 老市場 |

### 🍜 必食推薦
| 小食 | 價格 |
|------|------|
| 糖餅 | ₩1,000-1,500 |
| 紫菜飯卷 | ₩2,500-3,500 |

### 💡 探訪小貼士
1. 平日早上去會舒服啲
2. 避開午市高峰`;

        const fallbackAction = buildUpdateDetailFallbackAction(userText, reply);

        expect(fallbackAction).not.toBeNull();
        expect(fallbackAction.action).toBe('update_attraction_detail');
        expect(fallbackAction.params.id).toBe('chat_tongin_market');
        expect(fallbackAction.params.name).toBe('通仁市場');
        expect(fallbackAction.params.highlights).toContain('銅錢飯盒體驗');
        expect(fallbackAction.params.local_cuisine).toContain('糖餅');
        expect(fallbackAction.params.transport).toEqual({
            subway: '地鐵 3 號線 景福宮站 2 號出口',
            time_from_station: '步行約 5 分鐘'
        });
        expect(fallbackAction.params.hours).toBe('07:00-21:00');
        expect(fallbackAction.params.ticket).toBe('免費');
    });

    test('executeMapAction updates chat-added attraction detail by exact id', async () => {
        setAttractionsDataForTest([
            {
                id: 'chat_tongin_market',
                name: '通仁市場',
                lat: 37.5780,
                lng: 126.9720,
                category: '地標觀景',
                description: '特色銅錢市場，多種傳統小食'
            }
        ]);

        const result = await app.executeMapAction('update_attraction_detail', {
            id: 'chat_tongin_market',
            name: '通仁市場',
            description: '有銅錢飯盒體驗嘅傳統市場。',
            highlights: ['銅錢飯盒體驗', '80 年歷史'],
            local_cuisine: ['糖餅', '紫菜飯卷'],
            stay_duration: '1-1.5 小時',
            transport: {
                subway: '景福宮站 2 號出口',
                time_from_station: '步行約 5 分鐘'
            },
            ticket: '免費',
            hours: '07:00-21:00',
            tips: '避開中午高峰'
        });

        expect(result.success).toBe(true);
        showAttractionDetailById('chat_tongin_market');
        const modalText = document.getElementById('modal-body').textContent;
        expect(modalText).toContain('有銅錢飯盒體驗嘅傳統市場');
        expect(modalText).toContain('糖餅、紫菜飯卷');
        expect(modalText).toContain('步行約 5 分鐘');
    });

    test('executeMapAction returns failure when update target cannot be resolved', async () => {
        setAttractionsDataForTest([]);

        const result = await app.executeMapAction('update_attraction_detail', {
            id: 'chat_missing_market',
            name: '不存在景點',
            description: 'test'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('target attraction not found');
    });
});
