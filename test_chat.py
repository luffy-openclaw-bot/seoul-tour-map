#!/usr/bin/env python3
import requests
import json
import time

# Test search query first
url = "http://localhost:8092/api/chat"
headers = {"Content-Type": "application/json"}

print("=== Testing search query: 'What's the weather in Seoul today?' ===")
payload = {
    "message": "What's the weather in Seoul today?",
    "history": [],
    "preferences": {
        "use_web_search": True,
        "use_offline_fallback": True
    }
}
print("Payload is:")
print(json.dumps(payload, indent=2))
print("Sending request...")
try:
    response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=60)
    print(f"Status: {response.status_code}")
    print(f"Response headers: {dict(response.headers)}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"ERROR: {type(e)} - {e}")
    import traceback
    traceback.print_exc()
