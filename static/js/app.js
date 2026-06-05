/**
 * 首爾旅遊地圖平台 - 主程式
 */

// ==================== 全局變量 ====================
let map;
let markers = {};
let subwayLines = [];
let subwayLayerGroup;
let routeLayerGroup;
let pinnedLayerGroup;  // 用戶釘選標記圖層
let searchMarkersLayerGroup;  // Chatbot 搜索標記圖層
let attractionsData = [];
let currentSearchResults = []; // 存儲當前搜索結果，以便在不同面板同步
let subwayData = {};
let activeCategory = 'all';

// ==================== Radius Filter 狀態 ====================
let radiusState = {
    active: false,
    lat: null,
    lng: null,
    radiusMeters: 0,
    circleLayer: null,
    pickingMap: false
};

// ==================== 距離計算 (Haversine) ====================
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// ==================== 地圖選擇設定 ====================
const MapManager = {
    currentLat: null,
    currentLng: null,
    currentName: null,

    getPreference() {
        return localStorage.getItem('tour_map_preference');
    },

    setPreference(pref) {
        if (!pref) return;
        localStorage.setItem('tour_map_preference', pref);
        // Sync dropdowns
        const desktopSelector = document.getElementById('map-selector');
        const mobileSelector = document.getElementById('mobile-map-selector');
        if (desktopSelector) desktopSelector.value = pref;
        if (mobileSelector) mobileSelector.value = pref;
    },

    openMap(lat, lng, name = '') {
        const pref = this.getPreference();
        if (pref) {
            this.executeMapOpen(pref, lat, lng, name);
        } else {
            // Save state for modal
            this.currentLat = lat;
            this.currentLng = lng;
            this.currentName = name;
            // Show modal
            const modal = document.getElementById('map-selection-modal');
            if (modal) modal.classList.remove('hidden');
        }
    },

    executeMapOpen(pref, lat = this.currentLat, lng = this.currentLng, name = this.currentName) {
        this.setPreference(pref);
        const modal = document.getElementById('map-selection-modal');
        if (modal) modal.classList.add('hidden');

        let url = '';
        if (pref === 'google') {
            url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        } else if (pref === 'naver') {
            // Convert WGS84 to EPSG:3857 (Web Mercator)
            const R = 6378137;
            const x = R * lng * Math.PI / 180;
            const y = R * Math.log(Math.tan((90 + lat) * Math.PI / 360));
            const encodedName = encodeURIComponent(name || 'Location');
            url = `https://map.naver.com/p/entry/address/${x},${y},${encodedName}?c=15,0,0,0,dh`;
        }

        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    },

    init() {
        const pref = this.getPreference();
        if (pref) {
            this.setPreference(pref);
        }
    }
};

// ==================== 多國語言 (i18n) 設定 ====================
const CATEGORY_TRANSLATIONS = {
    'cat-all': { 'zh-Hant': '全部', 'en': 'All' },
    'cat-history': { 'zh-Hant': '歷史文化', 'en': 'History' },
    'cat-landmark': { 'zh-Hant': '地標觀景', 'en': 'Landmarks' },
    'cat-shopping': { 'zh-Hant': '購物美食', 'en': 'Shopping & Food' },
    'cat-nightlife': { 'zh-Hant': '夜生活文化', 'en': 'Nightlife' },
    'cat-entertainment': { 'zh-Hant': '娛樂', 'en': 'Entertainment' },
    'cat-leisure': { 'zh-Hant': '休閒', 'en': 'Leisure' },
    'cat-nature': { 'zh-Hant': '自然景觀', 'en': 'Nature' },
    'cat-wishlist': { 'zh-Hant': '願望s', 'en': 'Wishlist' },
    'cat-pinned': { 'zh-Hant': '釘選', 'en': 'Pinned' },
    'cat-visited': { 'zh-Hant': '去過', 'en': 'Visited' }
};

let currentLanguage = localStorage.getItem('seoul_tour_lang') || 'zh-Hant';

function updateCategoryLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('seoul_tour_lang', lang);
    
    // 替換所有帶有 data-i18n-category 屬性的文字
    document.querySelectorAll('[data-i18n-category]').forEach(el => {
        const catId = el.getAttribute('data-i18n-category');
        if (CATEGORY_TRANSLATIONS[catId] && CATEGORY_TRANSLATIONS[catId][lang]) {
            let text = CATEGORY_TRANSLATIONS[catId][lang];
            if (el.closest('.mobile-tab') && lang === 'zh-Hant') {
                const shortNames = {
                    'cat-history': '歷史',
                    'cat-landmark': '觀景',
                    'cat-shopping': '美食',
                    'cat-nightlife': '夜生活',
                    'cat-nature': '自然'
                };
                if (shortNames[catId]) text = shortNames[catId];
            }
            el.textContent = text;
        }
    });
}

// 對話歷史（保留最近 10 輪對話）
let chatHistory = [];
const MAX_HISTORY = 10;
const CHAT_HISTORY_KEY = 'seoul_tour_chat_history';

function saveChatHistory() {
    try {
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
    } catch (e) {
        console.error('Failed to save chat history', e);
    }
}

function loadChatHistory() {
    try {
        const saved = localStorage.getItem(CHAT_HISTORY_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const container = document.getElementById('chat-messages');
                if (container) {
                    container.innerHTML = '';
                    chatHistory = []; // Reset and rebuild through addMessage
                    parsed.forEach(msg => {
                        const sender = msg.role === 'assistant' ? 'bot' : 'user';
                        addMessage(msg.content, sender, true);
                    });
                }
            }
        }
    } catch (e) {
        console.error('Failed to load chat history', e);
    }
}

// 分類顏色對應
const CATEGORY_COLORS = {
    '歷史文化': '#e74c3c',
    '地標觀景': '#3498db',
    '購物美食': '#f39c12',
    '夜生活文化': '#9b59b6',
    '娛樂': '#e91e63',
    '休閒': '#1abc9c',
    '自然景觀': '#27ae60',
    '用戶釘選': '#1e3a8a',
    '自訂景點': '#8e44ad',
    '願望s': '#ff4757'
};

const CATEGORY_FALLBACK_IMAGES = {
    '歷史文化': 'https://images.unsplash.com/photo-1546874177-9e664107314e?w=800&q=80',
    '地標觀景': 'https://images.unsplash.com/photo-1538622156152-f4bf54c60d92?w=800&q=80',
    '購物美食': 'https://images.unsplash.com/photo-1583234035650-8b4e72ec0b4d?w=800&q=80',
    '夜生活文化': 'https://images.unsplash.com/photo-1517154586052-192e2c7a6e12?w=800&q=80',
    '娛樂': 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?w=800&q=80',
    '休閒': 'https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?w=800&q=80',
    '自然景觀': 'https://images.unsplash.com/photo-1490604001847-b712b0c2f965?w=800&q=80',
    '用戶釘選': 'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&q=80',
    '自訂景點': 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800&q=80',
    '願望s': 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80',
    'default': 'https://images.unsplash.com/photo-1610312278520-bcc893a3ff1d?w=800&q=80',
};

function getFallbackImage(category) {
    return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['default'];
}

// ==================== 地圖初始化 ====================
function initMap() {
    map = L.map('map', {
        center: [37.5665, 126.9780],
        zoom: 13,
        zoomControl: true
    });

    // 建立兩種地圖圖層
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    });
    
    // 使用 Esri World Street Map 作為英文地圖圖層 (清晰英文標籤、免費)
    // 注意：免費英文 tile 喺首爾 zoom 16+ 冇原生高解像數據，用 maxNativeZoom 令 Leaflet 自動放大
    const englishLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
        maxZoom: 19,
        maxNativeZoom: 15
    });

    // 預設顯示 OSM（韓文地圖）
    osmLayer.addTo(map);
    
    // 存儲圖層供後來切換使用
    window.osmLayer = osmLayer;
    window.englishLayer = englishLayer;

    subwayLayerGroup = L.layerGroup().addTo(map);
    routeLayerGroup = L.layerGroup().addTo(map);
    pinnedLayerGroup = L.layerGroup().addTo(map); // 初始化用戶釘選圖層
    searchMarkersLayerGroup = L.layerGroup().addTo(map); // 初始化搜索標記圖層

    map.on("click", onMapClick);
}

// ==================== 地圖點擊搜尋 ====================
function onMapClick(e) {
    if (radiusState.pickingMap) {
        document.getElementById('radius-lat').value = e.latlng.lat.toFixed(6);
        document.getElementById('radius-lng').value = e.latlng.lng.toFixed(6);
        radiusState.pickingMap = false;
        document.getElementById('map').style.cursor = '';
        const pickBtn = document.getElementById('btn-radius-pick-map');
        if (pickBtn) {
            pickBtn.style.backgroundColor = '';
            pickBtn.style.color = '';
        }
        if (document.getElementById('radius-val').value) {
            applyRadiusFilter();
        }
        return;
    }

    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    
    const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(`
            <div class="coord-popup">
                <div class="coord-latlng">📍 ${lat}, ${lng}</div>
                <div class="coord-actions">
                    <button class="pin-location-btn" onclick="openSaveLocationModal(${lat}, ${lng})">
                        <i class="fas fa-save"></i> 儲存此位置
                    </button>
                    <button class="search-nearby-btn" onclick="searchNearby(${lat}, ${lng})">
                        <i class="fas fa-search"></i> 搜尋附近資訊
                    </button>
                    <button class="transport-nearby-btn" onclick="searchNearbyTransport(${lat}, ${lng})">
                        <i class="fas fa-subway"></i> 交通資訊
                    </button>
                </div>
            </div>
        `)
        .openOn(map);
}

async function searchNearby(lat, lng) {
    map.closePopup();
    addMessage(`坐標 ${lat}, ${lng} 附近有咩景點？`, 'user');
    showTyping();
    
    // Find nearby attractions (within ~2km)
    const nearbyAttractions = attractionsData.filter(attr => {
        const dist = map.distance([lat, lng], [attr.lat, attr.lng]);
        return dist < 2000;
    }).map(attr => `${attr.name} (${attr.local_name}) - ${attr.category}`).join('\n');
    
    try {
        const response = await fetch('/api/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, radius: 2000 })
        });
        
        if (response.ok) {
            const data = await response.json();
            const reply = data.reply || `附近景點：\n${nearbyAttractions || '未有記錄'}`;
            hideTyping();
            addMessage(reply, 'bot');
        } else {
            throw new Error('API failed');
        }
    } catch (e) {
        hideTyping();
        const reply = nearbyAttractions 
            ? `附近景點：\n${nearbyAttractions}\n\n（使用離線數據）`
            : '附近未有記錄景點';
        addMessage(reply, 'bot');
    }
}

// ==================== 附近交通查詢 ====================
async function searchNearbyTransport(lat, lng) {
    addMessage(`查詢坐標 ${lat}, ${lng} 附近嘅交通資訊`, 'user');
    showTyping();

    // Find nearby subway stations (within ~2km)
    const nearbyStations = [];
    subwayData.lines.forEach(line => {
        line.stations.forEach(station => {
            const dist = map.distance([lat, lng], [station.lat, station.lng]);
            if (dist < 2000) {
                nearbyStations.push({
                    name: station.name,
                    line: line.name,
                    lineColor: line.color,
                    distance: Math.round(dist),
                    transfer: station.transfer || [],
                    nearby: station.nearby || []
                });
            }
        });
    });

    // Sort by distance
    nearbyStations.sort((a, b) => a.distance - b.distance);

    // Find nearby attractions with transport info
    const nearbyAttractions = attractionsData.filter(attr => {
        const dist = map.distance([lat, lng], [attr.lat, attr.lng]);
        return dist < 1500;
    }).sort((a, b) => {
        return map.distance([lat, lng], [a.lat, a.lng]) - map.distance([lat, lng], [b.lat, b.lng]);
    });

    let reply = '';

    if (nearbyStations.length > 0) {
        reply += `🚇 **附近地鐵站：**\n`;
        nearbyStations.slice(0, 5).forEach(s => {
            const transferInfo = s.transfer.length > 0 
                ? `（可轉乘：${s.transfer.map(t => t).join('、')}）` 
                : '';
            const nearbyInfo = s.nearby.length > 0
                ? ` → 附近景點：${s.nearby.join('、')}`
                : '';
            reply += `• **${s.name}站**（${s.line}）— ${s.distance}m ${transferInfo}${nearbyInfo}\n`;
        });
        reply += '\n';
    } else {
        reply += '🚇 2公里範圍內未有地鐵站記錄\n';
        reply += '💡 提示：你可以試下點擊「🚌 巴士」按鈕嚟獲取更全面嘅實時路面交通資訊。\n\n';
    }

    if (nearbyAttractions.length > 0) {
        reply += `🏛️ **附近景點交通：**\n`;
        nearbyAttractions.slice(0, 4).forEach(attr => {
            const dist = Math.round(map.distance([lat, lng], [attr.lat, attr.lng]));
            reply += `• **${attr.name}**（${dist}m）— 地鐵：${attr.transport.subway}，步程：${attr.transport.time_from_station}\n`;
        });
    }

    if (!reply) {
        reply = '附近未有交通資訊記錄';
    }

    hideTyping();
    addMessage(reply, 'bot');
}

// ==================== 用戶儲存位置功能 ====================
function openSaveLocationModal(lat, lng, initialName = '') {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const defaultName = initialName || `📍 釘選位置 (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    
    // Check if location already exists to pre-fill
    const existing = WishlistManager.get(defaultName, lat, lng);
    const isWish = existing ? existing.wish : false;
    const isPinned = existing ? existing.pinned : true; // Default to pinned if new
    const isVisited = existing ? existing.visited : false;
    const myRemark = existing ? (existing.myRemark || '') : '';

    body.innerHTML = `
        <div class="modal-info">
            <div class="modal-title">儲存位置</div>
            <div class="modal-section">
                <p>名稱：</p>
                <input type="text" id="save-name-input" class="pin-input" placeholder="${defaultName}" value="${defaultName}">
            </div>
            <div class="modal-section save-toggles">
                <label class="toggle-label">
                    <input type="checkbox" id="save-wish-check" ${isWish ? 'checked' : ''}>
                    <i class="fas fa-heart" style="color: #e74c3c;"></i> 想去 (Wish)
                </label>
                <label class="toggle-label">
                    <input type="checkbox" id="save-pinned-check" ${isPinned ? 'checked' : ''}>
                    <i class="fas fa-thumbtack" style="color: #3498db;"></i> 釘選 (Pinned)
                </label>
                <label class="toggle-label">
                    <input type="checkbox" id="save-visited-check" ${isVisited ? 'checked' : ''}>
                    <i class="fas fa-check-circle" style="color: #2ecc71;"></i> 去過 (Visited)
                </label>
            </div>
            <div class="modal-section">
                <p>備註 (Remark)：</p>
                <textarea id="save-remark-input" class="pin-input" rows="3" placeholder="加入你的備註...">${myRemark}</textarea>
            </div>
            <div class="modal-actions">
                <button class="btn-route" id="confirm-save-btn">
                    <i class="fas fa-check"></i> 儲存
                </button>
                <button class="btn-wishlist-modal" onclick="closeModal()">
                    <i class="fas fa-times"></i> 取消
                </button>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    
    // 自動聚焦輸入框並選中文字
    const input = document.getElementById('save-name-input');
    setTimeout(() => {
        if (!initialName) {
            input.focus();
            input.select();
        }
    }, 100);

    // 綁定確認按鈕
    document.getElementById('confirm-save-btn').onclick = () => {
        const name = input.value.trim() || defaultName;
        const wish = document.getElementById('save-wish-check').checked;
        const pinned = document.getElementById('save-pinned-check').checked;
        const visited = document.getElementById('save-visited-check').checked;
        const remark = document.getElementById('save-remark-input').value.trim();
        
        saveLocationData(name, lat, lng, wish, pinned, visited, remark);
        closeModal();
    };
}

