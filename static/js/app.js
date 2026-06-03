/**
 * 首爾旅遊地圖平台 - 主程式
 */

// ==================== 全局變量 ====================
let map;
let markers = {};
let subwayLines = [];
let subwayLayerGroup;
let routeLayerGroup;
let searchMarkersLayerGroup;  // Chatbot 搜索標記圖層
let attractionsData = [];
let subwayData = {};
let activeCategory = 'all';
let sidebarOpen = false;

// 對話歷史（保留最近 10 輪對話）
let chatHistory = [];
const MAX_HISTORY = 10;

// 分類顏色對應
const CATEGORY_COLORS = {
    '歷史文化': '#e74c3c',
    '地標觀景': '#3498db',
    '購物美食': '#f39c12',
    '夜生活文化': '#9b59b6',
    '娛樂': '#e91e63',
    '休閒': '#1abc9c',
    '自然景觀': '#27ae60'
};

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
    searchMarkersLayerGroup = L.layerGroup().addTo(map);  // 初始化搜索標記圖層

    map.on("click", onMapClick);
}

// ==================== 地圖點擊搜尋 ====================
function onMapClick(e) {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    
    const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(`
            <div class="coord-popup">
                <div class="coord-latlng">📍 ${lat}, ${lng}</div>
                <button class="search-nearby-btn" onclick="searchNearby(${lat}, ${lng})">
                    搜尋附近資訊
                </button>
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
    }).map(attr => `${attr.name} (${attr.name_ko}) - ${attr.category}`).join('\n');
    
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

// ==================== 載入資料 ====================
async function loadData() {
    try {
        const [attrRes, subwayRes] = await Promise.all([
            fetch('static/data/attractions.json'),
            fetch('static/data/subway.json')
        ]);
        const attrData = await attrRes.json();
        const subData = await subwayRes.json();

        attractionsData = attrData.attractions;
        subwayData = subData;
    } catch (e) {
        console.error('載入資料失敗:', e);
    }
}

// ==================== 景點列表 ====================
function renderAttractionList() {
    const container = document.getElementById('attraction-list');
    container.innerHTML = '';

    const filtered = activeCategory === 'all'
        ? attractionsData
        : attractionsData.filter(a => a.category === activeCategory);

    filtered.forEach(attr => {
        const item = document.createElement('div');
        item.className = 'attraction-item';
        item.dataset.id = attr.id;

        const color = CATEGORY_COLORS[attr.category] || '#666';

        item.innerHTML = `
            <img class="thumb" src="${attr.image}" alt="${attr.name}" loading="lazy"
                 onerror="this.src='https://placehold.co/70?text=${encodeURIComponent(attr.name)}'">
            <div class="info">
                <div class="name">${attr.name}</div>
                <span class="category-tag" style="background:${color}">${attr.category}</span>
                <div class="desc">${attr.description}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            focusAttraction(attr);
        });

        container.appendChild(item);
    });
}

// ==================== 地圖標記 ====================
function addMarkers() {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    const filtered = activeCategory === 'all'
        ? attractionsData
        : attractionsData.filter(a => a.category === activeCategory);

    filtered.forEach(attr => {
        const color = CATEGORY_COLORS[attr.category] || '#666';

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
    });
}

