@echo off
title Inventario Pactra
color 0A
echo.
echo  ============================================
echo    Inventario Pactra - Iniciando servidor...
echo  ============================================
echo.

:: Verificar si node_modules existe
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    echo  (Esto solo ocurre una vez, espera un momento)
    echo.
    call npm install
    echo.
)

echo  Servidor iniciado. Abriendo navegador...
echo.

:: Abrir el navegador despues de 2 segundos
start "" timeout /t 2 /nobreak >nul
start http://localhost:3000

:: Iniciar el servidor
node server.js

echo.
echo  Servidor detenido.
pause