function saveLocationData(name, lat, lng, wish, pinned, visited, remark) {
    const item = {
        name: name,
        lat: lat,
        lng: lng,
        category: '自訂景點',
        description: `用戶手動儲存的位置 (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        wish: wish,
        pinned: pinned,
        visited: visited,
        myRemark: remark
    };
    
    const added = WishlistManager.add(item);
    
    if (added) {
        if (map) map.closePopup();
        // 顯示提示
        const toast = document.createElement('div');
        toast.className = 'wishlist-toast';
        toast.innerHTML = `<i class="fas fa-save" style="color:#2ecc71"></i> 已儲存「${name}」`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
}

function renderPinnedMarkers() {
    if (!pinnedLayerGroup) return;
    pinnedLayerGroup.clearLayers();
    
    const items = WishlistManager.getAll();
    
    items.forEach(item => {
        if (item.pinned) {
            const color = CATEGORY_COLORS['自訂景點'] || '#1e3a8a';
            
            // 自定義 Pin 圖標
            const iconHtml = `<div class="pin-marker">
                <i class="fas fa-thumbtack"></i>
            </div>`;
            
            const customIcon = L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            
            const marker = L.marker([item.lat, item.lng], { icon: customIcon })
                .addTo(pinnedLayerGroup)
                .bindPopup(`
                    <div class="popup-card">
                        <div class="popup-info">
                            <div class="popup-name">${item.name}</div>
                            <span class="popup-cat" style="background:${color}">${item.category || '釘選位置'}</span>
                            <div class="popup-desc">坐標：${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</div>
                            <button class="popup-btn" style="background:#f39c12; margin-bottom: 5px;" onclick="openSaveLocationModal(${item.lat}, ${item.lng}, '${item.name.replace(/'/g, "\\'")}')">
                                編輯備註
                            </button>
                            <button class="popup-btn" style="background:#e74c3c" onclick="WishlistManager.remove('${item.id}')">
                                移除釘選
                            </button>
                        </div>
                    </div>
                `);
        }
    });
}

// ==================== 載入資料 ====================
async function loadData() {
    try {
        const [attrRes, subwayRes] = await Promise.all([
            fetch('static/data/preset_locations.json'),
            fetch('static/data/subway.json')
        ]);
        
        if (!attrRes.ok) throw new Error(`HTTP error! status: ${attrRes.status}`);
        
        const attrData = await attrRes.json();
        const subData = await subwayRes.json();

        if (attrData && Array.isArray(attrData.attractions)) {
            attractionsData = attrData.attractions;
        } else {
            console.warn('警告：preset_locations.json 中的 attractions 不是有效的陣列。');
            attractionsData = [];
        }
        
        subwayData = subData;
    } catch (e) {
        console.error('載入資料失敗:', e);
        attractionsData = [];
    }
}

let panelSearchQuery = '';
let panelSearchTimeout = null;

function setPanelSearchQuery(query) {
    panelSearchQuery = query;
}

function handlePanelSearchInput(e) {
    const query = e.target.value;
    
    // Show loading spinners
    document.getElementById('desktop-search-loading')?.classList.remove('hidden');
    document.getElementById('mobile-search-loading')?.classList.remove('hidden');
    
    // Sync both inputs
    const desktopInput = document.getElementById('desktop-search-input');
    const mobileInput = document.getElementById('mobile-search-input');
    if (desktopInput && desktopInput !== e.target) desktopInput.value = query;
    if (mobileInput && mobileInput !== e.target) mobileInput.value = query;

    // Show/hide clear buttons
    const desktopClear = document.getElementById('desktop-search-clear');
    const mobileClear = document.getElementById('mobile-search-clear');
    if (query) {
        desktopClear?.classList.remove('hidden');
        mobileClear?.classList.remove('hidden');
    } else {
        desktopClear?.classList.add('hidden');
        mobileClear?.classList.add('hidden');
    }

    if (panelSearchTimeout) clearTimeout(panelSearchTimeout);
    panelSearchTimeout = setTimeout(() => {
        panelSearchQuery = query;
        renderAttractionList();
        renderMobilePanelList();
        addMarkers();
        
        // Hide loading spinners
        document.getElementById('desktop-search-loading')?.classList.add('hidden');
        document.getElementById('mobile-search-loading')?.classList.add('hidden');
    }, 300);
}

function clearPanelSearch() {
    const desktopInput = document.getElementById('desktop-search-input');
    const mobileInput = document.getElementById('mobile-search-input');
    if (desktopInput) desktopInput.value = '';
    if (mobileInput) mobileInput.value = '';
    
    document.getElementById('desktop-search-clear')?.classList.add('hidden');
    document.getElementById('mobile-search-clear')?.classList.add('hidden');
    
    panelSearchQuery = '';
    renderAttractionList();
    renderMobilePanelList();
    addMarkers();
}

// ==================== Radius Filter Logic ====================
function toggleRadiusPanel() {
    const panel = document.getElementById('radius-panel');
    const toggleBtn = document.getElementById('toggle-radius-filter');
    if (panel) {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            const routePanel = document.getElementById('route-panel');
            if (routePanel) routePanel.classList.add('hidden');
            if (toggleBtn) toggleBtn.classList.add('active');
            
            // 載入預設範圍設定 (若欄位為空)
            const radiusValInput = document.getElementById('radius-val');
            const radiusUnitInput = document.getElementById('radius-unit');
            if (radiusValInput && !radiusValInput.value) {
                const defaultVal = localStorage.getItem('seoul_tour_radius_val');
                if (defaultVal) radiusValInput.value = defaultVal;
            }
            if (radiusUnitInput) {
                const defaultUnit = localStorage.getItem('seoul_tour_radius_unit');
                if (defaultUnit) radiusUnitInput.value = defaultUnit;
            }
        } else {
            if (toggleBtn) toggleBtn.classList.remove('active');
        }
    }
}

function parseRadiusSlashCommand(argsText) {
    if (!argsText) {
        toggleRadiusPanel();
        return;
    }
    const parts = argsText.trim().split(/\s+/);
    if (parts.length >= 3) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        const distStr = parts[2];
        let radius = parseFloat(distStr);
        let unit = distStr.toLowerCase().includes('mi') ? 'mi' : 'km';
        
        if (!isNaN(lat) && !isNaN(lng) && !isNaN(radius)) {
            document.getElementById('radius-lat').value = lat;
            document.getElementById('radius-lng').value = lng;
            document.getElementById('radius-val').value = radius;
            document.getElementById('radius-unit').value = unit;
            
            const panel = document.getElementById('radius-panel');
            if (panel && panel.classList.contains('hidden')) {
                toggleRadiusPanel();
            }
            applyRadiusFilter();
            return;
        }
    }
    addMessage('⚠️ /radius 指令格式錯誤。請使用: /radius [緯度] [經度] [距離][單位]，例如: /radius 37.56 126.97 5km，或就咁輸入 /radius 開啟面板', 'bot');
}

function applyRadiusFilter() {
    const lat = parseFloat(document.getElementById('radius-lat').value);
    const lng = parseFloat(document.getElementById('radius-lng').value);
    const val = parseFloat(document.getElementById('radius-val').value);
    const unit = document.getElementById('radius-unit').value;

    if (isNaN(lat) || isNaN(lng) || isNaN(val) || val <= 0) {
        return;
    }
    
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        alert('緯度必須在 -90 到 90 之間，經度必須在 -180 到 180 之間');
        return;
    }

    radiusState.active = true;
    radiusState.lat = lat;
    radiusState.lng = lng;
    radiusState.radiusMeters = unit === 'mi' ? val * 1609.344 : val * 1000;

    updateRadiusVisuals();
    
    renderAttractionList();
    renderMobilePanelList();
    addMarkers();
}

function clearRadiusFilter() {
    radiusState.active = false;
    document.getElementById('radius-lat').value = '';
    document.getElementById('radius-lng').value = '';
    document.getElementById('radius-val').value = '';
    
    if (radiusState.circleLayer && map) {
        map.removeLayer(radiusState.circleLayer);
        radiusState.circleLayer = null;
    }
    
    renderAttractionList();
    renderMobilePanelList();
    addMarkers();
}

function updateRadiusVisuals() {
    if (!map || !radiusState.active) return;
    
    if (radiusState.circleLayer) {
        map.removeLayer(radiusState.circleLayer);
    }
    
    radiusState.circleLayer = L.circle([radiusState.lat, radiusState.lng], {
        color: '#e74c3c',
        fillColor: '#f39c12',
        fillOpacity: 0.2,
        radius: radiusState.radiusMeters
    }).addTo(map);
    
    map.fitBounds(radiusState.circleLayer.getBounds());
}

function getFilteredAttractions(category) {
    // 獲取所有自訂/同步的景點
    const customItems = WishlistManager.getAll().map(item => {
        return {
            id: item.id,
            name: item.name,
            local_name: '',
            lat: item.lat,
            lng: item.lng,
            category: item.category || '自訂景點',
            image: '',
            ticket: item.price || '',
            description: item.description || ''
        };
    });

    // 合併內建景點與自訂景點（避免重複）
    let combined = [...attractionsData];
    customItems.forEach(customItem => {
        const exists = combined.some(a => a.name === customItem.name && Math.abs(a.lat - customItem.lat) < 0.0001);
        if (!exists) {
            combined.push(customItem);
        }
    });

    let items = combined;

    if (panelSearchQuery && panelSearchQuery.trim() !== '') {
        const query = panelSearchQuery.toLowerCase().trim();
        items = items.filter(item => {
            const name = (item.name || '').toLowerCase();
            const localName = (item.local_name || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const cat = (item.category || '').toLowerCase();
            const ticket = (item.ticket || '').toLowerCase();

            return name.includes(query) || 
                   localName.includes(query) ||
                   desc.includes(query) ||
                   cat.includes(query) ||
                   ticket.includes(query);
        });
    }

    if (radiusState.active) {
        items = items.filter(item => {
            if (item.lat == null || item.lng == null) return false;
            const dist = calculateHaversineDistance(radiusState.lat, radiusState.lng, item.lat, item.lng);
            return dist <= radiusState.radiusMeters;
        });
    }

    if (category === 'all') {
        return items;
    } else if (category === '願望s' || category === 'pinned' || category === 'visited') {
        if (category === '願望s') {
            items = items.filter(item => {
                const w = WishlistManager.get(item.name, item.lat, item.lng);
                return w && w.wish;
            });
        } else if (category === 'pinned') {
            items = items.filter(item => {
                const w = WishlistManager.get(item.name, item.lat, item.lng);
                return w && w.pinned;
            });
        } else if (category === 'visited') {
            items = items.filter(item => {
                const w = WishlistManager.get(item.name, item.lat, item.lng);
                return w && w.visited;
            });
        }
        return items;
    } else {
        return items.filter(a => a.category === category);
    }
}

// ==================== 景點列表 ====================
function renderAttractionList() {
    const container = document.getElementById('attraction-list');
    if (!container) return;
    container.innerHTML = '';

    // 1. 渲染搜索結果（如果有）
    if (currentSearchResults && currentSearchResults.length > 0) {
        const searchResultsHeader = document.createElement('div');
        searchResultsHeader.className = 'search-results-header';
        searchResultsHeader.innerHTML = `
            <div class="search-results-title">
                <i class="fas fa-search"></i> 搜索結果
                <button class="clear-search-results" onclick="clearSearchResultsFromList()" title="清除搜索結果">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(searchResultsHeader);

        currentSearchResults.forEach(place => {
            const category = place.category || '搜索結果';
            const color = CATEGORY_COLORS[category] || '#667eea';
            const searchId = `search-${place.lat.toFixed(4)}-${place.lng.toFixed(4)}`;

            const item = document.createElement('div');
            item.className = 'attraction-item search-result-item';
            item.dataset.searchId = searchId;
            item.dataset.lat = place.lat;
            item.dataset.lng = place.lng;

            item.innerHTML = `
                <img class="thumb" src="${place.image || getFallbackImage(category)}" alt="Photo of ${place.name}" loading="lazy"
                     onerror="this.onerror=null; this.src=getFallbackImage('${category}');">
                <div class="info">
                    <div class="name">${place.name}</div>
                    <span class="category-tag" style="background:${color}">${category}</span>
                    <div class="desc">${place.description ? place.description.substring(0, 60) + '...' : '搜索結果'}</div>
                </div>
                <div class="search-item-actions">
                    <button class="fly-to-btn" onclick="event.stopPropagation(); flyToSearchResult(${place.lat}, ${place.lng}, '${escapeHtml(place.name)}')" title="跳轉到地圖位置">
                        <i class="fas fa-crosshairs"></i>
                    </button>
                    <button class="wishlist-btn ${WishlistManager.has(place.name, place.lat, place.lng) ? 'in-wishlist' : ''}" 
                            data-name="${place.name}" data-lat="${place.lat}" data-lng="${place.lng}" 
                            data-category="${category}" data-description="${place.description || ''}"
                            onclick="event.stopPropagation(); toggleWishlist(this)" title="加入願望清單">
                        <i class="${WishlistManager.has(place.name, place.lat, place.lng) ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                </div>
            `;

            item.addEventListener('click', () => {
                flyToSearchResult(place.lat, place.lng, place);
            });

            container.appendChild(item);
        });
    }

    // 2. 渲染景點列表
    let filtered = getFilteredAttractions(activeCategory);

    if (filtered.length === 0 && (!currentSearchResults || currentSearchResults.length === 0)) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #888;">沒有找到景點資料</div>';
        return;
    }

    filtered.forEach(attr => {
        const item = document.createElement('div');
        item.className = 'attraction-item';
        item.dataset.id = attr.id || '';

        const color = CATEGORY_COLORS[attr.category] || '#666';
        const customData = WishlistManager.get(attr.name, attr.lat, attr.lng);
        
        let badges = '';
        if (customData?.wish) badges += '<span class="badge-icon" title="想去">❤️</span>';
        if (customData?.pinned) badges += '<span class="badge-icon" title="釘選">📌</span>';
        if (customData?.visited) badges += '<span class="badge-icon" title="去過">✅</span>';

        let remarkHtml = '';
        if (customData?.myRemark) {
            remarkHtml = `<div class="remark-text"><i class="fas fa-comment-dots"></i> ${customData.myRemark}</div>`;
        }

        const safeName = attr.name || '未知景點';
        const safeCategory = attr.category || '未分類';
        const safeTicket = attr.ticket || '';
        const safeDesc = attr.description ? attr.description : '';
        const safeDescShort = safeDesc.length > 60 ? safeDesc.substring(0, 60) + '...' : safeDesc;

        item.innerHTML = `
            <img class="thumb" src="${attr.image || getFallbackImage(attr.category)}" alt="Photo of ${safeName}" loading="lazy"
                 onerror="this.onerror=null; this.src=getFallbackImage('${attr.category}');">
            <div class="info">
                <div class="name">${safeName} ${badges}</div>
                <span class="category-tag" style="background:${color}">${safeCategory}</span>
                ${safeTicket ? `<span class="attraction-price">💰 ${safeTicket}</span>` : ''}
                <div class="desc">${safeDesc}</div>
                ${remarkHtml}
            </div>
            <button class="wishlist-btn ${WishlistManager.has(attr.name, attr.lat, attr.lng) ? 'in-wishlist' : ''}" 
                    data-name="${attr.name || ''}" data-lat="${attr.lat || 0}" data-lng="${attr.lng || 0}" 
                    data-category="${attr.category || ''}" data-price="${attr.ticket || ''}" 
                    data-description="${safeDescShort}"
                    onclick="event.stopPropagation(); toggleWishlist(this)" title="加入願望清單">
                <i class="${WishlistManager.has(attr.name, attr.lat, attr.lng) ? 'fas' : 'far'} fa-heart"></i>
            </button>
        `;

        item.addEventListener('click', () => {
            focusAttraction(attr);
        });

        container.appendChild(item);
    });
}

