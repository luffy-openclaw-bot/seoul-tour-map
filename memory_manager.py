import os
import json
import time
import urllib.request
import urllib.parse
from cryptography.fernet import Fernet

class MemoryManager:
    def __init__(self, data_dir='.memory', key_file='.memory_key'):
        self.data_dir = data_dir
        self.key_file = key_file
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.key = self._load_or_create_key()
        self.cipher_suite = Fernet(self.key)
        
        # Ensure versions directory
        self.versions_dir = os.path.join(self.data_dir, 'versions')
        os.makedirs(self.versions_dir, exist_ok=True)
        
    def _load_or_create_key(self):
        if os.path.exists(self.key_file):
            with open(self.key_file, 'rb') as f:
                return f.read()
        else:
            key = Fernet.generate_key()
            with open(self.key_file, 'wb') as f:
                f.write(key)
            return key

    def _get_file_paths(self, user_id):
        base_name = os.path.join(self.data_dir, f"memory_{user_id}")
        return f"{base_name}.enc", f"{base_name}.md"

    def read_memory(self, user_id):
        enc_file, _ = self._get_file_paths(user_id)
        if not os.path.exists(enc_file):
            return {
                "preferences": {},
                "travel_plans": {},
                "background_context": {},
                "extracted_attributes": {},
                "flagged_for_confirmation": {},
                "raw_notes": []
            }
        
        with open(enc_file, 'rb') as f:
            encrypted_data = f.read()
        
        try:
            decrypted_data = self.cipher_suite.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode('utf-8'))
        except Exception:
            return {}

    def write_memory(self, user_id, memory_data):
        enc_file, md_file = self._get_file_paths(user_id)
        
        # Write encrypted JSON
        json_data = json.dumps(memory_data, ensure_ascii=False).encode('utf-8')
        encrypted_data = self.cipher_suite.encrypt(json_data)
        
        with open(enc_file, 'wb') as f:
            f.write(encrypted_data)
            
        # Write synced Markdown
        self._sync_to_markdown(user_id, memory_data, md_file)
        
        # Create a version snapshot
        self._create_version(user_id, encrypted_data)

    def _sync_to_markdown(self, user_id, memory_data, md_file):
        md_content = f"# Memory for User: {user_id}\n\n"
        md_content += f"*Last updated: {time.strftime('%Y-%m-%d %H:%M:%S')}*\n\n"
        
        if 'preferences' in memory_data and memory_data['preferences']:
            md_content += "## Explicit Preferences\n"
            for k, v in memory_data['preferences'].items():
                md_content += f"- **{k}**: {v}\n"
                
        if 'travel_plans' in memory_data and memory_data['travel_plans']:
            md_content += "\n## Travel Plans\n"
            for k, v in memory_data['travel_plans'].items():
                md_content += f"- **{k}**: {v}\n"
                
        if 'background_context' in memory_data and memory_data['background_context']:
            md_content += "\n## Background Context\n"
            for k, v in memory_data['background_context'].items():
                md_content += f"- **{k}**: {v}\n"
        
        if 'extracted_attributes' in memory_data and memory_data['extracted_attributes']:
            md_content += "\n## Extracted Attributes\n"
            for k, v in memory_data['extracted_attributes'].items():
                val = v.get("value") if isinstance(v, dict) else v
                conf = v.get("confidence", 1.0) if isinstance(v, dict) else 1.0
                md_content += f"- **{k}**: {val} (Confidence: {conf:.2f})\n"
                
        if 'flagged_for_confirmation' in memory_data and memory_data['flagged_for_confirmation']:
            md_content += "\n## Needs User Confirmation\n"
            for k, v in memory_data['flagged_for_confirmation'].items():
                val = v.get("value") if isinstance(v, dict) else v
                conf = v.get("confidence", 0.0) if isinstance(v, dict) else 0.0
                md_content += f"- **{k}**: {val} (Confidence: {conf:.2f}) - *Pending Confirmation*\n"
                
        if 'raw_notes' in memory_data and memory_data['raw_notes']:
            md_content += "\n## Raw Notes\n"
            for note in memory_data['raw_notes']:
                md_content += f"- {note}\n"
                
        with open(md_file, 'w', encoding='utf-8') as f:
            f.write(md_content)

    def _create_version(self, user_id, encrypted_data):
        timestamp = int(time.time())
        version_file = os.path.join(self.versions_dir, f"memory_{user_id}_{timestamp}.enc")
        with open(version_file, 'wb') as f:
            f.write(encrypted_data)

    def delete_memory(self, user_id):
        enc_file, md_file = self._get_file_paths(user_id)
        if os.path.exists(enc_file):
            os.remove(enc_file)
        if os.path.exists(md_file):
            os.remove(md_file)
        # We might optionally want to delete or keep versions. Let's keep versions for history.

    def extract_attributes(self, text, api_base, api_key, model="gemma4:31b-cloud"):
        # Use Ollama API to extract attributes via NLP
        system_prompt = '''You are an NLP attribute extraction assistant. 
Extract user preferences, travel plans, and background context from the following text.
For each attribute, assign a "confidence" score between 0.0 and 1.0 based on how explicitly it is stated.
Return ONLY a valid JSON object matching this schema:
{
  "attributes": {
    "attribute_key_name": {
      "value": "attribute_value",
      "confidence": 0.95
    }
  }
}
Example: 
{
  "attributes": {
    "likes_spicy_food": {"value": true, "confidence": 0.8},
    "budget_level": {"value": "high", "confidence": 0.9}
  }
}'''

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "stream": False,
            "temperature": 0.1
        }
        
        req = urllib.request.Request(
            f"{api_base}/chat/completions",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                **({'Authorization': f'Bearer {api_key}'} if api_key else {})
            }
        )
        
        import ssl
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context))
        
        try:
            with opener.open(req, timeout=30) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                ai_reply = result.get('choices', [{}])[0].get('message', {}).get('content', '{}')
                
                import re
                json_match = re.search(r'\{.*\}', ai_reply, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(0))
                return json.loads(ai_reply)
        except Exception as e:
            print(f"[MemoryManager] Error extracting attributes: {e}")
            return {}

# Singleton instance
memory_manager = MemoryManager()
