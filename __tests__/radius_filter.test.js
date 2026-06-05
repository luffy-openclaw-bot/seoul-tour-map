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
    addLayer: jest.fn(),
    fitBounds: jest.fn()
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
        addTo: jest.fn(() => ({
            getBounds: jest.fn()
        }))
    }))
};

global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
global.alert = jest.fn();

document.body.innerHTML = `
    <!-- Radius Filter Panel -->
    <div id="radius-panel" class="radius-panel hidden">
        <input type="number" id="radius-lat">
        <input type="number" id="radius-lng">
        <input type="number" id="radius-val">
        <select id="radius-unit">
            <option value="km">公里 (km)</option>
            <option value="mi">英里 (mi)</option>
        </select>
        <button id="btn-radius-pick-map"></button>
        <button id="btn-radius-apply"></button>
        <button id="btn-radius-clear"></button>
    </div>

    <!-- Other required elements for app.js -->
    <div id="map"></div>
    <div class="panel-search-container"><input type="text" id="desktop-search-input" /><span id="desktop-search-loading" class="hidden"></span><button id="desktop-search-clear" class="hidden"></button></div>
    <div class="mobile-panel-search-container"><input type="text" id="mobile-search-input" /><span id="mobile-search-loading" class="hidden"></span><button id="mobile-search-clear" class="hidden"></button></div>
    <div id="attraction-list"></div>
    <div id="mobile-panel-list"></div>
    <span id="mobile-panel-count"></span>
    <div id="pinned-list"></div>
    <span id="pinned-count"></span>
    <span id="pinned-loading" class="hidden"></span>
    <div id="modal" class="hidden"><div id="modal-body"></div></div>
    <div id="ai-chat"></div>
    <input id="chat-input" />
    <button id="send-btn"></button>
    <div id="route-panel"></div>
    <button id="calculate-route"></button>
    <select id="route-start"></select>
    <select id="route-end"></select>
    <div id="route-result"></div>
    <button id="toggle-subway"></button>
    <button id="toggle-traffic"></button>
    <div id="locate-user"></div>
    <div id="sidebar-toggle"></div>
    <button id="reset-map"></button>
`;

global.attractionsData = [
    { name: 'Seoul Tower', local_name: '서울타워', category: '地標觀景', lat: 37.5511, lng: 126.9882, description: 'Tower' }, // Centerish
    { name: 'Gyeongbokgung', local_name: '경복궁', category: '歷史文化', lat: 37.5796, lng: 126.9770, description: 'Palace' }, // ~3km away
    { name: 'Incheon Airport', local_name: '인천공항', category: '交通', lat: 37.4602, lng: 126.4407, description: 'Airport' } // ~50km away
];

const app = require('../static/js/app.js');
const { 
    calculateHaversineDistance, 
    radiusState, 
    applyRadiusFilter, 
    clearRadiusFilter, 
    parseRadiusSlashCommand,
    getFilteredAttractions,
    setAttractionsDataForTest,
    setMapForTest,
    WishlistManager
} = app;

setAttractionsDataForTest(global.attractionsData);
setMapForTest(global.map);

describe('Radius Filter Logic', () => {
    beforeEach(() => {
        clearRadiusFilter();
        WishlistManager.getAll = jest.fn(() => []);
        jest.clearAllMocks();
    });

    test('calculateHaversineDistance calculates correctly', () => {
        const dist = calculateHaversineDistance(37.5511, 126.9882, 37.5796, 126.9770);
        // Distance should be around 3.3 km (3300m)
        expect(dist).toBeGreaterThan(3000);
        expect(dist).toBeLessThan(3500);
    });

    test('parseRadiusSlashCommand toggles panel if no args', () => {
        const panel = document.getElementById('radius-panel');
        panel.classList.add('hidden');
        parseRadiusSlashCommand('');
        expect(panel.classList.contains('hidden')).toBe(false);
    });

    test('parseRadiusSlashCommand parses arguments correctly', () => {
        parseRadiusSlashCommand('37.5511 126.9882 5km');
        expect(document.getElementById('radius-lat').value).toBe('37.5511');
        expect(document.getElementById('radius-lng').value).toBe('126.9882');
        expect(document.getElementById('radius-val').value).toBe('5');
        expect(document.getElementById('radius-unit').value).toBe('km');
        expect(radiusState.active).toBe(true);
        expect(radiusState.radiusMeters).toBe(5000);
    });

    test('applyRadiusFilter applies validation and updates state', () => {
        document.getElementById('radius-lat').value = '200'; // invalid lat
        document.getElementById('radius-lng').value = '126';
        document.getElementById('radius-val').value = '5';
        document.getElementById('radius-unit').value = 'km';
        
        applyRadiusFilter();
        
        expect(global.alert).toHaveBeenCalledWith('緯度必須在 -90 到 90 之間，經度必須在 -180 到 180 之間');
        expect(radiusState.active).toBe(false);

        // Valid values
        document.getElementById('radius-lat').value = '37.5511'; 
        applyRadiusFilter();
        
        expect(radiusState.active).toBe(true);
        expect(radiusState.radiusMeters).toBe(5000);
        expect(global.L.circle).toHaveBeenCalled();
    });

    test('getFilteredAttractions respects radius filter', () => {
        // Set focus to Seoul Tower, radius 5km
        document.getElementById('radius-lat').value = '37.5511';
        document.getElementById('radius-lng').value = '126.9882';
        document.getElementById('radius-val').value = '5';
        document.getElementById('radius-unit').value = 'km';
        applyRadiusFilter();

        const results = getFilteredAttractions('all');
        // Should include Seoul Tower and Gyeongbokgung, but not Incheon Airport
        expect(results.length).toBe(2);
        const names = results.map(r => r.name);
        expect(names).toContain('Seoul Tower');
        expect(names).toContain('Gyeongbokgung');
        expect(names).not.toContain('Incheon Airport');
    });

    test('clearRadiusFilter resets state and visuals', () => {
        document.getElementById('radius-lat').value = '37.5';
        applyRadiusFilter();
        
        clearRadiusFilter();
        
        expect(radiusState.active).toBe(false);
        expect(document.getElementById('radius-lat').value).toBe('');
        const results = getFilteredAttractions('all');
        expect(results.length).toBe(3); // All 3 returned again
    });
});
