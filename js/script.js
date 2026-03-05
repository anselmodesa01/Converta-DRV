// Variáveis globais
let selectedFolder = '';
let selectedFiles = [];

// Configuração da zona de drop
const dropZone = document.getElementById('dropZone');

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

async function scanFiles(entry) {
    if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        if (file.name.toLowerCase().endsWith('.dav')) {
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
            <i class="fas fa-folder-open"></i>
            <span>${selectedFiles.length} arquivos DAV prontos para conversão</span>
        `;
        showFileList();
        document.getElementById('convertBtn').disabled = false;
    } else {
        alert('Nenhum arquivo .dav encontrado!');
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
        
        // Filtra apenas arquivos .dav
        selectedFiles = files.filter(file => file.name.toLowerCase().endsWith('.dav'));
        
        handleFilesSelected();
    };
    
    input.click();
}

// Função para selecionar arquivo individual
function selectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dav';
    input.multiple = true;
    
    input.onchange = (e) => {
        const files = Array.from(e.target.files);
        selectedFolder = ''; // Reset folder if individual files are picked
        
        // Filtra apenas arquivos .dav (caso o accept falhe)
        selectedFiles = files.filter(file => file.name.toLowerCase().endsWith('.dav'));
        
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
        .map(file => `
            <div class="file-item">
                <i class="fas fa-file-video"></i>
                <span>${file.name}</span>
                <span style="margin-left: auto;">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
        `)
        .join('');
    
    fileList.style.display = 'block';
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
    formData.append('format', format);
    formData.append('filename', filename);

    try {
        const response = await fetch('http://localhost:5020/convert', {
            method: 'POST',
            body: formData
        });

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
        // document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('convertBtn').disabled = false;
        
        if (error.logs) {
            document.getElementById('logContent').textContent = error.logs;
        } else {
            document.getElementById('logContent').textContent += '\n\nERRO: ' + error.message;
        }
        
        alert('Erro na conversão: ' + error.message + '\nVerifique o console para mais detalhes.');
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

        window.lastDownloadUrl = 'http://localhost:5000' + downloadUrl;
    }, 500);
}

// Download do arquivo real do servidor
function downloadResult() {
    if (window.lastDownloadUrl) {
        window.location.href = window.lastDownloadUrl;
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