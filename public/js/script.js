// Variáveis globais
// Detecta automaticamente se deve usar o servidor local ou o Render
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? '' 
    : 'https://converta-drv.onrender.com';

let selectedFolder = '';
let selectedFiles = [];

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

// Iniciar conversão real via Backend Python
async function startConversion() {
    if (selectedFiles.length === 0) {
        alert('Selecione arquivos DAV primeiro!');
        return;
    }
    
    const format = document.querySelector('input[name="format"]:checked').value;
    const filename = document.getElementById('filename').value || 'video_completo';
    const clientId = 'client_' + Date.now(); // ID único para logs SSE
    
    // Mostrar progresso e abrir console
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    
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
                updateProgress(10, 'Recebendo arquivos...');
            } else if (state === 'PROCESSANDO') {
                updateProgress(55, 'Processando arquivos recebidos...');
                showToast('Arquivos recebidos pelo servidor', 'info');
            } else if (state === 'CONVERTENDO') {
                updateProgress(65, 'Iniciando motor FFmpeg...');
                showToast('Iniciando conversão FFmpeg', 'warning');
            } else if (state === 'RE-ENCODE') {
                updateProgress(80, 'Usando modo de compatibilidade máxima...');
                showToast('Ajustando formato para compatibilidade', 'warning');
            } else if (state === 'CONCLUIDO') {
                updateProgress(100, 'Concluído!');
                showToast('Conversão finalizada com sucesso!', 'success');
            }
            return;
        }

        // Capturar progresso real do tempo do FFmpeg
        if (msg.startsWith('PROGRESSO:')) {
            const progressData = msg.replace('PROGRESSO:', '');
            const timeMatch = progressData.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
            if (timeMatch) {
                const currentTime = timeMatch[1];
                let currentVal = parseInt(progressFill.style.width) || 50;
                if (currentVal < 95) {
                    currentVal += 0.5; // Incrementa levemente
                    updateProgress(currentVal, `Processando tempo: ${currentTime}`);
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
        progressFill.style.width = value + '%';
        progressPercent.textContent = Math.round(value) + '%';
        progressStatus.textContent = text;
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
            // O upload agora vai de 0% a 50% na barra para dar sensação de movimento real
            const totalPercent = (percentComplete * 0.5);
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
    xhr.send(formData);
}

// Remover função de simulação antiga pois agora o progresso é real
function simulateProgress() { return null; }

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
function completeConversion(format, filename, downloadUrl) {
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressPercent').textContent = '100%';
    document.getElementById('progressStatus').textContent = 'Concluído!';

    setTimeout(() => {
        document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('resultContainer').style.display = 'block';
        
        const finalName = downloadUrl.split('/').pop();
        
        document.getElementById('resultMessage').innerHTML = `
            O arquivo <strong>${finalName}</strong> foi gerado com sucesso!<br>
            <span style="color: var(--success);"><i class="fas fa-check-circle"></i> Conversão Real Concluída.</span><br>
            <small>Total de ${selectedFiles.length} arquivos processados pelo motor FFmpeg.</small>
        `;

        // Se downloadUrl for relativa, prefixamos com API_BASE_URL
        window.lastDownloadUrl = downloadUrl.startsWith('http')
            ? downloadUrl
            : `${API_BASE_URL}${downloadUrl}`;
    }, 500);
}

// Função para baixar o resultado
async function downloadResult() {
    if (!window.lastDownloadUrl) return;

    const btn = document.querySelector('.result-container .btn-outline');
    const originalContent = btn ? btn.innerHTML : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Baixando...';
        }

        const response = await fetch(window.lastDownloadUrl);
        if (!response.ok) throw new Error('Falha ao baixar arquivo do servidor.');
        
        const blob = await response.blob();
        const filename = window.lastDownloadUrl.split('/').pop();

        // Se o usuário escolheu um local personalizado via API do navegador
        if (customFileHandle) {
            const writable = await customFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            alert('Arquivo salvo com sucesso no local escolhido!');
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
        alert('Erro ao salvar o arquivo: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

// Limpar conversor
function resetConverter() {
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
