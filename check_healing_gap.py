import json
import os

dir_path = "/Users/mingjianliu/code/wowarenalogs/packages/tools/local-batch/healer-review"
with open(os.path.join(dir_path, "index.json"), "r") as f:
    index = json.load(f)

count = 0
for entry in index:
    filepath = os.path.join(dir_path, entry['file'])
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, "r") as f:
        content = f.read()
        if "[HEALING GAP]" in content:
            count += 1
            print(f"Found in {entry['file']}")

print(f"Total files with HEALING GAP: {count}")
