import json
import os
import re

dir_path = "/Users/mingjianliu/code/wowarenalogs/packages/tools/local-batch/healer-review"
with open(os.path.join(dir_path, "index.json"), "r") as f:
    index = json.load(f)

for entry in index:
    filepath = os.path.join(dir_path, entry['file'])
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, "r") as f:
        lines = f.readlines()
        
    last_time = -1
    last_line = ""
    for line in lines:
        match = re.match(r"^(\d+):(\d+)\s+\[", line)
        if match:
            t = int(match.group(1)) * 60 + int(match.group(2))
            if t < last_time:
                print(f"File {entry['ordinal']} out of order:\n  {last_line.strip()}\n  {line.strip()}")
            last_time = t
            last_line = line
