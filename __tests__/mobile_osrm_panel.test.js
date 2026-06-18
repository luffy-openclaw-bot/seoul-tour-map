/**
 * @jest-environment jsdom
 */

global.EventSource = class {
    constructor() { this.onmessage = null; this.onerror = null; }
    close() {}
};

global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 'Ok', routes: [] }) }));

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
    DomEvent: {
        stop: jest.fn(),
        disableClickPropagation: jest.fn(),
        on: jest.fn(),
        preventDefault: jest.fn()
    }
};

global.CATEGORY_COLORS = {};
global.CATEGORY_EMOJIS = {};
global.FingerprintManager = { getFingerprint: () => 'test-fp' };

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
        matches: query === '(max-width: 768px)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
    }))
});

document.body.innerHTML = `
    <div id="map"></div>
    <div id="route-panel" class="hidden"></div>
    <div id="radius-panel" class="hidden"></div>
    <div id="osrm-panel" class="osrm-panel hidden"></div>
    <div class="leaflet-control-osrm"><a></a></div>
    <div id="ai-chat" class="collapsed"></div>
    <div id="system-status-bar" class="hidden"></div>
    <input id="osrm-from" />
    <input id="osrm-to" />
    <div id="osrm-status"></div>
    <button id="osrm-panel-close"></button>
    <button id="btn-osrm-reset"></button>
    <div id="mobile-location-panel" class="mobile-location-panel">
        <div id="mobile-panel-drag-handle" class="mobile-panel-drag-handle">
            <span class="mobile-panel-title">📍 景點列表</span>
        </div>
        <span id="mobile-panel-count"></span>
        <div id="mobile-panel-actions" class="mobile-panel-actions hidden"></div>
        <div id="mobile-panel-tabs"></div>
        <div class="mobile-panel-search-container"></div>
        <div id="mobile-panel-list"></div>
        <div id="mobile-osrm-content" class="mobile-osrm-content hidden"></div>
        <button id="mobile-osrm-from-trigger" class="mobile-osrm-card" type="button"></button>
        <button id="mobile-osrm-to-trigger" class="mobile-osrm-card" type="button"></button>
        <span id="mobile-osrm-from-value"></span>
        <span id="mobile-osrm-to-value"></span>
        <div id="mobile-osrm-step-chip"></div>
        <div id="mobile-osrm-step-text"></div>
        <div id="mobile-osrm-status-card" class="mobile-osrm-status-card"></div>
        <div id="mobile-osrm-status"></div>
        <button id="mobile-osrm-reset" type="button"></button>
        <button id="mobile-osrm-back" type="button"></button>
        <button id="mobile-osrm-close" type="button"></button>
        <button id="mobile-osrm-focus-map" type="button"></button>
        <div id="mobile-osrm-result-card" class="mobile-osrm-result-card hidden"></div>
        <div id="mobile-osrm-result-main"></div>
        <div id="mobile-osrm-result-sub"></div>
    </div>
    <div id="pinned-list"></div>
    <span id="pinned-count"></span>
    <span id="pinned-loading" class="hidden"></span>
    <div id="modal" class="hidden"><div id="modal-body"></div></div>
    <button id="calculate-route"></button>
    <button id="reset-map"></button>
    <input id="chat-input" />
    <button id="send-btn"></button>
    <div id="sidebar-toggle"></div>
    <div id="locate-user"></div>
    <div id="route-result"></div>
    <button id="toggle-subway"></button>
    <button id="toggle-traffic"></button>
`;

const app = require('../static/js/app.js');

describe('Mobile OSRM Bottom Sheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        app.setMobilePanelMode('location-list');
        app.resetOsrmState();
        document.getElementById('mobile-location-panel').className = 'mobile-location-panel';
        document.getElementById('mobile-osrm-result-card').className = 'mobile-osrm-result-card hidden';
    });

    test('toggleOsrmPanel switches mobile panel into walk-route mode and expands it', () => {
        app.toggleOsrmPanel();

        expect(app.getMobilePanelModeForTest()).toBe('walk-route');
        expect(document.getElementById('mobile-location-panel').classList.contains('walk-route-mode')).toBe(true);
        expect(document.getElementById('mobile-location-panel').classList.contains('expanded')).toBe(true);
        expect(document.querySelector('.mobile-panel-title').textContent).toBe('步行路線規劃');
        expect(app.getOsrmStateForTest().active).toBe(true);
    });

    test('resetOsrmState clears mobile route summary and selected coordinates', () => {
        const state = app.getOsrmStateForTest();
        app.setMobilePanelMode('walk-route');
        state.fromLat = 37.5665;
        state.fromLng = 126.978;
        state.toLat = 37.5701;
        state.toLng = 126.992;
        state.step = 'done';
        state.summaryDistanceKm = '1.20';
        state.summaryDurationMin = 14;

        app.updateMobileOsrmUI();

        expect(document.getElementById('mobile-osrm-result-card').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('mobile-osrm-result-main').textContent).toBe('1.20 公里 · 14 分鐘');

        app.resetOsrmState();

        expect(state.fromLat).toBeNull();
        expect(state.toLat).toBeNull();
        expect(state.summaryDistanceKm).toBeNull();
        expect(state.summaryDurationMin).toBeNull();
        expect(document.getElementById('mobile-osrm-result-card').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('mobile-osrm-from-value').textContent).toContain('地圖上選擇起點');
        expect(document.getElementById('mobile-osrm-to-value').textContent).toContain('地圖上選擇終點');
    });
});
