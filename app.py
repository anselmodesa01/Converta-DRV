import os
import subprocess
import json
import time
import zipfile
import urllib.request
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# Configurações de pastas usando caminhos absolutos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
OUTPUT_FOLDER = os.path.join(BASE_DIR, 'outputs')
FFMPEG_PATH = os.path.join(BASE_DIR, 'ffmpeg.exe')
STATIC_FOLDER = os.path.join(BASE_DIR, 'public')

# Garante que as pastas existam
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def download_ffmpeg():
    print("--- FFmpeg não encontrado. Baixando automaticamente... ---")
    url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    zip_path = os.path.join(BASE_DIR, "ffmpeg.zip")
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
        return f'"{FFMPEG_PATH}"'
    try:
        ret = subprocess.call('ffmpeg -version', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)
        if ret == 0:
            return 'ffmpeg'
    except:
        pass
    if download_ffmpeg():
        return f'"{FFMPEG_PATH}"'
    return None

class UnifiedHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        # Define o diretório base para o SimpleHTTPRequestHandler como 'public'
        super().__init__(*args, directory=STATIC_FOLDER, **kwargs)

    def end_headers(self):
        # Cabeçalhos CORS para desenvolvimento
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def parse_multipart_streaming(self):
        content_type = self.headers.get('Content-Type')
        if not content_type or not content_type.startswith('multipart/form-data'):
            return None, "Not a multipart/form-data request"
        try:
            boundary = content_type.split("boundary=")[1].encode()
        except IndexError:
            return None, "Boundary not found"
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return None, "Empty body"
        try:
            remaining = content_length
            chunks = []
            read_size = 65536
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, read_size))
                if not chunk: break
                chunks.append(chunk)
                remaining -= len(chunk)
            body = b''.join(chunks)
            del chunks
        except Exception as e:
            return None, f"Erro na leitura do stream: {e}"
        parts = body.split(b'--' + boundary)
        data = {'files': [], 'format': 'mp4', 'filename': f"video_{int(time.time())}"}
        for part in parts:
            if not part or part.strip() == b'--' or part.strip() == b'': continue
            try:
                if b'\r\n\r\n' not in part: continue
                head, content = part.split(b'\r\n\r\n', 1)
                if content.endswith(b'\r\n'): content = content[:-2]
                head_str = head.decode('utf-8', errors='ignore')
                if 'name="format"' in head_str:
                    data['format'] = content.decode('utf-8', errors='ignore').strip()
                elif 'name="filename"' in head_str:
                    data['filename'] = content.decode('utf-8', errors='ignore').strip()
                elif 'name="keepOriginals"' in head_str:
                    data['keepOriginals'] = content.decode('utf-8', errors='ignore').strip() == 'true'
                elif 'name="orderByDate"' in head_str:
                    data['orderByDate'] = content.decode('utf-8', errors='ignore').strip() == 'true'
                elif 'name="files"' in head_str:
                    match = re.search(r'filename="([^"]+)"', head_str)
                    if match:
                        orig_filename = match.group(1)
                        temp_name = f"upload_{int(time.time())}_{orig_filename}"
                        path = os.path.join(UPLOAD_FOLDER, temp_name)
                        with open(path, 'wb') as f:
                            f.write(content)
                        data['files'].append(path)
            except Exception as e:
                print(f"Erro no parsing: {e}")
        return data, None

    def do_POST(self):
        if self.path == '/api' or self.path == '/convert':
            try:
                ffmpeg_cmd = get_ffmpeg_command()
                if not ffmpeg_cmd:
                    self.send_error_response(500, "FFmpeg não encontrado.")
                    return
                data, err = self.parse_multipart_streaming()
                if err:
                    self.send_error_response(400, err)
                    return
                output_format = data.get('format', 'mp4')
                output_name = data.get('filename', f"video_{int(time.time())}")
                saved_files = data.get('files', [])
                keep_originals = data.get('keepOriginals', False)
                order_by_date = data.get('orderByDate', False)
                if not saved_files:
                    self.send_error_response(400, "Nenhum arquivo enviado.")
                    return
                if order_by_date and len(saved_files) > 1:
                    saved_files.sort(key=lambda x: os.path.basename(x))
                output_filename = f"{output_name}.{output_format}"
                output_path = os.path.join(OUTPUT_FOLDER, output_filename)
                
                # Comando FFmpeg
                if len(saved_files) > 1:
                    list_path = os.path.join(UPLOAD_FOLDER, f'list_{int(time.time())}.txt')
                    with open(list_path, 'w', encoding='utf-8') as f:
                        for p in saved_files:
                            f.write(f"file '{os.path.abspath(p).replace('\\', '/')}'\n")
                    if output_format == 'mp3':
                        ffmpeg_args = f'-f concat -safe 0 -i "{list_path}" -vn -acodec libmp3lame -q:a 2 "{output_path}" -y'
                    elif output_format == 'avi':
                        ffmpeg_args = f'-f concat -safe 0 -i "{list_path}" -c:v mpeg4 -vtag xvid -q:v 5 -c:a aac "{output_path}" -y'
                    else:
                        ffmpeg_args = f'-f concat -safe 0 -i "{list_path}" -c copy "{output_path}" -y'
                else:
                    input_path = os.path.abspath(saved_files[0])
                    if output_format == 'mp3':
                        ffmpeg_args = f'-i "{input_path}" -vn -acodec libmp3lame -q:a 2 "{output_path}" -y'
                    elif output_format == 'avi':
                        ffmpeg_args = f'-i "{input_path}" -c:v mpeg4 -vtag xvid -q:v 5 -c:a aac "{output_path}" -y'
                    elif output_format == 'mp4' or output_format == 'mkv':
                        ffmpeg_args = f'-i "{input_path}" -c copy "{output_path}" -y'
                    else:
                        ffmpeg_args = f'-i "{input_path}" -c copy "{output_path}" -y'
                    list_path = None
                
                process = subprocess.run(f'{ffmpeg_cmd} {ffmpeg_args}', stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
                
                # Se copy falhar, tenta re-encode
                if process.returncode != 0 and (output_format == 'mp4' or output_format == 'mkv') and len(saved_files) == 1:
                    if output_format == 'mp4':
                        ffmpeg_args = f'-i "{input_path}" -c:v libx264 -crf 23 -preset ultrafast -c:a aac "{output_path}" -y'
                    else:
                        ffmpeg_args = f'-i "{input_path}" -c:v libx264 -crf 23 -preset ultrafast "{output_path}" -y'
                    process = subprocess.run(f'{ffmpeg_cmd} {ffmpeg_args}', stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
                
                # Limpeza
                if not keep_originals:
                    for p in saved_files:
                        if os.path.exists(p): os.remove(p)
                if list_path and os.path.exists(list_path): os.remove(list_path)
                
                if process.returncode == 0:
                    self.send_json_response(200, {'success': True, 'filename': output_filename, 'download_url': f'/download/{output_filename}'})
                else:
                    self.send_error_response(500, f"FFmpeg error: {process.stderr}")
            except Exception as e:
                self.send_error_response(500, str(e))

    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # Lógica de download
        if parsed_path.path.startswith('/download/'):
            filename = parsed_path.path[len('/download/'):]
            path = os.path.join(OUTPUT_FOLDER, filename)
            if os.path.exists(path):
                self.send_response(200)
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Length', os.path.getsize(path))
                self.end_headers()
                with open(path, 'rb') as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk: break
                        try:
                            self.wfile.write(chunk)
                        except: break
                return
            else:
                self.send_error_response(404, "Arquivo não encontrado.")
                return
        
        # O SimpleHTTPRequestHandler cuidará de servir os arquivos estáticos
        return super().do_GET()

    def send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def send_error_response(self, status, message):
        self.send_json_response(status, {'success': False, 'error': message})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    print(f"--- Iniciando servidor local na porta {port}... ---")
    try:
        # Usar ThreadingHTTPServer para permitir múltiplas conexões simultâneas
        httpd = ThreadingHTTPServer(('', port), UnifiedHandler)
        print(f"--- Servidor Ativo em http://localhost:{port} ---")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n--- Servidor interrompido. ---")
    except Exception as e:
        print(f"Erro fatal: {e}")
