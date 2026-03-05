// Variáveis globais
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
            <i class="fas fa-file-check"></i>
            <span>${selectedFiles.length} arquivos prontos para conversão</span>
        `;
        showFileList();
        document.getElementById('convertBtn').disabled = false;
    } else {
        alert('Nenhum arquivo de vídeo compatível encontrado!');
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
            <div class="file-item">
                <i class="fas fa-file-video"></i>
                <span>${file.name}</span>
                <span style="margin-left: auto;">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <button class="file-remove" data-index="${idx}" aria-label="Remover arquivo">&times;</button>
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
        <i class="fas fa-download"></i>
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

// Iniciar conversão real via Backend Python
async function startConversion() {
    if (selectedFiles.length === 0) {
        alert('Selecione arquivos DAV primeiro!');
        return;
    }
    
    const format = document.querySelector('input[name="format"]:checked').value;
    const filename = document.getElementById('filename').value || 'video_completo';
    
    // Mostrar progresso
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    
    // Iniciar animação de progresso (apenas visual enquanto o backend processa)
    const progressInterval = simulateProgress();
    
    // Reset console logs
    document.getElementById('logContent').textContent = 'Iniciando processo no servidor...';
    
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
    formData.append('keepOriginals', document.getElementById('keepOriginals').checked);
    formData.append('orderByDate', document.getElementById('orderByDate').checked);
    formData.append('savePath', document.getElementById('savePath').value);

    try {
        const response = await fetch('/api', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro no servidor (${response.status})`);
        }

        const result = await response.json();
        
        clearInterval(progressInterval);
        
        // Mostrar logs se disponíveis
        if (result.logs) {
            document.getElementById('logContent').textContent = result.logs;
        }
        
        if (result.success) {
            completeConversion(format, filename, result.download_url);
        } else {
            throw new Error(result.error || 'Erro desconhecido no servidor.');
        }
    } catch (error) {
        clearInterval(progressInterval);
        document.getElementById('convertBtn').disabled = false;
        
        let errorMsg = error.message;
        if (errorMsg.includes('Failed to fetch')) {
            errorMsg = 'A conexão com o servidor falhou (Timeout ou Conexão Interrompida). \n\nPossíveis causas:\n1. O servidor local pode estar processando um arquivo muito grande e demorando mais do que o esperado.\n2. A conexão local caiu.\n3. O arquivo enviado excedeu a capacidade de memória temporária do servidor Python.';
        }
        
        document.getElementById('logContent').textContent += '\n\nERRO: ' + errorMsg;
        
        alert('Erro na conversão: ' + errorMsg + '\nVerifique o console para mais detalhes.');
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

        window.lastDownloadUrl = 'http://localhost:5020' + downloadUrl;
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
