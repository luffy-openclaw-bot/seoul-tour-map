import json
import urllib.parse

with open('static/data/attractions.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for attr in data['attractions']:
    prompt = f"High quality travel photography of {attr['name']} ({attr['name_ko']}) in Seoul, realistic, sunny day, 4k resolution"
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt={encoded_prompt}&image_size=landscape_16_9"
    attr['image'] = url

with open('static/data/attractions.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

