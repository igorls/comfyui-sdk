#!/usr/bin/env zsh

# Script para facilitar a execução dos testes da ComfyUI SDK
# Execute com: ./test-rioblocks.sh

# Cores para saída
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=================================${NC}"
echo -e "${YELLOW}ComfyUI SDK - RioBlocks Test Suite${NC}"
echo -e "${YELLOW}=================================${NC}\n"

# Verificar se o arquivo de configuração existe
if [ ! -f "./comfyui-config-rioblocks.json" ]; then
    echo -e "${RED}Erro: Arquivo comfyui-config-rioblocks.json não encontrado!${NC}"
    exit 1
fi

# Verificar disponibilidade de hosts
echo -e "${YELLOW}Verificando hosts disponíveis...${NC}"
HOSTS=$(grep -o '"url": "[^"]*"' ./comfyui-config-rioblocks.json | cut -d'"' -f4)
HOSTS_ONLINE=0
HOSTS_STATUS=()

for HOST in $HOSTS; do
    echo -n "Verificando $HOST... "
    if curl --connect-timeout 3 --silent --head --fail "$HOST" > /dev/null; then
        echo -e "${GREEN}online${NC}"
        HOSTS_ONLINE=$((HOSTS_ONLINE+1))
        HOSTS_STATUS+=("$HOST: ${GREEN}online${NC}")
    else
        echo -e "${RED}offline${NC}"
        HOSTS_STATUS+=("$HOST: ${RED}offline${NC}")
    fi
done

if [ "$HOSTS_ONLINE" -eq 0 ]; then
    echo -e "\n${RED}Nenhum host está disponível! Verifique sua conexão ou configuração.${NC}"
    echo -e "${YELLOW}Deseja continuar mesmo assim para testes locais? (S/n)${NC}"
    read CONTINUE
    
    if [[ $CONTINUE == "n" || $CONTINUE == "N" ]]; then
        echo -e "${RED}Teste cancelado.${NC}"
        exit 1
    fi
else
    echo -e "\n${GREEN}$HOSTS_ONLINE hosts disponíveis.${NC}"
fi

# Menu de seleção
echo -e "\n${BLUE}=== TESTES DISPONÍVEIS ===${NC}"
echo -e "1) ${GREEN}Teste de Modelos${NC} - Descobre modelos disponíveis nos hosts"
echo -e "2) ${GREEN}Teste de Geração${NC} - Gera imagens usando o pool de hosts"
echo -e "3) ${GREEN}Teste de Monitoramento${NC} - Monitora o estado dos hosts"
echo -e "4) ${GREEN}Executar Todos os Testes${NC} - Executa a suíte completa"
echo -e "5) ${BLUE}Visualizar Relatório${NC} - Abre relatório HTML com resultados"
echo -e "0) ${RED}Sair${NC}"
echo ""

echo -e "${BLUE}=== HOSTS CONFIGURADOS ===${NC}"
for STATUS in "${HOSTS_STATUS[@]}"; do
    echo -e "• $STATUS"
done
echo ""

echo -n "Escolha uma opção (0-5): "
read ESCOLHA

case $ESCOLHA in
    1)
        echo -e "\n${YELLOW}Executando teste de modelos...${NC}\n"
        if command -v bun &> /dev/null; then
            bun run ../sdk-tests/test-rioblocks-models.ts
        else
            npx tsx ../sdk-tests/test-rioblocks-models.ts
        fi
        ;;
    2)
        echo -e "\n${YELLOW}Executando teste de geração...${NC}\n"
        if command -v bun &> /dev/null; then
            bun run ../sdk-tests/test-rioblocks-generation.ts
        else
            npx tsx ../sdk-tests/test-rioblocks-generation.ts
        fi
        ;;
    3)
        echo -e "\n${YELLOW}Executando teste de monitoramento...${NC}\n"
        if command -v bun &> /dev/null; then
            bun run ../sdk-tests/test-rioblocks-monitor.ts
        else
            npx tsx ../sdk-tests/test-rioblocks-monitor.ts
        fi
        ;;
    4)
        echo -e "\n${YELLOW}Executando todos os testes...${NC}\n"
        if command -v bun &> /dev/null; then
            bun run ../sdk-tests/run-all-tests.ts
        else
            npx tsx ../sdk-tests/run-all-tests.ts
        fi
        ;;
    5)
        echo -e "\n${YELLOW}Visualizando relatório de resultados...${NC}\n"
        ./view-report.sh
        ;;
    0)
        echo -e "\n${YELLOW}Saindo...${NC}"
        exit 0
        ;;
    *)
        echo -e "\n${RED}Opção inválida!${NC}"
        exit 1
        ;;
esac

# Verificar resultado
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}Teste concluído com sucesso!${NC}"
    echo -e "Resultados disponíveis em analytics-*.json\n"
else
    echo -e "\n${RED}Houve erros durante a execução do teste.${NC}\n"
fi
