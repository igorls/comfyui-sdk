import { ComfyApi } from "../../src/client";
import { ComfyPool, EQueueMode } from "../../src/pool";
import { CallWrapper } from "../../src/call-wrapper";
import { PromptBuilder } from "../../src/prompt-builder";
import { TSamplerName, TSchedulerName } from "../../src/types/sampler";

// Função seed para gerar números aleatórios
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

  // Carregar configuração
  const configPath = "../config/comfyui-config-rioblocks.json";

  // Verificar se o arquivo existe
  if (!fs.existsSync(configPath)) {
    console.error("❌ Arquivo de configuração não encontrado em analytics/config!");
    console.error("Por favor, crie o arquivo comfyui-config-rioblocks.json na pasta analytics/config");
    process.exit(1);
  }

  console.log(`📄 Usando configuração: ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // ✅ SELECIONE O WORKFLOW AQUI! Edite o nome do arquivo conforme necessário:
  // Os workflows agora estão na pasta analytics/workflows
  // const workflowFileName = "bottle-example.json";
  // const workflowFileName = "example-txt2img-workflow.json";
  const workflowFileName = "akaito_anime_fast.json";
  const workflowPath = `../workflows/${workflowFileName}`;

  // Verificar se o arquivo de workflow existe
  if (!fs.existsSync(workflowPath)) {
    console.error(`❌ Arquivo de workflow não encontrado: ${workflowPath}`);
    console.error(`Por favor, verifique se o arquivo ${workflowFileName} existe na pasta analytics/workflows`);
    process.exit(1);
  }

  // Indicar o workflow selecionado
  console.log(`⚙️ Workflow selecionado: ${workflowFileName}`);

  // Carregar workflow
  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(workflowPath, "utf-8"));
    console.log(`✅ Workflow carregado com sucesso`);

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
  } catch (error) {
    console.error(`❌ Erro ao carregar workflow: ${error}`);
    process.exit(1);
  }

  // Criar pool de APIs
  const apis = config.hosts
    .filter((h: any) => h.enabled)
    .map((host: any) => new ComfyApi(host.url, `pool-${host.name}`));

  const pool = new ComfyPool(apis, EQueueMode.PICK_LOWEST);

  // Analytics collector
  const analytics: GenerationAnalytics[] = [];

  // Usar o workflow carregado para construir o PromptBuilder
  const Txt2ImgPrompt = new PromptBuilder(
    workflow,
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
      // Extrair parâmetros diretamente do workflow
      const checkpointFromWorkflow = workflow["4"]?.inputs?.ckpt_name;
      const stepsFromWorkflow = workflow["3"]?.inputs?.steps || 20;
      const cfgFromWorkflow = workflow["3"]?.inputs?.cfg || 7;
      const widthFromWorkflow = workflow["5"]?.inputs?.width || 512;
      const heightFromWorkflow = workflow["5"]?.inputs?.height || 512;
      const batchFromWorkflow = workflow["5"]?.inputs?.batch_size || 1;
      const samplerFromWorkflow = workflow["3"]?.inputs?.sampler_name;
      const schedulerFromWorkflow = workflow["3"]?.inputs?.scheduler;
      const positiveFromWorkflow = workflow["6"]?.inputs?.text;
      const negativeFromWorkflow = workflow["7"]?.inputs?.text;

      console.log(`🔄 Parâmetros do workflow:`);
      console.log(`   - Checkpoint: ${checkpointFromWorkflow}`);
      console.log(`   - Steps: ${stepsFromWorkflow}`);
      console.log(`   - CFG: ${cfgFromWorkflow}`);
      console.log(`   - Sampler: ${samplerFromWorkflow}`);
      console.log(`   - Scheduler: ${schedulerFromWorkflow}`);

      try {
        // Construir o workflow
        let promptBuilder = Txt2ImgPrompt.input("checkpoint", checkpointFromWorkflow, api.osType)
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

        // Preparar para capturar erros
        const wrapper = new CallWrapper(api, promptBuilder)
          .onPending(() => {
            analytic.status = "pending";
            console.log(`📋 ${analytic.host}: Job ${jobId} pendente`);
          })
          .onStart(() => {
            analytic.status = "running";
            console.log(`🚀 ${analytic.host}: Job ${jobId} iniciado`);
          })
          .onProgress((info) => {
            analytic.progressUpdates++;
            console.log(`⚡ ${analytic.host}: Progresso ${info.value}/${info.max}`);
          })
          .onFinished((data) => {
            analytic.status = "completed";
            analytic.endTime = new Date();
            analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();
            analytic.images = data.images?.images.map((img: any) => api.getPathImage(img));

            console.log(`✅ ${analytic.host}: Job ${jobId} completado em ${analytic.duration}ms`);
            resolve(analytic.images || []);
          })
          .onFailed((error) => {
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
            console.log(`❌ ${analytic.host}: Job ${jobId} falhou - ${errorDetail}`);
            reject(error);
          });

        // Executar o workflow
        console.log(`🚀 Enviando workflow para execução em ${api.apiHost}...`);
        wrapper.run();
      } catch (error) {
        console.error(`❌ Erro ao construir ou executar workflow: ${error.message}`);
        analytic.status = "failed";
        analytic.error = `Erro de construção do workflow: ${error.message}`;
        analytic.endTime = new Date();
        analytic.duration = analytic.endTime.getTime() - analytic.startTime.getTime();
        reject(error);
      }
    });
  };

  // Inicializar APIs
  console.log(`Inicializando ${apis.length} hosts...`);
  for (const api of apis) {
    try {
      const initTimeout = 30000; // 30 segundos
      await Promise.race([
        api.init(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ao inicializar API após ${initTimeout}ms`)), initTimeout)
        )
      ]);
    } catch (error) {
      console.error(`⚠️ Erro ao inicializar host ${api.apiHost}: ${error.message}`);
    }
  }

  // Filtrar apenas APIs que foram inicializadas com sucesso
  const readyApis = apis.filter((api) => api.isReady);
  console.log(`✅ Pool inicializada com ${readyApis.length}/${apis.length} hosts prontos\n`);

  if (readyApis.length === 0) {
    console.error("❌ Nenhum host disponível. Abortando teste.");
    process.exit(1);
  }

  // Executar jobs
  const numberOfJobs = 6;
  const jobs = Array(numberOfJobs).fill(generateWithAnalytics);

  console.log(`📦 Enviando ${numberOfJobs} jobs para a pool...\n`);

  const startTime = Date.now();

  try {
    const results = await pool.batch(jobs, 1);
    const endTime = Date.now();

    // Gerar relatório
    const report = {
      testDate: new Date().toISOString(),
      workflowUsed: workflowFileName,
      totalDuration: endTime - startTime,
      totalJobs: numberOfJobs,
      successfulJobs: analytics.filter((a) => a.status === "completed").length,
      failedJobs: analytics.filter((a) => a.status === "failed").length,
      averageJobDuration:
        analytics.filter((a) => a.duration).reduce((acc, a) => acc + (a.duration || 0), 0) /
          analytics.filter((a) => a.duration).length || 0,
      hostPerformance: generateHostPerformance(analytics),
      jobs: analytics
    };

    // Garantir que o diretório exista
    const dataDir = "../data";
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(`${dataDir}/analytics-generation.json`, JSON.stringify(report, null, 2));
    console.log(`\n📊 Analytics salvo em ${dataDir}/analytics-generation.json`);

    // Resumo
    console.log("\n📈 Resumo:");
    console.log(`   Workflow: ${workflowFileName}`);
    console.log(`   Duração Total: ${report.totalDuration}ms`);
    console.log(`   Taxa de Sucesso: ${((report.successfulJobs / report.totalJobs) * 100).toFixed(1)}%`);
    console.log(`   Duração Média por Job: ${report.averageJobDuration.toFixed(0)}ms`);
  } catch (error) {
    console.error("Teste falhou:", error);
  }

  // Limpar recursos
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
    console.time("Tempo total de execução");
    await runGenerationTest();
    console.timeEnd("Tempo total de execução");

    // Força a limpeza de qualquer conexão websocket ou recurso pendente
    console.log("\n🧹 Limpando recursos...");

    // Espera um pequeno tempo para logs finais
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Forçar finalização do processo
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  }
}

// Adiciona um timeout global para garantir que o processo não fique preso
const GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutos
const timeout = setTimeout(() => {
  console.error("\n⚠️ Script atingiu timeout após", GLOBAL_TIMEOUT / 1000, "segundos");
  process.exit(1);
}, GLOBAL_TIMEOUT);

// Limpar o timeout se o processo terminar normalmente
timeout.unref();

main();
