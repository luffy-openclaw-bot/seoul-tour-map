categories = [
    '歷史文化',
    '地標觀景',
    '購物美食',
    '夜生活文化',
    '娛樂',
    '休閒',
    '自然景觀',
    '用戶釘選',
    '自訂景點',
    '願望s',
    'default',
]

result = """function escapeSvgText(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildInlineFallbackImage(category) {
    const normalizedCategory = category || 'default';
    const color = CATEGORY_COLORS[normalizedCategory] || '#667eea';
    const label = normalizedCategory === 'default' ? 'Seoul Pick' : normalizedCategory;
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="${escapeSvgText(label)} placeholder">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#f3f4f6" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" rx="18" fill="url(#bg)"/>
  <rect x="18" y="18" width="284" height="144" rx="14" fill="rgba(255,255,255,0.82)"/>
  <circle cx="70" cy="72" r="26" fill="${color}" fill-opacity="0.15"/>
  <path d="M70 52c-12.1 0-22 9.9-22 22 0 16.2 22 42 22 42s22-25.8 22-42c0-12.1-9.9-22-22-22zm0 30.5A8.5 8.5 0 1 1 70 65a8.5 8.5 0 0 1 0 17.5z" fill="${color}"/>
  <text x="112" y="74" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">${escapeSvgText(label)}</text>
  <text x="112" y="102" font-family="Arial, sans-serif" font-size="14" fill="#4b5563">Preview unavailable</text>
  <text x="112" y="124" font-family="Arial, sans-serif" font-size="14" fill="#6b7280">Seoul Tour Map</text>
</svg>`.trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const CATEGORY_FALLBACK_IMAGES = Object.freeze({
"""
for category in categories:
    result += f"    '{category}': buildInlineFallbackImage('{category}'),\n"
result += """});

function getFallbackImage(category) {
    return CATEGORY_FALLBACK_IMAGES[category] || getDefaultFallbackImage();
}

function getDefaultFallbackImage() {
    return CATEGORY_FALLBACK_IMAGES['default'];
}"""
print(result)
