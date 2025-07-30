import { ComfyApi } from "../../src/client";
import { ComfyPool, EQueueMode } from "../../src/pool";
import { CallWrapper } from "../../src/call-wrapper";
import { PromptBuilder } from "../../src/prompt-builder";
import { TSamplerName, TSchedulerName } from "../../src/types/sampler";

// Função seed para gerar números aleatórios (similar à original da SDK)
const seed = () => Math.floor(Math.random() * 1000000);
import * as fs from "fs";
import path from "path";

interface GenerationAnalytics {
  jobId: string;
  host: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  images?: string[];
  progressUpdates: number;
}

async function runGenerationTest() {
  console.log("🎨 ComfyUI SDK Test - Image Generation");
  console.log("======================================\n");

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

  // Carregar workflow
  let exampleWorkflow;
  try {
    // Tentar com caminho relativo à raiz do projeto
    const workflowPath = "../../examples/example-txt2img-workflow.json";
    exampleWorkflow = JSON.parse(fs.readFileSync(workflowPath, "utf-8"));
    console.log(`✅ Workflow carregado de ${workflowPath}`);
  } catch (error) {
    console.error(`❌ Erro ao carregar workflow: ${error}`);
    console.log("⚠️ Usando workflow mínimo como fallback...");

    // Workflow mínimo para fallback
    exampleWorkflow = {
      "3": { inputs: { seed: 123456, steps: 20, cfg: 7, sampler_name: "euler_a", scheduler: "normal" } },
      "4": { inputs: { ckpt_name: "epicrealism_naturalSinRC1VAE.safetensors" } },
      "5": { inputs: { width: 512, height: 512, batch_size: 1 } },
      "6": { inputs: { text: "A beautiful landscape with mountains" } },
      "7": { inputs: { text: "text, watermark, bad quality" } },
      "9": { class_type: "SaveImage" }
    };
  }

  // Criar pool de APIs
  const apis = config.hosts
    .filter((h: any) => h.enabled)
    .map((host: any) => new ComfyApi(host.url, `pool-${host.name}`));

  const pool = new ComfyPool(apis, EQueueMode.PICK_LOWEST);

  // Analytics collector
  const analytics: GenerationAnalytics[] = [];

  // Definir workflow
  const Txt2ImgPrompt = new PromptBuilder(
    exampleWorkflow,
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

  // Função geradora com analytics
  const generateWithAnalytics = async (api: ComfyApi, clientIdx?: number) => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const hostInfo = config.hosts.find((h: any) => api.apiHost.includes(h.url.split("//")[1]));

    const analytic: GenerationAnalytics = {
      jobId,
      host: hostInfo?.name || api.apiHost,
      startTime: new Date(),
      status: "pending",
      progressUpdates: 0
    };

    analytics.push(analytic);

    return new Promise<string[]>((resolve, reject) => {
      // Carregar modelos comuns se existirem
      let commonCheckpoint = "epicrealism_naturalSinRC1VAE.safetensors"; // Modelo que identificamos como comum

      try {
        const modelsDataPath = "../data/analytics-models.json";
        if (fs.existsSync(modelsDataPath)) {
          const modelsData = JSON.parse(fs.readFileSync(modelsDataPath, "utf-8"));
          if (
            modelsData.commonModels &&
            modelsData.commonModels.checkpoints &&
            modelsData.commonModels.checkpoints.length > 0
          ) {
            commonCheckpoint = modelsData.commonModels.checkpoints[0];
            console.log(`📌 Usando checkpoint comum: ${commonCheckpoint}`);
          }
        }
      } catch (e) {
        console.log(`⚠️ Não foi possível carregar modelos comuns: ${e}`);
      }

      const workflow = Txt2ImgPrompt.input("checkpoint", commonCheckpoint, api.osType)
        .input("seed", seed())
        .input("step", 6)
        .input("cfg", 1)
        .input("width", 512)
        .input("height", 512)
        .input("batch", 1)
        .input<TSamplerName>("sampler", "dpmpp_2m_sde_gpu")
        .input<TSchedulerName>("scheduler", "sgm_uniform")
        .input("positive", "A beautiful landscape with mountains and lake")
        .input("negative", "text, watermark, low quality");

      new CallWrapper(api, workflow)
        .onPending(() => {
          analytic.status = "pending";
          console.log(`📋 ${analytic.host}: Job ${jobId} pending`);
        })
        .onStart(() => {
          analytic.status = "running";
          console.log(`🚀 ${analytic.host}: Job ${jobId} started`);
        })
        .onProgress((info) => {
          analytic.progressUpdates++;
          console.log(`⚡ ${analytic.host}: Progress ${info.value}/${info.max}`);
        })
        .onFinished((data) => {
          analytic.status = "completed";
          analytic.endTime = new Date();
          analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();
          analytic.images = data.images?.images.map((img: any) => api.getPathImage(img));

          console.log(`✅ ${analytic.host}: Job ${jobId} completed in ${analytic.duration}ms`);
          resolve(analytic.images || []);
        })
        .onFailed((error) => {
          analytic.status = "failed";
          analytic.error = error.message;
          analytic.endTime = new Date();
          analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();

          console.log(`❌ ${analytic.host}: Job ${jobId} failed - ${error.message}`);
          reject(error);
        })
        .run();
    });
  };

  // Inicializar cada API no pool (já que o pool não tem init)
  console.log(`Inicializando ${apis.length} hosts...`);

  for (const api of apis) {
    try {
      // Definir um timeout para a inicialização
      const initTimeout = 30000; // 30 segundos

      await Promise.race([
        api.init(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ao inicializar API após ${initTimeout}ms`)), initTimeout)
        )
      ]);
    } catch (error) {
      console.error(`⚠️ Erro ao inicializar host ${api.apiHost}: ${error.message}`);
      // Continue com os outros hosts mesmo se um falhar
    }
  }

  // Filtrar apenas APIs que foram inicializadas com sucesso
  const readyApis = apis.filter((api) => api.isReady);
  console.log(`✅ Pool initialized with ${readyApis.length}/${apis.length} hosts ready\n`);

  // Executar múltiplos jobs
  const numberOfJobs = 6; // Reduzido para 6 jobs para teste inicial
  const jobs = Array(numberOfJobs).fill(generateWithAnalytics);

  console.log(`📦 Submitting ${numberOfJobs} jobs to the pool...\n`);

  const startTime = Date.now();

  try {
    const results = await pool.batch(jobs, 1);
    const endTime = Date.now();

    // Gerar relatório
    const report = {
      testDate: new Date().toISOString(),
      totalDuration: endTime - startTime,
      totalJobs: numberOfJobs,
      successfulJobs: analytics.filter((a) => a.status === "completed").length,
      failedJobs: analytics.filter((a) => a.status === "failed").length,
      averageJobDuration:
        analytics.filter((a) => a.duration).reduce((acc, a) => acc + (a.duration || 0), 0) /
        analytics.filter((a) => a.duration).length,
      hostPerformance: generateHostPerformance(analytics),
      jobs: analytics
    };

    // Garantir que o diretório exista
    const dataDir = "../data";
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(`${dataDir}/analytics-generation.json`, JSON.stringify(report, null, 2));
    console.log(`\n📊 Analytics saved to ${dataDir}/analytics-generation.json`);

    // Resumo
    console.log("\n📈 Summary:");
    console.log(`   Total Duration: ${report.totalDuration}ms`);
    console.log(`   Success Rate: ${((report.successfulJobs / report.totalJobs) * 100).toFixed(1)}%`);
    console.log(`   Average Job Duration: ${report.averageJobDuration.toFixed(0)}ms`);
  } catch (error) {
    console.error("Test failed:", error);
  }

  // Limpar recursos usando o método destroy() de cada API
  for (const api of apis) {
    api.destroy();
  }
}

function generateHostPerformance(analytics: GenerationAnalytics[]) {
  const hostStats: Record<string, any> = {};

  analytics.forEach((job) => {
    if (!hostStats[job.host]) {
      hostStats[job.host] = {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        totalDuration: 0,
        averageDuration: 0,
        progressUpdates: 0
      };
    }

    hostStats[job.host].totalJobs++;
    if (job.status === "completed") {
      hostStats[job.host].completedJobs++;
      hostStats[job.host].totalDuration += job.duration || 0;
    } else if (job.status === "failed") {
      hostStats[job.host].failedJobs++;
    }
    hostStats[job.host].progressUpdates += job.progressUpdates;
  });

  // Calcular médias
  Object.keys(hostStats).forEach((host) => {
    if (hostStats[host].completedJobs > 0) {
      hostStats[host].averageDuration = hostStats[host].totalDuration / hostStats[host].completedJobs;
    }
  });

  return hostStats;
}

/**
 * Executa o teste com timeout e cleanup adequado para evitar que o processo fique travado
 */
async function main() {
  try {
    console.time("Total execution time");
    await runGenerationTest();
    console.timeEnd("Total execution time");

    // Força a limpeza de qualquer conexão websocket ou recurso pendente
    console.log("\n🧹 Cleaning up resources...");

    // Espera um pequeno tempo para logs finais
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Forçar finalização do processo
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Adiciona um timeout global para garantir que o processo não fique preso
const GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutos
const timeout = setTimeout(() => {
  console.error("\n⚠️ Script timed out after", GLOBAL_TIMEOUT / 1000, "seconds");
  process.exit(1);
}, GLOBAL_TIMEOUT);

// Limpar o timeout se o processo terminar normalmente
timeout.unref();

main();
