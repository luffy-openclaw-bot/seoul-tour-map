categories = {
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
    'default': 'https://images.unsplash.com/photo-1610312278520-bcc893a3ff1d?w=800&q=80'
}

result = "const CATEGORY_FALLBACK_IMAGES = {\n"
for k, v in categories.items():
    result += f"    '{k}': '{v}',\n"
result += "};\n\n"
result += "function getFallbackImage(category) {\n"
result += "    return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['default'];\n"
result += "}"
print(result)