function createPopupContent(attr) {
    const color = CATEGORY_COLORS[attr.category] || '#666';
    return `
        <div class="popup-card">
            <div class="popup-info">
                <div class="popup-name">${attr.name}</div>
                <div class="popup-ko">${attr.name_ko}</div>
                <span class="popup-cat" style="background:${color}">${attr.category}</span>
                <div class="popup-desc">${attr.description.substring(0, 60)}...</div>
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
    const attr = attractionsData.find(a => a.id === id);
    if (attr) showAttractionDetail(attr);
}

function showAttractionDetail(attr) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const color = CATEGORY_COLORS[attr.category] || '#666';

    const highlights = attr.highlights.map(h => `<li>${h}</li>`).join('');

    body.innerHTML = `
        <img class="modal-hero" src="${attr.image}" alt="${attr.name}" onerror="this.src='https://placehold.co/500x220?text=${encodeURIComponent(attr.name)}'">
        <div class="modal-info">
            <div class="modal-title">${attr.name}</div>
            <div class="modal-ko">${attr.name_ko}</div>
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
                <h4><i class="fas fa-subway"></i> 交通資訊</h4>
                <p><strong>地鐵：</strong>${attr.transport.subway}</p>
                <p><strong>步程：</strong>${attr.transport.time_from_station}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-ticket-alt"></i> 門票</h4>
                <p>${attr.ticket}</p>
            </div>

            <div class="modal-section">
                <h4><i class="fas fa-clock"></i> 開放時間</h4>
                <p>${attr.hours}</p>
            </div>

            <div class="modal-tips">
                <i class="fas fa-lightbulb"></i>
                <strong>小貼士：</strong>${attr.tips}
            </div>

            <div class="modal-actions">
                <button class="btn-route" onclick="planRouteTo('${attr.id}')">
                    <i class="fas fa-route"></i> 規劃路線
                </button>
                <a class="btn-gmaps" href="https://www.google.com/maps/search/?api=1&query=${attr.lat},${attr.lng}" target="_blank" rel="noopener">
                    <i class="fas fa-map-marker-alt"></i> Google Maps
                </a>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

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
            const latlngs = line.stations.map(s => [s.lat, s.lng]);
            L.polyline(latlngs, {
                color: line.color,
                weight: 4,
                opacity: 0.7
            }).addTo(subwayLayerGroup);

            line.stations.forEach(station => {
                L.circleMarker([station.lat, station.lng], {
                    radius: 5,
                    fillColor: line.color,
                    color: 'white',
                    weight: 2,
                    fillOpacity: 1
                }).addTo(subwayLayerGroup)
                .bindPopup(`<b>${station.name}站</b><br>${line.name}`);
            });
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

// ==================== AI 地圖動作執行 ====================
async function executeMapAction(action, params) {
    console.log('[Map Action]', action, params);
    
    switch (action) {
        case 'center': {
            const { lat, lng, zoom } = params;
            map.setView([lat, lng], zoom || 15);
            break;
        }
        case 'focus_attraction': {
            const attr = attractionsData.find(a => a.id === params.id);
            if (attr) {
                focusAttraction(attr);
            } else {
                // 嘗試用名稱搵
                const name = params.id;
                const found = attractionsData.find(a => 
                    a.name.includes(name) || a.name_ko.includes(name)
                );
                if (found) focusAttraction(found);
            }
            break;
        }
        case 'highlight_category': {
            const { category } = params;
            activeCategory = category;
            // 觸發分類篩選 UI 更新
            document.querySelectorAll('.cat-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === category) {
                    btn.classList.add('active');
                }
            });
            renderAttractionList();
            addMarkers();
            break;
        }
        case 'locate_user': {
            locateUser();
            break;
        }
        case 'show_route': {
            const { from, to } = params;
            showRouteOnMap(from, to);
            break;
        }
    }
}

// ==================== AI 路線顯示 ====================
function showRouteOnMap(fromName, toName) {
    // 嘗試用名稱或ID搵景點
    const fromAttr = attractionsData.find(a => 
        a.id === fromName || a.name.includes(fromName) || a.name_ko.includes(fromName)
    );
    const toAttr = attractionsData.find(a => 
        a.id === toName || a.name.includes(toName) || a.name_ko.includes(toName)
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
        });
    });

    // 手機版側邊欄開關（由 initSidebarToggle 處理）

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
            document.getElementById('toggle-map-lang').title = '切換至韓文地圖';
            document.getElementById('toggle-map-lang').innerHTML = '<i class="fas fa-globe"></i> 韓文';
        } else {
            // 切換到韓文地圖
            map.removeLayer(window.englishLayer);
            map.addLayer(window.osmLayer);
            document.getElementById('toggle-map-lang').title = '切換至英文地圖';
            document.getElementById('toggle-map-lang').innerHTML = '<i class="fas fa-globe"></i> English';
        }
    }
    const toggleMapLangBtn = document.getElementById('toggle-map-lang');
    if (toggleMapLangBtn) {
        toggleMapLangBtn.addEventListener('click', toggleMapLanguage);
    }
    // 定位我的位置
    const locateUserBtn = document.getElementById('locate-user');
    if (locateUserBtn) {
        locateUserBtn.addEventListener('click', locateUser);
    }
}