// ==================== 地圖標記 ====================
function addMarkers() {
    if (!map) return;
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    let filtered = getFilteredAttractions(activeCategory);

    // Group by exact lat, lng
    const grouped = {};
    filtered.forEach(attr => {
        const key = `${attr.lat},${attr.lng}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(attr);
    });

    Object.values(grouped).forEach(group => {
        if (group.length === 1) {
            const attr = group[0];
            const customData = WishlistManager.get(attr.name, attr.lat, attr.lng);
            const isVisited = customData && customData.visited;
            const color = isVisited ? '#b0b0b0' : (CATEGORY_COLORS[attr.category] || '#666');

            // 自訂圖標
            const iconHtml = `<div class="custom-marker" style="border-color:${color};background:${color}">
                <i class="fas fa-map-marker-alt" style="font-size:16px"></i>
            </div>`;

            const customIcon = L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([attr.lat, attr.lng], { icon: customIcon })
                .addTo(map)
                .bindPopup(createPopupContent(attr));

            // 點擊 marker 只顯示 popup 氣泡，唔彈出 modal 對話框
            markers[attr.id] = marker;
        } else {
            const firstAttr = group[0];
            // Check if all items in this group are marked as visited
            const allVisited = group.every(attr => {
                const data = WishlistManager.get(attr.name, attr.lat, attr.lng);
                return data && data.visited;
            });
            // Use the first item's color for the marker, unless all are visited
            const color = allVisited ? '#b0b0b0' : (CATEGORY_COLORS[firstAttr.category] || '#666');

            // 自訂圖標 (with badge)
            const iconHtml = `<div class="custom-marker" style="border-color:${color};background:${color}">
                <i class="fas fa-map-marker-alt" style="font-size:16px"></i>
                <div class="multi-badge">${group.length}</div>
            </div>`;

            const customIcon = L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([firstAttr.lat, firstAttr.lng], { icon: customIcon })
                .addTo(map)
                .bindPopup(createMultiPopupContent(group));

            // Map all IDs in this group to the same marker
            group.forEach(attr => {
                markers[attr.id] = marker;
            });
        }
    });
}

function createMultiPopupContent(group) {
    let html = `<div class="multi-popup-container">
        <div class="multi-popup-header">📍 這裡有 ${group.length} 個景點</div>
        <div class="multi-popup-list">`;
    
    group.forEach((attr, index) => {
        html += createPopupContent(attr);
        if (index < group.length - 1) {
            html += `<hr class="multi-popup-divider">`;
        }
    });

    html += `</div></div>`;
    return html;
}

function createPopupContent(attr) {
    const color = CATEGORY_COLORS[attr.category] || '#666';
    return `
        <div class="popup-card">
            <img src="${attr.image || getFallbackImage(attr.category)}" alt="Photo of ${attr.name}" onerror="this.onerror=null; this.src=getFallbackImage('${attr.category}');">
            <div class="popup-info">
                <div class="popup-name">${attr.name}</div>
                <div class="popup-ko">${attr.local_name}</div>
                <span class="popup-cat" style="background:${color}">${attr.category}</span>
                <div class="popup-desc">${attr.description.substring(0, 80)}...</div>
                <button class="popup-btn" onclick="showAttractionDetailById('${attr.id}')">
                    查看詳情
                </button>
            </div>
        </div>
    `;
}

// ==================== 聚焦景點 ====================
function focusAttraction(attr) {
    map.setView([attr.lat, attr.lng], 16);
    const marker = markers[attr.id];
    if (marker) {
        marker.openPopup();
    }

    // 高亮列表項目
    document.querySelectorAll('.attraction-item').forEach(item => {
        item.style.background = item.dataset.id === attr.id ? '#e8ecff' : '';
    });
}

// ==================== 景點詳情彈窗 ====================
function showAttractionDetailById(id) {
    let attr = attractionsData.find(a => a.id === id);
    if (!attr) {
        const customItems = WishlistManager.getAll();
        const customItem = customItems.find(item => item.id === id);
        if (customItem) {
            attr = {
                id: customItem.id,
                name: customItem.name,
                local_name: '',
                lat: customItem.lat,
                lng: customItem.lng,
                category: customItem.category || '自訂景點',
                image: '',
                ticket: customItem.price || '無',
                description: customItem.description || '無詳細描述',
                highlights: ['用戶自訂景點'],
                transport: { subway: '無', time_from_station: '無' },
                hours: '無',
                tips: customItem.myRemark || '無小貼士'
            };
        }
    }
    if (attr) showAttractionDetail(attr);
}

function showAttractionDetail(attr) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const color = CATEGORY_COLORS[attr.category] || '#666';

    const highlights = attr.highlights.map(h => `<li>${h}</li>`).join('');

    body.innerHTML = `
        <img class="modal-hero" src="${attr.image || getFallbackImage(attr.category)}" alt="Photo of ${attr.name}" onerror="this.onerror=null; this.src=getFallbackImage('${attr.category}');">
        <div class="modal-info">
            <div class="modal-title">${attr.name}</div>
            <div class="modal-ko">${attr.local_name}</div>
            <span class="modal-cat" style="background:${color}">${attr.category}</span>

            <div class="modal-section">
                <h4><i class="fas fa-info-circle"></i> 簡介</h4>
                <p>${attr.description}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-star"></i> 必睇亮點</h4>
                <ul>${highlights}</ul>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-utensils"></i> 當地美食推薦</h4>
                <p>${attr.local_cuisine ? (Array.isArray(attr.local_cuisine) ? attr.local_cuisine.join('、') : attr.local_cuisine) : '無'}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-calendar-alt"></i> 最佳旅遊季節</h4>
                <p>${attr.best_seasons ? (Array.isArray(attr.best_seasons) ? attr.best_seasons.join('、') : attr.best_seasons) : '四季皆宜'}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-clock"></i> 建議逗留時間</h4>
                <p>${attr.stay_duration || '無'}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-comment-dots"></i> 旅客真實評價</h4>
                <p>${attr.visitor_insights || '無'}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-subway"></i> 交通資訊</h4>
                <p><strong>交通：</strong>${attr.transport ? attr.transport.subway : '無'}</p>
                <p><strong>步程：</strong>${attr.transport ? attr.transport.time_from_station : '無'}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-ticket-alt"></i> 門票</h4>
                <p>${attr.ticket || '無'}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-clock"></i> 開放時間</h4>
                <p>${attr.hours || '無'}</p>
            </div>

            <div class="modal-tips">
                <i class="fas fa-lightbulb"></i>
                <strong>小貼士：</strong>${attr.tips || '無'}
            </div>
            
            <div class="modal-section">
                <h4><i class="fas fa-link"></i> 參考來源</h4>
                <div style="font-size: 0.9em; word-break: break-all;">
                    ${attr.source_urls ? attr.source_urls.map(url => `<a href="${url}" target="_blank" style="color: #3498db; text-decoration: none; display: block; margin-bottom: 4px;">${url}</a>`).join('') : '無'}
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-route" onclick="planRouteTo('${attr.id}')">
                    <i class="fas fa-route"></i> 規劃路線
                </button>
                <button class="btn-open-map" onclick="MapManager.openMap(${attr.lat}, ${attr.lng}, '${attr.name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-map-marker-alt"></i> 開啟地圖
                </button>
                <button class="btn-wishlist-modal ${WishlistManager.has(attr.name, attr.lat, attr.lng) ? 'in-wishlist' : ''}"
                        data-name="${attr.name}" data-lat="${attr.lat}" data-lng="${attr.lng}"
                        data-category="${attr.category}" data-price="${attr.ticket}"
                        data-description="${attr.description.substring(0, 60)}"
                        onclick="toggleWishlist(this); showAttractionDetailById('${attr.id}');">
                    <i class="${WishlistManager.has(attr.name, attr.lat, attr.lng) ? 'fas' : 'far'} fa-heart"></i>
                    ${WishlistManager.has(attr.name, attr.lat, attr.lng) ? '已收藏' : '加入願望清單'}
                </button>
                <button class="btn-route" style="background-color: #f39c12; margin-top: 10px; width: 100%;" onclick="openSaveLocationModal(${attr.lat}, ${attr.lng}, '${attr.name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-edit"></i> 加入/編輯備註
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// ==================== 設置彈窗 ====================
window.openSettingsModal = function() {
    document.getElementById('setting-lang').value = localStorage.getItem('seoul_tour_lang') || 'zh-Hant';
    document.getElementById('setting-map-provider').value = localStorage.getItem('tour_map_preference') || 'google';
    document.getElementById('setting-radius-val').value = localStorage.getItem('seoul_tour_radius_val') || '';
    document.getElementById('setting-radius-unit').value = localStorage.getItem('seoul_tour_radius_unit') || 'km';

    document.getElementById('settings-modal').classList.remove('hidden');
};

window.closeSettingsModal = function() {
    document.getElementById('settings-modal').classList.add('hidden');
};

window.saveSettings = function() {
    const lang = document.getElementById('setting-lang').value;
    const mapProvider = document.getElementById('setting-map-provider').value;
    const radiusVal = document.getElementById('setting-radius-val').value;
    const radiusUnit = document.getElementById('setting-radius-unit').value;

    localStorage.setItem('seoul_tour_lang', lang);
    localStorage.setItem('tour_map_preference', mapProvider);
    if (radiusVal) {
        localStorage.setItem('seoul_tour_radius_val', radiusVal);
    } else {
        localStorage.removeItem('seoul_tour_radius_val');
    }
    localStorage.setItem('seoul_tour_radius_unit', radiusUnit);

    closeSettingsModal();
    
    // 重新載入頁面以套用語言與地圖等設定
    location.reload();
};

// ==================== 路線規劃 ====================
function initRoutePanel() {
    const startSelect = document.getElementById('route-start');
    const endSelect = document.getElementById('route-end');

    attractionsData.forEach(attr => {
        const opt1 = new Option(attr.name, attr.id);
        const opt2 = new Option(attr.name, attr.id);
        startSelect.add(opt1);
        endSelect.add(opt2);
    });
}

function planRouteTo(attrId) {
    closeModal();
    const panel = document.getElementById('route-panel');
    panel.classList.remove('hidden');
    document.getElementById('route-end').value = attrId;
    document.getElementById('route-start').focus();
}

document.getElementById('calculate-route').addEventListener('click', calculateRoute);

function calculateRoute() {
    const startId = document.getElementById('route-start').value;
    const endId = document.getElementById('route-end').value;
    const resultDiv = document.getElementById('route-result');

    if (!startId || !endId) {
        resultDiv.innerHTML = '<p style="color:#e74c3c">請選擇起點同終點</p>';
        return;
    }

    if (startId === endId) {
        resultDiv.innerHTML = '<p style="color:#e74c3c">起點同終點唔可以一樣</p>';
        return;
    }

    const start = attractionsData.find(a => a.id === startId);
    const end = attractionsData.find(a => a.id === endId);

    // 檢查預設交通時間
    const key1 = `${start.name}-${end.name}`;
    const key2 = `${end.name}-${start.name}`;
    const travelInfo = subwayData.travel_times[key1] || subwayData.travel_times[key2];

    // 繪製路線
    routeLayerGroup.clearLayers();

    const latlngs = [
        [start.lat, start.lng],
        [end.lat, end.lng]
    ];

    // 直線路線（視覺化，非真實路徑）
    const polyline = L.polyline(latlngs, {
        color: '#667eea',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(routeLayerGroup);

    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

    // 顯示結果
    let html = `
        <div class="route-step">
            <div class="route-icon"><i class="fas fa-map-marker-alt"></i></div>
            <span><strong>起點：</strong>${start.name}</span>
        </div>
    `;

    if (travelInfo) {
        html += `
            <div class="route-step">
                <div class="route-icon"><i class="fas fa-subway"></i></div>
                <span>${travelInfo}</span>
            </div>
        `;
    } else {
        // 估算距離同時間
        const dist = getDistance(start.lat, start.lng, end.lat, end.lng);
        const estTime = Math.ceil(dist / 0.5); // 假設地鐵平均 30km/h
        html += `
            <div class="route-step">
                <div class="route-icon"><i class="fas fa-subway"></i></div>
                <span>約 ${dist.toFixed(1)} 公里，估計車程約 ${estTime} 分鐘（建議查詢Naver Map獲取準確路線）</span>
            </div>
        `;
    }

    html += `
        <div class="route-step">
            <div class="route-icon"><i class="fas fa-flag-checkered"></i></div>
            <span><strong>終點：</strong>${end.name}</span>
        </div>
    `;

    // 終點交通資訊
    html += `
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #ccc">
            <strong>${end.name}交通：</strong>${end.transport.subway}
        </div>
    `;

    resultDiv.innerHTML = html;
}

// 計算兩點距離（km）
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ==================== 地鐵線顯示 ====================
let subwayVisible = false;

document.getElementById('toggle-subway').addEventListener('click', function() {
    subwayVisible = !subwayVisible;
    this.classList.toggle('active');

    subwayLayerGroup.clearLayers();

    if (subwayVisible) {
        subwayData.lines.forEach(line => {
            // 繪製路徑
            if (line.paths && line.paths.length > 0) {
                line.paths.forEach(path => {
                    L.polyline(path, {
                        color: line.color,
                        weight: 4,
                        opacity: 0.7
                    }).addTo(subwayLayerGroup);
                });
            } else if (line.stations && line.stations.length > 0) {
                // 回退到舊格式
                const latlngs = line.stations.map(s => [s.lat, s.lng]);
                L.polyline(latlngs, {
                    color: line.color,
                    weight: 4,
                    opacity: 0.7
                }).addTo(subwayLayerGroup);
            }

            // 繪製車站標記
            if (line.stations) {
                line.stations.forEach(station => {
                    L.circleMarker([station.lat, station.lng], {
                        radius: 4, // 稍微縮小標記
                        fillColor: line.color,
                        color: 'white',
                        weight: 1,
                        fillOpacity: 1
                    }).addTo(subwayLayerGroup)
                    .bindPopup(`<b>${station.name}站</b><br>${station.local_name}<br>${line.name}`);
                });
            }
        });
    }
});

// ==================== 交通時間顯示 ====================
let trafficVisible = false;

document.getElementById('toggle-traffic').addEventListener('click', function() {
    trafficVisible = !trafficVisible;
    this.classList.toggle('active');

    if (trafficVisible) {
        const panel = document.getElementById('route-panel');
        panel.classList.remove('hidden');
    } else {
        document.getElementById('route-panel').classList.add('hidden');
        routeLayerGroup.clearLayers();
    }
});

// ==================== 重置地圖 ====================
document.getElementById('reset-map').addEventListener('click', () => {
    map.setView([37.5665, 126.9780], 13);
    routeLayerGroup.clearLayers();
    document.getElementById('route-panel').classList.add('hidden');
    trafficVisible = false;
    document.getElementById('toggle-traffic').classList.remove('active');
});


// ==================== AI 路線顯示 ====================
function showRouteOnMap(fromName, toName) {
    // 嘗試用名稱或ID搵景點
    const fromAttr = attractionsData.find(a => 
        a.id === fromName || a.name.includes(fromName) || a.local_name.includes(fromName)
    );
    const toAttr = attractionsData.find(a => 
        a.id === toName || a.name.includes(toName) || a.local_name.includes(toName)
    );
    
    if (!fromAttr || !toAttr) {
        console.warn('找不到景點:', fromName, toName);
        return;
    }
    
    // 如果起點終點相同，唔畫路線
    if (fromAttr.id === toAttr.id) {
        focusAttraction(fromAttr);
        return;
    }
    
    // 清空之前嘅路線
    routeLayerGroup.clearLayers();
    
    // 繪製路線
    const latlngs = [
        [fromAttr.lat, fromAttr.lng],
        [toAttr.lat, toAttr.lng]
    ];
    
    const polyline = L.polyline(latlngs, {
        color: '#667eea',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(routeLayerGroup);
    
    // 自動 fit 路線範圍
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    
    // 顯示起點終點標記
    const startIcon = L.divIcon({
        html: '<div class="route-marker start"><i class="fas fa-play"></i></div>',
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
    const endIcon = L.divIcon({
        html: '<div class="route-marker end"><i class="fas fa-flag"></i></div>',
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
    
    L.marker([fromAttr.lat, fromAttr.lng], { icon: startIcon })
        .addTo(routeLayerGroup)
        .bindPopup(`<b>起點：</b>${fromAttr.name}`);
    
    L.marker([toAttr.lat, toAttr.lng], { icon: endIcon })
        .addTo(routeLayerGroup)
        .bindPopup(`<b>終點：</b>${toAttr.name}`);
    
    // 計算直線距離同估計時間
    const dist = getDistance(fromAttr.lat, fromAttr.lng, toAttr.lat, toAttr.lng);
    const estTime = Math.ceil(dist / 0.5); // 假設地鐵平均 30km/h
    console.log(`路線：${fromAttr.name} → ${toAttr.name}，距離 ${dist.toFixed(1)}km，估計 ${estTime} 分鐘`);
}

// ==================== 分類篩選 ====================
function bindEvents() {
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.category;
            renderAttractionList();
            addMarkers();
            // 同步手機版 panel tabs
            document.querySelectorAll('.mobile-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.category === activeCategory);
            });
            renderMobilePanelList();
        });
    });

    // 點擊彈窗外部關閉
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });

    // Enter 發送訊息
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // 地圖語言切換
    function toggleMapLanguage() {
        if (map.hasLayer(window.osmLayer)) {
            // 切換到英文地圖
            map.removeLayer(window.osmLayer);
            map.addLayer(window.englishLayer);
        } else {
            // 切換到韓文地圖
            map.removeLayer(window.englishLayer);
            map.addLayer(window.osmLayer);
        }
    }
    // 定位我的位置
    const locateUserBtn = document.getElementById('locate-user');
    if (locateUserBtn) {
        locateUserBtn.addEventListener('click', locateUser);
    }

    // 設置彈窗事件
    const openSettingsBtn = document.getElementById('open-settings');
    const burgerSettings = document.getElementById('burger-settings');
    
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettingsModal);
    if (burgerSettings) {
        burgerSettings.addEventListener('click', () => {
            const dropdown = document.getElementById('burger-dropdown');
            if (dropdown) dropdown.classList.remove('show');
            openSettingsModal();
        });
    }

    // Radius Filter 事件
    const btnRadiusApply = document.getElementById('btn-radius-apply');
    const btnRadiusClear = document.getElementById('btn-radius-clear');
    const btnRadiusPickMap = document.getElementById('btn-radius-pick-map');
    const toggleRadiusBtn = document.getElementById('toggle-radius-filter');
    
    if (toggleRadiusBtn) toggleRadiusBtn.addEventListener('click', toggleRadiusPanel);
    if (btnRadiusApply) btnRadiusApply.addEventListener('click', applyRadiusFilter);
    if (btnRadiusClear) btnRadiusClear.addEventListener('click', clearRadiusFilter);
    if (btnRadiusPickMap) {
        btnRadiusPickMap.addEventListener('click', () => {
            radiusState.pickingMap = !radiusState.pickingMap;
            if (radiusState.pickingMap) {
                document.getElementById('map').style.cursor = 'crosshair';
                btnRadiusPickMap.style.backgroundColor = '#2c3e50';
                btnRadiusPickMap.style.color = '#fff';
            } else {
                document.getElementById('map').style.cursor = '';
                btnRadiusPickMap.style.backgroundColor = '';
                btnRadiusPickMap.style.color = '';
            }
        });
    }

    let radiusDebounceTimer;
    ['radius-lat', 'radius-lng', 'radius-val', 'radius-unit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                clearTimeout(radiusDebounceTimer);
                radiusDebounceTimer = setTimeout(() => {
                    const val = document.getElementById('radius-val').value;
                    if (document.getElementById('radius-lat').value && document.getElementById('radius-lng').value && val && val > 0) {
                        applyRadiusFilter();
                    }
                }, 500);
            });
        }
    });
}

