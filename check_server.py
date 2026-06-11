#!/usr/bin/env python3
with open("server.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("=== Lines 480-560 of server.py ===")
for i, line in enumerate(lines[480:560], 481):
    print(f"{i:4}: {line.rstrip()}")