// ==================== AI 聊天功能 & 地圖控制 ====================
let useBackendAI = true; // 優先使用後端 AI

/**
 * 執行地圖控制動作
 * 支援動作: center, focus_attraction, highlight_category, locate_user, show_route
 * @param {string} action - 動作類型
 * @param {object} params - 動作參數
 * @returns {Promise<boolean>} 執行成功與否
 */
async function executeMapAction(action, params) {
    console.log('Executing map action:', action, params);

    switch (action) {
        case 'center':
            if (params.lat && params.lng) {
                const lat = parseFloat(params.lat);
                const lng = parseFloat(params.lng);
                const zoom = parseInt(params.zoom) || 15;

                // 飛到目的地（animate 效果）
                map.flyTo([lat, lng], zoom, {
                    duration: 1.5,
                    easeLinearity: 0.25
                });

                // 更新路由結果面板顯示
                console.log(`地圖已飛到: ${lat}, ${lng}, zoom ${zoom}`);
            }
            break;

        case 'focus_attraction':
            if (params.id) {
                const attr = attractionsData.find(a => a.id === params.id);
                if (attr) {
                    focusAttraction(attr);
                } else {
                    // 嘗試用名字查找
                    const attrByName = attractionsData.find(a =>
                        a.name.includes(params.id) || params.id.includes(a.name)
                    );
                    if (attrByName) {
                        focusAttraction(attrByName);
                    }
                }
            }
            break;

        case 'highlight_category':
            if (params.category) {
                // 檢查是否為有效分類
                const validCategories = Object.keys(CATEGORY_COLORS);
                const matchedCategory = validCategories.find(c =>
                    c === params.category || c.includes(params.category) || params.category.includes(c)
                );

                if (matchedCategory) {
                    activeCategory = matchedCategory;
                    // 更新 UI 按鈕狀態
                    document.querySelectorAll('.cat-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.category === matchedCategory);
                    });
                    // 重新渲染
                    renderAttractionList();
                    addMarkers();
                    console.log(`已篩選分類: ${matchedCategory}`);
                }
            }
            break;

        case 'locate_user':
            locateUser();
            break;

        case 'show_route':
            // 簡單顯示兩點路線
            if (params.from && params.to) {
                showRouteByNames(params.from, params.to);
            }
            break;

        case 'add_marker':
            // 添加搜索標記（用於顯示目的地）
            if (params.lat && params.lng) {
                const lat = parseFloat(params.lat);
                const lng = parseFloat(params.lng);
                const title = params.title || '目的地';
                const color = params.color || '#e74c3c';
                const popup = params.popup || title;
                const pulse = params.pulse !== false; // 默認開啟脈動效果
                
                addSearchMarker(lat, lng, title, color, popup, pulse);
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

        default:
            console.warn('Unknown map action:', action);
            return false;
    }

    return true;
}

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
            a.name_ko.includes(name) || name.includes(a.name_ko)
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

function toggleChat() {
    const chat = document.getElementById('ai-chat');
    chat.classList.toggle('collapsed');
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

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

async function fetchAIReply(userText) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: userText,
            system: getSystemContext(),
            history: chatHistory.slice(0, -1)  // 唔包剛加入嘅 user message
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
        `- ${a.name}(${a.name_ko}) [ID:${a.id}: ${a.lat},${a.lng}]: ${a.category}，${a.description.substring(0, 30)}...`
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
7. clear_search_markers (清除搜索標記)：【{"action":"clear_search_markers"}}】

