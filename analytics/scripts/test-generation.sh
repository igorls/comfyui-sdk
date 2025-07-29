#!/usr/bin/env zsh

# Script para testar apenas o script de geração

echo -e "\033[1;33m================================\033[0m"
echo -e "\033[1;33mComfyUI SDK - Teste de Geração\033[0m"
echo -e "\033[1;33m================================\033[0m\n"

echo -e "\033[1;33mExecutando teste de geração de imagens...\033[0m\n"

npx tsx ../sdk-tests/test-rioblocks-generation.ts
