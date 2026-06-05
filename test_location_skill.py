import unittest
import json
import os
import sys

# Add the directory containing server.py to the path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
import server

class MockHandler:
    def __init__(self):
        self.response_status = 200
        self.response_body = ""
        self.headers = {}
        self.workdir = os.path.abspath(os.path.dirname(__file__))
    
    def send_response(self, status):
        self.response_status = status
    
    def send_header(self, key, value):
        self.headers[key] = value
        
    def send_cors_headers(self):
        pass
        
    def end_headers(self):
        pass
        
    def write_response(self, data):
        self.response_body = data

class TestLocationSkill(unittest.TestCase):
    
    def setUp(self):
        # Create a mock instance of the handler
        self.handler = server.Handler.__new__(server.Handler)
        self.handler.workdir = os.path.abspath(os.path.dirname(__file__))
        self.response_data = None
        self.response_status = 200
        
        # Mock the send_json method to capture output
        def mock_send_json(data, status=200):
            self.response_data = data
            self.response_status = status
            
        self.handler.send_json = mock_send_json

    def test_nlp_intent_detection(self):
        # Test detecting "where am i" intent
        test_queries = ['我在哪裡', '我喺邊', 'where am i', 'my location', 'current location', '請幫我定位']
        
        for query in test_queries:
            self.response_data = None
            
            # Mock the request data
            body = json.dumps({'message': query, 'fingerprint': 'test-fp'}).encode('utf-8')
            
            # Mock rfile
            class MockRFile:
                def read(self, length):
                    return body
                    
            self.handler.rfile = MockRFile()
            self.handler.headers = {'Content-Length': str(len(body))}
            
            # Call handle_chat
            self.handler.handle_chat()
            
            # Verify the response triggers locate_user_and_report
            self.assertIsNotNone(self.response_data)
            self.assertIn('locate_user_and_report', self.response_data.get('reply', ''))
            self.assertEqual(self.response_data.get('source'), 'system')

    def test_system_location_report_without_fingerprint(self):
        body = json.dumps({
            'message': '[SYSTEM_LOCATION_REPORT]', 
            'lat': 37.5, 
            'lng': 126.9
            # No fingerprint
        }).encode('utf-8')
        
        class MockRFile:
            def read(self, length):
                return body
                
        self.handler.rfile = MockRFile()
        self.handler.headers = {'Content-Length': str(len(body))}
        
        self.handler.handle_chat()
        
        # Verify unauthorized response
        self.assertEqual(self.response_status, 403)
        self.assertTrue(self.response_data.get('error'))
        self.assertIn('未授權', self.response_data.get('reply', ''))

    def test_system_location_report_with_fingerprint(self):
        # Mock Ollama API to prevent real network calls
        original_call_ollama = self.handler._call_ollama_api
        def mock_ollama(system, message, history):
            return "你在首爾市中心！"
        self.handler._call_ollama_api = mock_ollama
        
        try:
            body = json.dumps({
                'message': '[SYSTEM_LOCATION_REPORT]', 
                'lat': 37.5, 
                'lng': 126.9,
                'fingerprint': 'valid-fingerprint'
            }).encode('utf-8')
            
            class MockRFile:
                def read(self, length):
                    return body
                    
            self.handler.rfile = MockRFile()
            self.handler.headers = {'Content-Length': str(len(body))}
            
            self.handler.handle_chat()
            
            # Verify successful response
            self.assertEqual(self.response_status, 200)
            self.assertEqual(self.response_data.get('reply'), "你在首爾市中心！")
            self.assertEqual(self.response_data.get('source'), 'ollama')
        finally:
            self.handler._call_ollama_api = original_call_ollama

if __name__ == '__main__':
    unittest.main()
