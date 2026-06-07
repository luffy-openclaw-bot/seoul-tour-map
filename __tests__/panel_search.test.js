/**
 * @jest-environment jsdom
 */

// Mock globals needed by app.js
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
    marker: jest.fn(() => {
        const markerObj = {
            addTo: jest.fn(() => markerObj),
            bindPopup: jest.fn(() => markerObj),
            on: jest.fn(() => markerObj),
            getLatLng: jest.fn(() => ({ lat: 0, lng: 0 })),
            openPopup: jest.fn()
        };
        return markerObj;
    }),
    DomEvent: { stop: jest.fn() }
};

global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

// Setup DOM for integration tests
document.body.innerHTML = `
    <!-- Desktop Search Panel -->
    <div class="panel-search-container">
        <input type="text" id="desktop-search-input" />
        <span id="desktop-search-loading" class="hidden"></span>
        <button id="desktop-search-clear" class="hidden"></button>
    </div>
    <div id="attraction-list"></div>

    <!-- Mobile Search Panel -->
    <div class="mobile-panel-search-container">
        <input type="text" id="mobile-search-input" />
        <span id="mobile-search-loading" class="hidden"></span>
        <button id="mobile-search-clear" class="hidden"></button>
    </div>
    <div id="mobile-panel-list"></div>
    <span id="mobile-panel-count"></span>

    <!-- Other required elements for app.js -->
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

global.attractionsData = [
    { name: 'Seoul Tower', local_name: '서울타워', category: '地標觀景', description: 'Tall tower in Seoul', ticket: '10000 KRW', lat: 37.5, lng: 127.0 },
    { name: 'Gyeongbokgung', local_name: '경복궁', category: '歷史文化', description: 'Ancient palace', ticket: '3000 KRW', lat: 37.6, lng: 126.9 },
    { name: 'Myeongdong', local_name: '명동', category: '購物美食', description: 'Shopping street', ticket: 'Free', lat: 37.56, lng: 126.98 }
];

global.CATEGORY_COLORS = { '地標觀景': '#1e3a8a', '歷史文化': '#e74c3c', '購物美食': '#f39c12' };
global.CATEGORY_EMOJIS = { '地標觀景': '🗼', '歷史文化': '🏯', '購物美食': '🍜' };
global.FingerprintManager = { getFingerprint: () => 'test-fp' };
// Load the module
const app = require('../static/js/app.js');
const { getFilteredAttractions, setPanelSearchQuery, handlePanelSearchInput, clearPanelSearch, WishlistManager, setAttractionsDataForTest, setMapForTest } = app;

setAttractionsDataForTest([
    { name: 'Seoul Tower', local_name: '서울타워', category: '地標觀景', description: 'Tall tower in Seoul', ticket: '10000 KRW', lat: 37.5, lng: 127.0 },
    { name: 'Gyeongbokgung', local_name: '경복궁', category: '歷史文化', description: 'Ancient palace', ticket: '3000 KRW', lat: 37.6, lng: 126.9 },
    { name: 'Myeongdong', local_name: '명동', category: '購物美食', description: 'Shopping street', ticket: 'Free', lat: 37.56, lng: 126.98 }
]);
setMapForTest(global.map);

// Use fake timers for debounce testing
jest.useFakeTimers();

describe('Location Panel Search - Unit Tests', () => {
    beforeEach(() => {
        setPanelSearchQuery('');
        WishlistManager.getAll = jest.fn(() => []); // Mock empty wishlist
    });

    test('getFilteredAttractions should return all items when search query is empty', () => {
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(3);
    });

    test('getFilteredAttractions should filter by exact name match', () => {
        setPanelSearchQuery('Seoul Tower');
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('Seoul Tower');
    });

    test('getFilteredAttractions should filter by partial local_name match (case-insensitive)', () => {
        setPanelSearchQuery('경복'); // part of 경복궁
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('Gyeongbokgung');
    });

    test('getFilteredAttractions should filter by description match', () => {
        setPanelSearchQuery('shopping');
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('Myeongdong');
    });

    test('getFilteredAttractions should return empty array when no match is found', () => {
        setPanelSearchQuery('Busan');
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(0);
    });

    test('getFilteredAttractions should handle special characters properly', () => {
        setPanelSearchQuery('!@#$');
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(0);
    });

    test('getFilteredAttractions should combine category filter and search query', () => {
        setPanelSearchQuery('Seoul');
        // Seoul Tower is '地標觀景', so searching in '購物美食' should return 0
        let results = getFilteredAttractions('購物美食');
        expect(results.length).toBe(0);

        results = getFilteredAttractions('地標觀景');
        expect(results.length).toBe(1);
    });
});

describe('Location Panel Search - Integration Tests', () => {
    beforeEach(() => {
        setPanelSearchQuery('');
        document.getElementById('desktop-search-input').value = '';
        document.getElementById('mobile-search-input').value = '';
        document.getElementById('desktop-search-loading').classList.add('hidden');
        document.getElementById('mobile-search-loading').classList.add('hidden');
        document.getElementById('desktop-search-clear').classList.add('hidden');
        document.getElementById('mobile-search-clear').classList.add('hidden');
    });

    test('Typing in search input should show loading, update sync input, and show clear button', () => {
        const desktopInput = document.getElementById('desktop-search-input');
        const mobileInput = document.getElementById('mobile-search-input');
        const desktopLoading = document.getElementById('desktop-search-loading');
        const desktopClear = document.getElementById('desktop-search-clear');

        // Simulate typing
        const event = { target: desktopInput };
        desktopInput.value = 'Tower';
        
        handlePanelSearchInput(event);

        expect(desktopLoading.classList.contains('hidden')).toBe(false);
        expect(mobileInput.value).toBe('Tower');
        expect(desktopClear.classList.contains('hidden')).toBe(false);
        
        global.L.marker.mockClear();

        // Fast forward 300ms debounce
        jest.advanceTimersByTime(300);

        // Loading should be hidden after debounce
        expect(desktopLoading.classList.contains('hidden')).toBe(true);
        expect(global.L.marker).toHaveBeenCalled();
    });

    test('Clearing search should reset inputs, hide clear buttons, and reset query', () => {
        const desktopInput = document.getElementById('desktop-search-input');
        const desktopClear = document.getElementById('desktop-search-clear');

        desktopInput.value = 'Tower';
        desktopClear.classList.remove('hidden');
        global.L.marker.mockClear();

        clearPanelSearch();

        expect(desktopInput.value).toBe('');
        expect(desktopClear.classList.contains('hidden')).toBe(true);
        expect(global.L.marker).toHaveBeenCalled();
        
        // Verify getFilteredAttractions uses empty query now
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(3);
    });
});
