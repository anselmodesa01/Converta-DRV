import os
import subprocess
import json
import io
import time
import zipfile
import urllib.request
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler
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

class ConverterHandler(SimpleHTTPRequestHandler):
    # Aumentar timeout e desabilitar buffering para arquivos grandes
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def parse_multipart_streaming(self):
        """Versão melhorada para ler o corpo em pedaços e evitar estouro de memória/conexão"""
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

        # Ler o corpo inteiro em buffer (Python HTTPServer padrão é síncrono)
        # Para arquivos muito grandes, o ideal seria processar o stream, 
        # mas para resolver o CONNECTION_RESET, vamos ler com blocos controlados.
        try:
            # Buffer de leitura controlado
            remaining = content_length
            body = b''
            chunk_size = 1024 * 1024 # 1MB por vez
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, chunk_size))
                if not chunk: break
                body += chunk
                remaining -= len(chunk)
        except Exception as e:
            return None, f"Erro na leitura do stream: {e}"

        parts = body.split(b'--' + boundary)
        data = {'files': [], 'format': 'mp4', 'filename': f"video_{int(time.time())}"}
        
        for part in parts:
            if not part or part.strip() == b'--' or part.strip() == b'':
                continue
            
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
                        ext = orig_filename.lower().split('.')[-1]
                        # Salva com nome temporário para evitar problemas de caracteres
                        temp_name = f"upload_{int(time.time())}_{orig_filename}"
                        path = os.path.join(UPLOAD_FOLDER, temp_name)
                        with open(path, 'wb') as f:
                            f.write(content)
                        data['files'].append(path)
            except Exception as e:
                print(f"Erro no parsing de parte: {e}")
        
        return data, None

    def do_POST(self):
        if self.path == '/convert':
            try:
                ffmpeg_cmd = get_ffmpeg_command()
                if not ffmpeg_cmd:
                    self.send_error_response(500, "FFmpeg não encontrado no servidor.")
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
                    self.send_error_response(400, "Nenhum arquivo enviado ou formato incompatível.")
                    return

                # Ordenar arquivos se solicitado
                if order_by_date and len(saved_files) > 1:
                    # Tenta ordenar pelo timestamp no nome do arquivo (que incluímos no parse)
                    # O nome é f"upload_{int(time.time())}_{orig_filename}"
                    saved_files.sort(key=lambda x: os.path.basename(x))

                output_filename = f"{output_name}.{output_format}"
                output_path = os.path.abspath(os.path.join(OUTPUT_FOLDER, output_filename))

                # Lógica de comando FFmpeg
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
                    elif output_format == 'mp4':
                        ffmpeg_args = f'-i "{input_path}" -c:v libx264 -crf 23 -c:a aac "{output_path}" -y'
                    else:
                        ffmpeg_args = f'-i "{input_path}" -c copy "{output_path}" -y'
                    list_path = None

                process = subprocess.run(f'{ffmpeg_cmd} {ffmpeg_args}', 
                                       stdout=subprocess.PIPE, 
                                       stderr=subprocess.PIPE, 
                                       text=True, shell=True)

                # Limpeza
                if not keep_originals:
                    for p in saved_files:
                        if os.path.exists(p): os.remove(p)
                if list_path and os.path.exists(list_path): os.remove(list_path)

                if process.returncode == 0:
                    self.send_json_response(200, {
                        'success': True,
                        'filename': output_filename,
                        'download_url': f'/download/{output_filename}'
                    })
                else:
                    self.send_error_response(500, f"Erro no FFmpeg: {process.stderr}")

            except Exception as e:
                self.send_error_response(500, str(e))

    def send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def send_error_response(self, status, message):
        self.send_json_response(status, {'success': False, 'error': message})

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
                self.send_header('Content-Length', os.path.getsize(path))
                self.end_headers()
                
                # Streaming do arquivo para o cliente em blocos de 64KB
                with open(path, 'rb') as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk:
                            break
                        try:
                            self.wfile.write(chunk)
                        except (ConnectionResetError, BrokenPipeError):
                            break
            else:
                self.send_response(404)
                self.end_headers()
        else:
            # Servir arquivos estáticos (index.html, css, js)
            if parsed_path.path == '/':
                self.path = '/index.html'
            return super().do_GET()

if __name__ == '__main__':
    port = 8000
    print(f"--- Iniciando servidor na porta {port}... ---")
    try:
        server_address = ('', port)
        httpd = HTTPServer(server_address, ConverterHandler)
        print(f"--- Servidor de Conversão Ativo em http://localhost:{port} ---")
        httpd.serve_forever()
    except Exception as e:
        print(f"Erro ao iniciar servidor: {e}")
    except KeyboardInterrupt:
        print("\n--- Servidor interrompido pelo usuário. ---")
