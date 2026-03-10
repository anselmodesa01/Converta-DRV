// Variáveis globais
// Link da API no Render
const RENDER_API_URL = 'https://converta-drv.onrender.com';

// Detecta automaticamente se deve usar o servidor local ou o Render
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? RENDER_API_URL 
    : ''; // Em produção na Vercel, usa o proxy configurado no vercel.json
// Variáveis globais
let selectedFolder = '';
let selectedFiles = [];
let currentClientId = null;
let isPaused = false;
let currentTab = 'dav-to-mp4';

// Configuração da zona de drop
const dropZone = document.getElementById('dropZone');

// Menu Mobile
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');

if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        const icon = menuToggle.querySelector('i');
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-times');
    });

    // Fechar menu ao clicar em um link
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            const icon = menuToggle.querySelector('i');
            icon.classList.add('fa-bars');
            icon.classList.remove('fa-times');
        });
    });
}

if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
    });

    dropZone.addEventListener('drop', async (e) => {
        const items = Array.from(e.dataTransfer.items);
        selectedFiles = [];
        
        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                await scanFiles(entry);
            }
        }
        
        handleFilesSelected();
    }, false);
}

const ALLOWED_EXTENSIONS = ['dav', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'];

async function scanFiles(entry) {
    if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        const ext = file.name.toLowerCase().split('.').pop();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            selectedFiles.push(file);
        }
    } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise((resolve) => reader.readEntries(resolve));
        for (const childEntry of entries) {
            await scanFiles(childEntry);
        }
    }
}