// 應用程式生命週期事件監聽（確保切換至背景時儲存聊天記錄）
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveChatHistory();
    }
});
window.addEventListener('pagehide', () => {
    saveChatHistory();
});

// ==================== AI 聊天功能 & 地圖控制 ====================
let useBackendAI = true; // 優先使用後端 AI

/**

/**
 * 解析 AI 回覆中的地圖指令
 * 指令格式：【{"type":"map_action","action":"...","params":{...}}】
 * @param {string} reply - AI 原始回覆
 * @returns {string} 清除指令後的純文字回覆
 */
function parseMapActions(reply) {
    if (!reply) return reply;

    // 匹配【...】內的 JSON 指令
    const commandPattern = /【\s*({[^}][\s\S]*?})\s*】/g;
    let cleanReply = reply;
    let match;

    while ((match = commandPattern.exec(reply)) !== null) {
        try {
            const cmdJson = match[1];
            const cmd = JSON.parse(cmdJson);

            if (cmd.type === 'map_action' && cmd.action) {
                // 異步執行地圖動作
                executeMapAction(cmd.action, cmd.params || {});
                // 從回覆中移除指令標記
                cleanReply = cleanReply.replace(match[0], '').trim();
            }
        } catch (e) {
            console.warn('Failed to parse map command:', match[1], e);
            // 保留原文
        }
    }

    return cleanReply;
}

/**
 * 根據景點名稱顯示路線
 */
function showRouteByNames(fromName, toName) {
    // 在景點中查找匹配名稱的景點
    const findAttraction = (name) => {
        // 先試 ID
        let attr = attractionsData.find(a => a.id === name);
        if (attr) return attr;

        // 再試名稱包含
        attr = attractionsData.find(a =>
            a.name.includes(name) || name.includes(a.name) ||
            a.local_name.includes(name) || name.includes(a.local_name)
        );
        return attr;
    };

    const fromAttr = findAttraction(fromName);
    const toAttr = findAttraction(toName);

    if (fromAttr && toAttr) {
        // 打開路線面板
        const panel = document.getElementById('route-panel');
        if (panel) {
            panel.classList.remove('hidden');
            document.getElementById('route-start').value = fromAttr.id;
            document.getElementById('route-end').value = toAttr.id;
            calculateRoute();
        }
    }
}

let isDraggingChat = false;
let systemStatusChecked = false;

function toggleChat() {
    if (isDraggingChat) return;
    const chat = document.getElementById('ai-chat');
    chat.classList.toggle('collapsed');
    
    // 如果收合，一併關閉 system-status-bar
    if (chat.classList.contains('collapsed')) {
        const statusBar = document.getElementById('system-status-bar');
        if (statusBar) statusBar.classList.add('hidden');
    }
    
    // 首次展開時才檢查系統狀態並顯示指示器
    if (!chat.classList.contains('collapsed') && !systemStatusChecked) {
        const statusDot = document.getElementById('system-status');
        if (statusDot) statusDot.classList.remove('hidden');
        checkSystemStatus();
        systemStatusChecked = true;
    }
}

function toggleChatHeight(event) {
    if (event) {
        event.stopPropagation();
    }
    const chat = document.getElementById('ai-chat');
    chat.classList.toggle('expanded-tall');
    
    const resizeIcon = document.getElementById('resize-chat-icon');
    if (resizeIcon) {
        if (chat.classList.contains('expanded-tall')) {
            resizeIcon.className = 'fas fa-compress resize-icon';
            resizeIcon.title = '縮小對話框';
        } else {
            resizeIcon.className = 'fas fa-expand resize-icon';
            resizeIcon.title = '放大對話框';
        }
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

    // 檢查 Slash Commands
    if (text.startsWith('/')) {
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        if (command === '/transit') {
            handleTransitCommand();
            return;
        } else if (command === '/radius') {
            parseRadiusSlashCommand(parts.slice(1).join(' '));
            return;
        }
    }

    showTyping();

    if (useBackendAI) {
        try {
            const reply = await fetchAIReply(text);
            hideTyping();
            addMessage(reply, 'bot');
        } catch (e) {
            hideTyping();
            // 後端失敗，使用離線知識庫
            const reply = generateAIReply(text);
            addMessage(reply + '\n\n（⚠️ 已切換至離線模式）', 'bot');
        }
    } else {
        setTimeout(() => {
            hideTyping();
            const reply = generateAIReply(text);
            addMessage(reply, 'bot');
        }, 600);
    }
}

/**
 * 處理 /transit 指令
 */
async function handleTransitCommand() {
    showTyping();
    
    // 獲取地圖中心坐標作為搜索點
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    try {
        // 同時獲取巴士同地鐵資訊
        const [busRes, subwayRes] = await Promise.all([
            fetch('/api/transit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, type: 'bus' })
            }),
            fetch('/api/transit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, type: 'subway' })
            })
        ]);

        const busData = await busRes.json();
        const subwayData = await subwayRes.json();
        
        hideTyping();

        let combinedHtml = `### 🗺️ **附近交通概覽**\n\n`;
        
        if (busData.data.is_demo || subwayData.data.is_demo) {
            combinedHtml += `*⚠️ 目前正使用模擬數據展示*\n\n`;
        }

        // 渲染地鐵 (優先顯示)
        if (subwayData.success && subwayData.data.stations && subwayData.data.stations.length > 0) {
            combinedHtml += `#### 🚇 **地鐵 (Subway)**\n`;
            subwayData.data.stations.forEach(station => {
                combinedHtml += `**${station.name}** (${station.distance}m)\n`;
                if (station.arrivals && station.arrivals.length > 0) {
                    station.arrivals.forEach(arr => {
                        combinedHtml += `- ${arr.line} [${arr.dest}]：**${arr.time}**\n`;
                    });
                } else {
                    combinedHtml += `- *暫無實時資訊*\n`;
                }
                combinedHtml += `\n`;
            });
        }

        // 渲染巴士
        if (busData.success && busData.data.stations && busData.data.stations.length > 0) {
            combinedHtml += `#### 🚌 **巴士 (Bus)**\n`;
            busData.data.stations.forEach(station => {
                combinedHtml += `**${station.name}** (${station.distance}m)\n`;
                station.arrivals.forEach(arr => {
                    const statusEmoji = arr.status === '即將抵達' ? '🔴' : '🟢';
                    combinedHtml += `- ${statusEmoji} **${arr.line}**：${arr.time}\n`;
                });
                combinedHtml += `\n`;
            });
        }

        if (!combinedHtml.includes('####')) {
            combinedHtml += `附近 400 米內未發現巴士站或地鐵站。請試下移動地圖中心到主要道路再試。\n\n`;
        }

        // 渲染貼士 (取地鐵貼士)
        const tips = (subwayData.data.tips || busData.data.tips || []);
        if (tips.length > 0) {
            combinedHtml += `---\n### 💡 **新手乘車貼士 (Rookie Tips)**\n\n`;
            tips.forEach(tip => combinedHtml += `- ${tip}\n`);
        }

        addMessage(combinedHtml, 'bot');

    } catch (e) {
        hideTyping();
        console.error('Transit error:', e);
        addMessage('❌ 系統錯誤，暫時無法獲取實時交通資訊。', 'bot');
    }
}

async function fetchAIReply(userText) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: userText,
            system: getSystemContext(),
            history: chatHistory.slice(0, -1),  // 唔包剛加入嘅 user message
            fingerprint: fingerprintManager.getFingerprint()
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    let reply = data.reply || generateAIReply(userText);

    // 解析並執行回覆中的地圖指令
    const actionPattern = /【([^】]+)】/g;
    let match;
    const actions = [];
    while ((match = actionPattern.exec(reply)) !== null) {
        try {
            const cmd = JSON.parse(match[1]);
            if (cmd.type === 'map_action' || cmd.action) {
                actions.push(cmd);
            }
        } catch (e) { /* 無視格式錯誤 */ }
        reply = reply.replace(match[0], ''); // 移除指令標記
    }

    // 異步執行所有地圖動作
    actions.forEach(action => {
        const actName = action.action || action.type;
        const actParams = action.params || {};
        executeMapAction(actName, actParams);
    });

    return reply;
}

function getSystemContext() {
    // 提供當前景點資料作為 AI 上下文
    const attractionsSummary = attractionsData.map(a =>
        `- ${a.name}(${a.local_name}) [ID:${a.id}: ${a.lat},${a.lng}]: ${a.category}，${a.description.substring(0, 30)}...`
    ).join('\n');

    // 可用分類
    const categories = Object.keys(CATEGORY_COLORS).join('、');

    return `你係韓國首爾旅遊專家，用粵語（廣東話書面）回答用戶關於首爾旅遊嘅問題。

【地圖控制指令】重要！當用家需要睇地圖、想去某個景點、想顯示特定類別景點、或者搜索特定位置時，請喺回覆尾加上特殊指令格式。

指令格式：將以下 JSON 放喺【...】內，例如 【{"action":"center","params":{"lat":37.5635,"lng":126.9895,"zoom":15}}】

可用動作：
1. center (移動地圖到指定坐標)：【{"action":"center","params":{"lat":37.5635,"lng":126.9895,"zoom":15}}】
2. focus_attraction (聚焦已知景點並顯示詳情)：【{"action":"focus_attraction","params":{"id":"景點ID"}}】
3. highlight_category (篩選顯示某分類景點)：【{"action":"highlight_category","params":{"category":"購物美食"}}】
4. locate_user (定位用戶GPS位置)：【{"action":"locate_user"}}】
5. add_marker (搜索結果/特定位置時添加標記)：【{"action":"add_marker","params":{"lat":37.5500,"lng":126.9200,"title":"弘大","color":"#e74c3c","popup":"弘大購物區"}}】
6. add_polygon (顯示區域範圍)：【{"action":"add_polygon","params":{"coords":[[37.56,126.98],[37.56,126.99],[37.57,126.99],[37.57,126.98]],"name":"明洞商圈","color":"#3498db"}}】
7. clear_search_markers (清除搜索標記)：【{"action":"clear_search_markers"}】
8. add_to_list (將提及嘅地點加入景點列表)：【{"action":"add_to_list","params":{"name":"地點名稱","lat":37.46,"lng":126.44,"category":"購物美食","description":"簡短描述"}}】

景點ID：${attractionsData.map(a=>a.id).join(', ')}
分類：${categories}

景點資料：
${attractionsSummary}

【重要使用指引】
- 當用家講「去XX」、「睇吓XX」等需要移動地圖時，如果XX係已知景點ID，用 focus_attraction；如果係其他地點（如機場、火車站、區域名稱），用 add_marker 加上準確坐標
- 搜索結果在內文回答後，適宜用 add_marker 喺地圖標示位置
- 提及區域或商圈時，可用 add_polygon 顯示範圍
- 提及具體地點（咖啡店、酒店、餐廳、景點等）時，必須使用 add_to_list，系統會自動處理地圖標記與列表添加，不需要再輸出 add_marker
- 普通對答唔需要地圖指令`;
}

function addMessage(text, sender, isRestore = false) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${sender}`;

    let displayText = text;
    let autoActions = [];

    if (sender === 'bot') {
        // Step 1: Extract and process 【{"action":"...","params":{...}}】 tags
        // We need to handle fly_to separately because marked.parse() would mangle HTML links
        const actionPattern = /【([^】]+)】/g;
        let match;
        let cleanText = text;
        const flyToLinks = []; // Store fly_to link HTML, use placeholders

        while ((match = actionPattern.exec(text)) !== null) {
            try {
                const cmd = JSON.parse(match[1]);
                if (cmd.action === 'fly_to' && cmd.params) {
                    // Replace fly_to tag with a placeholder, store link HTML separately
                    const lat = cmd.params.lat;
                    const lng = cmd.params.lng;
                    const title = cmd.params.title || '位置';
                    const placeholderId = `FLYTO_PLACEHOLDER_${flyToLinks.length}`;
                    const linkHtml = `<a href="javascript:void(0)" class="fly-to-link" data-lat="${lat}" data-lng="${lng}" data-title="${title.replace(/"/g, '&quot;')}" title="點擊飛到 ${title}">${title} 🗺️</a>`;
                    flyToLinks.push(linkHtml);
                    cleanText = cleanText.replace(match[0], placeholderId);
                } else if (cmd.action === 'add_marker' && cmd.params) {
                    // add_marker actions are auto-executed after render
                    autoActions.push(cmd);
                    cleanText = cleanText.replace(match[0], '');
                } else if (cmd.action) {
                    // Other action types: auto-execute and remove from text
                    autoActions.push(cmd);
                    cleanText = cleanText.replace(match[0], '');
                }
            } catch (e) { /* ignore malformed JSON */ }
        }

        // Step 2: Parse Markdown first
        displayText = marked.parse(cleanText);

        // Step 3: Replace placeholders with actual HTML links (after Markdown parsing)
        flyToLinks.forEach((linkHtml, index) => {
            const placeholder = `FLYTO_PLACEHOLDER_${index}`;
            // The placeholder may be wrapped in <p> tags by marked, handle both cases
            displayText = displayText.replace(`<p>${placeholder}</p>`, linkHtml);
            displayText = displayText.replace(placeholder, linkHtml);
        });
    } else {
        displayText = text;
    }

    div.innerHTML = `
        <div class="avatar"><i class="fas fa-${sender === 'bot' ? 'robot' : 'user'}"></i></div>
        <div class="bubble">${displayText}</div>
    `;
    container.appendChild(div);

    // Bind click handlers for fly_to links after DOM insertion
    if (sender === 'bot') {
        div.querySelectorAll('.fly-to-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const lat = parseFloat(link.dataset.lat);
                const lng = parseFloat(link.dataset.lng);
                const title = link.dataset.title;
                // 使用統一的 flyToSearchResult 以獲得豐富的氣泡詳情
                flyToSearchResult(lat, lng, title);
                // Also add a search marker
                addSearchMarker(lat, lng, title, '#e74c3c', title, true);
            });
        });

        // Auto-execute add_marker and other actions
        if (!isRestore) {
            autoActions.forEach(cmd => {
                const actName = cmd.action || cmd.type;
                const actParams = cmd.params || {};
                executeMapAction(actName, actParams);
            });
        }
    }

    container.scrollTop = container.scrollHeight;
    
    if (!isRestore) {
        // 儲存到對話歷史
        chatHistory.push({ role: sender === 'bot' ? 'assistant' : 'user', content: text });
        // 保留最近 N 輪對話
        if (chatHistory.length > MAX_HISTORY * 2) {
            chatHistory = chatHistory.slice(-MAX_HISTORY * 2);
        }
        saveChatHistory();
    } else {
        // 恢復時，我們仍然需要重建 chatHistory 陣列
        chatHistory.push({ role: sender === 'bot' ? 'assistant' : 'user', content: text });
    }
}

