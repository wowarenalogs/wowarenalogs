import os
import base64

print(base64.b64encode(os.environ['CSC_LINK'].encode('utf-8')))
print(base64.b64encode(os.environ['CSC_KEY_PASSWORD']))
