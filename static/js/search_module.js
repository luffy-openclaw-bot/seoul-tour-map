/**
 * Search Module - 經緯度實時搜索前端模組
 * 模組化設計，與主 app.js 分離，易維護
 */

// ==================== 搜索配置 ====================
// 若部署到靜態伺服器，可通過全局 API_BASE_URL（在 app.js 中定義）補全
const API_PREFIX = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

const SearchConfig = {
    ENDPOINT: `${API_PREFIX}/api/search`,
    TIMEOUT: 60000,  // 60秒（含網頁搜索）
    DEFAULT_RADIUS: 2000,
    MAX_RESULTS: 5
};

// 搜索類型配置
const SearchTypes = {
    attractions: { icon: '🏛️', label: '景點', color: '#e74c3c' },
    restaurants: { icon: '🍜', label: '美食', color: '#f39c12' },
    hotels: { icon: '🏨', label: '酒店', color: '#3498db' },
    shopping: { icon: '🛍️', label: '購物', color: '#9b59b6' },
    transport: { icon: '🚇', label: '地鐵', color: '#3498db' },
    bus: { icon: '🚌', label: '巴士', color: '#2ecc71' },
    all: { icon: '🔍', label: '全部', color: '#27ae60' }
};

// ==================== 搜索彈窗 UI ====================
const SearchPopup = {
    currentLat: null,
    currentLng: null,
    popup: null,

    /**
     * 顯示搜索選擇彈窗
     */
    show(lat, lng) {
        this.currentLat = lat;
        this.currentLng = lng;

        const content = `
            <div class="search-popup-container">
                <div class="search-popup-header">
                    <div class="search-coord">📍 ${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}</div>
                    <div class="search-location-name" id="search-location-name">正在識別位置...</div>
                    <button class="open-map-btn" onclick="MapManager.openMap(${lat}, ${lng}); event.stopPropagation();">
                        <i class="fas fa-map"></i> 開啟地圖
                    </button>
                    <button class="pin-location-btn-mini" onclick="openSaveLocationModal(${lat}, ${lng}); SearchPopup.close();" title="儲存此位置">
                        <i class="fas fa-save"></i> 儲存
                    </button>
                </div>
                <div class="search-type-grid">
                    <button class="search-type-btn" data-type="attractions" style="--btn-color: ${SearchTypes.attractions.color}" aria-label="搜索景點">
                        <span class="search-icon">${SearchTypes.attractions.icon}</span>
                        <span>${SearchTypes.attractions.label}</span>
                    </button>
                    <button class="search-type-btn" data-type="restaurants" style="--btn-color: ${SearchTypes.restaurants.color}" aria-label="搜索美食">
                        <span class="search-icon">${SearchTypes.restaurants.icon}</span>
                        <span>${SearchTypes.restaurants.label}</span>
                    </button>
                    <button class="search-type-btn" data-type="hotels" style="--btn-color: ${SearchTypes.hotels.color}" aria-label="搜索酒店">
                        <span class="search-icon">${SearchTypes.hotels.icon}</span>
                        <span>${SearchTypes.hotels.label}</span>
                    </button>
                    <button class="search-type-btn" data-type="shopping" style="--btn-color: ${SearchTypes.shopping.color}" aria-label="搜索購物">
                        <span class="search-icon">${SearchTypes.shopping.icon}</span>
                        <span>${SearchTypes.shopping.label}</span>
                    </button>
                    <button class="search-type-btn" data-type="transport" style="--btn-color: ${SearchTypes.transport.color}" aria-label="搜索地鐵">
                        <span class="search-icon">${SearchTypes.transport.icon}</span>
                        <span>${SearchTypes.transport.label}</span>
                    </button>
                    <button class="search-type-btn" data-type="bus" style="--btn-color: ${SearchTypes.bus.color}" aria-label="搜索巴士">
                        <span class="search-icon">${SearchTypes.bus.icon}</span>
                        <span>${SearchTypes.bus.label}</span>
                    </button>
                    <button class="search-type-btn search-all-btn" data-type="all" style="--btn-color: ${SearchTypes.all.color}" aria-label="搜索全部類型">
                        <span class="search-icon">${SearchTypes.all.icon}</span>
                        <span>${SearchTypes.all.label}</span>
                    </button>
                </div>
            </div>
        `;

        this.popup = L.popup({
            closeButton: true,
            className: 'location-search-popup',
            autoPan: true,
            autoPanPadding: [50, 50]
        })
        .setLatLng([lat, lng])
        .setContent(content)
        .openOn(map);

        // 綁定按鈕事件
        this.bindEvents();

        // 預先獲取位置名稱
        this.fetchLocationName(lat, lng);

        return this.popup;
    },

    /**
     * 綁定按鈕點擊事件
     */
    bindEvents() {
        const buttons = document.querySelectorAll('.search-type-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // 防止重複點擊
                if (btn.classList.contains('is-loading')) return;
                
                const type = btn.dataset.type;
                
                // 顯示加載狀態
                btn.classList.add('is-loading');
                buttons.forEach(b => b.style.pointerEvents = 'none'); // 禁用所有按鈕
                
                try {
                    // 執行搜索並等待完成
                    await SearchExecutor.execute(this.currentLat, this.currentLng, type);
                } finally {
                    // 搜索完成後關閉彈窗
                    this.close();
                }
            });
        });
    },

    /**
     * 獲取位置名稱（用於顯示）
     */
    async fetchLocationName(lat, lng) {
        try {
            // 使用簡易逆地理編碼
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&accept-language=zh`);
            const data = await response.json();
            const nameEl = document.getElementById('search-location-name');
            if (nameEl && data.display_name) {
                const shortName = data.display_name.split(',')[0];
                nameEl.textContent = `📍 ${shortName}`;
            }
        } catch (e) {
            console.log('Location name fetch failed:', e);
        }
    },

    /**
     * 關閉彈窗
     */
    close() {
        if (this.popup && map) {
            map.closePopup(this.popup);
            this.popup = null;
        }
    }
};

// ==================== 搜索執行器 ====================
const SearchExecutor = {
    abortController: null,

    /**
     * 執行搜索
     */
    async execute(lat, lng, queryType) {
        // 取消之前的搜索
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // 處理交通查詢 (調用 app.js 中的現有邏輯)
        if (queryType === 'transport') {
            if (typeof searchNearbyTransport === 'function') {
                try {
                    await searchNearbyTransport(lat, lng);
                } catch (error) {
                    console.error('Transport search error:', error);
                    SearchUI.displayError('交通查詢出錯', lat, lng, queryType);
                }
                return;
            }
        }

        // 在聊天框顯示搜索中狀態
        const typeInfo = SearchTypes[queryType];
        SearchUI.showSearching(lat, lng, typeInfo);

        try {
            // Explicit timeout wrapper
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), SearchConfig.TIMEOUT)
            );

            const response = await Promise.race([
                fetch(SearchConfig.ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat: parseFloat(lat),
                        lng: parseFloat(lng),
                        query_type: queryType,
                        radius: SearchConfig.DEFAULT_RADIUS
                    }),
                    signal: this.abortController.signal
                }),
                timeoutPromise
            ]);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                SearchUI.displayResults(result.data, queryType);
                // 在地圖上標記結果
                SearchMap.markResults(result.data.places, lat, lng);
            } else {
                SearchUI.displayError(result.error || '搜索失敗', lat, lng, queryType);
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Search aborted');
                return;
            }
            console.error('Search error:', error);
            SearchUI.displayError('搜索出錯，請稍後再試', lat, lng, queryType);
        } finally {
            this.abortController = null;
        }
    },

    /**
     * 取消當前搜索
     */
    cancel() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
};

// ==================== 搜索 UI 渲染 ====================
const SearchUI = {
    /**
     * 顯示搜索中狀態
     */
    showSearching(lat, lng, typeInfo) {
        const message = `🔍 正在搜索 ${typeInfo.label}...\n\n坐標：${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
        addMessage(message, 'user');

        // 自動展開 chatbot widget 以顯示新內容
        const chatWidget = document.getElementById('ai-chat');
        if (chatWidget && chatWidget.classList.contains('collapsed')) {
            chatWidget.classList.remove('collapsed');
        }

        // 顯示加載動畫
        showTyping();

        // 更新打字指示器內容
        const typingIndicator = document.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.innerHTML = `
                <span class="search-loading">
                    <i class="fas fa-search"></i> 實時搜索中
                    <span class="loading-dots"></span>
                </span>
            `;
        }
    },



    /**
     * 顯示搜索結果
     */
    displayResults(data, queryType) {
        hideTyping();

        const typeInfo = SearchTypes[queryType];
        const locationName = data.location_name || '該位置';

        // 構建 Markdown 結果
        let markdown = `## ${typeInfo.icon} **${locationName}** 周邊${typeInfo.label}搜索結果\n\n`;
        markdown += `${data.summary || ''}\n\n`;

        if (data.places && data.places.length > 0) {
            data.places.forEach((place, index) => {
                markdown += this.renderPlaceCard(place, index + 1);
            });

            // 添加搜索來源
            markdown += `\n---\n`;
            
            let sourceText = "實時網頁搜索 (DuckDuckGo) + AI 分析";
            if (data.source === 'official_public_api') {
                sourceText = "🏛️ 官方數據 (VisitKorea / Google Places / Seoul Data) + AI 總結";
            } else if (data.source === 'ai_knowledge') {
                sourceText = "🤖 AI 內置旅遊知識";
            }
            
            markdown += `📊 **數據來源**：${sourceText}\n`;
            markdown += `🤖 **模型**：Gemma 31B Cloud\n`;
            
            // 自動添加到景點列表
            addSearchResultsToList(data.places, queryType);
        } else {
            markdown += `\n⚠️ 暫時未能找到該位置周邊的${typeInfo.label}資訊。\n`;
        }

        addMessage(markdown, 'bot');
    },

    /**
     * 渲染單個地點卡片
     */
    renderPlaceCard(place, index) {
        const highlights = place.highlights || [];
        const highlightsHtml = highlights.length > 0
            ? highlights.map(h => `✨ ${h}`).join(' | ')
            : '';

        const rating = place.rating ? `\n⭐ **評分**：${place.rating}` : '';
        const price = place.price ? `\n💰 **價格**：${place.price}` : '';
        const source = place.source ? `\n🔍 **來源**：${place.source}` : '';
        const tips = place.tips ? `\n💡 **貼士**：${place.tips}` : '';
        const review = place.latest_review ? `\n💬 **最新評價**：${place.latest_review}` : '';

        // 可點擊座標指令（如果有座標，轉為 fly_to action tag 供 addMessage 解析）
        const flyToAction = (place.lat && place.lng)
            ? `【{"action":"fly_to","params":{"lat":${place.lat},"lng":${place.lng},"title":"${this.escapeJson(place.name)}"}}】`
            : '';

        // 添加標記指令（如果有座標）
        const addMarkerAction = (place.lat && place.lng)
            ? `【{"action":"add_marker","params":{"lat":${place.lat},"lng":${place.lng},"title":"${this.escapeJson(place.name)}","color":"#e74c3c","pulse":true}}}】`
            : '';

        // 願望清單按鈕（JSON action tag 會被 addMessage 解析）
        const wishlistAction = (place.lat && place.lng)
            ? `【{"action":"add_to_wishlist","params":{"name":"${this.escapeJson(place.name)}","lat":${place.lat},"lng":${place.lng},"category":"${this.escapeJson(place.category)}","price":"${this.escapeJson(place.price || '')}","description":"${this.escapeJson(place.description ? place.description.substring(0, 60) : '')}"}}】`
            : '';

        // 標題：如果有座標，在標題後方加上 fly_to 連結（會被 addMessage 轉為可點擊）
        const titleSuffix = (place.lat && place.lng) ? '📍' : '';

        return `
### ${index}. ${place.name} ${titleSuffix} ${flyToAction}
**類別**：${place.category}${rating}${price}${source}

${place.description}

${highlightsHtml ? `**亮點**：${highlightsHtml}\n` : ''}${tips}${review}

${wishlistAction}
---
`;
    },

    /**
     * JSON 字符串轉義
     */
    escapeJson(str) {
        return str.replace(/["\\]/g, '\\$&');
    },

    /**
     * 顯示錯誤信息
     */
    displayError(error, lat, lng, queryType) {
        hideTyping();
        let retryBtn = '';
        if (lat !== undefined && lng !== undefined && queryType) {
            retryBtn = `<br><br><button class="btn-route" style="margin-top: 10px; padding: 5px 10px; border-radius: 4px; border: none; background-color: #e74c3c; color: white; cursor: pointer;" onclick="SearchExecutor.execute(${lat}, ${lng}, '${queryType}')"><i class="fas fa-redo"></i> 重試 (Try Again)</button>`;
        }
        addMessage(`❌ **搜索失敗**\n\n${error}\n\n請檢查網路連接或稍後再試。${retryBtn}`, 'bot');
    }
};

// ==================== 地圖標記管理 ====================
const SearchMap = {
    /**
     * 標記搜索結果到地圖
     */
    markResults(places, centerLat, centerLng) {
        // 清除舊標記
        if (typeof clearSearchMarkers === 'function') {
            clearSearchMarkers();
        } else if (window.searchMarkersLayerGroup) {
            window.searchMarkersLayerGroup.clearLayers();
        }

        if (!places || places.length === 0) {
            // 無結果，標記中心點
            this.addCenterMarker(centerLat, centerLng);
            return;
        }

        // 收集所有標記位置用於縮放
        const bounds = L.latLngBounds();

        // 為每個結果添加標記
        places.forEach((place, index) => {
            if (place.lat && place.lng) {
                const marker = this.addPlaceMarker(place, index + 1);
                bounds.extend([place.lat, place.lng]);
            }
        });

        // 飛到結果區域
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        } else {
            map.flyTo([centerLat, centerLng], 14);
        }
    },

    /**
     * 添加中心點標記
     */
    addCenterMarker(lat, lng) {
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'search-center-marker',
                html: '<div class="center-pin">📍</div>',
                iconSize: [30, 30]
            })
        });

        if (window.searchMarkersLayerGroup) {
            marker.addTo(window.searchMarkersLayerGroup);
        }

        marker.bindPopup('<b>搜索位置</b>');
        map.flyTo([lat, lng], 14);
    },

    /**
     * 添加地點標記
     */
    addPlaceMarker(place, index) {
        const colors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#27ae60'];
        const color = colors[(index - 1) % colors.length];

        const marker = L.marker([place.lat, place.lng], {
            icon: L.divIcon({
                className: 'search-result-marker',
                html: `
                    <div class="place-marker" style="--marker-color: ${color}">
                        <span class="marker-number">${index}</span>
                    </div>
                `,
                iconSize: [32, 32]
            })
        });

        if (window.searchMarkersLayerGroup) {
            marker.addTo(window.searchMarkersLayerGroup);
        }

        // 構建 popup 內容
        const popupContent = `
            <div class="place-popup">
                <h4>${place.name}</h4>
                <div class="place-category">${place.category}</div>
                <p>${place.description.substring(0, 100)}...</p>
                ${place.rating ? `<div class="place-rating">⭐ ${place.rating}</div>` : ''}
                ${place.price ? `<div class="place-price">💰 ${place.price}</div>` : ''}
            </div>
        `;

        marker.bindPopup(popupContent);

        return marker;
    }
};