function showTyping() {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.id = 'typing-indicator';
    div.className = 'message bot';
    div.innerHTML = `
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="bubble">
            <div class="typing-indicator">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

// ==================== AI 知識庫回覆 ====================
function generateAIReply(userText) {
    const text = userText.toLowerCase();

    // 1. 景點查詢
    for (const attr of attractionsData) {
        if (text.includes(attr.name.toLowerCase()) || text.includes(attr.local_name.toLowerCase())) {
            if (text.includes('門票') || text.includes('幾錢')) {
                return `「${attr.name}」門票係 <strong>${attr.ticket}</strong>。`;
            }
            if (text.includes('時間') || text.includes('幾點') || text.includes('開放')) {
                return `「${attr.name}」開放時間係 <strong>${attr.hours}</strong>。`;
            }
            if (text.includes('交通') || text.includes('點去') || text.includes('地鐵')) {
                return `去「${attr.name}」嘅交通方式：<br>🚇 ${attr.transport.subway}<br>🚶 ${attr.transport.time_from_station}`;
            }
            if (text.includes('貼士') || text.includes('建議') || text.includes('tips')) {
                return `「${attr.name}」小貼士：${attr.tips}`;
            }
            return `「${attr.name}」係一個${attr.category}景點，${attr.description}<br><br>💡 ${attr.tips}`;
        }
    }

    // 2. 分類推薦
    for (const cat of Object.keys(CATEGORY_COLORS)) {
        if (text.includes(cat.toLowerCase()) || text.includes(cat)) {
            const list = attractionsData.filter(a => a.category === cat).map(a => `• ${a.name}`).join('<br>');
            return `首爾嘅${cat}景點有：<br>${list}<br><br>你想了解邊個？`;
        }
    }

    // 3. 交通時間查詢
    for (const [route, info] of Object.entries(subwayData.travel_times || {})) {
        const [from, to] = route.split('-');
        if ((text.includes(from) && text.includes(to)) || (text.includes(to) && text.includes(from))) {
            return `由<strong>${from}</strong>去<strong>${to}</strong>：${info}`;
        }
    }

    // 4. 一般問題
    if (text.includes('你好') || text.includes('hi') || text.includes('hello')) {
        return '你好！有咩關於首爾旅遊嘅問題想問？我可以幫你查景點、交通、行程規劃等等！';
    }
    if (text.includes('測試提取') || text.includes('test extraction')) {
        return '這是一個測試地點：星巴克明洞店！【{"action":"add_to_list","params":{"name":"星巴克明洞店","lat":37.5635,"lng":126.9895,"category":"購物美食","description":"位於明洞的星巴克"}}】還有另一個地點：弘大！【{"action":"add_to_list","params":{"name":"弘大","lat":37.5568,"lng":126.9245,"category":"地標觀景","description":"弘益大學周邊"}}】';
    }
    if (text.includes('行程') || text.includes('推薦') || text.includes('點玩')) {
        return `建議首爾3日行程：<br><br>
<strong>Day 1 - 歷史文化遊</strong><br>
景福宮 → 北村韓屋村 → 仁寺洞 → 清溪川<br><br>
<strong>Day 2 - 購物美食遊</strong><br>
明洞 → 廣藏市場 → 東大門DDP → 南山塔夜景<br><br>
<strong>Day 3 - 潮流娛樂遊</strong><br>
弘大 → 梨泰院 → 江南星空圖書館 → COEX<br><br>
你想詳細了解邊日嘅行程？`;
    }
    if (text.includes('韓服') || text.includes(' hanbok')) {
        return `著韓服免費入景福宮同昌德宮！推薦喺景福宮或北村附近嘅韓服租借店，一般 2-4小時約 15,000-30,000韓元。著韓服行北村韓屋村影相超靚！`;
    }
    if (text.includes('換錢') || text.includes('匯率') || text.includes('won')) {
        return `💰 換錢小貼士：<br>• 明洞換錢所匯率通常最好<br>• 帶港幣現金去換最抵<br>• 機場匯率較差，建議只換少量搭車用<br>• 大部份商店接受信用卡（Visa/Master）`;
    }
    if (text.includes('wifi') || text.includes('上網') || text.includes('網絡')) {
        return `📶 上網選擇：<br>• 租WiFi蛋：約 HK$15-25/日<br>• 買SIM卡：7日無限數據約 HK$80-150<br>• 韓國好多地方有免費WiFi（咖啡廳、地鐵站等）`;
    }
    if (text.includes('天氣') || text.includes('季節') || text.includes('幾時')) {
        return `🌸 首爾最佳旅遊季節：<br>• <strong>春季（3-5月）</strong>：櫻花季，天氣舒適<br>• <strong>秋季（9-11月）</strong>：紅葉季，最靚<br>• <strong>冬季（12-2月）</strong>：可以滑雪，但好凍<br>• <strong>夏季（6-8月）</strong>：較熱同潮濕`;
    }
    if (text.includes('機場') || text.includes('仁川') || text.includes('入境')) {
        return `✈️ 仁川機場到市區：<br>• <strong>機場快線AREX</strong>：直達首爾站約43分鐘，9500韓元<br>• <strong>機場巴士</strong>：到明洞/江南約60-90分鐘，17,000韓元<br>• <strong>的士</strong>：到市區約60,000-100,000韓元`;
    }
    if (text.includes('感謝') || text.includes('多謝') || text.includes('thank')) {
        return '唔使客氣！祝你首爾之旅愉快！🎌 有咩問題隨時再問我！';
    }

    // 5. 關鍵字模糊匹配
    if (text.includes('食') || text.includes('飲') || text.includes('餐廳') || text.includes('food')) {
        const foodPlaces = attractionsData.filter(a => a.category === '購物美食').map(a => `• ${a.name}`).join('<br>');
        return `首爾美食熱點：<br>${foodPlaces}<br><br>必試：人蔘雞湯、韓式烤肉、綠豆餅、生拌牛肉、炸雞啤酒！`;
    }
    if (text.includes('買') || text.includes('購物') || text.includes('shopping')) {
        return `🛍️ 購物推薦：<br>• <strong>明洞</strong>：藥妝店集中地<br>• <strong>東大門</strong>：批發市場，夜晚開<br>• <strong>弘大</strong>：潮牌、設計師店<br>• <strong>江南</strong>：名牌、百貨公司<br>• <strong>免稅店</strong>：樂天、新羅、新世界`;
    }
    if (text.includes('夜') || text.includes('酒吧') || text.includes('夜景')) {
        return `🌙 夜晚好去處：<br>• <strong>南山塔</strong>：睇夜景最正<br>• <strong>弘大</strong>：街頭表演、酒吧<br>• <strong>梨泰院</strong>：多國酒吧<br>• <strong>東大門DDP</strong>：LED燈光秀<br>• <strong>漢江</strong>：夜景散步`;
    }

    // 預設回覆
    return `抱歉，我暫時唔太明白你嘅問題。😅<br><br>
我可以幫你解答：<br>
• 景點資料（門票、開放時間、交通）<br>
• 行程規劃建議<br>
• 交通路線查詢<br>
• 韓國旅遊常見問題<br><br>
試下問「景福宮幾錢門票」或者「推薦行程」！`;
}

// ==================== 初始化聊天 ====================
function initChat() {
    // 預設已經喺 HTML 有歡迎訊息
    loadChatHistory();
    initChatDrag();
}

function initChatDrag() {
    const chatHeader = document.querySelector('.chat-header');
    const aiChat = document.getElementById('ai-chat');
    if (!chatHeader || !aiChat) return;

    let startY = 0;
    let currentY = 0;
    let initialTranslateY = 0;

    function getTranslateY() {
        const transform = window.getComputedStyle(aiChat).getPropertyValue('transform');
        if (transform !== 'none') {
            // 解析 matrix(a, b, c, d, tx, ty)
            const matrix = transform.match(/^matrix\((.+)\)$/);
            if (matrix) {
                return parseFloat(matrix[1].split(',')[5].trim());
            }
            // 解析 matrix3d
            const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
            if (matrix3d) {
                return parseFloat(matrix3d[1].split(',')[13].trim());
            }
        }
        return 0;
    }

    function onDragStart(e) {
        if (e.target.closest('.resize-icon') || e.target.closest('.toggle-icon')) return;
        
        isDraggingChat = false;
        startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        initialTranslateY = getTranslateY();

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
    }

    function onDragMove(e) {
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const dy = clientY - startY;
        
        if (Math.abs(dy) > 3) {
            isDraggingChat = true;
            aiChat.style.transition = 'none';
            currentY = initialTranslateY + dy;
            aiChat.style.transform = `translateY(${currentY}px)`;
            if (e.type === 'touchmove') e.preventDefault(); // 防止手機滾動
        }
    }

    function onDragEnd(e) {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        
        if (isDraggingChat) {
            aiChat.style.transition = '';
            setTimeout(() => {
                isDraggingChat = false;
            }, 100);
        }
    }

    chatHeader.addEventListener('mousedown', onDragStart);
    chatHeader.addEventListener('touchstart', onDragStart, { passive: true });
}

// ==================== 手機版底部景點列表面板 ====================
let mobilePanelExpanded = false;

// 類別對應 emoji
const CATEGORY_EMOJIS = {
    '歷史文化': '🏯',
    '地標觀景': '🗼',
    '購物美食': '🍜',
    '夜生活文化': '🎶',
    '娛樂': '🎭',
    '休閒': '☕',
    '自然景觀': '🌿',
    '自訂景點': '📌',
    '願望s': '❤️'
};

function renderMobilePanelList() {
    const container = document.getElementById('mobile-panel-list');
    const countEl = document.getElementById('mobile-panel-count');
    if (!container) return;

    container.innerHTML = '';

    // 1. 渲染搜索結果（如果有）
    if (currentSearchResults && currentSearchResults.length > 0) {
        const searchHeader = document.createElement('div');
        searchHeader.className = 'mobile-search-results-header';
        searchHeader.innerHTML = `
            <div class="search-title">
                <i class="fas fa-search"></i> 搜索結果
                <button class="clear-search-btn" onclick="clearSearchResultsFromList()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(searchHeader);

        currentSearchResults.forEach(function(place) {
            const category = place.category || '搜索結果';
            const color = CATEGORY_COLORS[category] || '#667eea';
            const emoji = CATEGORY_EMOJIS[category] || '📍';
            
            const card = document.createElement('div');
            card.className = 'mobile-attraction-card search-result-item';
            card.innerHTML =
                '<div class="card-emoji" style="background:' + color + '15">' + emoji + '</div>' +
                '<div class="card-info">' +
                    '<div class="card-name">' + place.name + '</div>' +
                    '<div class="card-sub">' +
                        '<span class="card-dot" style="background:' + color + '"></span>' +
                        category +
                    '</div>' +
                '</div>' +
                '<button class="wishlist-btn mobile-wishlist-btn ' + (WishlistManager.has(place.name, place.lat, place.lng) ? 'in-wishlist' : '') + '" ' +
                    'data-name="' + place.name + '" data-lat="' + place.lat + '" data-lng="' + place.lng + '" ' +
                    'data-category="' + category + '" data-description="' + (place.description || '') + '" ' +
                    'onclick="event.stopPropagation(); toggleWishlist(this)">' +
                    '<i class="' + (WishlistManager.has(place.name, place.lat, place.lng) ? 'fas' : 'far') + ' fa-heart"></i>' +
                '</button>' +
                '<div class="card-arrow"><i class="fas fa-chevron-right"></i></div>';

            card.addEventListener('click', function() {
                flyToSearchResult(place.lat, place.lng, place);
                toggleMobilePanel(false);
            });
            container.appendChild(card);
        });
    }

    // 2. 渲染靜態景點
    let filtered = getFilteredAttractions(activeCategory);

    if (countEl) countEl.textContent = (filtered.length + (currentSearchResults ? currentSearchResults.length : 0)) + ' 個項目';

    if (filtered.length === 0 && (!currentSearchResults || currentSearchResults.length === 0)) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #888;">沒有找到景點資料</div>';
        return;
    }

    filtered.forEach(function(attr) {
        var color = CATEGORY_COLORS[attr.category] || '#666';
        var emoji = CATEGORY_EMOJIS[attr.category] || '📍';
        var card = document.createElement('div');
        card.className = 'mobile-attraction-card';
        
        const customData = WishlistManager.get(attr.name, attr.lat, attr.lng);
        let badges = '';
        if (customData?.wish) badges += '<span class="badge-icon" title="想去">❤️</span>';
        if (customData?.pinned) badges += '<span class="badge-icon" title="釘選">📌</span>';
        if (customData?.visited) badges += '<span class="badge-icon" title="去過">✅</span>';

        let remarkHtml = '';
        if (customData?.myRemark) {
            remarkHtml = `<div class="remark-text"><i class="fas fa-comment-dots"></i> ${customData.myRemark}</div>`;
        }

        const safeName = attr.name || '未知景點';
        const safeCategory = attr.category || '未分類';
        const safeTicket = attr.ticket || '';
        const safeDesc = attr.description ? attr.description : '';
        const safeDescShort = safeDesc.length > 60 ? safeDesc.substring(0, 60) + '...' : safeDesc;

        card.innerHTML =
            '<div class="card-emoji" style="background:' + color + '15">' + emoji + '</div>' +
            '<div class="card-info">' +
                '<div class="card-name">' + safeName + ' ' + badges + '</div>' +
                '<div class="card-sub">' +
                    '<span class="card-dot" style="background:' + color + '"></span>' +
                    safeCategory + (attr.local_name ? ' · ' + attr.local_name : '') +
                '</div>' +
                remarkHtml +
            '</div>' +
            '<button class="wishlist-btn mobile-wishlist-btn ' + (WishlistManager.has(attr.name, attr.lat, attr.lng) ? 'in-wishlist' : '') + '" ' +
                'data-name="' + (attr.name || '') + '" data-lat="' + (attr.lat || 0) + '" data-lng="' + (attr.lng || 0) + '" ' +
                'data-category="' + safeCategory + '" data-price="' + safeTicket + '" ' +
                'data-description="' + safeDescShort + '" ' +
                'onclick="event.stopPropagation(); toggleWishlist(this)">' +
                '<i class="' + (WishlistManager.has(attr.name, attr.lat, attr.lng) ? 'fas' : 'far') + ' fa-heart"></i>' +
            '</button>' +
            '<div class="card-arrow"><i class="fas fa-chevron-right"></i></div>';

        card.addEventListener('click', function() {
            focusAttraction(attr);
            toggleMobilePanel(false);
        });
        container.appendChild(card);
    });
}

function initMobilePanel() {
    var panel = document.getElementById('mobile-location-panel');
    var dragHandle = document.getElementById('mobile-panel-drag-handle');
    if (!panel || !dragHandle) return;

    // 點擊 drag handle 切換展開/收起
    dragHandle.addEventListener('click', function() {
        toggleMobilePanel(!mobilePanelExpanded);
    });

    // 觸控拖動支援
    var startY = 0;
    var startTranslateY = 0;
    var isDragging = false;

    dragHandle.addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
        isDragging = true;
        // 移除 transition 以便拖動時即時跟手
        panel.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        var currentY = e.touches[0].clientY;
        var deltaY = currentY - startY;
        // 向下拖 = 收起，向上拖 = 展開
        if (mobilePanelExpanded) {
            // 已展開狀態，向下拖
            if (deltaY > 50) {
                toggleMobilePanel(false);
                isDragging = false;
            }
        } else {
            // 已收起狀態，向上拖
            if (deltaY < -30) {
                toggleMobilePanel(true);
                isDragging = false;
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', function() {
        if (isDragging) {
            panel.style.transition = '';
            isDragging = false;
        }
    });

    // 分類 tab 點擊
    var tabs = document.querySelectorAll('.mobile-tab');
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            tabs.forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            activeCategory = tab.dataset.category;
            renderMobilePanelList();
            // 同步桌面版分類按鈕
            document.querySelectorAll('.cat-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.category === activeCategory);
            });
            // 同步地圖 markers
            addMarkers();
            renderAttractionList();
        });
    });

    // 初始渲染
    renderMobilePanelList();
}

function toggleMobilePanel(expanded) {
    var panel = document.getElementById('mobile-location-panel');
    var dragHandle = document.getElementById('mobile-panel-drag-handle');
    if (!panel) return;

    mobilePanelExpanded = expanded;
    panel.style.transition = '';

    if (expanded) {
        panel.classList.add('expanded');
        panel.classList.remove('hidden-panel');
    } else {
        panel.classList.remove('expanded');
    }

    // 更新 drag handle 文字
    if (dragHandle) {
        var titleEl = dragHandle.querySelector('.mobile-panel-title');
        if (titleEl) {
            titleEl.textContent = expanded ? '📍 景點列表' : '📍 景點列表';
        }
    }
}


