# Running a sim log

Create a .env file in the /tools folder to hold the following values:

```
OUTPUT_PATH="C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs\\"
INPUT_PATH="C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs\\WoWCombatLog-102323_201518.txt"
BUFFER_SLEEP_MS=1000
CHUNK_SIZE=1000
```

Make the appropriate changes for your local file system!

```
npm run start:simlog
```

CHUNK_SIZE determines how many lines will be written per chunk of file

BUFFER_SLEEP_MS determines the sleep time between writing file chunks
