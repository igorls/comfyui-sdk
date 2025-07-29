#!/usr/bin/env zsh

# Script para testar apenas o monitoramento

echo -e "\033[1;33m================================\033[0m"
echo -e "\033[1;33mComfyUI SDK - Teste de Monitoramento\033[0m"
echo -e "\033[1;33m================================\033[0m\n"

echo -e "\033[1;33mExecutando teste de monitoramento do sistema...\033[0m\n"

# Verificar se bun está disponível
if command -v bun &> /dev/null; then
    bun run ../sdk-tests/test-rioblocks-monitor.ts
else
    npx tsx ../sdk-tests/test-rioblocks-monitor.ts
fi

echo -e "\n\033[1;32m✓ Teste de monitoramento concluído\033[0m"
echo -e "\nVerifique o arquivo \033[1;36manalytics-monitoring.json\033[0m para detalhes."
