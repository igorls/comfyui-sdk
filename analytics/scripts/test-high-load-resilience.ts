import { ComfyApi } from "../../src/client";
import { ComfyPool, EQueueMode } from "../../src/pool";
import { CallWrapper } from "../../src/call-wrapper";
import { PromptBuilder } from "../../src/prompt-builder";
import { TSamplerName, TSchedulerName } from "../../src/types/sampler";
import * as fs from "fs";
import * as path from "path";
import { createWriteStream } from "fs";
// Importing path to handle file paths

// Função seed para gerar números aleatórios
const seed = () => Math.floor(Math.random() * 1000000);

/**
 * Sistema de log customizado para gravar tanto no console quanto em arquivo
 */
class Logger {
  private logStream: fs.WriteStream;
  private logFilePath: string;
  private originalConsole: any = {};

  constructor() {
    // Criar diretório de logs se não existir
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Criar arquivo de log com timestamp
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    this.logFilePath = path.join(logsDir, `test-high-load-resilience-${timestamp}.log`);
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: "a" });

    console.log(`📝 Log será salvo em: ${this.logFilePath}`);

    // Guardar referências originais
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
      time: console.time,
      timeEnd: console.timeEnd
    };

    // Sobrescrever métodos do console
    this.setupConsoleOverrides();
  }

  private logToFile(type: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const message = args
      .map((arg) => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    this.logStream.write(`[${timestamp}] [${type.toUpperCase()}] ${message}\n`);
  }

  private setupConsoleOverrides() {
    // Substituir console.log
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      this.logToFile("log", ...args);
    };

    // Substituir console.error
    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      this.logToFile("error", ...args);
    };

    // Substituir console.warn
    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      this.logToFile("warn", ...args);
    };

    // Substituir console.info
    console.info = (...args: any[]) => {
      this.originalConsole.info(...args);
      this.logToFile("info", ...args);
    };

    // Substituir console.debug
    console.debug = (...args: any[]) => {
      this.originalConsole.debug(...args);
      this.logToFile("debug", ...args);
    };

    // Substituir console.time
    console.time = (label: string) => {
      this.originalConsole.time(label);
      this.logToFile("time", `Timer iniciado: ${label}`);
    };

    // Substituir console.timeEnd
    console.timeEnd = (label: string) => {
      this.originalConsole.timeEnd(label);
      this.logToFile("timeEnd", `Timer finalizado: ${label}`);
    };
  }

  getLogFilePath() {
    return this.logFilePath;
  }

  close() {
    this.logStream.end();

    // Restaurar console original
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;
    console.time = this.originalConsole.time;
    console.timeEnd = this.originalConsole.timeEnd;
  }
}

// Configuração padrão para o teste de alta carga e resiliência
const DEFAULT_CONFIG = {
  // Configurações de carga
  totalRequests: 20,
  concurrentRequests: 3, // Reduzido para menor concorrência
  requestsPerBatch: 2, // Reduzido para enviar em lotes menores

  // Configurações de retry e robustez
  maxRetryAttempts: 3, // Permitir até 3 tentativas para jobs com falha
  jobMonitoringIntervalMs: 2000, // Checar status dos jobs a cada 2 segundos

  // Configurações de falha
  enableFailureSimulation: true,
  failureAfterSeconds: 5, // Reduzido para falhar mais cedo
  serversToFail: [0], // índice do primeiro servidor na lista

  // Configurações de análise
  enableDetailedLogging: true,
  checkpointIntervalMs: 5000
};

// Estrutura para análise detalhada por servidor
interface ServerMetrics {
  serverId: string;
  serverName: string;
  serverUrl: string;
  status: "active" | "failed" | "disabled";
  totalAssigned: number;
  completed: number;
  failed: number;
  redistributed: number;
  averageResponseTime: number;
  failureTime?: Date;
  lastActiveTime: Date;
}

// Evento na timeline de execução
interface TimelineEvent {
  timestamp: Date;
  eventType: "request_start" | "request_complete" | "request_failed" | "server_failed" | "request_redistributed";
  serverId: string;
  requestId: string;
  details?: any;
}

// Checkpoint de progresso durante a execução
interface ProgressCheckpoint {
  timestamp: Date;
  completedRequests: number;
  activeRequests: number;
  queuedRequests: number;
  activeServers: number;
  requestsPerSecond: number;
}

// Analytics de geração para um job específico
interface GenerationAnalytics {
  jobId: string;
  host: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: "pending" | "running" | "completed" | "failed" | "redistributed";
  error?: string;
  images?: string[];
  progressUpdates: number;
  originalHost?: string; // Para jobs redistribuídos
  redistributionTime?: Date; // Para jobs redistribuídos
}

// Analytics completo do teste
interface DetailedAnalytics {
  testId: string;
  testConfig: typeof DEFAULT_CONFIG;
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;

  // Métricas gerais
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  redistributedRequests: number;

  // Métricas por servidor
  serverMetrics: Map<string, ServerMetrics>;

  // Timeline de eventos
  events: TimelineEvent[];

  // Checkpoints de progresso
  progressCheckpoints: ProgressCheckpoint[];

  // Jobs individuais
  jobs: GenerationAnalytics[];
}

/**
 * Classe principal para o teste de alta carga e resiliência
 */