// ==================== 工具函數 ====================
const SearchUtils = {
    /**
     * 格式化距離
     */
    formatDistance(meters) {
        if (meters < 1000) {
            return `${Math.round(meters)} 米`;
        }
        return `${(meters / 1000).toFixed(1)} 公里`;
    },

    /**
     * 防抖函數
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ==================== 初始化與導出 ====================
// 覆寫原有的 onMapClick 函數
function initLocationSearch() {
    // 保存原有的 onMapClick 如果存在
    if (typeof window.originalOnMapClick === 'undefined' && typeof onMapClick === 'function') {
        window.originalOnMapClick = onMapClick;
    }

    // 定義新的 onMapClick
    window.onMapClick = function(e) {
        // 如果有原始事件，防止預設行為（如手機長按彈出系統選單）
        if (e.originalEvent) {
            L.DomEvent.preventDefault(e.originalEvent);
        }

        // 如果正在使用範圍篩選的「在地圖上選取」功能，交由原始處理函數處理
        if (typeof window.radiusState !== 'undefined' && window.radiusState.pickingMap) {
            if (typeof window.originalOnMapClick === 'function') {
                window.originalOnMapClick(e);
            }
            return;
        }

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // 顯示搜索選擇彈窗
        SearchPopup.show(lat, lng);
    };

    // 重新綁定地圖點擊事件
    if (typeof map !== 'undefined') {
        // 偵測是否為手機版 (Leaflet 內建偵測 或 螢幕寬度小於等於 768px 或 UA 包含行動裝置關鍵字)
        const isMobile = L.Browser.mobile || window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        map.off('click');
        map.off('contextmenu');

        if (isMobile) {
            // 手機版：使用 contextmenu (對應長按) 觸發
            map.on('contextmenu', window.onMapClick);
            console.log('[Search Module] Mobile mode: use long press for search menu');
        } else {
            // 電腦版：維持點擊觸發，並同時支援右鍵觸發
            map.on('click', window.onMapClick);
            map.on('contextmenu', window.onMapClick);
            console.log('[Search Module] Desktop mode: use click or right-click for search menu');
        }
    }

    console.log('[Search Module] Location search initialized');
}

// 在 DOM 加載完成後初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLocationSearch);
} else {
    // DOM 已加載，延遲初始化等待 map 對象存在
    setTimeout(initLocationSearch, 1000);
}