function handleFilesSelected() {
    if (selectedFiles.length > 0) {
        document.getElementById('folderPath').parentNode.style.display = 'flex';
        document.getElementById('folderPath').innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${selectedFiles.length} arquivo${selectedFiles.length > 1 ? 's' : ''} pronto${selectedFiles.length > 1 ? 's' : ''} para conversão</span>
        `;
        showFileList();
        document.getElementById('convertBtn').disabled = false;
        updateDestinationDisplay();
    } else {
        showToast('Nenhum arquivo de vídeo compatível encontrado!', 'warning');
    }
}

// Função para selecionar pasta
function selectFolder() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;
    
    input.onchange = (e) => {
        const files = Array.from(e.target.files);
        selectedFolder = files[0]?.webkitRelativePath.split('/')[0] || 'Pasta selecionada';
        
        // Filtra apenas arquivos compatíveis
        selectedFiles = files.filter(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            return ALLOWED_EXTENSIONS.includes(ext);
        });
        
        handleFilesSelected();
    };
    
    input.click();
}

// Função para selecionar arquivo individual
function selectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_EXTENSIONS.map(ext => '.' + ext).join(',');
    input.multiple = true;
    
    input.onchange = (e) => {
        const files = Array.from(e.target.files);
        selectedFolder = ''; // Reset folder if individual files are picked
        
        // Filtra apenas arquivos compatíveis
        selectedFiles = files.filter(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            return ALLOWED_EXTENSIONS.includes(ext);
        });
        
        handleFilesSelected();
    };
    
    input.click();
}

// Mostrar lista de arquivos
function showFileList() {
    const fileList = document.getElementById('fileList');
    const fileItems = document.getElementById('fileItems');
    const fileCount = document.getElementById('fileCount');
    
    fileCount.textContent = `${selectedFiles.length} arquivo${selectedFiles.length > 1 ? 's' : ''}`;
    
    fileItems.innerHTML = selectedFiles
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((file, idx) => `
            <div class="file-item" id="file-item-${idx}">
                <i class="fas fa-file-video"></i>
                <div class="file-info">
                    <span class="file-name" title="${file.name}">${file.name}</span>
                    <span class="file-size">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div class="file-status" style="display: none;">
                    <i class="fas fa-circle-notch fa-spin"></i>
                </div>
                <button class="file-remove" data-index="${idx}" title="Remover arquivo">&times;</button>
            </div>
        `)
        .join('');
    
    fileList.style.display = 'block';
}

// Remover arquivo individual da lista
const fileItemsContainer = document.getElementById('fileItems');
if (fileItemsContainer) {
    fileItemsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.file-remove');
        if (!btn) return;
        const index = parseInt(btn.getAttribute('data-index'), 10);
        if (isNaN(index)) return;
        selectedFiles.splice(index, 1);
        
        if (selectedFiles.length > 0) {
            document.getElementById('folderPath').innerHTML = `
                <i class="fas fa-file-check"></i>
                <span>${selectedFiles.length} arquivos prontos para conversão</span>
            `;
            document.getElementById('convertBtn').disabled = false;
            showFileList();
        } else {
            document.getElementById('folderPath').innerHTML = `
                <i class="far fa-folder-open"></i>
                <span>Nenhum arquivo ou pasta selecionada</span>
            `;
            document.getElementById('fileList').style.display = 'none';
            document.getElementById('convertBtn').disabled = true;
        }
    });
}

// Atualizar extensão e caminho de destino quando mudar formato
document.querySelectorAll('input[name="format"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const format = e.target.value;
        document.getElementById('extension').textContent = '.' + format;
        updateDestinationDisplay();
    });
});

// Atualizar caminho de destino quando mudar nome do arquivo
document.getElementById('filename').addEventListener('input', () => {
    updateDestinationDisplay();
});

// Atualizar exibição do destino
function updateDestinationDisplay() {
    const filename = document.getElementById('filename').value || 'video_completo';
    const format = document.querySelector('input[name="format"]:checked').value;
    const destinationPath = document.getElementById('destinationPath');
    
    destinationPath.innerHTML = `
        <i class="fas fa-map-marker-alt"></i>
        <span>Destino: <strong>Downloads/${filename}.${format}</strong></span>
    `;
}

// Lógica para o seletor de salvamento (Web)
let customFileHandle = null;

async function handleSavePicker() {
    if (!('showSaveFilePicker' in window)) {
        alert('Seu navegador não suporta a escolha direta de local. O arquivo será salvo na sua pasta de Downloads padrão.');
        return;
    }

    const format = document.querySelector('input[name="format"]:checked').value;
    const filename = document.getElementById('filename').value || 'video_camera';

    try {
        customFileHandle = await window.showSaveFilePicker({
            suggestedName: `${filename}.${format}`,
            types: [{
                description: 'Video File',
                accept: {'video/*': ['.' + format]}
            }]
        });
        document.getElementById('savePath').value = customFileHandle.name + " (Local selecionado)";
    } catch (err) {
        console.log('Escolha cancelada ou erro:', err);
    }
}

// Função para mostrar notificações Toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-triangle';
    if (type === 'warning') icon = 'exclamation-circle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s ease-out forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function switchTab(tab) {
    currentTab = tab;
    const tabDavToMp4 = document.getElementById('tabDavToMp4');
    const tabMp4ToDav = document.getElementById('tabMp4ToDav');
    const davOptions = document.getElementById('davOptions');
    const mp4ToDavOptions = document.getElementById('mp4ToDavOptions');
    
    // Smooth scroll to converter section
    const converterSection = document.getElementById('converter');
    if (converterSection) {
        converterSection.scrollIntoView({ behavior: 'smooth' });
    }

    if (tab === 'dav-to-mp4') {
        if (tabDavToMp4) tabDavToMp4.classList.add('active');
        if (tabMp4ToDav) tabMp4ToDav.classList.remove('active');
        if (davOptions) davOptions.style.display = 'block';
        if (mp4ToDavOptions) mp4ToDavOptions.style.display = 'none';
        showToast('Modo: DAV para MP4/Outros ativado', 'info');
    } else {
        if (tabDavToMp4) tabDavToMp4.classList.remove('active');
        if (tabMp4ToDav) tabMp4ToDav.classList.add('active');
        if (davOptions) davOptions.style.display = 'none';
        if (mp4ToDavOptions) mp4ToDavOptions.style.display = 'block';
        showToast('Modo: MP4 para DAV ativado', 'info');
    }
    
    // Reset converter state when switching tabs
    resetConverter();
}

// Iniciar conversão real via Backend Python
async function startConversion() {
    if (selectedFiles.length === 0) {
        alert('Selecione arquivos primeiro!');
        return;
    }
    
    let format, filename;
    if (currentTab === 'dav-to-mp4') {
        format = document.querySelector('input[name="format"]:checked').value;
        filename = document.getElementById('filename').value || 'video_completo';
    } else {
        format = 'dav';
        filename = document.getElementById('filenameDav').value || 'video_backup';
    }
    
    const clientId = 'client_' + Date.now(); // ID único para logs SSE
    currentClientId = clientId;
    isPaused = false;
    
    // Mostrar progresso e abrir console
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.style.display = 'flex';
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i> <span>Pausar</span>';
    }
    
    const consoleLog = document.getElementById('consoleLog');
    if (consoleLog.style.display !== 'block') toggleConsole();
    
    // Resetar barra de progresso
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Iniciando...';

    showToast('Iniciando processo de conversão...', 'info');
    
    // Iniciar monitoramento de logs em tempo real (SSE)
    const logContent = document.getElementById('logContent');
    logContent.textContent = 'Conectando ao monitor de eventos...\n';
    
    let isConnected = false;
    let progressWatchdog = null;
    const eventSource = new EventSource(`${API_BASE_URL}/api/events?id=${clientId}`);
    
    eventSource.onopen = () => {
        isConnected = true;
        logContent.textContent += 'Monitor de eventos conectado.\n';
    };

    eventSource.onmessage = (event) => {
        const msg = event.data;
        
        // Monitor de memória
        if (msg.startsWith('MEM_USAGE:')) {
            const memValue = msg.split(': ')[1];
            document.getElementById('memValue').textContent = memValue;
            return;
        }

        // Lógica de estágios e barra de progresso real
        if (msg.startsWith('ESTADO:')) {
            const stateParts = msg.split('|');
            const state = stateParts[0].replace('ESTADO:', '');
            const detail = stateParts[1] || '';

            if (state === 'RECEBENDO') {
                updateProgress(5, 'Recebendo arquivos...');
            } else if (state === 'PROCESSANDO') {
                updateProgress(35, 'Processando arquivos recebidos...');
                showToast('Arquivos recebidos pelo servidor', 'info');
            } else if (state === 'CONVERTENDO') {
                isPaused = false;
                const pauseBtn = document.getElementById('pauseBtn');
                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fas fa-pause"></i> <span>Pausar</span>';
                    pauseBtn.classList.remove('paused');
                }
                updateProgress(40, 'Iniciando motor FFmpeg...');
                showToast('Iniciando conversão FFmpeg', 'warning');
            } else if (state === 'RE-ENCODE') {
                updateProgress(85, 'Usando modo de compatibilidade máxima...');
                showToast('Ajustando formato para compatibilidade', 'warning');
            } else if (state === 'PAUSADO') {
                isPaused = true;
                const pauseBtn = document.getElementById('pauseBtn');
                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fas fa-play"></i> <span>Retomar</span>';
                    pauseBtn.classList.add('paused');
                }
                document.getElementById('progressStatus').textContent = 'Pausado pelo usuário';
                showToast('Conversão pausada', 'info');
            } else if (state === 'CONCLUIDO') {
                updateProgress(100, 'Concluído!');
                const pauseBtn = document.getElementById('pauseBtn');
                if (pauseBtn) pauseBtn.style.display = 'none';
                showToast('Conversão finalizada com sucesso!', 'success');
                
                // Extrair o nome do arquivo da mensagem se possível (Sucesso! Arquivo gerado: video_camera_123.avi)
                const filenameMatch = detail.match(/Arquivo gerado:\s*(.*)/i);
                if (filenameMatch && filenameMatch[1]) {
                    const sseFilename = filenameMatch[1].trim();
                    const sseDownloadUrl = `${API_BASE_URL}/download/${sseFilename}`;
                    
                    // Disparar conclusão via SSE para ser mais rápido que o XHR onload
                    if (eventSource) eventSource.close();
                    completeConversion(format, filename, sseDownloadUrl);
                }
            }
            return;
        }

        // Capturar progresso real do tempo do FFmpeg
        if (msg.startsWith('PROGRESSO:')) {
            const progressData = msg.replace('PROGRESSO:', '');
            
            // Se for um valor numérico (porcentagem enviada pelo backend)
            const progressVal = parseFloat(progressData);
            if (!isNaN(progressVal)) {
                // Mapear 0-100% da conversão para 40-95% da barra total
                const mappedProgress = 40 + (progressVal * 0.55);
                updateProgress(mappedProgress, `Convertendo: ${progressVal.toFixed(1)}%`);
            } else if (progressData.includes('time=')) {
                // Fallback: se não temos porcentagem mas temos tempo, incrementamos levemente
                const timeMatch = progressData.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                const timeStr = timeMatch ? timeMatch[1] : '...';
                
                let currentWidth = parseFloat(document.getElementById('progressFill').style.width) || 40;
                if (currentWidth < 95) {
                    // Incremento cosmético para mostrar que não travou
                    updateProgress(currentWidth + 0.1, `Processando vídeo... (${timeStr})`);
                }
            }
            return;
        }

        if (msg.startsWith('LOG:')) {
            logContent.textContent += ' FFmpeg: ' + msg.replace('LOG:', '') + '\n';
            return;
        }

        if (msg.startsWith('AVISO:')) {
            showToast(msg.replace('AVISO:', ''), 'warning');
        }

        if (msg.startsWith('ERRO:')) {
            showToast(msg.replace('ERRO:', ''), 'error');
        }

        logContent.textContent += msg + '\n';
        logContent.scrollTop = logContent.scrollHeight;

        // Lógica para ativar loaders individuais na lista
        if (msg.includes('Salvando temporário:') || msg.includes('Preparando para unir:') || msg.includes('Convertendo:')) {
            const fileName = msg.split(': ').pop();
            document.querySelectorAll('.file-item').forEach(item => {
                if (item.querySelector('.file-name').textContent === fileName) {
                    item.querySelector('.file-status').style.display = 'block';
                    item.querySelector('.file-remove').style.display = 'none';
                    item.classList.add('processing');
                }
            });
        }
    };

    function updateProgress(value, text) {
        const currentWidth = parseFloat(progressFill.style.width) || 0;
        // Impedir que a barra volte para trás, exceto em reset
        if (value < currentWidth && value > 0) return;
        
        progressFill.style.width = value + '%';
        progressPercent.textContent = Math.round(value) + '%';
        if (text) progressStatus.textContent = text;
    }
    
    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });
    const keepOriginals = document.getElementById('keepOriginals').checked;
    const orderByDate = document.getElementById('orderByDate').checked;

    formData.append('format', format);
    formData.append('filename', filename);
    formData.append('keepOriginals', keepOriginals);
    formData.append('orderByDate', orderByDate);

    // Usar XMLHttpRequest para progresso de UPLOAD real
    const xhr = new XMLHttpRequest();
    
    // Configurar o progresso do upload
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            // O upload agora vai de 0% a 35% na barra para dar sensação de movimento real
            const totalPercent = (percentComplete * 0.35);
            updateProgress(totalPercent, `Enviando arquivos: ${Math.round(percentComplete)}%`);
            
            if (Math.round(percentComplete) % 20 === 0) {
                logContent.textContent += `Upload: ${Math.round(percentComplete)}%\n`;
                logContent.scrollTop = logContent.scrollHeight;
            }
        }
    });

    xhr.onloadstart = () => {
        showToast('Iniciando upload dos arquivos...', 'info');
        logContent.textContent += 'Upload iniciado...\n';
    };

    xhr.onload = function() {
        if (progressWatchdog) clearInterval(progressWatchdog);
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                const result = JSON.parse(xhr.responseText);
                if (result.success) {
                    const downloadUrl = result.download_url.startsWith('http') 
                        ? result.download_url 
                        : `${API_BASE_URL}${result.download_url}`;
                    
                    if (eventSource) eventSource.close();
                    completeConversion(format, filename, downloadUrl);
                } else {
                    throw new Error(result.error || 'Erro desconhecido.');
                }
            } catch (e) {
                handleError(e);
            }
        } else {
            handleError(new Error(`Erro no servidor: ${xhr.status}`));
        }
    };

    xhr.onerror = () => handleError(new Error('A conexão com o servidor falhou.'));
    
    function handleError(error) {
        if (progressWatchdog) clearInterval(progressWatchdog);
        if (eventSource) eventSource.close();
        document.getElementById('convertBtn').disabled = false;
        showToast(error.message, 'error');
        document.getElementById('logContent').textContent += '\n\nERRO: ' + error.message;
    }

    // Aguardar conexão SSE por no máximo 3 segundos antes de enviar
    let waitCount = 0;
    logContent.textContent += 'Aguardando conexão com o motor de eventos...\n';
    while (!isConnected && waitCount < 30) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
    }
    
    if (!isConnected) {
        logContent.textContent += 'Aviso: Continuando sem monitoramento de eventos em tempo real.\n';
    } else {
        logContent.textContent += 'Motor de eventos pronto.\n';
    }

    xhr.open('POST', `${API_BASE_URL}/api`);
    xhr.setRequestHeader('X-Client-ID', clientId);
    
    // Watchdog para a barra de progresso (garante movimento se o SSE falhar ou for lento)
    progressWatchdog = setInterval(() => {
        if (isPaused) return; // Não incrementa se estiver pausado
        let currentWidth = parseFloat(progressFill.style.width) || 0;
        if (currentWidth >= 35 && currentWidth < 98) {
            // Se já passou do upload mas não terminou, incrementa 0.1% a cada 2s
            // Isso dá feedback visual de que o servidor está trabalhando
            updateProgress(currentWidth + 0.05, progressStatus.textContent);
        }
    }, 2000);

    xhr.send(formData);
}

// Remover função de simulação antiga pois agora o progresso é real
function simulateProgress() { return null; }

// Funções de Controle de Pausa
async function togglePause() {
    if (!currentClientId) return;
    
    const wasPaused = isPaused;
    const endpoint = wasPaused ? '/api/resume' : '/api/pause';
    const pauseBtn = document.getElementById('pauseBtn');
    
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = wasPaused ? 
            '<i class="fas fa-sync fa-spin"></i> Retomando...' : 
            '<i class="fas fa-sync fa-spin"></i> Pausando...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'X-Client-ID': currentClientId }
        });
        
        const result = await response.json();
        if (result.success) {
            // Atualizar estado local imediatamente para feedback instantâneo
            isPaused = !wasPaused;
            if (pauseBtn) {
                if (isPaused) {
                    pauseBtn.innerHTML = '<i class="fas fa-play"></i> <span>Retomar</span>';
                    pauseBtn.classList.add('paused');
                    document.getElementById('progressStatus').textContent = 'Pausado pelo usuário';
                } else {
                    pauseBtn.innerHTML = '<i class="fas fa-pause"></i> <span>Pausar</span>';
                    pauseBtn.classList.remove('paused');
                    document.getElementById('progressStatus').textContent = 'Retomando conversão...';
                }
            }
        } else {
            showToast('Erro ao controlar pausa: ' + result.error, 'error');
            // Reverter texto se falhar
            if (pauseBtn) {
                pauseBtn.innerHTML = wasPaused ? 
                    '<i class="fas fa-play"></i> <span>Retomar</span>' : 
                    '<i class="fas fa-pause"></i> <span>Pausar</span>';
            }
        }
    } catch (error) {
        showToast('Erro de conexão: ' + error.message, 'error');
    } finally {
        if (pauseBtn) pauseBtn.disabled = false;
    }
}

// Funções do Console
function toggleConsole() {
    const consoleLog = document.getElementById('consoleLog');
    const isVisible = consoleLog.style.display === 'block';
    consoleLog.style.display = isVisible ? 'none' : 'block';
    
    const btnText = document.querySelector('.btn-console span') || document.querySelector('.btn-console');
    btnText.innerHTML = isVisible ? 
        '<i class="fas fa-terminal"></i> Ver no console' : 
        '<i class="fas fa-terminal"></i> Ocultar console';
}

function copyLogs() {
    const logContent = document.getElementById('logContent').textContent;
    navigator.clipboard.writeText(logContent).then(() => {
        alert('Logs copiados para a área de transferência!');
    });
}

// Simular barra de progresso (retorna o ID do intervalo para limpeza)
function simulateProgress() {
    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    
    const messages = [
        'Enviando arquivos para o servidor...',
        'Analisando streams DAV...',
        'Processando vídeo (FFmpeg)...',
        'Finalizando arquivo...'
    ];

    const interval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 5;
        }
        
        progressFill.style.width = progress + '%';
        progressPercent.textContent = Math.round(progress) + '%';
        
        const msgIndex = Math.min(Math.floor((progress / 100) * messages.length), messages.length - 1);
        progressStatus.textContent = messages[msgIndex];
    }, 500);

    return interval;
}

// Finalizar conversão
let isConversionUIShown = false;
function completeConversion(format, filename, downloadUrl) {
    if (isConversionUIShown) return;
    isConversionUIShown = true;
    
    // Esconder botão de pausa imediatamente
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';

    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
    progressStatus.textContent = 'Conclusão confirmada pelo motor!';

    setTimeout(() => {
        const resultContainer = document.getElementById('resultContainer');
        if (resultContainer) {
            resultContainer.style.display = 'block';
            
            // Limpar nome do arquivo para exibição (remover timestamp se houver)
            let finalName = downloadUrl.split('/').pop().split('?')[0];
            // Tenta remover o timestamp _\d{10} se houver
            finalName = finalName.replace(/_\d{10}\./, '.');
            
            resultContainer.innerHTML = `
                <div class="result-card" style="background: var(--bg-secondary); border: 2px solid var(--success); border-radius: 1.5rem; padding: 2.5rem; margin-top: 2rem; animation: slideUp 0.5s ease-out;">
                    <div class="result-icon success" style="font-size: 4rem; color: var(--success); margin-bottom: 1rem;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 1rem;">Processo Terminado!</h3>
                    <p style="color: var(--text-secondary); font-size: 1.1rem; margin-bottom: 2rem;">
                        O arquivo <strong>${finalName}</strong> foi totalmente convertido e está pronto.<br>
                        Você pode encontrá-lo na pasta <code>\\outputs</code> do projeto ou baixar agora mesmo.
                    </p>
                    <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                        <button class="btn-convert" onclick="downloadResult()" style="flex: none; min-width: 250px; background: var(--success);">
                            <i class="fas fa-download"></i>
                            Baixar Arquivo Agora
                        </button>
                        <button class="btn-secondary" onclick="resetConverter()" style="flex: none;">
                            <i class="fas fa-plus"></i>
                            Nova Conversão
                        </button>
                    </div>
                </div>
            `;

            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Armazenar URL final para download
        window.lastDownloadUrl = downloadUrl;
    }, 600);
}

// Função para baixar o resultado
async function downloadResult() {
    if (!window.lastDownloadUrl) return;

    // Tentar encontrar o botão, independentemente da classe
    const btn = document.querySelector('.result-card .btn-convert') || 
                document.querySelector('.result-container .btn-convert') ||
                document.querySelector('.result-container .btn-outline');
                
    const originalContent = btn ? btn.innerHTML : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando download...';
        }

        // Adicionar cache-busting para garantir o arquivo mais recente
        const cacheBuster = `&t=${Date.now()}`;
        const finalUrl = window.lastDownloadUrl.includes('?') 
            ? `${window.lastDownloadUrl}${cacheBuster}`
            : `${window.lastDownloadUrl}?t=${Date.now()}`;

        const response = await fetch(finalUrl);
        if (!response.ok) throw new Error('Falha ao baixar arquivo do servidor.');
        
        const blob = await response.blob();
        const filename = window.lastDownloadUrl.split('/').pop().split('?')[0];

        // Se o usuário escolheu um local personalizado via API do navegador
        if (customFileHandle) {
            const writable = await customFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            showToast('Arquivo salvo com sucesso no local escolhido!', 'success');
        } else {
            // Download padrão do navegador
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
    } catch (error) {
        console.error('Erro no download:', error);
        showToast('Erro ao salvar o arquivo: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

// Limpar conversor
function resetConverter() {
    isConversionUIShown = false;
    selectedFiles = [];
    selectedFolder = '';
    document.getElementById('folderPath').innerHTML = `
        <i class="far fa-folder-open"></i>
        <span>Nenhum arquivo ou pasta selecionada</span>
    `;
    document.getElementById('fileList').style.display = 'none';
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    updateDestinationDisplay();
}

// Inicializar display
updateDestinationDisplay();

// Scroll para o conversor
function scrollToConverter() {
    document.getElementById('converter').scrollIntoView({ behavior: 'smooth' });
}

// Mostrar demo
function showDemo() {
    alert('🎥 Demonstração: Selecione uma pasta com arquivos DAV e veja a mágica acontecer!');
}

// Toggle FAQ
function toggleFaq(element) {
    const faqItem = element.parentElement;
    faqItem.classList.toggle('active');
}

// Smooth scroll para links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Animação de entrada dos cards
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.6s ease-out';
    observer.observe(el);
});