class HighLoadResilienceTest {
  private config: typeof DEFAULT_CONFIG;
  private analytics: DetailedAnalytics;
  private apis: ComfyApi[] = [];
  private pool: ComfyPool;
  private failureTimeout: any = null;
  private checkpointInterval: any = null;
  private _jobMonitorInterval: any = null;
  private workflowPath: string;
  private workflow: any;
  private promptBuilder: PromptBuilder<any, any, any>;
  private testStartTime: Date;
  private lastCheckpointTime: Date;
  private completedSinceLastCheckpoint: number = 0;

  constructor(configOverride: Partial<typeof DEFAULT_CONFIG> = {}) {
    // Mesclar configuração padrão com override
    this.config = { ...DEFAULT_CONFIG, ...configOverride };

    // Inicializar analytics
    this.testStartTime = new Date();
    this.lastCheckpointTime = new Date();

    this.analytics = {
      testId: `test-${Date.now()}`,
      testConfig: this.config,
      startTime: this.testStartTime,
      totalRequests: this.config.totalRequests,
      completedRequests: 0,
      failedRequests: 0,
      redistributedRequests: 0,
      serverMetrics: new Map(),
      events: [],
      progressCheckpoints: [],
      jobs: []
    };
  }

  /**
   * Carrega a configuração do ComfyUI
   */
  private loadConfig() {
    console.log("📄 Carregando configuração do ComfyUI...");

    // Tentar diferentes caminhos para encontrar o arquivo de configuração
    const possiblePaths = [
      "../config/comfyui-config-rioblocks.json",
      "analytics/config/comfyui-config-rioblocks.json",
      "./analytics/config/comfyui-config-rioblocks.json"
    ];

    let configPath: string | null = null;
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        configPath = path;
        console.log(`✅ Configuração encontrada em: ${path}`);
        break;
      }
    }

    if (!configPath) {
      throw new Error("❌ Arquivo de configuração não encontrado! Tentou em: " + possiblePaths.join(", "));
    }

    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }

  /**
   * Carrega o workflow para uso nos testes
   */
  private loadWorkflow(workflowFileName: string = "example-txt2img-workflow.json") {
    console.log(`⚙️ Carregando workflow: ${workflowFileName}`);

    // Tentar diferentes caminhos para encontrar o workflow
    const possiblePaths = [
      `../workflows/${workflowFileName}`,
      `analytics/workflows/${workflowFileName}`,
      `./analytics/workflows/${workflowFileName}`,
      `./examples/${workflowFileName}` // Também tentar na pasta examples
    ];

    let workflowPath: string | null = null;
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        workflowPath = path;
        console.log(`✅ Workflow encontrado em: ${path}`);
        break;
      }
    }

    if (!workflowPath) {
      throw new Error(`❌ Arquivo de workflow não encontrado! Tentou em: ${possiblePaths.join(", ")}`);
    }

    this.workflowPath = workflowPath;

    let workflow = JSON.parse(fs.readFileSync(this.workflowPath, "utf-8"));

    // Verificar e normalizar a estrutura do workflow
    if (workflow.prompt) {
      console.log(`🔧 Convertendo formato de workflow compatível...`);
      workflow = workflow.prompt;
    }

    // Verificar se o workflow tem estrutura mínima necessária
    const hasNode3 = workflow["3"] && workflow["3"].inputs;
    const hasNode4 = workflow["4"] && workflow["4"].inputs;
    if (!hasNode3 || !hasNode4) {
      console.warn(`⚠️ Workflow pode não ter a estrutura esperada. Faltam nós essenciais.`);
    }

    this.workflow = workflow;
    return workflow;
  }

  /**
   * Inicializa a ComfyPool com as APIs disponíveis
   */
  private async initializePool(config: any) {
    console.log("🔌 Inicializando APIs e criando pool...");

    // Criar APIs a partir da configuração
    this.apis = config.hosts
      .filter((h: any) => h.enabled)
      .map((host: any) => {
        const api = new ComfyApi(host.url, `pool-${host.name}`);

        // Inicializar métricas de servidor
        this.analytics.serverMetrics.set(host.name, {
          serverId: host.url,
          serverName: host.name,
          serverUrl: host.url,
          status: "active",
          totalAssigned: 0,
          completed: 0,
          failed: 0,
          redistributed: 0,
          averageResponseTime: 0,
          lastActiveTime: new Date()
        });

        return api;
      });

    // Criar pool de APIs - usar modo PICK_ROUTINE para garantir distribuição entre servidores
    console.log(`⚙️ Inicializando ComfyPool com modo de balanceamento: PICK_ROUTINE`);
    this.pool = new ComfyPool(this.apis, EQueueMode.PICK_ROUTINE);

    // Inicializar APIs
    console.log(`Inicializando ${this.apis.length} hosts...`);
    for (const api of this.apis) {
      try {
        const initTimeout = 30000; // 30 segundos
        await Promise.race([
          api.init(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ao inicializar API após ${initTimeout}ms`)), initTimeout)
          )
        ]);

        console.log(`✅ API ${api.apiHost} inicializada`);
      } catch (error) {
        console.error(`⚠️ Erro ao inicializar host ${api.apiHost}: ${error.message}`);
      }
    }

    // Filtrar apenas APIs que foram inicializadas com sucesso
    const readyApis = this.apis.filter((api) => api.isReady);
    console.log(`✅ Pool inicializada com ${readyApis.length}/${this.apis.length} hosts prontos\n`);

    if (readyApis.length === 0) {
      throw new Error("❌ Nenhum host disponível. Abortando teste.");
    }

    return readyApis;
  }

  /**
   * Configura monitor para a pool para rastrear eventos importantes
   */
  private setupPoolMonitor() {
    console.log("👀 Configurando monitor para eventos da pool...");

    // Monitorar eventos de mudanças de estado na pool
    this.pool.addEventListener("queue_updated", (e: any) => {
      console.log(`⚙️ [Pool] Atualização na fila: ${JSON.stringify(e.detail)}`);
    });

    this.pool.addEventListener("execution_start", (e: any) => {
      const clientName = this.apis[e.detail?.clientIdx]?.id || "desconhecido";
      console.log(`⚡ [Pool] Início de execução no cliente: ${clientName}`);
    });

    this.pool.addEventListener("execution_error", (e: any) => {
      const clientName = this.apis[e.detail?.clientIdx]?.id || "desconhecido";
      console.log(`❌ [Pool] Erro de execução no cliente ${clientName}: ${e.detail?.error?.message}`);
    });

    this.pool.addEventListener("reconnected", (e: any) => {
      const clientName = this.apis[e.detail?.clientIdx]?.id || "desconhecido";
      console.log(`🔄 [Pool] Cliente reconectado: ${clientName}`);
    });

    this.pool.addEventListener("disconnected", (e: any) => {
      const clientName = this.apis[e.detail?.clientIdx]?.id || "desconhecido";
      console.log(`📴 [Pool] Cliente desconectado: ${clientName}`);
    });

    // Adicionar log periódico do estado da pool
    setInterval(() => {
      const clientsStatus = this.apis.map((api, idx) => {
        return {
          index: idx,
          id: api.id,
          isReady: api.isReady,
          hasSocket: !!(api as any)._socket
        };
      });
      console.log(`🔍 [Pool] Estado dos clientes: ${JSON.stringify(clientsStatus)}`);
    }, 5000);
  }

  /**
   * Configura o PromptBuilder para o workflow
   */
  private setupPromptBuilder() {
    console.log("📝 Configurando PromptBuilder...");

    this.promptBuilder = new PromptBuilder(
      this.workflow,
      ["positive", "negative", "checkpoint", "seed", "step", "cfg", "sampler", "scheduler", "width", "height", "batch"],
      ["images"]
    )
      .setInputNode("checkpoint", "4.inputs.ckpt_name")
      .setInputNode("seed", "3.inputs.seed")
      .setInputNode("batch", "5.inputs.batch_size")
      .setInputNode("negative", "7.inputs.text")
      .setInputNode("positive", "6.inputs.text")
      .setInputNode("step", "3.inputs.steps")
      .setInputNode("cfg", "3.inputs.cfg")
      .setInputNode("sampler", "3.inputs.sampler_name")
      .setInputNode("scheduler", "3.inputs.scheduler")
      .setInputNode("width", "5.inputs.width")
      .setInputNode("height", "5.inputs.height")
      .setOutputNode("images", "9");

    return this.promptBuilder;
  }

  /**
   * Simula falha em um ou mais servidores após tempo especificado
   */
  private setupFailureSimulation(serverConfig: any) {
    if (!this.config.enableFailureSimulation) return;

    console.log(`⏱️ Configurando simulação de falha para ${this.config.failureAfterSeconds}s...`);

    this.failureTimeout = setTimeout(() => {
      const serversToFail = this.config.serversToFail;

      serversToFail.forEach((serverIndex: number) => {
        if (serverIndex >= this.apis.length) {
          console.warn(`⚠️ Índice de servidor ${serverIndex} fora de alcance.`);
          return;
        }

        const api = this.apis[serverIndex];
        const hostInfo = serverConfig.hosts.find((h: any) => api.apiHost.includes(h.url.split("//")[1]));
        const serverName = hostInfo?.name || api.apiHost;

        console.log(`💥 Simulando falha no servidor ${serverName}...`);

        // Adicionar evento na timeline
        this.recordEvent({
          timestamp: new Date(),
          eventType: "server_failed",
          serverId: serverName,
          requestId: "n/a",
          details: { serverUrl: api.apiHost }
        });

        // Atualizar status do servidor nas métricas
        const serverMetrics = this.analytics.serverMetrics.get(serverName);
        if (serverMetrics) {
          serverMetrics.status = "failed";
          serverMetrics.failureTime = new Date();
        }

        // Forçar desconexão do WebSocket para simular falha de maneira mais robusta
        try {
          // Desconectar WebSocket
          (api as any)._socket?.destroy();

          // Forçar falha nos métodos críticos da API
          api.isReady = false;

          // Substituir o método de execução por um que sempre falha
          api.queuePrompt = async (...args: any[]) => {
            throw new Error(`Servidor ${serverName} está offline (falha simulada)`);
          };

          // Fazer o mesmo com outros métodos críticos
          (api as any).getHistory = async () => {
            throw new Error(`Servidor ${serverName} está offline (falha simulada)`);
          };

          (api as any).getSystemStats = async () => {
            throw new Error(`Servidor ${serverName} está offline (falha simulada)`);
          };

          // Desabilitar reconexão automática se existir
          if (typeof (api as any)._reconnect === "function") {
            (api as any)._reconnect = () => {
              console.log(`🚫 Bloqueando reconexão do servidor ${serverName}`);
              return Promise.reject(new Error("Reconexão desabilitada - falha simulada"));
            };
          }

          // Emitir evento de disconnected se a API tiver este método
          if (typeof (api as any).emit === "function") {
            (api as any).emit("disconnected", { detail: { reason: "Falha simulada pelo teste" } });
          }

          // Forçar o pool a considerar este cliente como falho
          try {
            // Usar método interno da pool se disponível
            if (typeof (this.pool as any)._handleClientFailed === "function") {
              (this.pool as any)._handleClientFailed(serverIndex, new Error("Falha simulada pelo teste"));
            }
          } catch (e) {
            console.warn(`⚠️ Erro ao notificar pool sobre falha do cliente: ${e.message}`);
          }

          // Notificar sobre remoção da pool
          const idx = this.pool.clients.findIndex((c) => c === api);
          if (idx !== -1) {
            console.log(`🔌 Servidor ${serverName} (índice ${idx}) marcado como falho na pool`);
          }
        } catch (e) {
          console.warn(`⚠️ Erro ao simular falha completa: ${e.message}`);
        }

        console.log(`💀 Servidor ${serverName} falhou. ComfyPool deve redistribuir os jobs pendentes...`);
      });
    }, this.config.failureAfterSeconds * 1000);
  }

  /**
   * Configura checkpoint periódico para estatísticas
   */
  /**
   * Monitora o progresso dos jobs e verifica se há algum travado
   */
  private setupJobMonitoring() {
    // Configurar intervalo apenas se especificado na configuração
    if (!this.config.jobMonitoringIntervalMs) return;

    const monitorInterval = setInterval(() => {
      // Verificar jobs pendentes há mais de 10 segundos
      const stuckJobs = this.analytics.jobs.filter((job) => {
        // Procurar jobs pendentes ou em execução há mais de 10 segundos
        const isStuck = job.status === "pending" || job.status === "running";
        const startTime = job.startTime.getTime();
        const elapsed = Date.now() - startTime;
        return isStuck && elapsed > 10000;
      });

      if (stuckJobs.length > 0) {
        console.log(`\n⚠️ Detectados ${stuckJobs.length} jobs possivelmente travados:`);
        stuckJobs.forEach((job) => {
          const elapsedSeconds = ((Date.now() - job.startTime.getTime()) / 1000).toFixed(1);
          console.log(`   - Job ${job.jobId} em ${job.host} no estado ${job.status} por ${elapsedSeconds}s`);
          this.addJobForRetry(job.jobId);
        });
      }
    }, this.config.jobMonitoringIntervalMs);

    // Armazenar para limpeza posterior
    this._jobMonitorInterval = monitorInterval;
  }

  private setupCheckpoints() {
    if (this.checkpointInterval) clearInterval(this.checkpointInterval);

    this.checkpointInterval = setInterval(() => {
      const now = new Date();
      const elapsedSinceLastCheckpoint = (now.getTime() - this.lastCheckpointTime.getTime()) / 1000;
      const requestsPerSecond = this.completedSinceLastCheckpoint / elapsedSinceLastCheckpoint;

      const activeServers = Array.from(this.analytics.serverMetrics.values()).filter(
        (s) => s.status === "active"
      ).length;

      const checkpoint: ProgressCheckpoint = {
        timestamp: now,
        completedRequests: this.analytics.completedRequests,
        activeRequests: this.analytics.jobs.filter((j) => j.status === "running").length,
        queuedRequests: this.analytics.jobs.filter((j) => j.status === "pending").length,
        activeServers,
        requestsPerSecond
      };

      this.analytics.progressCheckpoints.push(checkpoint);

      console.log(`\n📊 CHECKPOINT [${formatTime(now)}]:`);
      console.log(
        `   Completados: ${this.analytics.completedRequests}/${this.analytics.totalRequests} (${((this.analytics.completedRequests / this.analytics.totalRequests) * 100).toFixed(1)}%)`
      );
      console.log(`   Em execução: ${checkpoint.activeRequests}, Na fila: ${checkpoint.queuedRequests}`);
      console.log(`   Servidores ativos: ${activeServers}/${this.analytics.serverMetrics.size}`);
      console.log(`   Velocidade: ${requestsPerSecond.toFixed(2)} req/s`);

      if (this.analytics.redistributedRequests > 0) {
        console.log(`   Redistribuídos: ${this.analytics.redistributedRequests}`);
      }

      // Resetar contadores para o próximo checkpoint
      this.lastCheckpointTime = now;
      this.completedSinceLastCheckpoint = 0;
    }, this.config.checkpointIntervalMs);
  }

  /**
   * Função para gerar uma imagem com analytics
   */
  private generateWithAnalytics = (api: ComfyApi, clientIdx?: number) => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Encontrar informações do host
    const serverConfig = this.loadConfig();
    const hostInfo = serverConfig.hosts.find((h: any) => api.apiHost.includes(h.url.split("//")[1]));
    const serverName = hostInfo?.name || api.apiHost;

    // Criar analytics para este job
    const analytic: GenerationAnalytics = {
      jobId,
      host: serverName,
      startTime: new Date(),
      status: "pending",
      progressUpdates: 0
    };

    // Adicionar à lista de jobs
    this.analytics.jobs.push(analytic);

    // Atualizar contadores do servidor
    const serverMetrics = this.analytics.serverMetrics.get(serverName);
    if (serverMetrics) {
      serverMetrics.totalAssigned++;
    }

    return new Promise<string[]>((resolve, reject) => {
      try {
        // Extrair parâmetros diretamente do workflow
        const checkpointFromWorkflow = this.workflow["4"]?.inputs?.ckpt_name;
        const stepsFromWorkflow = this.workflow["3"]?.inputs?.steps || 20;
        const cfgFromWorkflow = this.workflow["3"]?.inputs?.cfg || 7;
        const widthFromWorkflow = this.workflow["5"]?.inputs?.width || 512;
        const heightFromWorkflow = this.workflow["5"]?.inputs?.height || 512;
        const batchFromWorkflow = this.workflow["5"]?.inputs?.batch_size || 1;
        const samplerFromWorkflow = this.workflow["3"]?.inputs?.sampler_name;
        const schedulerFromWorkflow = this.workflow["3"]?.inputs?.scheduler;
        const positiveFromWorkflow = this.workflow["6"]?.inputs?.text;
        const negativeFromWorkflow = this.workflow["7"]?.inputs?.text;

        // Construir o workflow
        let promptBuilder = this.promptBuilder
          .input("checkpoint", checkpointFromWorkflow, api.osType)
          .input("seed", seed())
          .input("step", stepsFromWorkflow)
          .input("cfg", cfgFromWorkflow)
          .input("width", widthFromWorkflow)
          .input("height", heightFromWorkflow)
          .input("batch", batchFromWorkflow);

        try {
          promptBuilder = promptBuilder.input("sampler", samplerFromWorkflow as TSamplerName);
        } catch (error) {
          console.error(`⚠️ Erro ao definir sampler '${samplerFromWorkflow}': ${error.message}`);
          return reject(new Error(`Sampler não suportado: ${samplerFromWorkflow}`));
        }

        try {
          promptBuilder = promptBuilder.input("scheduler", schedulerFromWorkflow as TSchedulerName);
        } catch (error) {
          console.error(`⚠️ Erro ao definir scheduler '${schedulerFromWorkflow}': ${error.message}`);
          return reject(new Error(`Scheduler não suportado: ${schedulerFromWorkflow}`));
        }

        // Completar workflow com prompts
        promptBuilder = promptBuilder.input("positive", positiveFromWorkflow).input("negative", negativeFromWorkflow);

        // Preparar para capturar eventos
        const wrapper = new CallWrapper(api, promptBuilder)
          .onPending(() => {
            analytic.status = "pending";
            if (this.config.enableDetailedLogging) {
              console.log(`📋 ${analytic.host}: Job ${jobId} pendente`);
            }

            this.recordEvent({
              timestamp: new Date(),
              eventType: "request_start",
              serverId: serverName,
              requestId: jobId
            });
          })
          .onStart(() => {
            analytic.status = "running";
            if (this.config.enableDetailedLogging) {
              console.log(`🚀 ${analytic.host}: Job ${jobId} iniciado`);
            }
          })
          .onProgress((info) => {
            analytic.progressUpdates++;
            if (this.config.enableDetailedLogging) {
              console.log(`⚡ ${analytic.host}: Progresso ${info.value}/${info.max}`);
            }
          })
          .onFinished((data) => {
            analytic.status = "completed";
            analytic.endTime = new Date();
            analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();
            analytic.images = data.images?.images.map((img: any) => api.getPathImage(img));

            // Atualizar contadores
            this.analytics.completedRequests++;
            this.completedSinceLastCheckpoint++;

            // Atualizar métricas do servidor
            const serverMetrics = this.analytics.serverMetrics.get(serverName);
            if (serverMetrics) {
              serverMetrics.completed++;
              serverMetrics.lastActiveTime = new Date();

              // Atualizar tempo médio de resposta
              const currentTotal = serverMetrics.averageResponseTime * (serverMetrics.completed - 1);
              serverMetrics.averageResponseTime = (currentTotal + analytic.duration!) / serverMetrics.completed;
            }

            this.recordEvent({
              timestamp: new Date(),
              eventType: "request_complete",
              serverId: serverName,
              requestId: jobId,
              details: { duration: analytic.duration }
            });

            console.log(`✅ ${analytic.host}: Job ${jobId} completado em ${analytic.duration}ms`);
            resolve(analytic.images || []);
          })
          .onFailed((error) => {
            // Se for um erro relacionado a falhas de servidor ou conexão, marcamos para redistribuição
            // Ampliamos as mensagens de erro que indicam redistribuição
            const redistributionErrors = [
              "redistrib",
              "offline",
              "disconnect",
              "timeout",
              "socket",
              "network",
              "connection",
              "unavailable",
              "failed"
            ];

            // Verifica se alguma das palavras-chave está na mensagem de erro
            const shouldRedistribute = redistributionErrors.some((errType) =>
              error.message.toLowerCase().includes(errType.toLowerCase())
            );

            if (shouldRedistribute) {
              analytic.status = "redistributed";
              analytic.redistributionTime = new Date();
              analytic.originalHost = serverName;

              // Registrar evento de redistribuição
              this.recordEvent({
                timestamp: new Date(),
                eventType: "request_redistributed",
                serverId: serverName,
                requestId: jobId,
                details: { error: error.message }
              });

              this.analytics.redistributedRequests++;

              // Atualizar métricas do servidor
              const serverMetrics = this.analytics.serverMetrics.get(serverName);
              if (serverMetrics) {
                serverMetrics.redistributed++;
              }

              console.log(`🔄 ${analytic.host}: Job ${jobId} marcado para redistribuição devido a: ${error.message}`);

              // Adicionar explicitamente à lista de retry
              this.addJobForRetry(jobId);

              // Não rejeitamos o promise aqui, pois o ComfyPool vai lidar com a redistribuição
            } else {
              // Se for um erro normal, registramos como falha
              analytic.status = "failed";
              analytic.endTime = new Date();
              analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();

              // Tentar extrair mais informações do erro
              let errorDetail = error.message;
              if (error.cause) {
                try {
                  const causeInfo = typeof error.cause === "object" ? JSON.stringify(error.cause) : error.cause;
                  errorDetail = `${error.message} - Causa: ${causeInfo}`;
                } catch (e) {
                  errorDetail = `${error.message} - Causa não identificada`;
                }
              }

              analytic.error = errorDetail;

              // Atualizar contadores
              this.analytics.failedRequests++;

              // Atualizar métricas do servidor
              const serverMetrics = this.analytics.serverMetrics.get(serverName);
              if (serverMetrics) {
                serverMetrics.failed++;
                serverMetrics.lastActiveTime = new Date();
              }

              this.recordEvent({
                timestamp: new Date(),
                eventType: "request_failed",
                serverId: serverName,
                requestId: jobId,
                details: { error: errorDetail }
              });

              console.log(`❌ ${analytic.host}: Job ${jobId} falhou - ${errorDetail}`);

              // Também marcar para retry caso sejamos capazes de reenviar
              this.addJobForRetry(jobId);

              reject(error);
            }
          });

        // Executar o workflow
        if (this.config.enableDetailedLogging) {
          console.log(`🚀 Enviando workflow para execução em ${api.apiHost}...`);
        }
        wrapper.run();
      } catch (error) {
        console.error(`❌ Erro ao construir ou executar workflow: ${error.message}`);
        analytic.status = "failed";
        analytic.error = `Erro de construção do workflow: ${error.message}`;
        analytic.endTime = new Date();
        analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();

        // Atualizar contadores
        this.analytics.failedRequests++;

        // Atualizar métricas do servidor
        const serverMetrics = this.analytics.serverMetrics.get(serverName);
        if (serverMetrics) {
          serverMetrics.failed++;
        }

        reject(error);
      }
    });
  };

  /**
   * Registra um evento na timeline de analytics e rastreia eventos que podem exigir intervenção
   */
  private recordEvent(event: TimelineEvent) {
    this.analytics.events.push(event);

    // Monitorar eventos de redistribuição e falha para possível retry manual
    if (event.eventType === "request_redistributed" || event.eventType === "request_failed") {
      this.addJobForRetry(event.requestId);
    }
  }

  /**
   * Gera o relatório final de análise
   * Método público para permitir geração de relatório em casos de erro
   */
  public generateReport() {
    this.analytics.endTime = new Date();
    this.analytics.totalDuration = this.analytics.endTime.getTime() - this.analytics.startTime.getTime();

    // Converter Map para objeto para poder salvar em JSON
    const serverMetricsObj = {};
    this.analytics.serverMetrics.forEach((value, key) => {
      serverMetricsObj[key] = value;
    });

    const reportObj = {
      ...this.analytics,
      serverMetrics: serverMetricsObj,
      summary: {
        totalDuration: `${(this.analytics.totalDuration / 1000).toFixed(1)}s`,
        totalRequests: this.analytics.totalRequests,
        completedRequests: this.analytics.completedRequests,
        failedRequests: this.analytics.failedRequests,
        redistributedRequests: this.analytics.redistributedRequests,
        successRate: `${((this.analytics.completedRequests / this.analytics.totalRequests) * 100).toFixed(1)}%`,
        averageRequestDuration: `${(
          this.analytics.jobs.filter((j) => j.duration).reduce((acc, j) => acc + (j.duration || 0), 0) /
          this.analytics.jobs.filter((j) => j.duration).length /
          1000
        ).toFixed(1)}s`
      }
    };

    // Garantir que o diretório exista
    const dataDir = "../data";
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const reportFilename = `${dataDir}/analytics-high-load-resilience-${this.analytics.testId}.json`;
    fs.writeFileSync(reportFilename, JSON.stringify(reportObj, null, 2));

    return {
      reportObj,
      reportFilename
    };
  }

  /**
   * Limpa recursos utilizados
   */
  private cleanup() {
    if (this.failureTimeout) {
      clearTimeout(this.failureTimeout);
    }

    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }

    if (this._jobMonitorInterval) {
      clearInterval(this._jobMonitorInterval);
    }

    // Destruir todas as APIs
    for (const api of this.apis) {
      api.destroy();
    }
  }

  /**
   * Rastreia trabalhos pendentes ou com falha para possível retry
   */
  private jobsRequiringRetry: string[] = [];

  /**
   * Adiciona trabalho para retry se necessário
   */
  private addJobForRetry(jobId: string) {
    if (!this.jobsRequiringRetry.includes(jobId)) {
      this.jobsRequiringRetry.push(jobId);
      console.log(`🔁 Job ${jobId} adicionado à lista de retry`);
    }
  }

  /**
   * Executa o teste completo
   */
  public async runTest(workflowFileName: string = "example-txt2img-workflow.json") {
    console.log("🎨 ComfyUI SDK - Teste de Alta Carga e Resiliência");
    console.log("==================================================\n");

    try {
      // Carregar configuração e workflow
      const serverConfig = this.loadConfig();
      this.loadWorkflow(workflowFileName);

      // Inicializar pool e APIs
      await this.initializePool(serverConfig);
      this.setupPromptBuilder();
      this.setupPoolMonitor();

      // Configurar checkpoints, monitoramento e simulação de falha
      this.setupCheckpoints();
      this.setupJobMonitoring();
      this.setupFailureSimulation(serverConfig);

      // Preparar jobs
      const jobs = Array(this.config.totalRequests).fill(this.generateWithAnalytics);

      console.log(`\n📦 Iniciando teste com ${this.config.totalRequests} requisições totais`);
      console.log(`📊 Concorrência: ${this.config.concurrentRequests}, Batch: ${this.config.requestsPerBatch}`);

      if (this.config.enableFailureSimulation) {
        console.log(
          `💥 Simulação de falha ativada - Servidor(es) ${this.config.serversToFail.join(", ")} falharão após ${this.config.failureAfterSeconds}s`
        );
      }

      console.log("\n🚀 Iniciando execução...\n");

      // Executar jobs em grupos sequenciais para permitir que a falha ocorra entre os lotes
      try {
        // Separar jobs em lotes menores para envio gradual
        const jobBatches: Array<Array<(client: ComfyApi, clientIdx?: number) => Promise<string[]>>> = [];
        const batchSize = Math.ceil(jobs.length / 4); // Dividir em 4 lotes

        for (let i = 0; i < jobs.length; i += batchSize) {
          jobBatches.push(jobs.slice(i, i + batchSize));
        }

        console.log(`\n🚀 Dividindo requisições em ${jobBatches.length} lotes de ${batchSize} jobs`);

        // Processar lotes sequencialmente
        for (let i = 0; i < jobBatches.length; i++) {
          console.log(`\n📦 Enviando lote ${i + 1}/${jobBatches.length} (${jobBatches[i].length} jobs)...`);

          // ComfyPool.batch aceita (jobs, weight, clientFilter)
          const jobWeight = 1;

          // Adicionar timeout para cada lote para evitar travamento
          try {
            const results = await Promise.race([
              this.pool.batch(jobBatches[i], jobWeight),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout ao processar lote após 30s")), 30000)
              )
            ]);
          } catch (error) {
            console.warn(`⚠️ Erro/timeout no lote ${i + 1}: ${error.message}`);
            console.log(`Continuando com o próximo lote...`);

            // Verificar jobs pendentes do lote atual
            const pendingJobsInCurrentBatch = this.analytics.jobs
              .filter((job) => job.status === "pending" || job.status === "redistributed")
              .filter((job) => job.startTime >= new Date(Date.now() - 60000)); // Jobs iniciados no último minuto

            if (pendingJobsInCurrentBatch.length > 0) {
              console.log(`⚠️ Detectados ${pendingJobsInCurrentBatch.length} jobs pendentes no lote atual`);
              pendingJobsInCurrentBatch.forEach((job) => this.addJobForRetry(job.jobId));
            }
          }

          // Pausa entre lotes (exceto o último)
          if (i < jobBatches.length - 1) {
            const pauseTime = 2000; // 2 segundos entre lotes
            console.log(`\n⏱️ Aguardando ${pauseTime / 1000}s antes do próximo lote...`);
            await new Promise((resolve) => setTimeout(resolve, pauseTime));
          }
        }

        // Verificar se precisamos fazer retry de algum job
        const incompleteJobs = this.analytics.jobs.filter(
          (job) => job.status === "pending" || job.status === "redistributed" || job.status === "failed"
        );

        if (incompleteJobs.length > 0 || this.jobsRequiringRetry.length > 0) {
          console.log(
            `\n⚠️ Detectados ${incompleteJobs.length} jobs incompletos e ${this.jobsRequiringRetry.length} jobs marcados para retry`
          );

          // Adicionar todos os jobs incompletos à lista de retry
          incompleteJobs.forEach((job) => this.addJobForRetry(job.jobId));

          // Verificar se ainda temos servidores ativos
          const activeServers = Array.from(this.analytics.serverMetrics.values()).filter(
            (s) => s.status === "active"
          ).length;

          if (activeServers > 0 && this.jobsRequiringRetry.length > 0) {
            console.log(`\n🔄 Tentando reenviar ${this.jobsRequiringRetry.length} jobs para garantir conclusão...`);

            // Criar novos jobs para retry (com novos IDs para evitar conflitos)
            const retryJobs = Array(this.jobsRequiringRetry.length).fill(this.generateWithAnalytics);

            try {
              console.log(`\n📦 Enviando lote de retry com ${retryJobs.length} jobs...`);
              await Promise.race([
                this.pool.batch(retryJobs, 1), // Prioridade normal
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("Timeout ao processar lote de retry após 40s")), 40000)
                )
              ]);
            } catch (retryError) {
              console.warn(`⚠️ Erro durante retry: ${retryError.message}`);
            }
          }
        }

        console.log(
          `\n✅ Teste concluído! ${this.analytics.completedRequests}/${this.analytics.totalRequests} requisições completadas (${((this.analytics.completedRequests / this.analytics.totalRequests) * 100).toFixed(1)}%)`
        );
      } catch (error) {
        console.error("\n⚠️ Teste concluído com erros:", error.message);
      }

      // Gerar relatório final
      const { reportObj, reportFilename } = this.generateReport();

      // Validar distribuição entre servidores
      const serverStats = Object.entries(reportObj.serverMetrics as Record<string, any>).map(([name, metrics]) => {
        return {
          name,
          status: metrics.status,
          totalAssigned: metrics.totalAssigned,
          percentAssigned: Math.round((metrics.totalAssigned / reportObj.summary.totalRequests) * 100)
        };
      });

      // Exibir resumo
      console.log("\n📈 Resumo do Teste:");
      console.log(`   Duração Total: ${reportObj.summary.totalDuration}`);
      console.log(`   Taxa de Sucesso: ${reportObj.summary.successRate}`);
      console.log(
        `   Requisições Completadas: ${reportObj.summary.completedRequests}/${reportObj.summary.totalRequests}`
      );
      console.log(`   Duração Média por Requisição: ${reportObj.summary.averageRequestDuration}`);

      // Exibir estatísticas de distribuição
      console.log("\n🔄 Distribuição de Carga:");
      serverStats.forEach((server) => {
        console.log(
          `   ${server.name}: ${server.totalAssigned} jobs (${server.percentAssigned}%) - Status: ${server.status}`
        );
      });

      // Exibir estatísticas de redistribuição
      if (reportObj.summary.redistributedRequests > 0) {
        console.log(`\n🔁 Redistribuição:`);
        console.log(`   Requisições Redistribuídas: ${reportObj.summary.redistributedRequests}`);

        // Análise da timeline para encontrar redistribuições
        const redistributionEvents = reportObj.events.filter((e) => e.eventType === "request_redistributed");
        console.log(`   Eventos de Redistribuição: ${redistributionEvents.length}`);

        if (redistributionEvents.length > 0) {
          const eventGroups = redistributionEvents.reduce((acc, ev) => {
            acc[ev.serverId] = (acc[ev.serverId] || 0) + 1;
            return acc;
          }, {});

          Object.entries(eventGroups).forEach(([server, count]) => {
            console.log(`   - ${server}: ${count} jobs redistribuídos`);
          });
        }
      }

      // Análise de eficácia do teste
      console.log("\n🧪 Validação do Teste:");

      // Verificar se houve distribuição entre servidores
      const serversUsed = serverStats.filter((s) => s.totalAssigned > 0).length;
      if (serversUsed > 1) {
        console.log(`   ✅ Jobs distribuídos entre ${serversUsed} servidores`);
      } else {
        console.log(`   ❌ Todos os jobs foram para um único servidor! Balanceamento não funcionou.`);
      }

      // Verificar se houve redistribuição após falha
      if (this.config.enableFailureSimulation) {
        if (reportObj.summary.redistributedRequests > 0) {
          console.log(`   ✅ ${reportObj.summary.redistributedRequests} jobs redistribuídos após simulação de falha`);
        } else {
          console.log(`   ❌ Nenhum job foi redistribuído após simulação de falha!`);
        }
      }

      console.log(`\n📊 Relatório detalhado salvo em: ${reportFilename}`);

      // Limpar recursos
      this.cleanup();

      return reportObj;
    } catch (error) {
      console.error("❌ Erro durante execução do teste:", error.message);
      this.cleanup();
      throw error;
    }
  }
}

/**
 * Função auxiliar para formatar timestamp
 */
function formatTime(date: Date): string {
  return date.toTimeString().split(" ")[0];
}

/**
 * Função principal para execução do teste
 */
async function main() {
  // Inicializar o logger
  const logger = new Logger();
  (global as any).__logger = logger; // Salvar referência global para uso no handler de timeout

  try {
    console.time("Tempo total de execução");

    // Configuração do teste
    const testConfig = {
      // Configurações de carga
      totalRequests: 12, // Total reduzido para testar com mais precisão
      concurrentRequests: 3, // Melhor distribuição com mais concorrência
      requestsPerBatch: 3, // Tamanho do lote equilibrado

      // Configurações de retry e robustez
      maxRetryAttempts: 3, // Permitir até 3 tentativas para jobs com falha
      jobMonitoringIntervalMs: 2000, // Checar status dos jobs a cada 2 segundos

      // Configurações de falha
      enableFailureSimulation: true, // Ativar simulação de falha
      failureAfterSeconds: 5, // Falha após 5 segundos (mais cedo)
      serversToFail: [0], // Índices dos servidores para falhar (0 = primeiro servidor)

      // Configurações de análise
      enableDetailedLogging: true, // Ativar logs detalhados
      checkpointIntervalMs: 5000 // Intervalo em ms para checkpoints de progresso
    };

    // Criar e executar o teste com timeout global para garantir que não trave
    const test = new HighLoadResilienceTest(testConfig);

    try {
      // Adicionar timeout específico para a execução do teste (aumentado para 3 minutos para permitir retries)
      await Promise.race([
        test.runTest("example-txt2img-workflow.json"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("O teste excedeu o tempo máximo de execução (3 minutos)")), 3 * 60 * 1000)
        )
      ]);
    } catch (testError) {
      console.error(`\n⚠️ Teste interrompido: ${testError.message}`);
      // Gerar relatório mesmo em caso de erro
      try {
        test.generateReport();
      } catch (e) {
        console.error(`Erro ao gerar relatório: ${e.message}`);
      }
    }

    console.timeEnd("Tempo total de execução");

    // Forçar limpeza de recursos e finalizar processo
    console.log("\n🧹 Limpando recursos...");
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Fechar o logger antes de sair
    console.log(`\n📝 Log completo salvo em: ${logger.getLogFilePath()}`);
    logger.close();

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erro fatal:", error);

    // Fechar o logger mesmo em caso de erro
    logger.close();

    process.exit(1);
  }
}

// Adicionar timeout global mais curto (3 minutos) para evitar execuções muito longas
const GLOBAL_TIMEOUT = 30 * 60 * 1000; // 3 minutos
const timeout = setTimeout(() => {
  console.error("\n⚠️ Script atingiu timeout global após", GLOBAL_TIMEOUT / 1000, "segundos");

  // Se o logger foi inicializado, fechar antes de sair
  try {
    const logger = (global as any).__logger;
    if (logger) {
      logger.close();
    }
  } catch (e) {
    // Ignorar erros no shutdown
  }

  process.exit(1);
}, GLOBAL_TIMEOUT);

// Limpar o timeout se o processo terminar normalmente
timeout.unref();

// Executar teste
main();
