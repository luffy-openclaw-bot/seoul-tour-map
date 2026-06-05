/**
 * @jest-environment jsdom
 */

// Mock EventSource, map, etc.
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

// Set up minimal HTML structure
document.body.innerHTML = `
    <div id="pinned-list"></div>
    <span id="pinned-count"></span>
    <span id="pinned-loading" class="hidden"></span>
    <div id="modal" class="hidden">
        <div id="modal-body"></div>
    </div>
    <div class="wishlist-btn" data-name="Test" data-lat="37" data-lng="127">
        <i class="far fa-heart"></i>
    </div>
    <!-- Elements required by app.js global bindings -->
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

// Required global variables in app.js
global.CATEGORY_COLORS = { '用戶釘選': '#1e3a8a' };
global.FingerprintManager = { getFingerprint: () => 'test-fp' };
global.renderAttractionList = jest.fn();
global.renderMobilePanelList = jest.fn();
global.addMarkers = jest.fn();
global.activeCategory = 'all';

// Load module
const app = require('../static/js/app.js');
const { WishlistManager, saveLocationData, renderPinnedPanel, updatePinnedCount, toggleLoadingState } = app;

describe('Pinned Location Logic', () => {
    beforeEach(() => {
        localStorage.clear();
        document.getElementById('pinned-list').innerHTML = '';
        document.getElementById('pinned-count').textContent = '0';
        jest.clearAllMocks();
    });

    test('toggleLoadingState updates CSS class', () => {
        const loading = document.getElementById('pinned-loading');
        
        toggleLoadingState(true);
        expect(loading.classList.contains('hidden')).toBe(false);
        
        toggleLoadingState(false);
        expect(loading.classList.contains('hidden')).toBe(true);
    });

    test('saveLocationData adds item to WishlistManager with category "自訂景點" and pinned true', () => {
        saveLocationData('My Pin', 37.123, 127.456, false, true, false, 'remark');
        
        const items = WishlistManager.getAll();
        expect(items.length).toBe(1);
        expect(items[0].name).toBe('My Pin');
        expect(items[0].category).toBe('自訂景點');
        expect(items[0].pinned).toBe(true);
        expect(items[0].myRemark).toBe('remark');
    });

    test('updatePinnedCount correctly reflects pinned locations only', () => {
        // Add a pinned location
        saveLocationData('Pin 1', 37.1, 127.1, false, true, false, '');
        
        // Add a regular wishlist item
        WishlistManager.add({
            name: 'Regular Wishlist',
            lat: 37.2,
            lng: 127.2,
            category: '購物美食'
        });
        
        updatePinnedCount();
        const badge = document.getElementById('pinned-count');
        expect(badge.textContent).toBe('1');
    });

    test('renderPinnedPanel only renders pinned locations', () => {
        // Add one pinned and one regular item
        saveLocationData('Pin 1', 37.1, 127.1, false, true, false, '');
        WishlistManager.add({
            name: 'Regular Wishlist',
            lat: 37.2,
            lng: 127.2,
            category: '購物美食'
        });
        
        renderPinnedPanel();
        const list = document.getElementById('pinned-list');
        
        // Should have exactly 1 child (the pinned item)
        expect(list.children.length).toBe(1);
        expect(list.innerHTML).toContain('Pin 1');
        expect(list.innerHTML).not.toContain('Regular Wishlist');
    });

    test('removing a pinned location works correctly', () => {
        saveLocationData('Pin 1', 37.1, 127.1, false, true, false, '');
        const item = WishlistManager.getAll()[0];
        
        WishlistManager.remove(item.id);
        
        const items = WishlistManager.getAll();
        expect(items.length).toBe(0);
        
        updatePinnedCount();
        const badge = document.getElementById('pinned-count');
        expect(badge.textContent).toBe('0');
    });
});
