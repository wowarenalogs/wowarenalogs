import json
import os
import re

dir_path = "/Users/mingjianliu/code/wowarenalogs/packages/tools/local-batch/healer-review"
with open(os.path.join(dir_path, "index.json"), "r") as f:
    index = json.load(f)

stats = {
    "NaN_found": 0,
    "cd_expired_count": 0,
    "duplicate_res_spells": 0,
    "cc_disambiguation_misfire": 0,
    "out_of_order": 0,
    "null_values": 0,
    "undefined_values": 0,
    "healer_cc_no_gap": 0
}

files = []
for entry in index:
    filepath = os.path.join(dir_path, entry['file'])
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, "r") as f:
        lines = f.readlines()
        
    last_time = -1
    for line in lines:
        if "NaN" in line:
            stats["NaN_found"] += 1
        if "null" in line.lower():
            stats["null_values"] += 1
        if "undefined" in line.lower():
            stats["undefined_values"] += 1
        if "[CD EXPIRED]" in line:
            stats["cd_expired_count"] += 1
        if "succeeded after CC arrived" in line:
            stats["cc_disambiguation_misfire"] += 1
        if "[RES]" in line:
            cd_match = re.search(r"cd:([^ ]+)", line)
            if cd_match:
                spells = [s.split("(")[0] for s in cd_match.group(1).split(",")]
                if len(spells) != len(set(spells)):
                    stats["duplicate_res_spells"] += 1
            enemy_match = re.search(r"enemy:([^ ]+)", line)
            if enemy_match:
                spells = [s.split("(")[0] for s in enemy_match.group(1).split(",")]
                if len(spells) != len(set(spells)):
                    stats["duplicate_res_spells"] += 1
        
        match = re.match(r"^(\d+):(\d+)\s+\[", line)
        if match:
            t = int(match.group(1)) * 60 + int(match.group(2))
            if t < last_time:
                stats["out_of_order"] += 1
            last_time = t

print(json.dumps(stats, indent=2))
