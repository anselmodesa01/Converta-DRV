import os
import subprocess
import json
import time
import zipfile
import urllib.request
import re
import uuid
import threading
import psutil
import platform
try:
    from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
except ImportError:
    # Para versões mais antigas do Python 3
    from http.server import HTTPServer, SimpleHTTPRequestHandler
    import socketserver
    class ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
        pass

from urllib.parse import urlparse, parse_qs
from werkzeug.formparser import parse_form_data

# Configurações de pastas usando caminhos absolutos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
OUTPUT_FOLDER = os.path.join(BASE_DIR, 'outputs')
FFMPEG_PATH = os.path.join(BASE_DIR, 'ffmpeg.exe')
STATIC_FOLDER = os.path.join(BASE_DIR, 'public')

# Detecta o sistema operacional
IS_WINDOWS = platform.system().lower() == 'windows'

# Garante que as pastas existam
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Gerenciador de logs em memória para SSE
class LogStore:
    def __init__(self):
        self.logs = {}
        self.lock = threading.Lock()

    def add_log(self, client_id, message):
        with self.lock:
            if client_id not in self.logs:
                self.logs[client_id] = []
            timestamp = time.strftime('%H:%M:%S')
            self.logs[client_id].append(f"[{timestamp}] {message}")
            print(f"[{client_id}] {message}")

    def get_logs(self, client_id):
        with self.lock:
            return self.logs.get(client_id, [])

    def clear_logs(self, client_id):
        with self.lock:
            if client_id in self.logs:
                del self.logs[client_id]

log_store = LogStore()

# Dicionário global para rastrear processos FFmpeg ativos por client_id
active_processes = {}
processes_lock = threading.Lock()

def download_ffmpeg():
    if not IS_WINDOWS:
        print("--- No Linux/Render, o FFmpeg deve ser instalado via pacote do sistema. ---")
        return False

    print("--- FFmpeg não encontrado. Baixando automaticamente para Windows... ---")
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
    print("--- Verificando instalação do FFmpeg... ---")
    
    # 1. Verifica no PATH do sistema (Funciona em Linux/Render e Windows)
    try:
        ret = subprocess.call('ffmpeg -version', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)
        if ret == 0:
            print("--- FFmpeg encontrado no sistema (PATH). ---")
            return 'ffmpeg'
    except:
        pass

    # 2. Verifica binário local (Apenas Windows)
    if IS_WINDOWS and os.path.exists(FFMPEG_PATH):
        print("--- FFmpeg encontrado na pasta do projeto (Windows). ---")
        return f'"{FFMPEG_PATH}"'
    
    # 3. Tenta baixar se for Windows
    if IS_WINDOWS:
        print("*** AVISO: FFmpeg não encontrado. Tentando baixar... ***")
        if download_ffmpeg():
            return f'"{FFMPEG_PATH}"'
    
    print("*** ERRO FATAL: Não foi possível encontrar o FFmpeg. ***")
    print("DICA: No Render, use o Build Command: apt-get update && apt-get install -y ffmpeg")
    return None

# Iniciar verificação do FFmpeg ao carregar o script
FFMPEG_CMD = get_ffmpeg_command()

class UnifiedHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        # Define o diretório base para o SimpleHTTPRequestHandler como 'public'
        super().__init__(*args, directory=STATIC_FOLDER, **kwargs)

    def end_headers(self):
        # Cabeçalhos CORS para desenvolvimento
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, X-Client-ID')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        # Endpoint para pausar conversão
        if parsed_path.path == '/api/pause':
            client_id = self.headers.get('X-Client-ID', 'default')
            with processes_lock:
                process = active_processes.get(client_id)
                if process and process.poll() is None: # Verifica se o processo ainda está rodando
                    try:
                        p = psutil.Process(process.pid)
                        p.suspend()
                        for child in p.children(recursive=True):
                            child.suspend()
                        log_store.add_log(client_id, "ESTADO:PAUSADO|A conversão foi pausada.")
                        self.send_json_response(200, {'success': True, 'message': 'Pausado'})
                        return
                    except Exception as e:
                        self.send_error_response(500, f"Erro ao pausar: {str(e)}")
                        return
                else:
                    self.send_error_response(404, "Processo não encontrado ou já finalizado")
                    return

        # Endpoint para retomar conversão
        if parsed_path.path == '/api/resume':
            client_id = self.headers.get('X-Client-ID', 'default')
            with processes_lock:
                process = active_processes.get(client_id)
                if process and process.poll() is None:
                    try:
                        p = psutil.Process(process.pid)
                        p.resume()
                        for child in p.children(recursive=True):
                            child.resume()
                        log_store.add_log(client_id, "ESTADO:CONVERTENDO|A conversão foi retomada.")
                        self.send_json_response(200, {'success': True, 'message': 'Retomado'})
                        return
                    except Exception as e:
                        self.send_error_response(500, f"Erro ao retomar: {str(e)}")
                        return
                else:
                    self.send_error_response(404, "Processo não encontrado ou já finalizado")
                    return

        if self.path == '/api' or self.path == '/convert':
            client_id = self.headers.get('X-Client-ID', 'default')
            log_store.add_log(client_id, "ESTADO:RECEBENDO|Iniciando recebimento dos dados...")
            try:
                if not FFMPEG_CMD:
                    self.send_error_response(500, "FFmpeg não está instalado ou configurado.")
                    return

                # Usar Werkzeug para parse do formulário
                log_store.add_log(client_id, "ESTADO:PROCESSANDO|Lendo dados do formulário...")
                environ = {
                    'REQUEST_METHOD': 'POST',
                    'CONTENT_TYPE': self.headers['Content-Type'],
                    'CONTENT_LENGTH': self.headers['Content-Length'],
                    'wsgi.input': self.rfile
                }
                _, form, files = parse_form_data(environ)

                output_format = form.get('format', 'mp4')
                output_name = form.get('filename', f"video_{int(time.time())}")
                keep_originals = form.get('keepOriginals') == 'true'
                order_by_date = form.get('orderByDate') == 'true'

                saved_files = []
                files_list = files.getlist('files')
                log_store.add_log(client_id, f"Arquivos recebidos: {len(files_list)}")

                for file in files_list:
                    if file.filename:
                        clean_filename = os.path.basename(file.filename).replace(' ', '_')
                        temp_name = f"upload_{int(time.time())}_{clean_filename}"
                        path = os.path.join(UPLOAD_FOLDER, temp_name)
                        
                        log_store.add_log(client_id, f"Salvando: {file.filename}")
                        # Usar o método save() nativo do Werkzeug que é mais rápido e seguro
                        file.save(path)
                        actual_size = os.path.getsize(path)
                        log_store.add_log(client_id, f"Salvo: {file.filename} ({actual_size / 1024 / 1024:.2f} MB)")
                        saved_files.append(path)

                if not saved_files:
                    log_store.add_log(client_id, "Erro: Nenhum arquivo foi salvo.")
                    self.send_error_response(400, "Nenhum arquivo enviado.")
                    return

                if order_by_date and len(saved_files) > 1:
                    saved_files.sort(key=lambda x: os.path.basename(x))
                
                # Evitar extensões duplicadas (ex: video.avi.avi)
                clean_output_name = output_name
                if clean_output_name.lower().endswith(f".{output_format.lower()}"):
                    clean_output_name = clean_output_name[:-(len(output_format) + 1)]

                # Adicionar timestamp para garantir unicidade e evitar cache/sobreposição
                timestamp = int(time.time())
                output_filename = f"{clean_output_name}_{timestamp}.{output_format}"
                output_path = os.path.abspath(os.path.join(OUTPUT_FOLDER, output_filename))
                
                log_store.add_log(client_id, f"LOG:Formato de saída detectado: {output_format}")
                log_store.add_log(client_id, f"LOG:Caminho de saída: {output_path}")
                
                # Calcular tamanho total dinâmico para os logs
                total_size_bytes = sum(os.path.getsize(p) for p in saved_files)
                total_size_mb = total_size_bytes / (1024 * 1024)
                size_str = f"{total_size_mb:.2f} MB" if total_size_mb < 1024 else f"{total_size_mb/1024:.2f} GB"

                log_store.add_log(client_id, f"ESTADO:PROCESSANDO|Tamanho total: {size_str}")

                # --- MOTOR DE CONVERSÃO MULTI-ESTRATÉGIA ---
                def get_video_duration(file_path):
                    """Usa ffprobe para obter a duração de um vídeo em segundos."""
                    command = f'"{FFMPEG_PATH.replace("ffmpeg.exe", "ffprobe.exe")}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{file_path}"'
                    try:
                        result = subprocess.check_output(command, shell=True, stderr=subprocess.STDOUT)
                        return float(result)
                    except Exception as e:
                        log_store.add_log(client_id, f"LOG:Aviso - Não foi possível obter a duração de '{os.path.basename(file_path)}'. A barra de progresso pode não ser precisa.")
                        return 0

                def run_ffmpeg(args, desc, total_duration=0):
                    log_store.add_log(client_id, f"ESTADO:CONVERTENDO|{desc}...")
                    log_store.add_log(client_id, f"LOG:Comando: {FFMPEG_CMD} {args}")
                    
                    process = subprocess.Popen(
                        f'{FFMPEG_CMD} {args}',
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        shell=True,
                        universal_newlines=True,
                        encoding='utf-8',
                        errors='replace'
                    )
                    
                    # Registrar o processo como ativo
                    with processes_lock:
                        active_processes[client_id] = process
                    
                    try:
                        last_line = ""
                        for line in process.stdout:
                            line = line.strip()
                            if not line: continue
                            last_line = line

                            if 'time=' in line:
                                match = re.search(r'time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})', line)
                                if match and total_duration > 0:
                                    hours, minutes, seconds, ms = map(int, match.groups())
                                    current_time = hours * 3600 + minutes * 60 + seconds + ms / 100
                                    progress = (current_time / total_duration) * 100
                                    log_store.add_log(client_id, f"PROGRESSO:{min(progress, 100):.1f}")
                                else:
                                    # Fallback para quando a duração não está disponível
                                    log_store.add_log(client_id, f"PROGRESSO:LINE:{line}")
                            else:
                                 log_store.add_log(client_id, f"LOG:{line}")
                    finally:
                        # Remover o processo do registro de ativos
                        with processes_lock:
                            if client_id in active_processes:
                                del active_processes[client_id]

                    process.wait()
                    success = os.path.exists(output_path) and os.path.getsize(output_path) > 1000
                    if not success:
                        log_store.add_log(client_id, f"ERRO:Falha na estratégia '{desc}'. Última linha do log: {last_line}")

                    return success, last_line

                list_path = None
                success = False
                error_log = ""

                total_duration = 0
                if len(saved_files) == 1:
                    total_duration = get_video_duration(saved_files[0])
                # Para múltiplos arquivos, o cálculo da duração é mais complexo e será ignorado por enquanto.

                # Definir estratégias para DAV ou outros formatos
                if len(saved_files) > 1:
                    # Estratégia de UNIÃO (Concat)
                    list_path = os.path.join(UPLOAD_FOLDER, f'list_{int(time.time())}.txt')
                    with open(list_path, 'w', encoding='utf-8') as f:
                        for p in saved_files:
                            f.write(f"file '{os.path.abspath(p).replace('\\', '/')}'\n")
                    
                    if output_format == 'dav':
                        # Para DAV, usamos o muxer h264 raw, pois dhav muxer não é suportado para escrita
                        # Nota: raw h264 não suporta áudio.
                        success, error_log = run_ffmpeg(f'-f concat -safe 0 -i "{list_path}" -c:v libx264 -crf 23 -pix_fmt yuv420p -an -f h264 "{output_path}" -y', "Unindo e convertendo para DAV (H264 Raw)")
                    elif output_format == 'mp3':
                        success, error_log = run_ffmpeg(f'-f concat -safe 0 -i "{list_path}" -vn -acodec libmp3lame -q:a 2 "{output_path}" -y', "Extraindo áudio de todos")
                    elif output_format == 'avi':
                        success, error_log = run_ffmpeg(f'-f concat -safe 0 -i "{list_path}" -c:v mpeg4 -vtag xvid -q:v 5 -c:a aac "{output_path}" -y', "Unindo em AVI")
                    else:
                        # Estratégia 1: Concat rápido
                        extra_args = "-f h264 -an" if output_format == 'dav' else ""
                        success, error_log = run_ffmpeg(f'-f concat -safe 0 -i "{list_path}" -c copy {extra_args} "{output_path}" -y', "Tentando união rápida")
                        if not success:
                            # Estratégia 2: Concat com Re-encode (mais seguro para DAVs diferentes)
                            success, error_log = run_ffmpeg(f'-f concat -safe 0 -i "{list_path}" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac {extra_args} "{output_path}" -y', "Tentando união com re-processamento")
                else:
                    # Estratégia de ARQUIVO ÚNICO
                    input_path = os.path.abspath(saved_files[0])
                    is_dav = input_path.lower().endswith('.dav')
                    
                    if output_format == 'dav':
                        # Raw h264 para .dav (sem áudio)
                        success, error_log = run_ffmpeg(f'-i "{input_path}" -c:v libx264 -crf 23 -pix_fmt yuv420p -an -f h264 "{output_path}" -y', "Convertendo para DAV (H264 Raw)", total_duration)
                    elif output_format == 'mp3':
                        success, error_log = run_ffmpeg(f'-i "{input_path}" -vn -acodec libmp3lame -q:a 2 "{output_path}" -y', "Extraindo áudio", total_duration)
                    elif output_format == 'avi':
                        success, error_log = run_ffmpeg(f'-i "{input_path}" -c:v mpeg4 -vtag xvid -q:v 5 -c:a aac "{output_path}" -y', "Convertendo para AVI", total_duration)
                    elif is_dav:
                        # ESTRATÉGIA 1: Modo Especialista DHAV (Dahua/Intelbras)
                        success, error_log = run_ffmpeg(f'-analyzeduration 100M -probesize 100M -f dhav -i "{input_path}" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -fflags +genpts "{output_path}" -y', "Estratégia 1: Formato DHAV", total_duration)
                    else:
                        # Formatos comuns (MP4, MKV, etc)
                        extra_args = "-f h264 -an" if output_format == 'dav' else ""
                        success, error_log = run_ffmpeg(f'-i "{input_path}" -c copy {extra_args} "{output_path}" -y', "Conversão rápida", total_duration)
                        if not success:
                            success, error_log = run_ffmpeg(f'-i "{input_path}" -c:v libx264 -preset ultrafast -crf 23 {extra_args} "{output_path}" -y', "Conversão compatível", total_duration)

                # Limpeza final
                if not keep_originals:
                    for p in saved_files:
                        if os.path.exists(p): os.remove(p)
                if list_path and os.path.exists(list_path): os.remove(list_path)
                
                if success:
                    log_store.add_log(client_id, f"ESTADO:CONCLUIDO|Sucesso! Arquivo gerado: {output_filename}")
                    self.send_json_response(200, {'success': True, 'filename': output_filename, 'download_url': f'/download/{output_filename}'})
                else:
                    log_store.add_log(client_id, f"ERRO: Todas as estratégias de conversão falharam.")
                    log_store.add_log(client_id, f"LOG: Último erro: {error_log}")
                    self.send_error_response(500, f"Falha ao converter arquivo DAV. O formato pode estar corrompido ou é incompatível. Erro: {error_log}")
            except Exception as e:
                log_store.add_log(client_id, f"Erro fatal: {str(e)}")
                self.send_error_response(500, str(e))

    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # Endpoint para Server-Sent Events (SSE) - Logs em tempo real
        if parsed_path.path == '/api/events':
            query = parse_qs(parsed_path.query)
            client_id = query.get('id', ['default'])[0]
            
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            log_store.add_log(client_id, "Conectado ao monitor de conversão.")
            
            try:
                # Envia logs acumulados e novos
                last_idx = 0
                process = psutil.Process(os.getpid())
                
                while True:
                    # Monitoramento de memória
                    mem_info = process.memory_info().rss / (1024 * 1024) # MB
                    mem_message = f"MEM_USAGE: {mem_info:.2f} MB"
                    self.wfile.write(f"data: {mem_message}\n\n".encode())
                    print(f"[Monitor] {mem_message}") # Adicionado para logar no console
                    
                    current_logs = log_store.get_logs(client_id)
                    if len(current_logs) > last_idx:
                        for i in range(last_idx, len(current_logs)):
                            msg = current_logs[i]
                            self.wfile.write(f"data: {msg}\n\n".encode())
                        self.wfile.flush()
                        last_idx = len(current_logs)
                    time.sleep(0.5)
            except Exception as e:
                # Conexão fechada pelo cliente
                pass
            return

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
    # No Render/Docker, o host DEVE ser '0.0.0.0'
    host = '0.0.0.0'
    port = int(os.environ.get('PORT', '10000'))
    
    print("--------------------------------------------------")
    print(f"SISTEMA: {platform.system()}")
    print(f"PORTA DETECTADA: {port}")
    print(f"FFMPEG COMMAND: {FFMPEG_CMD}")
    print(f"DIRETÓRIO BASE: {BASE_DIR}")
    print("--------------------------------------------------")
    
    try:
        httpd = ThreadingHTTPServer((host, port), UnifiedHandler)
        print(f"--- Servidor ONLINE em http://{host}:{port} ---")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n--- Servidor interrompido. ---")
    except Exception as e:
        print(f"Erro fatal: {e}")
