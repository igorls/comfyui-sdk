# Teste de Alta Carga e Resiliência para ComfyPool

Este teste foi projetado para avaliar a capacidade de distribuição de carga e recuperação de falhas do ComfyPool quando trabalhando com múltiplos servidores ComfyUI.

## Funcionalidades

- **Teste de Alta Carga**: Envia um grande número de requisições para testar a capacidade de processamento da pool
- **Simulação de Falha**: Simula a queda de servidores para testar a resiliência da pool
- **Análise Detalhada**: Coleta métricas avançadas sobre o desempenho e comportamento do sistema
- **Relatório Completo**: Gera relatório JSON com todas as métricas e eventos do teste

## Como Executar

```bash
# Usando bun
bun analytics/scripts/test-high-load-resilience.ts


## Configurações Personalizáveis

Você pode modificar o comportamento do teste editando as configurações no arquivo `test-high-load-resilience.ts`:

```typescript
const testConfig = {
  // Configurações de carga
  totalRequests: 20,         // Total de requisições para gerar
  concurrentRequests: 5,     // Número máximo de requisições simultâneas
  requestsPerBatch: 5,       // Número de requisições por lote
  
  // Configurações de falha
  enableFailureSimulation: true, // Ativar simulação de falha
  failureAfterSeconds: 10,      // Tempo em segundos após iniciar o teste para simular falha
  serversToFail: [0],           // Índices dos servidores para falhar (0 = primeiro servidor)
  
  // Configurações de análise
  enableDetailedLogging: true,  // Ativar logs detalhados
  checkpointIntervalMs: 5000,   // Intervalo em ms para checkpoints de progresso
};
```

## Cenários de Teste Recomendados

1. **Teste Básico de Distribuição**
   - `totalRequests`: 20
   - `concurrentRequests`: 5
   - `enableFailureSimulation`: false

   Verifica se a pool está distribuindo corretamente os trabalhos entre os servidores disponíveis.

2. **Teste de Resiliência Básica**
   - `totalRequests`: 30
   - `concurrentRequests`: 5
   - `enableFailureSimulation`: true
   - `failureAfterSeconds`: 10
   - `serversToFail`: [0]

   Verifica se a pool redistribui corretamente os trabalhos quando um servidor falha.

3. **Teste de Alta Carga**
   - `totalRequests`: 100
   - `concurrentRequests`: 10
   - `enableFailureSimulation`: false

   Testa o desempenho da pool sob alta carga.

4. **Teste de Resiliência Avançado**
   - `totalRequests`: 100
   - `concurrentRequests`: 10
   - `enableFailureSimulation`: true
   - `failureAfterSeconds`: 20
   - `serversToFail`: [0, 1]  // Falha em múltiplos servidores (ajuste conforme disponibilidade)

   Testa a resiliência da pool quando múltiplos servidores falham.

## Relatório de Resultados

Os resultados são salvos na pasta `analytics/data/` como arquivos JSON com o formato:

```plaintext
analytics-high-load-resilience-test-{timestamp}.json
```

O relatório contém informações detalhadas como:

- Métricas gerais (requisições completadas, falhas, etc)
- Métricas por servidor (distribuição, tempos de resposta)
- Timeline de eventos (início de requisições, falhas, etc)
- Checkpoints de progresso (instantâneos durante o teste)
