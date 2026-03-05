import os
import subprocess
import json
import io
import time
import zipfile
import urllib.request
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
    
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
FFMPEG_PATH = 'ffmpeg.exe'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def download_ffmpeg():
    print("--- FFmpeg não encontrado. Baixando automaticamente... ---")
    url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    zip_path = "ffmpeg.zip"
    try:
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file in zip_ref.namelist():
                if file.endswith('ffmpeg.exe'):
                    data = zip_ref.read(file)
                    with open(FFMPEG_PATH, 'wb') as f:
                        f.write(data)
                    break
        if os.path.exists(zip_path):
            os.remove(zip_path)
        print("--- FFmpeg instalado com sucesso na pasta local! ---")
        return True
    except Exception as e:
        print(f"--- Erro ao baixar FFmpeg: {e} ---")
        return False

def get_ffmpeg_command():
    if os.path.exists(FFMPEG_PATH):
        return f'"{os.path.abspath(FFMPEG_PATH)}"'
    try:
        ret = subprocess.call('ffmpeg -version', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)
        if ret == 0:
            return 'ffmpeg'
    except:
        pass
    if download_ffmpeg():
        return f'"{os.path.abspath(FFMPEG_PATH)}"'
    return None

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def parse_multipart(self):
        content_type = self.headers.get('Content-Type')
        if not content_type or not content_type.startswith('multipart/form-data'):
            return None, "Not a multipart/form-data request"
        try:
            boundary = content_type.split("boundary=")[1].encode()
        except IndexError:
            return None, "Boundary not found in Content-Type"
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return None, "Empty body"
        try:
            body = self.rfile.read(content_length)
        except Exception as e:
            return None, f"Failed to read request body: {e}"
        parts = body.split(b'--' + boundary)
        data = {'files': []}
        for part in parts:
            if not part or part == b'--' or part == b'--\r\n' or part == b'\r\n':
                continue
            try:
                if b'\r\n\r\n' not in part: continue
                head, content = part.split(b'\r\n\r\n', 1)
                if content.endswith(b'\r\n'):
                    content = content[:-2]
                head_str = head.decode('utf-8', errors='ignore')
                if 'name="format"' in head_str:
                    data['format'] = content.decode('utf-8', errors='ignore').strip()
                elif 'name="filename"' in head_str:
                    data['filename'] = content.decode('utf-8', errors='ignore').strip()
                elif 'name="files"' in head_str:
                    match = re.search(r'filename="([^"]+)"', head_str)
                    if match:
                        filename = match.group(1)
                        if filename.lower().endswith('.dav'):
                            path = os.path.join(UPLOAD_FOLDER, filename)
                            with open(path, 'wb') as f:
                                f.write(content)
                            data['files'].append(path)
            except Exception as e:
                print(f"Error parsing part: {e}")
                continue
        return data, None

    def do_POST(self):
        if self.path == '/convert':
            try:
                ffmpeg_cmd = get_ffmpeg_command()
                if not ffmpeg_cmd:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'FFmpeg nao encontrado.'}).encode())
                    return
                data, err = self.parse_multipart()
                if err:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': err}).encode())
                    return
                output_format = data.get('format', 'mp4')
                output_name = data.get('filename', f"video_{int(time.time())}")
                saved_files = data.get('files', [])
                if not saved_files:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'Nenhum arquivo .dav enviado.'}).encode())
                    return
                list_path = os.path.join(UPLOAD_FOLDER, f'list_{int(time.time())}.txt')
                with open(list_path, 'w', encoding='utf-8') as f:
                    for path in saved_files:
                        abs_path = os.path.abspath(path).replace('\\', '/')
                        f.write(f"file '{abs_path}'\n")
                output_filename = f"{output_name}.{output_format}"
                output_path = os.path.abspath(os.path.join(OUTPUT_FOLDER, output_filename))
                if output_format == 'mp4':
                    ffmpeg_args = f'-f concat -safe 0 -i "{list_path}" -c copy "{output_path}" -y'
                elif output_format == 'avi':
                    ffmpeg_args = f'-f concat -safe 0 -i "{list_path}" -c:v mpeg4 -vtag xvid -q:v 5 -c:a aac "{output_path}" -y'
                else:
                    ffmpeg_args = f'-f concat -safe 0 -i "{list_path}" -c:v libx264 -crf 23 -c:a aac "{output_path}" -y'
                full_cmd = f'{ffmpeg_cmd} {ffmpeg_args}'
                process = subprocess.run(full_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
                for path in saved_files:
                    if os.path.exists(path): os.remove(path)
                if os.path.exists(list_path): os.remove(list_path)
                response_data = {
                    'success': process.returncode == 0,
                    'filename': output_filename,
                    'download_url': f'/download/{output_filename}',
                    'logs': process.stderr if process.stderr else "Sem logs do FFmpeg."
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                print(error_trace)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e), 'logs': error_trace}).encode())

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        if parsed_path.path.startswith('/download/'):
            filename = parsed_path.path[len('/download/'):]
            path = os.path.join(OUTPUT_FOLDER, filename)
            if os.path.exists(path):
                self.send_response(200)
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Type', 'application/octet-stream')
                self.end_headers()
                with open(path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'Arquivo nao encontrado.')
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    try:
        port = 5020
        httpd = HTTPServer(('', port), SimpleHTTPRequestHandler)
        print(f"--- Servidor de Conversão DAV Ativo em http://localhost:{port} ---")
        httpd.serve_forever()
    except Exception as e:
        print(f"Erro fatal no servidor: {e}")