景點ID：${attractionsData.map(a=>a.id).join(', ')}
分類：${categories}

景點資料：
${attractionsSummary}

【重要使用指引】
- 當用家講「去XX」、「睇吓XX」等需要移動地圖時，如果XX係已知景點ID，用 focus_attraction；如果係其他地點（如機場、火車站、區域名稱），用 add_marker 加上準確坐標
- 搜索結果在內文回答後，適宜用 add_marker 喺地圖標示位置
- 提及區域或商圈時，可用 add_polygon 顯示範圍
- 普通對答唔需要地圖指令`;
}

function addMessage(text, sender) {
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
                map.flyTo([lat, lng], 16, { duration: 1.5 });
                L.popup()
                    .setLatLng([lat, lng])
                    .setContent(`<b>${title}</b><br>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
                    .openOn(map);
                // Also add a search marker
                addSearchMarker(lat, lng, title, '#e74c3c', title, true);
            });
        });

        // Auto-execute add_marker and other actions
        autoActions.forEach(cmd => {
            const actName = cmd.action || cmd.type;
            const actParams = cmd.params || {};
            executeMapAction(actName, actParams);
        });
    }

    container.scrollTop = container.scrollHeight;
    
    // 儲存到對話歷史
    chatHistory.push({ role: sender === 'bot' ? 'assistant' : 'user', content: text });
    // 保留最近 N 輪對話
    if (chatHistory.length > MAX_HISTORY * 2) {
        chatHistory = chatHistory.slice(-MAX_HISTORY * 2);
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
                <span></span><span></span><span></span>
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
        if (text.includes(attr.name.toLowerCase()) || text.includes(attr.name_ko.toLowerCase())) {
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
}

// ==================== 手機側邊欄開關 ====================
function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebarOpen = false;
    if (sidebar) sidebar.classList.remove('open');
    if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-bars"></i> 景點';
    if (overlay) overlay.classList.remove('active');
}

