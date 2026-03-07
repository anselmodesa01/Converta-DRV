from http.server import BaseHTTPRequestHandler
import json
from werkzeug.formparser import parse_form_data
import os
import subprocess
import time
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Configurações de pastas temporárias (únicas que funcionam na Vercel)
        UPLOAD_FOLDER = '/tmp/uploads'
        OUTPUT_FOLDER = '/tmp/outputs'
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(OUTPUT_FOLDER, exist_ok=True)

        try:
            # Usar Werkzeug para parse do formulário
            environ = {
                'REQUEST_METHOD': 'POST',
                'CONTENT_TYPE': self.headers['Content-Type'],
                'CONTENT_LENGTH': self.headers['Content-Length'],
                'wsgi.input': self.rfile
            }
            _, form, files = parse_form_data(environ)

            # Extrair dados do formulário
            output_format = form.get('format', 'mp4')
            output_name = form.get('filename', f"video_{int(time.time())}")
            order_by_date = form.get('orderByDate') == 'true'

            saved_files = []
            for file in files.getlist('files'):
                temp_name = f"upload_{int(time.time())}_{file.filename}"
                path = os.path.join(UPLOAD_FOLDER, temp_name)
                with open(path, 'wb') as f:
                    f.write(file.read())
                saved_files.append(path)

            if not saved_files:
                self.send_error_response(400, "Nenhum arquivo enviado.")
                return

            # Ordenar arquivos
            if order_by_date and len(saved_files) > 1:
                saved_files.sort()

            output_filename = f"{output_name}.{output_format}"
            output_path = os.path.join(OUTPUT_FOLDER, output_filename)
            
            # Lógica FFmpeg
            ffmpeg_cmd = 'ffmpeg' # Assume-se FFmpeg no PATH da Vercel ou via binário local
            
            if len(saved_files) > 1:
                list_path = os.path.join(UPLOAD_FOLDER, f'list_{int(time.time())}.txt')
                with open(list_path, 'w', encoding='utf-8') as f:
                    for p in saved_files:
                        f.write(f"file '{p}'\n")
                
                if output_format == 'mp3':
                    args = [ffmpeg_cmd, '-f', 'concat', '-safe', '0', '-i', list_path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output_path, '-y']
                else:
                    args = [ffmpeg_cmd, '-f', 'concat', '-safe', '0', '-i', list_path, '-c', 'copy', output_path, '-y']
            else:
                input_path = saved_files[0]
                if output_format == 'mp3':
                    args = [ffmpeg_cmd, '-i', input_path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output_path, '-y']
                else:
                    args = [ffmpeg_cmd, '-i', input_path, '-c', 'copy', output_path, '-y']

            # Executa a conversão
            process = subprocess.run(args, capture_output=True, text=True)

            # Se falhou o copy, tenta recodificar (funciona para um arquivo ou concat)
            if process.returncode != 0 and (output_format == 'mp4' or output_format == 'mkv'):
                if len(saved_files) > 1:
                    args_re = [ffmpeg_cmd, '-f', 'concat', '-safe', '0', '-i', list_path, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', output_path, '-y']
                else:
                    args_re = [ffmpeg_cmd, '-i', saved_files[0], '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', output_path, '-y']
                process = subprocess.run(args_re, capture_output=True, text=True)

            if process.returncode == 0:
                self.send_json_response(200, {
                    'success': True,
                    'filename': output_filename,
                    'download_url': f'/api/download?file={output_filename}'
                })
            else:
                self.send_error_response(500, f"Erro FFmpeg: {process.stderr}")

        except Exception as e:
            self.send_error_response(500, str(e))

    def do_GET(self):
        parsed_path = urlparse(self.path)
        params = parse_qs(parsed_path.query)

        # Rota de download
        if parsed_path.path == '/api/download':
            filename = params.get('file', [None])[0]
            if not filename:
                self.send_error_response(400, "Arquivo não especificado.")
                return
            
            path = os.path.join('/tmp/outputs', filename)
            if os.path.exists(path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Length', os.path.getsize(path))
                self.end_headers()
                with open(path, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_error_response(404, "Arquivo não encontrado no servidor temporário.")
                return
        
        # Qualquer outra rota GET retorna erro JSON para evitar o Unexpected Token no frontend
        self.send_error_response(404, "Rota não encontrada.")

    def send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def send_error_response(self, status, message):
        self.send_json_response(status, {'success': False, 'error': message})
