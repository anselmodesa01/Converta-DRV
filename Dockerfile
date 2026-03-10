FROM python:3.9-slim

# Instala FFmpeg e dependências do sistema
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia o requirements.txt primeiro para aproveitar o cache das camadas
COPY requirements.txt .

# Instala as dependências Python
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código do projeto
COPY . .

# Cria as pastas necessárias para upload e output
RUN mkdir -p uploads outputs public

# Define a porta padrão (o Render sobrescreve isso com a variável PORT)
EXPOSE 10000

# Comando para iniciar o servidor
CMD ["python", "app.py"]