// ==================== AI 地圖控制指令執行 ====================
async function executeMapAction(action, params) {
    console.log('[Map Action] Executing:', action, params);
    
    // 驗證坐標參數
    if (params.lat !== undefined) {
        params.lat = parseFloat(params.lat);
        if (isNaN(params.lat) || params.lat < -90 || params.lat > 90) {
            console.error('[Map Action] Invalid latitude:', params.lat);
            return false;
        }
    }
    if (params.lng !== undefined) {
        params.lng = parseFloat(params.lng);
        if (isNaN(params.lng) || params.lng < -180 || params.lng > 180) {
            console.error('[Map Action] Invalid longitude:', params.lng);
            return false;
        }
    }
    if (params.zoom !== undefined) {
        params.zoom = parseInt(params.zoom);
    }
    
    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params })
        });
        const data = await response.json();
        if (!data.success) {
            console.error('Map action failed:', data.error);
            return false;
        }

        // 前端執行實際地圖動作
        switch (action) {
            case 'center':
                if (params.lat !== undefined && params.lng !== undefined) {
                    map.setView([params.lat, params.lng], params.zoom || 15);
                    console.log(`[Map Action] Map centered at ${params.lat}, ${params.lng}, zoom ${params.zoom || 15}`);
                }
                break;
            case 'focus_attraction':
                const attr = attractionsData.find(a => a.id === params.id);
                if (attr) {
                    focusAttraction(attr);
                } else {
                    // 嘗試用名稱查找
                    const attrByName = attractionsData.find(a =>
                        a.name.includes(params.id) || params.id.includes(a.name)
                    );
                    if (attrByName) focusAttraction(attrByName);
                }
                break;
            case 'highlight_category':
                activeCategory = params.category;
                renderAttractionList();
                addMarkers();
                break;
            case 'locate_user':
                locateUser();
                break;
            case 'locate_user_and_report':
                locateUserAndReport();
                break;
            case 'show_route':
                // from 和 to 可以係 attraction id 或者名稱
                const fromAttr = attractionsData.find(a => a.id === params.from) ||
                    attractionsData.find(a => a.name.includes(params.from));
                const toAttr = attractionsData.find(a => a.id === params.to) ||
                    attractionsData.find(a => a.name.includes(params.to));
                if (fromAttr && toAttr) {
                    document.getElementById('route-start').value = fromAttr.id;
                    document.getElementById('route-end').value = toAttr.id;
                    calculateRoute();
                }
                break;
            // ===== 搜索標記相關動作 =====
            case 'add_marker':
                // 添加搜索標記（用於顯示目的地）
                if (params.lat !== undefined && params.lng !== undefined) {
                    const title = params.title || '目的地';
                    const color = params.color || '#e74c3c';
                    const popup = params.popup || title;
                    const pulse = params.pulse !== false; // 默認開啟脈動效果
                    
                    addSearchMarker(params.lat, params.lng, title, color, popup, pulse);
                    console.log(`[Map Action] Added marker for "${title}" at ${params.lat}, ${params.lng}`);
                }
                break;
            case 'add_polygon':
                // 添加範圍多邊形（用於顯示區域）
                if (params.coords && Array.isArray(params.coords)) {
                    const name = params.name || '範圍';
                    const color = params.color || '#3498db';
                    addSearchPolygon(params.coords, name, color);
                }
                break;
            case 'clear_search_markers':
                // 清除所有搜索標記
                clearSearchMarkers();
                break;
            // ===== 添加到願望清單 =====
            case 'add_to_wishlist':
                // 將搜索結果地點添加到願望清單
                if (params.name && params.lat !== undefined && params.lng !== undefined) {
                    const added = WishlistManager.add({
                        name: params.name,
                        lat: parseFloat(params.lat),
                        lng: parseFloat(params.lng),
                        category: params.category || '',
                        price: params.price || '',
                        description: params.description || ''
                    });
                    if (added) {
                        // 顯示 toast 提示
                        const toast = document.createElement('div');
                        toast.className = 'wishlist-toast';
                        toast.innerHTML = `<i class="fas fa-heart" style="color:#e74c3c"></i> ${params.name} 已加入願望清單`;
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 2000);
                    }
                    console.log(`[Map Action] Add to wishlist: ${params.name}`);
                }
                break;
            // ===== 從願望清單移除 =====
            case 'remove_from_wishlist':
                if (params.id) {
                    WishlistManager.remove(params.id);
                }
                break;
            // ===== 飛到指定坐標 =====
            case 'fly_to':
                // 飛到指定位置並顯示名稱
                if (params.lat !== undefined && params.lng !== undefined) {
                    const title = params.title || '位置';
                    // 使用統一的 flyToSearchResult 以獲得豐富的氣泡詳情
                    flyToSearchResult(params.lat, params.lng, title);
                    console.log(`[Map Action] Flying to ${params.lat}, ${params.lng} (${title})`);
                }
                break;
            case 'add_to_list':
                // 將地點加入景點列表並持久化
                if (params.name && params.lat !== undefined && params.lng !== undefined) {
                    const lat = parseFloat(params.lat);
                    const lng = parseFloat(params.lng);
                    const listPlace = {
                        name: params.name,
                        lat: lat,
                        lng: lng,
                        category: params.category || '地標觀景',
                        description: params.description || ''
                    };
                    // 1. Add to attractions list
                    addChatPlacesToAttractions([listPlace]);
                    // 2. Persist to localStorage
                    persistChatPlace(listPlace);
                    
                    // 3. Add marker to map
                    const color = CATEGORY_COLORS[listPlace.category] || '#e74c3c';
                    addSearchMarker(lat, lng, params.name, color, params.name, true);
                    
                    console.log(`[Map Action] Added to list & map: ${params.name}`);
                }
                break;
            case 'transit_info':
                handleTransitCommand();
                break;
            default:
                console.warn('[Map Action] Unknown action:', action);
                return false;
        }
        return true;
    } catch (e) {
        console.error('executeMapAction error:', e);
        return false;
    }
}

