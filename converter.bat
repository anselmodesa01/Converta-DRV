@echo off
title DAV Converter Pro
mode con cols=80 lines=30
color 0A

echo ========================================
echo        DAV CONVERTER PRO
echo ========================================
echo.

:: Pega o diretório atual
set current_dir=%cd%
echo Diretório atual: %current_dir%
echo.

:: Verifica se existem arquivos DAV
dir *.dav >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Nenhum arquivo DAV encontrado!
    echo.
    pause
    exit
)

:: Conta arquivos DAV
set count=0
for %%i in (*.dav) do set /a count+=1
echo Encontrados %count% arquivos DAV
echo.

:: Pergunta formato de saída
echo Escolha o formato de saída:
echo [1] AVI (recomendado)
echo [2] MP4
echo [3] MKV
echo [4] Manter DAV
echo.
set /p formato="Opcao (1-4): "

:: Pergunta nome do arquivo
echo.
set /p nome="Nome do arquivo final (sem extensao): "
if "%nome%"=="" set nome="video_completo"

:: Pergunta se quer manter originais
echo.
echo Manter arquivos originais?
echo [1] Sim
echo [2] Nao
set /p manter="Opcao (1-2): "

echo.
echo ========================================
echo        INICIANDO CONVERSAO...
echo ========================================
echo.

:: Cria lista de arquivos ordenada para o FFmpeg
echo Criando lista de arquivos...
(for %%i in (*.dav) do @echo file '%%i') > lista_ffmpeg.txt

:: Junta os arquivos usando o demuxer concat do FFmpeg (mais seguro que copy /b)
echo Juntando e preparando arquivos...
ffmpeg -f concat -safe 0 -i lista_ffmpeg.txt -c copy "%nome%_temp.dav" -y >nul

:: Se for converter para outro formato
if not "%formato%"=="4" (
    echo.
    echo Convertendo para o formato selecionado...
    
    :: Verifica se tem ffmpeg
    where ffmpeg >nul 2>nul
    if errorlevel 1 (
        echo FFmpeg nao encontrado. Baixando automaticamente...
        powershell -Command "Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile 'ffmpeg.zip'"
        powershell Expand-Archive -Path ffmpeg.zip -DestinationPath .\ffmpeg_temp
        copy .\ffmpeg_temp\ffmpeg-*\bin\ffmpeg.exe . >nul
        rd /s /q ffmpeg_temp >nul
        del ffmpeg.zip >nul
        echo FFmpeg instalado com sucesso!
    )
    
    :: Define codec baseado no formato
    if "%formato%"=="1" set codec=-c:v mpeg4 -vtag xvid -q:v 5
    if "%formato%"=="2" set codec=-c:v libx264 -crf 23 -preset medium
    if "%formato%"=="3" set codec=-c:v libx264 -crf 23 -preset medium
    
    if "%formato%"=="1" set ext=avi
    if "%formato%"=="2" set ext=mp4
    if "%formato%"=="3" set ext=mkv
    
    :: Tenta remuxar primeiro se for DAV->MP4 (mais rápido e mantém qualidade)
    if "%formato%"=="2" (
        echo Tentando remuxagem rapida...
        ffmpeg -i "%nome%_temp.dav" -c copy "%nome%.%ext%" -y
        if not errorlevel 1 goto ok
    )

    echo Convertendo com recodificacao para compatibilidade...
    ffmpeg -i "%nome%_temp.dav" %codec% -c:a aac -b:a 128k "%nome%.%ext%" -y
    
    :ok
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha na conversao!
        pause
        exit
    )
    
    echo Conversao concluida!
) else (
    :: Mantem como DAV
    ren "%nome%_temp.dav" "%nome%.dav"
    echo Arquivo DAV unificado criado: %nome%.dav
)

:: Remove arquivos originais se solicitado (exceto o arquivo final)
if "%manter%"=="2" (
    echo.
    echo Removendo arquivos originais...
    for %%f in (*.dav) do (
        if not "%%f"=="%nome%.dav" if not "%%f"=="%nome%_temp.dav" del "%%f"
    )
)

:: Limpeza de arquivos temporarios
if exist lista_ffmpeg.txt del lista_ffmpeg.txt
if exist "%nome%_temp.dav" del "%nome%_temp.dav"

echo.
echo Pressione qualquer tecla para sair...
pause >nul
exit