#!/usr/bin/env python3
import os
import sys

# Check current directory
print("Current working directory:", os.getcwd())

# Check where server.py is
server_path = os.path.join(os.getcwd(), "server.py")
print("Looking for server.py at:", server_path)
print("Exists:", os.path.exists(server_path))

# Now let's check the content of server.py's handle_chat source line
if os.path.exists(server_path):
    with open(server_path, 'r', encoding='utf-8') as f:
        content = f.read()
    if "hermes_worker" in content:
        print("✅ server.py has the updated source='hermes_worker' line!")
    else:
        print("❌ server.py does NOT have the updated line!")
