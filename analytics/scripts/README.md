# ComfyUI SDK - Scripts de Teste

Este diretório contém os scripts principais para testar e avaliar a SDK do ComfyUI com configurações do RioBlocks.

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

## Configuração

Antes de executar qualquer teste, certifique-se de que:

1. Existe um arquivo de configuração em `analytics/config/comfyui-config-rioblocks.json` com a definição dos hosts
2. Os hosts definidos na configuração estão acessíveis

## Como Executar

Todos os scripts devem ser executados com Bun para melhor performance:

```bash
# Executar todos os testes em sequência
bun run run-all-tests.ts

# Executar testes individuais
bun run test-rioblocks-models.ts     # Teste de modelos disponíveis
bun run test-rioblocks-generation.ts # Teste de geração de imagens
bun run test-rioblocks-monitor.ts    # Teste de monitoramento do sistema
```

Para executar a partir da pasta raiz do projeto:

```bash
cd analytics/scripts
bun run test-rioblocks-models.ts
```

## Resultados e Análises

Após a execução, os scripts geram arquivos JSON com dados analíticos na pasta `analytics/data/`:

* `analytics-models.json`: Informações sobre modelos disponíveis
* `analytics-generation.json`: Métricas de performance de geração de imagens
* `analytics-monitoring.json`: Métricas de sistema coletadas durante o monitoramento
* `analytics-summary.json`: Relatório consolidado de todos os testes

### Visualizando Resultados

Para visualizar os resultados, você pode usar o script na pasta `analytics/server/`:

```bash
cd analytics/server
./view-report.sh
```

Ou iniciar o servidor dedicado:

```bash
cd analytics/server
./serve-report.sh
```

Acesse o relatório em `http://localhost:8080/report.html`

## Personalização

Você pode personalizar os testes editando os parâmetros nos scripts:

* Altere a quantidade de jobs em `test-rioblocks-generation.ts` (atualmente configurado para 6 jobs)
* Ajuste a duração do monitoramento em `test-rioblocks-monitor.ts`
* Modifique os parâmetros de geração de imagem (prompt, modelo, etc.)

## Requisitos

* **Arquivo de configuração**: `comfyui-config-rioblocks.json` na pasta `analytics/config/`
* **Runtime**: Bun (recomendado)
* **ComfyUI**: Instâncias rodando nos hosts especificados na configuração

## Organização de Arquivos

```bash
analytics/
  ├── config/                   # Configurações dos hosts
  │   └── comfyui-config-rioblocks.json
  ├── data/                     # Dados analíticos gerados
  │   ├── analytics-models.json
  │   ├── analytics-generation.json
  │   ├── analytics-monitoring.json
  │   └── analytics-summary.json
  ├── reports/                  # Relatórios e visualizações
  │   └── report.html
  ├── server/                   # Servidor para visualização de relatórios
  │   ├── server.cjs
  │   ├── server.js
  │   ├── view-report.sh
  │   └── serve-report.sh
  └── scripts/                  # Scripts de testes principais
      ├── test-rioblocks-models.ts
      ├── test-rioblocks-generation.ts
      ├── test-rioblocks-monitor.ts
      └── run-all-tests.ts
```

## Principais Recursos e Implementações

1. **API ComfyUI**
   * Conexão com múltiplos hosts via WebSocket e HTTP
   * Descoberta de modelos (checkpoints, LoRAs, embeddings)
   * Geração de imagens com configurações avançadas

2. **Tratamento de Erros Robusto**
   * Timeouts para cada operação de API
   * Cancelamento automático de operações bloqueadas
   * Detecção de hosts offline com fallback para hosts disponíveis

3. **Sistema de Relatórios**
   * Coleta de métricas por host e por job
   * Análises comparativas entre hosts
   * Visualização de métricas de sistema (CPU, GPU, memória)

## Próximos Passos

* Implementar visualizações mais detalhadas para métricas de desempenho
* Adicionar comparação histórica entre execuções de teste
* Expandir monitoramento para mais métricas específicas de GPU
* Integrar com sistemas de notificação para alertar sobre anomalias
