import http.server
import socketserver
import json
import base64
import os
import time

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/questions':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            if os.path.exists('questions.json'):
                with open('questions.json', 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b'[]')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/questions':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            with open('questions.json', 'wb') as f:
                f.write(post_data)
                
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')

        elif self.path == '/api/upload':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                filename = data.get('filename', f'upload_{int(time.time())}.png')
                image_base64 = data.get('image_base64')
                
                # Strip data:image/png;base64, if present
                if ',' in image_base64:
                    image_base64 = image_base64.split(',', 1)[1]
                    
                image_data = base64.b64decode(image_base64)
                
                safe_filename = os.path.basename(filename)
                filepath = os.path.join('assets', safe_filename)
                
                # Make sure assets folder exists
                if not os.path.exists('assets'):
                    os.makedirs('assets')
                    
                with open(filepath, 'wb') as f:
                    f.write(image_data)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'url': f'assets/{safe_filename}'}).encode())
            except Exception as e:
                print(f"Error uploading file: {e}")
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "error"}')
        else:
            self.send_response(404)
            self.end_headers()

# Permite reutilizar el puerto para evitar "Address already in use"
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print("Serving with API endpoints at port", PORT)
    httpd.serve_forever()
