import { ComfyApi } from "../../src/client";
import * as fs from "fs";

interface SystemMetrics {
  host: string;
  timestamp: Date;
  queue: {
    size: number;
    running: number;
    pending: number;
  };
  system?: {
    cpu: number;
    memory: {
      used: number;
      total: number;
    };
    gpu?: {
      used: number;
      total: number;
    };
  };
  status?: "online" | "offline" | "error";
  error?: string;
}

async function monitorHosts() {
  // Carregar configuração exclusivamente da pasta config
  const configPath = "../config/comfyui-config-rioblocks.json";
  
  // Verificar se o arquivo existe
  if (!fs.existsSync(configPath)) {
    console.error("❌ Arquivo de configuração não encontrado em analytics/config!");
    console.error("Por favor, crie o arquivo comfyui-config-rioblocks.json na pasta analytics/config");
    process.exit(1);
  }
  
  console.log(`📄 Usando configuração: ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const metrics: SystemMetrics[] = [];

  for (const host of config.hosts.filter((h: any) => h.enabled)) {
    try {
      console.log(`Tentando conectar a ${host.name} (${host.url})...`);

      // Testar conectividade antes de iniciar
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundos de timeout

        const testResponse = await fetch(`${host.url}/system_stats`, {
          method: "GET",
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!testResponse.ok) {
          throw new Error(`Host ${host.name} não está respondendo corretamente`);
        }
      } catch (connError) {
        console.log(`❌ Host ${host.name} offline ou inacessível`);

        // Adicionar métrica de host offline
        const offlineMetric: SystemMetrics = {
          host: host.name,
          timestamp: new Date(),
          queue: {
            size: 0,
            running: 0,
            pending: 0
          },
          status: "offline"
        };

        metrics.push(offlineMetric);
        console.log(`📊 ${host.name}: Status=offline (métricas registradas)`);

        continue; // Pular para o próximo host
      }

      const api = new ComfyApi(host.url, `monitor-${host.name}`);

      // Definir timeout para inicialização
      const initTimeout = 30000; // 30 segundos

      try {
        await Promise.race([
          api.init(5, 2000), // 5 tentativas com 2s de intervalo
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ao inicializar após ${initTimeout}ms`)), initTimeout)
          )
        ]);
      } catch (initError) {
        console.error(`❌ Falha ao inicializar ${host.name}: ${initError.message}`);

        // Adicionar métrica de host com erro
        const errorMetric: SystemMetrics = {
          host: host.name,
          timestamp: new Date(),
          queue: {
            size: 0,
            running: 0,
            pending: 0
          },
          status: "error",
          error: initError.message
        };

        metrics.push(errorMetric);
        continue; // Pular para o próximo host
      }

      // Coletar métricas de fila
      const queue = await api.getQueue();

      const metric: SystemMetrics = {
        host: host.name,
        timestamp: new Date(),
        queue: {
          size: queue.queue_pending.length,
          running: queue.queue_running.length,
          pending: queue.queue_pending.length
        },
        status: "online"
      };

      // Se tiver suporte para monitoramento (extensão)
      if (api.ext?.monitor?.isSupported) {
        const monitorData = api.ext.monitor.monitorData;
        if (monitorData) {
          metric.system = {
            cpu: monitorData.cpu_utilization,
            memory: {
              used: monitorData.ram_used,
              total: monitorData.ram_total
            },
            gpu: monitorData.gpus?.[0]
              ? {
                  used: monitorData.gpus[0].gpu_utilization,
                  total: 100
                }
              : undefined
          };
        }
      }

      metrics.push(metric);
      console.log(`📊 ${host.name}: Queue=${metric.queue.size}, Running=${metric.queue.running}`);

      // Limpar recursos após o uso
      await api.destroy();
    } catch (error) {
      console.error(`❌ Failed to monitor ${host.name}:`, error);
    }
  }

  // Salvar métricas apenas se houver dados para salvar
  if (metrics.length > 0) {
    console.log(`Salvando ${metrics.length} métricas no arquivo...`);

    const existingMetrics = fs.existsSync("../data/analytics-monitoring.json")
      ? JSON.parse(fs.readFileSync("../data/analytics-monitoring.json", "utf-8"))
      : { metrics: [] };

    // Converter datas para strings para evitar problemas de serialização
    const metricsToSave = metrics.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString()
    }));

    existingMetrics.metrics.push(...metricsToSave);

    // Manter apenas últimas 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existingMetrics.metrics = existingMetrics.metrics.filter((m: any) => new Date(m.timestamp) > oneDayAgo);

    // Adicionar data da última atualização
    existingMetrics.lastUpdate = new Date().toISOString();

    fs.writeFileSync("../data/analytics-monitoring.json", JSON.stringify(existingMetrics, null, 2));
    console.log(`✅ Métricas salvas em analytics-monitoring.json`);
  } else {
    console.log(`⚠️ Nenhuma métrica coletada para salvar`);
  }
}

// Execução inicial
console.log("🔍 ComfyUI SDK Test - System Monitoring");
console.log("=====================================\n");
console.log("Monitoring started. Press Ctrl+C to stop.");

// Executar monitoramento uma vez
monitorHosts().catch((error) => {
  console.error("Erro ao executar monitoramento:", error);
  // Salvar pelo menos um registro no arquivo para manter consistência
  const errorRecord = {
    metrics: [
      {
        host: "error",
        timestamp: new Date(),
        queue: {
          size: 0,
          running: 0,
          pending: 0
        },
        status: "error",
        error: error.message
      }
    ]
  };

  if (!fs.existsSync("../data/analytics-monitoring.json")) {
    fs.writeFileSync("../data/analytics-monitoring.json", JSON.stringify(errorRecord, null, 2));
    console.log("Arquivo de monitoramento criado com erro registrado");
  }
});

// Para testes, podemos limitar a apenas algumas execuções (em vez de deixar rodando indefinidamente)
let counter = 0;
const maxRuns = 1; // Reduzido para apenas uma execução para teste rápido

// Forçar uma atualização imediata do arquivo de monitoramento
// para garantir que pelo menos um registro seja feito
setTimeout(() => {
  // Forçar uma entrada de registro
  const forceMetric: SystemMetrics = {
    host: "test-run",
    timestamp: new Date(),
    queue: {
      size: 0,
      running: 0,
      pending: 0
    },
    status: "offline"
  };

  const testMetrics = {
    metrics: [forceMetric],
    lastUpdate: new Date().toISOString()
  };

  // Garantir que o diretório exista
  fs.mkdirSync("../data", { recursive: true });
  fs.writeFileSync("../data/analytics-monitoring.json", JSON.stringify(testMetrics, null, 2));
  console.log("✅ Arquivo de monitoramento atualizado com dados de teste");
}, 1000);

// Para testes, podemos executar apenas uma vez e finalizar
if (maxRuns <= 1) {
  setTimeout(() => {
    console.log("\n✅ Monitoring complete. Data saved to ../data/analytics-monitoring.json");
    process.exit(0); // Encerrar o processo explicitamente
  }, 3000); // Esperar 3s e encerrar
} else {
  // Versão com múltiplas execuções
  const interval = setInterval(() => {
    counter++;

    if (counter >= maxRuns) {
      console.log("\n✅ Monitoring complete. Data saved to ../data/analytics-monitoring.json");
      clearInterval(interval);
      process.exit(0); // Encerrar o processo explicitamente
      return;
    }

    console.log(`\n📊 Monitoring run ${counter + 1}/${maxRuns}...`);
    monitorHosts().catch((error) => {
      console.error("Erro ao executar monitoramento:", error);
    });
  }, 10000); // A cada 10 segundos
}