function initSidebarToggle() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebarOpen = !sidebarOpen;
            sidebar.classList.toggle('open', sidebarOpen);
            toggleBtn.innerHTML = sidebarOpen 
                ? '<i class="fas fa-times"></i> 關閉'
                : '<i class="fas fa-bars"></i> 景點';
            if (overlay) {
                overlay.classList.toggle('active', sidebarOpen);
            }
        });

        if (overlay) {
            overlay.addEventListener('click', () => {
                closeSidebar();
            });
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
            // ===== 飛到指定坐標 =====
            case 'fly_to':
                // 飛到指定位置並顯示名稱
                if (params.lat !== undefined && params.lng !== undefined) {
                    const title = params.title || '位置';
                    map.flyTo([params.lat, params.lng], 16, { duration: 1.5 });
                    // 顯示 tooltip 提示
                    L.popup()
                        .setLatLng([params.lat, params.lng])
                        .setContent(`<b>${title}</b><br>📍 ${params.lat.toFixed(5)}, ${params.lng.toFixed(5)}`)
                        .openOn(map);
                    console.log(`[Map Action] Flying to ${params.lat}, ${params.lng} (${title})`);
                }
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
                .bindPopup(`<b>您的位置</b><br>緯度: ${latitude.toFixed(6)}<br>經度: ${longitude.toFixed(6)}<br>精確度: ±${accuracy}米`)
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
document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    initSidebarToggle();
    await loadData();
    renderAttractionList();
    addMarkers();
    initRoutePanel();
    initChat();
    bindEvents();
    // 頁面啟動時檢查系統狀態
    checkSystemStatus();
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
        iconSize: [40, 40],
        iconAnchor: [20, 40]
    });
    
    // 創建標記
    const marker = L.marker([lat, lng], { icon: customIcon })
        .addTo(searchMarkersLayerGroup)
        .bindPopup(`
            <div class="search-marker-popup">
                <h4>${title}</h4>
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
            if (analysis.landmark_name_ko) {
                reply += ` (${analysis.landmark_name_ko})`;
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
    
    // English 地圖（手機版）
    const burgerLang = document.getElementById('burger-toggle-lang');
    if (burgerLang) {
        burgerLang.addEventListener('click', function() {
            const desktopBtn = document.getElementById('toggle-map-lang');
            if (desktopBtn) desktopBtn.click();
            burgerDropdown.classList.remove('show');
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
    
    // 獲取列表容器
    const container = document.getElementById('attraction-list');
    if (!container) return;
    
    // 創建搜索結果區分隔（如果不存在）
    let searchResultsHeader = container.querySelector('.search-results-header');
    if (!searchResultsHeader) {
        searchResultsHeader = document.createElement('div');
        searchResultsHeader.className = 'search-results-header';
        searchResultsHeader.innerHTML = `
            <div class="search-results-title">
                <i class="fas fa-search"></i> 搜索結果
                <button class="clear-search-results" onclick="clearSearchResultsFromList()" title="清除搜索結果">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.insertBefore(searchResultsHeader, container.firstChild);
    }
    
    // 為每個地點添加列表項
    places.forEach((place, idx) => {
        // 跳過沒有坐標的
        if (!place.lat || !place.lng) return;
        
        // 檢查是否已存在（避免重複）
        const existingItem = container.querySelector(`[data-search-id="search-${place.lat}-${place.lng}"]`);
        if (existingItem) return;
        
        const category = typeToCategory[queryType] || place.category || '搜索結果';
        const color = CATEGORY_COLORS[category] || '#667eea';
        
        // 生成唯一 ID
        const searchId = `search-${place.lat.toFixed(4)}-${place.lng.toFixed(4)}`;
        
        const item = document.createElement('div');
        item.className = 'attraction-item search-result-item';
        item.dataset.searchId = searchId;
        item.dataset.lat = place.lat;
        item.dataset.lng = place.lng;
        
        item.innerHTML = `
            <div class="thumb-search" style="background: ${color}; color: white; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="info">
                <div class="name">${place.name}</div>
                <span class="category-tag" style="background:${color}">${category}</span>
                <div class="desc">${place.description ? place.description.substring(0, 60) + '...' : '搜索結果'}</div>
            </div>
            <button class="fly-to-btn" onclick="flyToSearchResult(${place.lat}, ${place.lng}, '${escapeHtml(place.name)}')" title="跳轉到地圖位置">
                <i class="fas fa-crosshairs"></i>
            </button>
        `;
        
        // 點擊整個項目也可以跳轉
        item.addEventListener('click', (e) => {
            // 如果點擊的是按鈕，不執行
            if (e.target.closest('.fly-to-btn')) return;
            flyToSearchResult(place.lat, place.lng, place.name);
        });
        
        // 插入到 header 後面
        container.insertBefore(item, searchResultsHeader.nextSibling);
    });
    
    console.log(`[Search] Added ${places.length} search results to list`);
}

/**
 * 跳轉到搜索結果位置
 */
function flyToSearchResult(lat, lng, name) {
    map.flyTo([lat, lng], 16, { duration: 1.5 });
    
    // 顯示 popup
    L.popup()
        .setLatLng([lat, lng])
        .setContent(`<b>${name}</b><br>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        .openOn(map);
}

/**
 * 清除搜索結果從列表
 */
function clearSearchResultsFromList() {
    const container = document.getElementById('attraction-list');
    if (!container) return;
    
    // 移除所有搜索結果項
    const searchItems = container.querySelectorAll('.search-result-item');
    searchItems.forEach(item => item.remove());
    
    // 移除搜索結果標題
    const header = container.querySelector('.search-results-header');
    if (header) header.remove();
    
    // 同時清除地圖標記
    clearSearchMarkers();
    
    console.log('[Search] Cleared all search results from list');
}

/**
 * HTML 轉義
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
