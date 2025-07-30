#!/usr/bin/env zsh

# Script para visualizar o relatório usando um servidor HTTP local

echo -e "\033[1;33m================================\033[0m"
echo -e "\033[1;33mComfyUI SDK - Servidor de Relatório\033[0m"
echo -e "\033[1;33m================================\033[0m\n"

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "\033[1;31mErro: Node.js não está instalado. Instale o Node.js para executar este script.\033[0m"
    exit 1
fi

# Verificar se existem os arquivos de relatório
if [[ -f "../reports/report.html" ]]; then
  echo -e "\033[1;32m✓ Arquivo de relatório disponível\033[0m"
else
  echo -e "\033[1;31m✗ Arquivo de relatório não encontrado\033[0m"
  exit 1
fi

echo -e "\n\033[1;34mIniciando servidor HTTP para o relatório...\033[0m"
echo -e "\033[1;33mPara encerrar o servidor, pressione Ctrl+C\033[0m\n"

# Iniciar o servidor HTTP
cd ../server/
node server.cjs

echo -e "\n\033[1;32m✓ Servidor encerrado\033[0m"
