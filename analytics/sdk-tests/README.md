# ComfyUI SDK - Scripts de Teste

Este diretório contém scripts para testar e avaliar a SDK do ComfyUI com configurações do RioBlocks.

## Visão Geral dos Scripts

1. **test-rioblocks-models.ts**
   * Descobre modelos disponíveis em todos os hosts configurados
   * Coleta informações sobre checkpoints, LoRAs e embeddings
   * Identifica modelos comuns entre todos os hosts

2. **test-rioblocks-generation.ts**
   * Gera imagens usando o sistema de pool
   * Coleta métricas de performance para cada host
   * Analisa tempo de execução e taxas de sucesso

3. **test-rioblocks-monitor.ts**
   * Monitora o estado do sistema de cada host
   * Coleta informações sobre filas e recursos (CPU/GPU/memória)
   * Cria séries temporais para análise de tendências

4. **run-all-tests.ts**
   * Script executor para rodar todos os testes em sequência
   * Gera um relatório consolidado

## Como Executar

Você pode executar os scripts usando os shell scripts facilitadores ou diretamente:

### Usando os scripts facilitadores

```bash
# Menu principal com todas as opções
./test-rioblocks.sh

# Testes individuais
./test-local.sh      # Testa apenas os modelos disponíveis
./test-generation.sh # Testa a geração de imagens
./test-monitor.sh    # Executa o monitoramento do sistema
```

### Executando diretamente com bun ou tsx

```bash
# Com Bun (recomendado)
bun run ./scripts/run-all-tests.ts
bun run ./scripts/test-rioblocks-models.ts
bun run ./scripts/test-rioblocks-generation.ts
bun run ./scripts/test-rioblocks-monitor.ts

# Com tsx
npx tsx ./scripts/run-all-tests.ts
npx tsx ./scripts/test-rioblocks-models.ts
npx tsx ./scripts/test-rioblocks-generation.ts
npx tsx ./scripts/test-rioblocks-monitor.ts
```

## Resultados e Análises

Após a execução, os scripts geram arquivos JSON com dados analíticos:

* `analytics-models.json`: Informações sobre modelos disponíveis
* `analytics-generation.json`: Métricas de performance de geração de imagens
* `analytics-monitoring.json`: Métricas de sistema coletadas durante o monitoramento
* `analytics-summary.json`: Relatório consolidado de todos os testes

### Visualizando Resultados

Execute o script de visualização para gerar um relatório HTML interativo:

```bash
./view-report.sh
```

O script irá gerar um arquivo `report.html` com visualizações e resumos de todos os dados coletados, organizados por abas:

1. **Resumo**: Visão geral de todos os testes
2. **Modelos**: Análise de modelos disponíveis e comuns
3. **Geração**: Estatísticas de desempenho e imagens geradas
4. **Monitoramento**: Métricas de sistema coletadas

## Personalização

Você pode personalizar os testes editando os parâmetros nos scripts:

* Altere a quantidade de jobs em `test-rioblocks-generation.ts`
* Ajuste a duração do monitoramento em `test-rioblocks-monitor.ts`
* Modifique os parâmetros de geração de imagem (prompt, modelo, etc.)

## Requisitos

* Arquivo de configuração `comfyui-config-rioblocks.json` na raiz do projeto
* ComfyUI rodando nos hosts especificados na configuração
* Node.js ou Bun para execução dos scripts

## Principais Correções e Atualizações

1. **Correções na API**
   * Substituição de `api.getSamplers()` por `api.getSamplerInfo()`
   * Substituição de `api.disconnect()` por `api.destroy()`

2. **Tratamento de Erros**
   * Melhorado o tratamento de erros quando os hosts estão inacessíveis
   * Adicionados timeouts para evitar bloqueios em requisições
   * Implementação de fallbacks quando hosts não estão disponíveis

3. **Melhorias de Interface**
   * Scripts shell para facilitar execução de testes
   * Relatório HTML interativo para visualização de resultados
   * Suporte para múltiplos ambientes de execução (bun/node)

## Próximos Passos

* Implementar visualizações mais detalhadas para métricas de desempenho
* Adicionar comparação histórica entre execuções de teste
* Expandir monitoramento para mais métricas específicas de GPU
* Integrar com sistemas de notificação para alertar sobre anomalias