// ==================== 定位我的位置 ====================
function locateUser() {
    if (!navigator.geolocation) {
        alert('您的瀏覽器不支持地理位置定位');
        return;
    }

    // 顯示加載狀態
    const locateBtn = document.getElementById('locate-user');
    const originalHtml = locateBtn.innerHTML;
    locateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 定位中...';
    locateBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const accuracy = position.coords.accuracy;

            // 添加用戶位置標記
            const userIcon = L.divIcon({
                html: '<div class="user-marker"><i class="fas fa-user"></i></div>',
                className: '',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            // 如果已有用戶標記，先移除
            if (window.userMarker) {
                map.removeLayer(window.userMarker);
            }
            if (window.userAccuracyCircle) {
                map.removeLayer(window.userAccuracyCircle);
            }

            // 精確度圓圈（半透明藍色圓圈）
            window.userAccuracyCircle = L.circle([latitude, longitude], {
                radius: Math.max(accuracy, 10),
                color: '#3388ff',
                fillColor: '#3388ff',
                fillOpacity: 0.15,
                weight: 1,
                opacity: 0.5
            }).addTo(map);

            window.userMarker = L.marker([latitude, longitude], { icon: userIcon })
                .addTo(map)
                .bindPopup(`
                    <div class="user-location-popup">
                        <div class="user-location-title">📍 您的位置</div>
                        <div class="user-location-info">
                            <div>緯度: ${latitude.toFixed(6)}</div>
                            <div>經度: ${longitude.toFixed(6)}</div>
                            <div class="user-location-accuracy">精確度: ±${accuracy}米</div>
                        </div>
                    </div>
                `)
                .openPopup();

            // 移動地圖到用戶位置
            map.setView([latitude, longitude], 15);

            // 恢復按鈕狀態
            locateBtn.innerHTML = originalHtml;
            locateBtn.disabled = false;
        },
        (error) => {
            let errorMsg = '無法獲取您的位置：';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg += '用戶拒絕請求地理位置';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg += '位置信息不可用';
                    break;
                case error.TIMEOUT:
                    errorMsg += '請求超時';
                    break;
                case error.UNKNOWN_ERROR:
                    errorMsg += '未知錯誤';
                    break;
            }
            alert(errorMsg);
            locateBtn.innerHTML = originalHtml;
            locateBtn.disabled = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// ==================== 定位並向聊天匯報 ====================
function locateUserAndReport() {
    if (!navigator.geolocation) {
        addMessage('❌ 您的瀏覽器不支持地理位置定位', 'bot');
        return;
    }

    showTyping();
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            const accuracy = position.coords.accuracy;

            // 添加用戶位置標記 (與 locateUser 相同)
            const userIcon = L.divIcon({
                html: '<div class="user-marker"><i class="fas fa-user"></i></div>',
                className: '',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            if (map && window.userMarker) {
                map.removeLayer(window.userMarker);
            }
            if (map && window.userAccuracyCircle) {
                map.removeLayer(window.userAccuracyCircle);
            }

            if (map) {
                window.userAccuracyCircle = L.circle([latitude, longitude], {
                    radius: Math.max(accuracy, 10),
                    color: '#3388ff',
                    fillColor: '#3388ff',
                    fillOpacity: 0.15,
                    weight: 1,
                    opacity: 0.5
                }).addTo(map);

                window.userMarker = L.marker([latitude, longitude], { icon: userIcon })
                    .addTo(map)
                    .bindPopup("📍 您的位置")
                    .openPopup();

                map.setView([latitude, longitude], 15);
            }

            // 報告位置給後端
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: "[SYSTEM_LOCATION_REPORT]",
                        lat: latitude,
                        lng: longitude,
                        history: chatHistory,
                        fingerprint: fingerprintManager.getFingerprint()
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                hideTyping();
                if (data.reply) {
                    addMessage(data.reply, 'bot');
                } else if (data.error) {
                    addMessage(`❌ ${data.error}`, 'bot');
                }
            } catch (e) {
                hideTyping();
                console.error('Location report error:', e);
                addMessage('❌ 無法向伺服器報告位置。', 'bot');
            }
        },
        (error) => {
            hideTyping();
            let msg = '無法獲取位置';
            if (error.code === 1) msg = '用戶拒絕提供位置權限';
            addMessage(`❌ ${msg}`, 'bot');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

document.addEventListener('DOMContentLoaded', async () => {
    MapManager.init();
    initMap();
    await loadData();
    
    // Setup search input listeners
    document.getElementById('desktop-search-input')?.addEventListener('input', handlePanelSearchInput);
    document.getElementById('mobile-search-input')?.addEventListener('input', handlePanelSearchInput);
    document.getElementById('desktop-search-clear')?.addEventListener('click', clearPanelSearch);
    document.getElementById('mobile-search-clear')?.addEventListener('click', clearPanelSearch);
    
    renderAttractionList();
    addMarkers();
    initRoutePanel();
    initChat();
    bindEvents();
    updateCategoryLanguage(currentLanguage);
    initMobilePanel();
    // 初始化釘選位置面板
    renderPinnedPanel();
    updatePinnedCount();
    // 渲染地圖釘選
    renderPinnedMarkers();
    // 恢復聊天添加的地點
    loadChatPlaces();
    // 取消頁面啟動時自動檢查系統狀態，改為在首次打開聊天時檢查
    // checkSystemStatus();
});

// ==================== Chatbot 搜索標記與範圍顯示 ====================

/**
 * 添加搜索標記（目的地指示器）
 * @param {number} lat - 緯度
 * @param {number} lng - 經度
 * @param {string} title - 標題
 * @param {string} color - 顏色
 * @param {string} popupContent - 彈出內容
 * @param {boolean} pulse - 是否啟用脈動效果
 */
function addSearchMarker(lat, lng, title, color, popupContent, pulse = true) {
    console.log(`[Chatbot] 添加搜索標記: ${title} @ ${lat}, ${lng}`);
    
    // 創建自定義圖標 HTML
    const pulseClass = pulse ? 'search-marker-pulse' : '';
    const iconHtml = `
        <div class="search-marker ${pulseClass}" style="--marker-color: ${color}">
            <div class="marker-inner">
                <i class="fas fa-map-marker-alt"></i>
            </div>
        </div>
    `;
    
    const customIcon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [48, 48],
        iconAnchor: [24, 48]   // pin tip at bottom-center = map coordinate
    });
    
    // 創建標記
    const marker = L.marker([lat, lng], { icon: customIcon })
        .addTo(searchMarkersLayerGroup)
        .bindPopup(`
            <div class="search-marker-popup">
                <h4><i class="fas fa-map-marker-alt"></i>${title}</h4>
                <p>${popupContent}</p>
            </div>
        `);
    
    // 自動打開彈出窗口
    marker.openPopup();
    
    return marker;
}

/**
 * 添加搜索範圍多邊形
 * @param {Array} coords - 多邊形坐標數組 [[lat, lng], [lat, lng], ...]
 * @param {string} name - 區域名稱
 * @param {string} color - 顏色
 */
function addSearchPolygon(coords, name, color) {
    console.log(`[Chatbot] 添加範圍多邊形: ${name}`);
    
    // 驗證坐標
    if (!Array.isArray(coords) || coords.length < 3) {
        console.warn('多邊形坐標無效，需要至少3個點');
        return null;
    }
    
    // 創建多邊形
    const polygon = L.polygon(coords, {
        color: color,
        fillColor: color,
        fillOpacity: 0.25,
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5'
    }).addTo(searchMarkersLayerGroup);
    
    // 計算多邊形中心點顯示標籤
    const bounds = polygon.getBounds();
    const center = bounds.getCenter();
    
    // 添加區域標籤
    const labelIcon = L.divIcon({
        html: `<div class="area-label" style="background: ${color}; color: white;">${name}</div>`,
        className: '',
        iconSize: [100, 30],
        iconAnchor: [50, 15]
    });
    
    L.marker(center, { icon: labelIcon, interactive: false })
        .addTo(searchMarkersLayerGroup);
    
    // 顯示範圍信息彈窗
    polygon.bindPopup(`
        <div class="area-popup">
            <h4><i class="fas fa-map"></i> ${name}</h4>
            <p>這是一個熱門區域，範圍內有多個值得探索的地點。</p>
        </div>
    `);
    
    // 自動調整地圖視野以顯示整個範圍
    map.fitBounds(bounds, { padding: [50, 50] });
    
    return polygon;
}

/**
 * 清除所有搜索標記和範圍
 */
function clearSearchMarkers() {
    console.log('[Chatbot] 清除所有搜索標記');
    searchMarkersLayerGroup.clearLayers();
}

// ==================== 圖片上傳識別功能 ====================
let currentUploadedImage = null;

/**
 * 處理圖片上傳
 */
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
        alert('請上傳圖片文件');
        return;
    }
    
    // 檢查文件大小（限制 50MB — 新手機相普遍 10MB+）
    if (file.size > 50 * 1024 * 1024) {
        alert('圖片大小唔可以超過 50MB');
        return;
    }
    
    // 用 URL.createObjectURL 代替 FileReader.readAsDataURL
    // 避免將 10MB+ raw file 全部 load 入 memory 做 base64（~13MB string）
    const objectUrl = URL.createObjectURL(file);
    
    const img = new Image();
    img.onload = function() {
        // 無論原圖幾大，一律 resize + compress 至安全大小
        const maxSize = 1024;
        let width = img.width;
        let height = img.height;
        
        if (width > maxSize || height > maxSize) {
            if (width > height) {
                height = Math.round(height * maxSize / width);
                width = maxSize;
            } else {
                width = Math.round(width * maxSize / height);
                height = maxSize;
            }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // JPEG 壓縮 quality 0.6 → 10MB 原圖 → ~150KB base64
        currentUploadedImage = canvas.toDataURL('image/jpeg', 0.6);
        
        // 釋放 blob URL memory
        URL.revokeObjectURL(objectUrl);
        
        showImagePreview(currentUploadedImage);
        
        // 自動展開 chatbot
        const chat = document.getElementById('ai-chat');
        if (chat && chat.classList.contains('collapsed')) {
            toggleChat();
        }
        
        // 自動發送圖片分析
        analyzeUploadedImage();
    };
    
    img.onerror = function() {
        URL.revokeObjectURL(objectUrl);
        alert('無法載入圖片，請確認文件格式正確');
    };
    
    img.src = objectUrl;
}

/**
 * 顯示圖片預覽
 */
function showImagePreview(imageData) {
    const preview = document.getElementById('image-preview');
    if (preview) {
        preview.innerHTML = `
            <div class="preview-container">
                <img src="${imageData}" alt="預覽">
                <button class="remove-image" onclick="removeUploadedImage()" title="移除圖片">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        preview.classList.remove('hidden');
    }
}

/**
 * 移除已上傳圖片
 */
function removeUploadedImage() {
    currentUploadedImage = null;
    const preview = document.getElementById('image-preview');
    const fileInput = document.getElementById('image-input');
    
    if (preview) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
    }
    if (fileInput) {
        fileInput.value = '';
    }
}

/**
 * 發送圖片做 AI 分析
 */
async function analyzeUploadedImage() {
    if (!currentUploadedImage) return;
    
    // 顯示用戶訊息
    addMessage('[已上傳圖片，正在分析...]', 'user');
    showTyping();
    
    try {
        // 只發送 base64 內容（唔要 data:image/... 前綴）
        const base64Image = currentUploadedImage.split(',')[1];
        
        const response = await fetch('/api/analyze-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image }),
            signal: AbortSignal.timeout(45000)  // 45s timeout
        });
        
        // Check Content-Type before parsing as JSON
        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`Server 返回非 JSON 回應（${response.status}）。可能圖片太大或伺服器繁忙，請重試。`);
        }
        
        const data = await response.json();
        hideTyping();
        
        if (data.success) {
            const analysis = data.analysis;
            const confidence = analysis.confidence || 0;
            
            // 構建 AI 回覆
            let reply = `📍 **圖片分析結果**\n\n`;
            reply += `**可能地點：** ${analysis.landmark_name || '未知地點'}`;
            if (analysis.landmark_local_name) {
                reply += ` (${analysis.landmark_local_name})`;
            }
            reply += `\n\n`;
            
            if (analysis.description) {
                reply += `**分析：** ${analysis.description}\n\n`;
            }
            
            reply += `**信心度：** ${(confidence * 100).toFixed(0)}%\n\n`;
            
            if (analysis.nearby_attractions) {
                reply += `**附近景點：** ${analysis.nearby_attractions}\n\n`;
            }
            
            reply += `📌 已喺地圖標示可能位置`;
            
            addMessage(reply, 'bot');
            
            // 執行地圖動作（如果有的話）
            if (data.map_action) {
                executeMapAction(data.map_action.action, data.map_action.params);
                
                // 同時 centre 地圖
                if (data.map_action.params.lat && data.map_action.params.lng) {
                    map.flyTo([data.map_action.params.lat, data.map_action.params.lng], 16, {
                        duration: 1.5
                    });
                }
            }
        } else {
            // 分析失敗
            addMessage(`❌ 圖片分析失敗：${data.error || '請稍後再試'}\n\n可能原因：\n• AI 模型暫時無法識別該圖片\n• 圖片質素太模糊\n• 唔係首爾常見景點\n\n建議試吓用文字描述你想知嘅地點！`, 'bot');
        }
        
    } catch (error) {
        hideTyping();
        console.error('圖片分析錯誤:', error);
        addMessage(`❌ 圖片上傳失敗：${error.message}\n\n請檢查網絡連接後重試。`, 'bot');
    }
    
    // 清理圖片
    removeUploadedImage();
}

// ==================== Burger Menu（手機版選單） ====================
document.addEventListener('DOMContentLoaded', function() {
    const burgerBtn = document.getElementById('burger-menu-btn');
    const burgerDropdown = document.getElementById('burger-dropdown');
    
    // Burger Menu 開關
    if (burgerBtn && burgerDropdown) {
        burgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            burgerDropdown.classList.toggle('show');
        });
        
        // 點擊外部關閉
        document.addEventListener('click', function(e) {
            if (!burgerDropdown.contains(e.target) && !burgerBtn.contains(e.target)) {
                burgerDropdown.classList.remove('show');
            }
        });
    }
    
    // 更新 Burger Menu Toggle 狀態
    function updateBurgerToggleState(burgerItem, isActive) {
        if (!burgerItem) return;
        const icon = burgerItem.querySelector('.toggle-switch i');
        if (isActive) {
            burgerItem.classList.add('active');
            if (icon) {
                icon.classList.remove('fa-toggle-off');
                icon.classList.add('fa-toggle-on');
            }
        } else {
            burgerItem.classList.remove('active');
            if (icon) {
                icon.classList.remove('fa-toggle-on');
                icon.classList.add('fa-toggle-off');
            }
        }
    }
    
    // 地鐵線 Toggle（手機版）
    const burgerSubway = document.getElementById('burger-toggle-subway');
    if (burgerSubway) {
        burgerSubway.addEventListener('click', function() {
            const desktopBtn = document.getElementById('toggle-subway');
            if (desktopBtn) desktopBtn.click();
        });
    }
    
    // 交通規劃 Toggle（手機版）
    const burgerTraffic = document.getElementById('burger-toggle-traffic');
    if (burgerTraffic) {
        burgerTraffic.addEventListener('click', function() {
            const desktopBtn = document.getElementById('toggle-traffic');
            if (desktopBtn) desktopBtn.click();
        });
    }

    // 範圍篩選 Toggle（手機版）
    const burgerRadius = document.getElementById('burger-toggle-radius');
    if (burgerRadius) {
        burgerRadius.addEventListener('click', function() {
            const desktopBtn = document.getElementById('toggle-radius-filter');
            if (desktopBtn) desktopBtn.click();
        });
    }
    
    // 我的定位（手機版）
    const burgerLocate = document.getElementById('burger-locate-user');
    if (burgerLocate) {
        burgerLocate.addEventListener('click', function() {
            const desktopBtn = document.getElementById('locate-user');
            if (desktopBtn) desktopBtn.click();
            burgerDropdown.classList.remove('show');
        });
    }
    
    // 重置地圖（手機版）
    const burgerReset = document.getElementById('burger-reset-map');
    if (burgerReset) {
        burgerReset.addEventListener('click', function() {
            const desktopBtn = document.getElementById('reset-map');
            if (desktopBtn) desktopBtn.click();
            burgerDropdown.classList.remove('show');
        });
    }
    
    // 監聽桌面版按鈕狀態，同步更新 Burger Menu
    const subwayBtn = document.getElementById('toggle-subway');
    const trafficBtn = document.getElementById('toggle-traffic');
    const radiusBtn = document.getElementById('toggle-radius-filter');
    
    if (subwayBtn && burgerSubway) {
        const subwayObserver = new MutationObserver(function() {
            updateBurgerToggleState(burgerSubway, subwayBtn.classList.contains('active'));
        });
        subwayObserver.observe(subwayBtn, { attributes: true, attributeFilter: ['class'] });
    }
    
    if (trafficBtn && burgerTraffic) {
        const trafficObserver = new MutationObserver(function() {
            updateBurgerToggleState(burgerTraffic, trafficBtn.classList.contains('active'));
        });
        trafficObserver.observe(trafficBtn, { attributes: true, attributeFilter: ['class'] });
    }

    if (radiusBtn && burgerRadius) {
        const radiusObserver = new MutationObserver(function() {
            updateBurgerToggleState(burgerRadius, radiusBtn.classList.contains('active'));
        });
        radiusObserver.observe(radiusBtn, { attributes: true, attributeFilter: ['class'] });
    }
});

// ==================== 搜索結果添加到景點列表 ====================

/**
 * 將搜索結果添加到景點列表
 * @param {Array} places - 搜索結果地點陣列
 * @param {string} queryType - 搜索類型 (attractions/restaurants/hotels/shopping/all)
 */
function addSearchResultsToList(places, queryType) {
    if (!places || places.length === 0) return;
    
    // 類型到分類的映射
    const typeToCategory = {
        'attractions': '地標觀景',
        'restaurants': '購物美食',
        'hotels': '購物美食',
        'shopping': '購物美食',
        'all': '地標觀景'
    };
    
    // 為每個地點添加
    places.forEach((place) => {
        if (!place.lat || !place.lng) return;
        
        // 檢查是否已存在（避免重複，使用模糊比對）
        const exists = currentSearchResults.some(p => {
            const dist = getDistance(p.lat, p.lng, place.lat, place.lng);
            const nameMatch = p.name === place.name || 
                              p.name.includes(place.name) || 
                              place.name.includes(p.name);
            return dist < 0.05 && nameMatch;
        });
        
        if (!exists) {
            // 存儲完整數據以支持豐富的氣泡顯示
            currentSearchResults.push({
                ...place, // 保留原始所有字段 (rating, price, highlights, tips, etc.)
                category: typeToCategory[queryType] || place.category || '搜索結果',
                description: place.description || ''
            });
        }
    });
    
    // 同步更新所有面板
    renderAttractionList();
    renderMobilePanelList();
    
    console.log(`[Search] Added ${places.length} search results to global state and refreshed panels`);
}

function addChatPlacesToAttractions(places) {
    if (!places || places.length === 0) return;
    let added = false;
    
    places.forEach(place => {
        if (!place.lat || !place.lng) return;
        
        // 檢查是否已存在於 attractionsData
        const exists = attractionsData.some(a => {
            const dist = getDistance(a.lat, a.lng, place.lat, place.lng);
            const nameMatch = a.name === place.name || 
                              a.name.includes(place.name) || 
                              place.name.includes(a.name);
            return dist < 0.05 && nameMatch;
        });
        
        if (!exists) {
            attractionsData.push({
                id: place.id || `chat_${place.name}_${place.lat.toFixed(4)}_${place.lng.toFixed(4)}`,
                name: place.name,
                local_name: '',
                lat: place.lat,
                lng: place.lng,
                category: place.category || '自訂景點',
                image: place.image || '',
                ticket: place.price || '',
                description: place.description || ''
            });
            added = true;
        }
    });

    if (added) {
        addMarkers(); // 重新整理地圖標記
        renderAttractionList();
        renderMobilePanelList();
        console.log(`[ChatPlaces] Added ${places.length} chat places to attractionsData`);
    }
}

// ==================== 設備指紋系統 ====================
const FingerprintManager = {
    STORAGE_KEY: 'seoul_tour_device_uuid',
    TIMESTAMP_KEY: 'seoul_tour_device_ts',

    /** 獲取或生成設備唯一標識 */
    getFingerprint() {
        let uuid = localStorage.getItem(this.STORAGE_KEY);
        let ts = localStorage.getItem(this.TIMESTAMP_KEY);
        
        if (!uuid) {
            uuid = this._generateUUID();
            localStorage.setItem(this.STORAGE_KEY, uuid);
        }
        
        if (!ts) {
            ts = Date.now().toString();
            localStorage.setItem(this.TIMESTAMP_KEY, ts);
        }

        const ua = navigator.userAgent;
        // 組合指紋: UA + 首次生成時間戳 + UUID 哈希
        // 使用自定義哈希處理 UUID 以符合用戶需求
        const uuidHash = this._hash(uuid);
        
        // 使用 URL 安全的 Base64 處理，並處理非 ASCII 字符
        try {
            const fingerprintRaw = `${ua}|${ts}|${uuidHash}`;
            // 由於 btoa 只能處理 ASCII，先用 encodeURIComponent
            const encoded = btoa(unescape(encodeURIComponent(fingerprintRaw)));
            return encoded.substring(0, 32);
        } catch (e) {
            // 回退方案：簡單哈希
            return `fp_${this._hash(ua + ts + uuid)}`.substring(0, 32);
        }
    },

    /** 簡單的哈希函數 (DJB2) */
    _hash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 33) ^ str.charCodeAt(i);
        }
        return (hash >>> 0).toString(16);
    },

    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};

// ==================== 聊天添加地點持久化 ====================
const CHAT_PLACES_KEY = 'seoul_tour_chat_places';

function persistChatPlace(place) {
    if (!place.name || place.lat === undefined || place.lng === undefined) {
        console.error('[ChatPlaces] Cannot persist invalid place:', place);
        return;
    }
    const places = JSON.parse(localStorage.getItem(CHAT_PLACES_KEY) || '[]');
    // 避免重複（按名稱+坐標模糊比對）
    const exists = places.some(p => {
        const dist = getDistance(p.lat, p.lng, place.lat, place.lng);
        const nameMatch = p.name === place.name || 
                          p.name.includes(place.name) || 
                          place.name.includes(p.name);
        return dist < 0.05 && nameMatch;
    });
    if (!exists) {
        places.push({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            category: place.category || '自訂景點',
            description: place.description || '',
            addedAt: Date.now(),
            ownerFingerprint: FingerprintManager.getFingerprint(),
            id: `chat_${place.name}_${place.lat.toFixed(4)}_${place.lng.toFixed(4)}` // 添加 ID 以便伺服器端去重
        });
        localStorage.setItem(CHAT_PLACES_KEY, JSON.stringify(places));
        // 同步聊天地點到伺服器
        WishlistManager.syncToServer(places);
    }
}

function loadChatPlaces() {
    const places = JSON.parse(localStorage.getItem(CHAT_PLACES_KEY) || '[]');
    if (places.length > 0) {
        addChatPlacesToAttractions(places);
        console.log(`[ChatPlaces] Restored ${places.length} chat-added places`);
    }
}

function clearChatPlaces() {
    localStorage.removeItem(CHAT_PLACES_KEY);
}

/**
 * 創建搜索結果的豐富彈窗內容
 */
function createSearchResultPopupContent(place) {
    const category = place.category || '搜索結果';
    const color = CATEGORY_COLORS[category] || '#667eea';
    
    // 構建亮點 HTML
    let highlightsHtml = '';
    if (place.highlights && Array.isArray(place.highlights) && place.highlights.length > 0) {
        highlightsHtml = `
            <div class="place-highlights" style="margin-top: 8px; font-size: 12px; color: #666;">
                ${place.highlights.slice(0, 2).map(h => `<div style="margin-bottom: 2px;">✨ ${h}</div>`).join('')}
            </div>
        `;
    }

    return `
        <div class="place-popup">
            <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700;">${place.name}</h4>
            <div class="place-category" style="display: inline-block; padding: 2px 8px; background: ${color}20; color: ${color}; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 8px;">
                ${category}
            </div>
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #4b5563; line-height: 1.5;">
                ${place.description ? (place.description.length > 100 ? place.description.substring(0, 100) + '...' : place.description) : '暫無簡介'}
            </p>
            <div class="place-meta" style="display: flex; gap: 12px; margin-bottom: 8px; font-size: 13px; font-weight: 600;">
                ${place.rating ? `<span class="place-rating" style="color: #f59e0b;">⭐ ${place.rating}</span>` : ''}
                ${place.price ? `<span class="place-price" style="color: #10b981;">💰 ${place.price}</span>` : ''}
            </div>
            ${highlightsHtml}
            ${place.tips ? `<div class="place-tips" style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;">
                <i class="fas fa-lightbulb"></i> ${place.tips.substring(0, 60)}${place.tips.length > 60 ? '...' : ''}
            </div>` : ''}
            <div class="place-coord" style="margin-top: 12px; font-size: 11px; color: #9ca3af; font-family: monospace;">
                📍 ${parseFloat(place.lat).toFixed(5)}, ${parseFloat(place.lng).toFixed(5)}
            </div>
        </div>
    `;
}

/**
 * 跳轉到搜索結果位置
 */
function flyToSearchResult(lat, lng, nameOrPlace) {
    map.flyTo([lat, lng], 16, { duration: 1.5 });
    
    let placeData = null;
    if (typeof nameOrPlace === 'object' && nameOrPlace !== null) {
        placeData = nameOrPlace;
    } else {
        // 如果傳遞的是名稱，嘗試在 currentSearchResults 中尋找完整數據
        placeData = currentSearchResults.find(p => 
            p.name === nameOrPlace && 
            Math.abs(p.lat - lat) < 0.0001 && 
            Math.abs(p.lng - lng) < 0.0001
        );
    }
    
    let content;
    if (placeData) {
        content = createSearchResultPopupContent(placeData);
    } else {
        // 如果還是找不到（例如是兼容舊調用或自定義釘選），顯示簡單內容
        content = `
            <div class="place-popup">
                <h4 style="margin: 0 0 8px 0;">${nameOrPlace || '未知地點'}</h4>
                <div class="place-coord" style="font-size: 12px; color: #9ca3af;">
                    📍 ${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}
                </div>
            </div>
        `;
    }
    
    // 顯示 popup
    L.popup({
        maxWidth: 280,
        className: 'location-search-popup'
    })
    .setLatLng([lat, lng])
    .setContent(content)
    .openOn(map);
}

/**
 * 清除搜索結果從列表
 */
function clearSearchResultsFromList() {
    // 1. 清空全局搜索結果數據
    currentSearchResults = [];
    
    // 2. 重新渲染兩個面板
    renderAttractionList();
    renderMobilePanelList();
    
    // 3. 同時清除地圖標記
    clearSearchMarkers();
    
    // 4. 清除聊天地點持久化
    clearChatPlaces();

    console.log('[Search] Cleared all search results from global state and refreshed panels');
}

/**
 * HTML 轉義
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 切換加載狀態
 */
function toggleLoadingState(isSyncing) {
    const loadingEl = document.getElementById('pinned-loading');
    if (loadingEl) {
        if (isSyncing) {
            loadingEl.classList.remove('hidden');
        } else {
            loadingEl.classList.add('hidden');
        }
    }
}

// ==================== 願望清單（Wishlist）系統 ====================

/**
 * 願望清單管理器 — localStorage 持久化存儲
 * 數據結構: { id: string, name, lat, lng, category, price, description, addedAt }
 */
const WishlistManager = {
    STORAGE_KEY: 'seoul_tour_wishlist',

    /** 獲取所有願望清單項目 */
    getAll() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('[Wishlist] Read error:', e);
            return [];
        }
    },

    /** 保存願望清單 */
    save(items) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
            // 同步到伺服器
            this.syncToServer(items);
        } catch (e) {
            console.error('[Wishlist] Save error:', e);
        }
    },

    /** 同步到伺服器 */
    async syncToServer(items) {
        try {
            toggleLoadingState(true);
            const response = await fetch('/api/sync-locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items)
            });
            if (response.ok) {
                console.log('[Wishlist] Synced to server');
            }
        } catch (e) {
            console.warn('[Wishlist] Sync to server failed:', e);
        } finally {
            toggleLoadingState(false);
        }
    },

    /** 啟動 SSE 實時同步 */
    startSyncStream() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource('/api/stream-locations');

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.success && data.locations) {
                    this._mergeRemoteLocations(data.locations);
                }
            } catch (e) {
                console.warn('[Wishlist] SSE parse error:', e);
            }
        };

        this.eventSource.onerror = (error) => {
            console.warn('[Wishlist] SSE connection error. Browser will auto-reconnect...', error);
        };
    },

    /** 合併遠端數據 */
    _mergeRemoteLocations(remoteLocations) {
        const localItems = this.getAll();
        const localMap = new Map(localItems.map(i => [i.id, i]));
        
        let merged = [];
        let changed = false;
        
        remoteLocations.forEach(remoteItem => {
            // 嚴格數據驗證：確保 remoteItem 有效且包含必要的經緯度
            if (!remoteItem.id || !remoteItem.name || 
                remoteItem.lat === undefined || remoteItem.lng === undefined ||
                isNaN(parseFloat(remoteItem.lat)) || isNaN(parseFloat(remoteItem.lng))) {
                return;
            }

            if (!localMap.has(remoteItem.id)) {
                merged.push(remoteItem);
                changed = true;
            } else {
                const localItem = localMap.get(remoteItem.id);
                const remoteTime = remoteItem.updatedAt || remoteItem.addedAt || 0;
                const localTime = localItem.updatedAt || localItem.addedAt || 0;

                if (remoteTime > localTime) {
                    merged.push(remoteItem);
                    if (localItem.wish !== remoteItem.wish ||
                        localItem.pinned !== remoteItem.pinned ||
                        localItem.visited !== remoteItem.visited ||
                        localItem.myRemark !== remoteItem.myRemark) {
                        changed = true;
                    }
                } else {
                    merged.push(localItem);
                }
                localMap.delete(remoteItem.id);
            }
        });

        // 將本地有但遠端沒有的項目也加回去（雖然伺服器應該會返回全部）
        localMap.forEach(item => merged.push(item));
        
        if (changed) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
            this._notifyChange();
            console.log(`[Wishlist] Synced changes from server via SSE`);
        }
    },

    /** 生成唯一 ID */
    _generateId(name, lat, lng) {
        // 用 name+坐標 作為唯一標識，避免重複
        return `wl_${name}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
    },

    /** 添加或更新項目 */
    add(item) {
        if (!item.name || item.lat === undefined || item.lng === undefined) {
            console.error('[Wishlist] Cannot add invalid item:', item);
            return false;
        }
        const items = this.getAll();
        const id = this._generateId(item.name, item.lat, item.lng);

        const existingIdx = items.findIndex(i => i.id === id);
        if (existingIdx >= 0) {
            // Update existing
            items[existingIdx] = {
                ...items[existingIdx],
                wish: item.wish !== undefined ? item.wish : items[existingIdx].wish,
                pinned: item.pinned !== undefined ? item.pinned : items[existingIdx].pinned,
                visited: item.visited !== undefined ? item.visited : items[existingIdx].visited,
                myRemark: item.myRemark !== undefined ? item.myRemark : (items[existingIdx].myRemark || ''),
                category: item.category || items[existingIdx].category,
                price: item.price || items[existingIdx].price,
                description: item.description || items[existingIdx].description,
                updatedAt: Date.now()
            };
            console.log('[Wishlist] Updated:', item.name);
        } else {
            // Add new
            items.push({
                id: id,
                name: item.name,
                lat: item.lat,
                lng: item.lng,
                category: item.category || '',
                price: item.price || '',
                description: item.description || '',
                addedAt: Date.now(),
                updatedAt: Date.now(),
                ownerFingerprint: FingerprintManager.getFingerprint(),
                wish: item.wish || false,
                pinned: item.pinned || false,
                visited: item.visited || false,
                myRemark: item.myRemark || ''
            });
            console.log('[Wishlist] Added:', item.name);
        }

        this.save(items);
        this._notifyChange();
        return true;
    },

    /** 從願望清單移除 */
    remove(id) {
        let items = this.getAll();
        items = items.filter(i => i.id !== id);
        this.save(items);
        console.log('[Wishlist] Removed:', id);
        this._notifyChange();
    },

    /** 獲取指定地點 */
    get(name, lat, lng) {
        const id = this._generateId(name, lat, lng);
        return this.getAll().find(i => i.id === id);
    },

    /** 切換願望清單狀態（切換 wish 屬性） */
    toggle(item) {
        const id = this._generateId(item.name, item.lat, item.lng);
        const existing = this.get(item.name, item.lat, item.lng);
        
        let newWishState = true;
        if (existing) {
            newWishState = !existing.wish;
        }

        item.wish = newWishState;
        this.add(item); // add will update existing
        
        // 如果所有屬性都為 false 且沒有備註，可以考慮移除（此處保留為歷史紀錄亦可）
        // 為了簡單起見，我們保留該紀錄
        
        return newWishState;
    },

    /** 檢查是否已在願望清單 */
    has(name, lat, lng) {
        const item = this.get(name, lat, lng);
        return item ? !!item.wish : false;
    },

    /** 獲取項目數量 */
    count() {
        return this.getAll().length;
    },

    /** 觸發 UI 更新事件 */
    _notifyChange() {
        // 更新釘選位置面板
        renderPinnedPanel();
        // 更新景點列表中的心形按鈕狀態
        updateAllWishlistButtons();
        // 更新側邊欄釘選計數
        updatePinnedCount();
        // 更新地圖上的釘選標記
        renderPinnedMarkers();

        // 重新渲染景點列表和標記 (不再限制分類，因為同步的景點可能屬於任何分類)
        renderAttractionList();
        if (typeof renderMobilePanelList === 'function') renderMobilePanelList();
        addMarkers();
    }
};

/**
 * 渲染釘選位置面板
 */
function renderPinnedPanel() {
    const container = document.getElementById('pinned-list');
    const countEl = document.getElementById('pinned-count');
    if (!container) return;

    const allItems = WishlistManager.getAll();
    const items = allItems.filter(item => item.pinned);
    
    if (countEl) countEl.textContent = items.length > 0 ? items.length.toString() : '0';
    if (countEl) countEl.dataset.count = items.length;

    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="pinned-empty"><i class="fas fa-thumbtack"></i> 沒有釘選位置<br><small>在地圖上點擊並選擇「釘選此位置」添加</small></div>';
        return;
    }

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'pinned-item';
        el.dataset.wishlistId = item.id;

        const color = CATEGORY_COLORS[item.category] || '#667eea';
        const priceHtml = item.price ? `<span class="pinned-price">💰 ${item.price}</span>` : '';

        el.innerHTML = `
            <div class="pinned-thumb" style="background:${color}20;color:${color}">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="pinned-info">
                <div class="pinned-name">${item.name}</div>
                <div class="pinned-meta">
                    <span class="pinned-cat" style="background:${color}">${item.category}</span>
                    ${priceHtml}
                </div>
            </div>
            <button class="pinned-edit-btn" data-wishlist-id="${item.id}" title="編輯備註" style="background: none; border: none; cursor: pointer; color: #666; margin-right: 5px;">
                <i class="fas fa-edit"></i>
            </button>
            <button class="pinned-remove-btn" data-wishlist-id="${item.id}" title="移除釘選">
                <i class="fas fa-times"></i>
            </button>
        `;

        // 點擊跳轉
        el.addEventListener('click', (e) => {
            if (e.target.closest('.pinned-remove-btn') || e.target.closest('.pinned-edit-btn')) return;
            map.flyTo([item.lat, item.lng], 16, { duration: 1.5 });
        });

        // 編輯按鈕
        const editBtn = el.querySelector('.pinned-edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSaveLocationModal(item.lat, item.lng, item.name);
        });

        // 移除按鈕
        const removeBtn = el.querySelector('.pinned-remove-btn');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            WishlistManager.remove(item.id);
        });

        container.appendChild(el);
    });
}

