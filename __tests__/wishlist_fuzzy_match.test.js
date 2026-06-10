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
    })),
    circle: jest.fn(() => ({
        addTo: jest.fn(() => ({})),
        getBounds: jest.fn(() => ({}))
    }))
};

global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

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

const app = require('../static/js/app.js');
const {
    WishlistManager,
    getFilteredAttractions,
    setAttractionsDataForTest,
    setPanelSearchQuery,
    radiusState,
    showAttractionDetailById,
    removeFromWishlistFromModal
} = app;

describe('Wishlist fuzzy match', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        setAttractionsDataForTest([]);
        setPanelSearchQuery('');
        radiusState.active = false;
    });

    test('WishlistManager.get falls back to near-coordinate match within tolerance', () => {
        WishlistManager.add({ name: 'Place', lat: 37.1, lng: 127.1, category: '自訂景點' });
        const expected = WishlistManager.getAll()[0];

        const found = WishlistManager.get('Place', 37.10005, 127.10005);
        expect(found).not.toBeNull();
        expect(found.id).toBe(expected.id);
    });

    test('WishlistManager.get does not match when outside tolerance', () => {
        WishlistManager.add({ name: 'Place', lat: 37.1, lng: 127.1, category: '自訂景點' });

        const found = WishlistManager.get('Place', 37.1003, 127.1003);
        expect(found).toBeNull();
    });

    test('WishlistManager.has uses the same fuzzy matching behavior', () => {
        WishlistManager.add({ name: 'WishPlace', lat: 37.2, lng: 127.2, wish: true, category: '自訂景點' });

        expect(WishlistManager.has('WishPlace', 37.20005, 127.20005)).toBe(true);
    });

    test('WishlistManager.get falls back to coordKey match when names differ but rounded coords match', () => {
        localStorage.setItem(WishlistManager.STORAGE_KEY, JSON.stringify([
            { id: 'imported_1', name: 'Imported Name', lat: 37.5664999, lng: 126.9780001, addedAt: 1, updatedAt: 1, deleted: false }
        ]));

        const found = WishlistManager.get('Preset Name', 37.5665, 126.9780);
        expect(found).not.toBeNull();
        expect(found.id).toBe('imported_1');
    });

    test('WishlistManager.get coordKey fallback returns null when ambiguous', () => {
        localStorage.setItem(WishlistManager.STORAGE_KEY, JSON.stringify([
            { id: 'imported_1', name: 'Imported A', lat: 37.5664999, lng: 126.9780001, addedAt: 1, updatedAt: 1, deleted: false },
            { id: 'imported_2', name: 'Imported B', lat: 37.5665001, lng: 126.9780002, addedAt: 1, updatedAt: 1, deleted: false }
        ]));

        const found = WishlistManager.get('Preset Name', 37.5665, 126.9780);
        expect(found).toBeNull();
    });

    test('WishlistManager.get prefers an active duplicate over a deleted exact-id record', () => {
        localStorage.setItem(WishlistManager.STORAGE_KEY, JSON.stringify([
            { id: 'chat_Blue Bottle 清溪川店_37.5678_126.9825', name: 'Blue Bottle 清溪川店', lat: 37.5678, lng: 126.9825, addedAt: 1, updatedAt: 10, deleted: false },
            { id: 'wl_Blue Bottle 清溪川店_37.5678_126.9825', name: 'Blue Bottle 清溪川店', lat: 37.5678, lng: 126.9825, addedAt: 2, updatedAt: 20, deleted: true }
        ]));

        const found = WishlistManager.get('Blue Bottle 清溪川店', 37.5678, 126.9825);
        expect(found).not.toBeNull();
        expect(found.id).toBe('chat_Blue Bottle 清溪川店_37.5678_126.9825');
    });

    test('getFilteredAttractions hides preset rows when only a deleted saved match exists', () => {
        setAttractionsDataForTest([
            { id: 'preset_blue_bottle_seongsu', name: 'Blue Bottle 聖水店', lat: 37.5467, lng: 127.0544, category: '購物美食', description: '' }
        ]);
        localStorage.setItem(WishlistManager.STORAGE_KEY, JSON.stringify([
            { id: 'chat_Blue Bottle 聖水店_37.5467_127.0544', name: 'Blue Bottle 聖水店', lat: 37.5467, lng: 127.0544, addedAt: 1, updatedAt: 1, deleted: true }
        ]));

        const filtered = getFilteredAttractions('all');
        expect(filtered.some(item => item.name === 'Blue Bottle 聖水店')).toBe(false);
    });

    test('removing a matched duplicate soft-deletes the active record', () => {
        localStorage.setItem(WishlistManager.STORAGE_KEY, JSON.stringify([
            { id: 'chat_Blue Bottle 清溪川店_37.5678_126.9825', name: 'Blue Bottle 清溪川店', lat: 37.5678, lng: 126.9825, addedAt: 1, updatedAt: 10, deleted: false },
            { id: 'wl_Blue Bottle 清溪川店_37.5678_126.9825', name: 'Blue Bottle 清溪川店', lat: 37.5678, lng: 126.9825, addedAt: 2, updatedAt: 20, deleted: true }
        ]));

        const found = WishlistManager.get('Blue Bottle 清溪川店', 37.5678, 126.9825);
        WishlistManager.remove(found.id);

        const items = WishlistManager.getAll();
        const activeItem = items.find(item => item.id === 'chat_Blue Bottle 清溪川店_37.5678_126.9825');
        const deletedItem = items.find(item => item.id === 'wl_Blue Bottle 清溪川店_37.5678_126.9825');
        expect(activeItem.deleted).toBe(true);
        expect(deletedItem.deleted).toBe(true);
    });

    test('modal delete keeps item and modal open when confirmation is cancelled', () => {
        setAttractionsDataForTest([
            { id: 'chat_cancel_delete', name: 'Blue Bottle 安國店', lat: 37.5761, lng: 126.9851, category: '購物美食', description: '安國站附近。' }
        ]);
        WishlistManager.add({
            name: 'Blue Bottle 安國店',
            lat: 37.5761,
            lng: 126.9851,
            category: '購物美食',
            description: '安國站附近。',
            wish: true
        });

        showAttractionDetailById('chat_cancel_delete');
        const deleteBtn = document.querySelector('.btn-delete-modal');
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

        expect(removeFromWishlistFromModal(deleteBtn)).toBe(false);

        const savedItem = WishlistManager.getAll().find(item => item.name === 'Blue Bottle 安國店');
        expect(confirmSpy).toHaveBeenCalled();
        expect(savedItem.deleted).toBe(false);
        expect(document.getElementById('modal').classList.contains('hidden')).toBe(false);

        confirmSpy.mockRestore();
    });
});

