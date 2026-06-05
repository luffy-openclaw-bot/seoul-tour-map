/**
 * @jest-environment jsdom
 */

global.EventSource = class {
    constructor() { this.onmessage = null; this.onerror = null; }
    close() {}
};

// Mock geolocation
const mockGeolocation = {
    getCurrentPosition: jest.fn()
};
global.navigator.geolocation = mockGeolocation;

global.map = {
    closePopup: jest.fn(),
    flyTo: jest.fn(),
    removeLayer: jest.fn(),
    addLayer: jest.fn(),
    setView: jest.fn()
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
            bindPopup: jest.fn(() => ({
                openPopup: jest.fn()
            }))
        }))
    })),
    circle: jest.fn(() => ({
        addTo: jest.fn()
    }))
};

// Mock fetch
global.fetch = jest.fn();

// Mock marked
global.marked = {
    parse: jest.fn(text => `<p>${text}</p>`)
};

document.body.innerHTML = `
    <div id="chat-messages"></div>
    <div id="ai-chat"></div>
    <input id="chat-input" />
    <button id="send-btn"></button>
    <div id="locate-user"></div>
    <div id="pinned-list"></div>
    <span id="pinned-count"></span>
    <span id="pinned-loading" class="hidden"></span>
    <div id="modal" class="hidden"><div id="modal-body"></div></div>
    <button id="calculate-route"></button>
    <button id="reset-map"></button>
    <div id="sidebar-toggle"></div>
    <div id="route-panel"></div>
    <div id="route-result"></div>
    <button id="toggle-subway"></button>
    <button id="toggle-traffic"></button>
    <select id="route-start"></select>
    <select id="route-end"></select>
`;

global.FingerprintManager = { getFingerprint: () => 'test-fp' };
global.fingerprintManager = { getFingerprint: () => 'test-fp' };
global.CATEGORY_COLORS = {};
global.activeCategory = 'all';

// Load app.js and get exported functions
const app = require('../static/js/app.js');
const { executeMapAction, addMessage, getChatHistory } = app;

describe('Location Skill Frontend Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.getElementById('chat-messages').innerHTML = '';
        getChatHistory().length = 0;
    });

    test('executeMapAction handles locate_user_and_report', async () => {
        // Prepare mock geolocation to succeed
        mockGeolocation.getCurrentPosition.mockImplementationOnce((success) => {
            success({ coords: { latitude: 37.5, longitude: 126.9, accuracy: 10 } });
        });

        // Prepare mock fetch for the report
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }) // /api/execute
        }).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ reply: 'You are in Seoul!' }) // /api/chat
        });

        // Trigger action
        const result = await executeMapAction('locate_user_and_report', {});
        expect(result).toBe(true);
        expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
        
        // Let promises resolve
        return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: expect.stringContaining('"[SYSTEM_LOCATION_REPORT]"')
            }));
            
            // Check if fingerprint is sent
            const chatCall = global.fetch.mock.calls.find(call => call[0] === '/api/chat');
            expect(chatCall).toBeDefined();
            expect(chatCall[1].body).toContain('"fingerprint":"test-fp"');
            expect(chatCall[1].body).toContain('"lat":37.5');
            expect(chatCall[1].body).toContain('"lng":126.9');
            
            // Check if message was added to chat
            const chatMessages = document.getElementById('chat-messages');
            expect(chatMessages.innerHTML).toContain('You are in Seoul!');
        });
    });
});