/**
 * 更新側邊欄釘選計數
 */
function updatePinnedCount() {
    const badge = document.getElementById('pinned-count');
    if (badge) {
        const items = WishlistManager.getAll().filter(item => item.pinned);
        const count = items.length;
        badge.textContent = count > 0 ? count.toString() : '0';
        badge.dataset.count = count;
    }
}

/**
 * 更新所有願望清單按鈕狀態
 */
function updateAllWishlistButtons() {
    document.querySelectorAll('.wishlist-btn').forEach(btn => {
        const name = btn.dataset.name;
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        if (name && !isNaN(lat) && !isNaN(lng)) {
            const inList = WishlistManager.has(name, lat, lng);
            btn.classList.toggle('in-wishlist', inList);
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = inList ? 'fas fa-heart' : 'far fa-heart';
            }
        }
    });
}

/**
 * 切換願望清單（通用按鈕 handler）
 */
function toggleWishlist(btn) {
    const name = btn.dataset.name;
    const lat = parseFloat(btn.dataset.lat);
    const lng = parseFloat(btn.dataset.lng);
    if (!name || isNaN(lat) || isNaN(lng)) return;

    const item = {
        name: name,
        lat: lat,
        lng: lng,
        category: btn.dataset.category || '',
        price: btn.dataset.price || '',
        description: btn.dataset.description || ''
    };

    const added = WishlistManager.toggle(item);

    // 更新按鈕外觀
    btn.classList.toggle('in-wishlist', added);
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = added ? 'fas fa-heart' : 'far fa-heart';
    }

    // 顯示提示
    const toast = document.createElement('div');
    toast.className = 'wishlist-toast';
    toast.innerHTML = added
        ? `<i class="fas fa-heart" style="color:#e74c3c"></i> 已加入願望清單`
        : `<i class="far fa-heart"></i> 已從願望清單移除`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// ==================== 系統狀態檢查 ====================
/**
 * 頁面啟動時檢查後端 AI 服務等狀態
 * 喺 chat header 顯示狀態指示器（綠色=正常，黃色=降級，紅色=離線）
 */
async function checkSystemStatus() {
    const statusDot = document.getElementById('system-status');
    const statusBar = document.getElementById('system-status-bar');
    const statusAi = document.getElementById('status-ai');
    const statusHermes = document.getElementById('status-hermes');

    // 設為檢查中狀態
    statusDot.className = 'status-indicator status-checking';
    statusDot.title = '正在檢查系統狀態...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超時

        const response = await fetch('/api/health', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // 更新 AI 狀態
        const ai = data.services?.ai || {};
        const aiEl = statusAi.querySelector('span');
        const aiStatus = ai.status || 'unknown';
        const aiLatency = ai.latency_ms;

        if (aiStatus === 'online') {
            aiEl.textContent = `AI：在線 (${aiLatency}ms)`;
            statusAi.classList.add('status-online');
            statusAi.classList.remove('status-offline', 'status-degraded');
        } else if (aiStatus === 'reachable') {
            aiEl.textContent = `AI：有限 (${aiLatency}ms)`;
            statusAi.classList.add('status-degraded');
            statusAi.classList.remove('status-online', 'status-offline');
        } else {
            aiEl.textContent = `AI：離線`;
            statusAi.classList.add('status-offline');
            statusAi.classList.remove('status-online', 'status-degraded');
        }
        // 顯示 model 資訊
        if (ai.model) {
            aiEl.textContent += ` [${ai.model}]`;
        }

        // 更新 Hermes/搜索 狀態
        const hermes = data.services?.hermes || {};
        const search = data.services?.search || {};
        const hermesEl = statusHermes.querySelector('span');

        const hermesStatus = hermes.status || 'unknown';
        const hermesEnabled = hermes.enabled;

        if (!hermesEnabled) {
            hermesEl.textContent = '搜索：基本模式';
            statusHermes.classList.add('status-degraded');
            statusHermes.classList.remove('status-online', 'status-offline');
        } else if (hermesStatus === 'idle') {
            hermesEl.textContent = '搜索：就緒 ✓';
            statusHermes.classList.add('status-online');
            statusHermes.classList.remove('status-offline', 'status-degraded');
        } else if (hermesStatus === 'busy') {
            hermesEl.textContent = '搜索：處理中...';
            statusHermes.classList.add('status-online');
            statusHermes.classList.remove('status-offline', 'status-degraded');
        } else if (hermesStatus === 'overloaded') {
            hermesEl.textContent = '搜索：繁忙';
            statusHermes.classList.add('status-degraded');
            statusHermes.classList.remove('status-online', 'status-offline');
        } else {
            hermesEl.textContent = '搜索：' + (search.status === 'available' ? '可用' : '不可用');
            statusHermes.classList.add('status-online');
            statusHermes.classList.remove('status-offline', 'status-degraded');
        }

        // 設定整體狀態指示器
        if (data.status === 'ok') {
            statusDot.className = 'status-indicator status-online';
            statusDot.title = '系統正常運行';
            // 如果所有服務都 OK，5秒後自動隱藏狀態欄
            setTimeout(() => {
                statusBar.classList.add('hidden');
            }, 5000);
        } else if (data.status === 'degraded') {
            statusDot.className = 'status-indicator status-degraded';
            statusDot.title = '部分服務不可用';
            // 降級狀態保持顯示
        } else {
            statusDot.className = 'status-indicator status-offline';
            statusDot.title = '服務離線';
        }

        // 顯示狀態欄
        statusBar.classList.remove('hidden');

    } catch (err) {
        console.error('[Status Check] Failed:', err);
        statusDot.className = 'status-indicator status-offline';
        statusDot.title = '無法連接伺服器';

        const aiEl = statusAi.querySelector('span');
        const hermesEl = statusHermes.querySelector('span');
        aiEl.textContent = 'AI：無法連接';
        hermesEl.textContent = '搜索：無法連接';
        statusAi.classList.add('status-offline');
        statusHermes.classList.add('status-offline');

        statusBar.classList.remove('hidden');
    }
}

// 點擊狀態指示器展開/收起詳情
document.addEventListener('DOMContentLoaded', () => {
    // 啟動時建立 SSE 連線以實時同步地點
    WishlistManager.startSyncStream();
    
    const statusDot = document.getElementById('system-status');
    const statusBar = document.getElementById('system-status-bar');
    if (statusDot && statusBar) {
        statusDot.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止觸發 chat toggle
            statusBar.classList.toggle('hidden');
        });
        // 同時提供重新檢查功能
        statusDot.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            checkSystemStatus();
        });
    }
});

// For testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WishlistManager,
        saveLocationData,
        renderPinnedPanel,
        updatePinnedCount,
        toggleLoadingState,
        addMessage,
        saveChatHistory,
        loadChatHistory,
        executeMapAction,
        getChatHistory: () => chatHistory,
        CHAT_HISTORY_KEY,
        getFilteredAttractions,
        setPanelSearchQuery,
        handlePanelSearchInput,
        clearPanelSearch,
        CATEGORY_COLORS,
        CATEGORY_EMOJIS,
        setAttractionsDataForTest: (data) => { attractionsData = data; },       
        setMapForTest: (testMap) => { map = testMap; },
        addMarkers,
        calculateHaversineDistance,
        radiusState,
        applyRadiusFilter,
        clearRadiusFilter,
        parseRadiusSlashCommand
    };
}
