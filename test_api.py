import json
import urllib.request
import os
from dotenv import load_dotenv

load_dotenv()

PORT = os.getenv('PORT', 8082)
URL = f"http://localhost:{PORT}/api/google-places"

def test_google_places(lat, lng, radius=50):
    data = {
        "lat": lat,
        "lng": lng,
        "radius": radius
    }
    
    req = urllib.request.Request(
        URL,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"Status: Success")
            print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Status: Error")
        print(e)

if __name__ == "__main__":
    # Test coordinates (Myeongdong area)
    test_google_places(37.5635, 126.9895)
