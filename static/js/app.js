/**
 * 首爾旅遊地圖平台 - 主程式
 */

// ==================== 全局變量 ====================
let map;
let markers = {};
let subwayLines = [];
let subwayLayerGroup;
let routeLayerGroup;
let attractionsData = [];
let subwayData = {};
let activeCategory = 'all';
let sidebarOpen = false;

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

        marker.on('click', () => {
            showAttractionDetail(attr);
        });

        markers[attr.id] = marker;
    });
}

function createPopupContent(attr) {
    const color = CATEGORY_COLORS[attr.category] || '#666';
    return `
        <div class="popup-card">
            <img src="${attr.image}" alt="${attr.name}" onerror="this.style.display='none'">
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

    // 手機版側邊欄開關
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.toggle('open');
                sidebarToggle.innerHTML = sidebar.classList.contains('open')
                    ? '<i class="fas fa-times"></i> 關閉'
                    : '<i class="fas fa-bars"></i> 景點';
            }
        });
    }

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

// ==================== AI 聊天功能 ====================
let useBackendAI = true; // 優先使用後端 AI

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
            system: getSystemContext()
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.reply || generateAIReply(userText);
}

function getSystemContext() {
    // 提供當前景點資料作為 AI 上下文
    const attractionsSummary = attractionsData.map(a =>
        `- ${a.name}(${a.name_ko}): ${a.category}，${a.description.substring(0, 50)}，門票${a.ticket}，交通${a.transport.subway}`
    ).join('\n');

    return `你係韓國首爾旅遊專家，用粵語（廣東話書面）回答。\n\n可用景點資料：\n${attractionsSummary}\n\n請基於以上資料回答用戶問題，如果不確定就老實講唔知。`;
}

function addMessage(text, sender) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    // Render Markdown for bot messages using marked.js
    const displayText = sender === 'bot' ? marked.parse(text) : text;
    div.innerHTML = `
        <div class="avatar"><i class="fas fa-${sender === 'bot' ? 'robot' : 'user'}"></i></div>
        <div class="bubble">${displayText}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
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
    
    if (sidebar && toggleBtn) {
        sidebarOpen = false;
        sidebar.classList.remove('open');
        toggleBtn.innerHTML = '<i class="fas fa-bars"></i> 景點';
    }
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
                ? '<i class="fas fa-times"></i>'
                : '<i class="fas fa-bars"></i>';
        });

        if (overlay) {
            overlay.addEventListener('click', () => {
                closeSidebar();
            });
        }
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
});
