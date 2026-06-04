import urllib.parse
import json

categories = {
    '歷史文化': 'High quality travel photography of a traditional Korean palace or temple in Seoul, realistic, sunny day, 4k resolution',
    '地標觀景': 'High quality travel photography of a modern Seoul city landmark or skyline, realistic, sunny day, 4k resolution',
    '購物美食': 'High quality travel photography of a bustling Seoul shopping street and street food stalls, realistic, 4k resolution',
    '夜生活文化': 'High quality travel photography of Seoul nightlife, neon lights, busy streets, realistic, 4k resolution',
    '娛樂': 'High quality travel photography of an amusement park or entertainment venue in Seoul, realistic, 4k resolution',
    '休閒': 'High quality travel photography of a relaxing cafe or cultural space in Seoul, realistic, 4k resolution',
    '自然景觀': 'High quality travel photography of a beautiful park or nature trail in Seoul, realistic, sunny day, 4k resolution',
    'default': 'High quality travel photography of Seoul cityscape, realistic, sunny day, 4k resolution'
}

result = "const CATEGORY_FALLBACK_IMAGES = {\n"
for k, v in categories.items():
    encoded = urllib.parse.quote(v)
    url = f"https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt={encoded}&image_size=landscape_16_9"
    result += f"    '{k}': '{url}',\n"
result += "};\n\n"
result += "function getFallbackImage(category) {\n"
result += "    return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['default'];\n"
result += "}"
print(result)
