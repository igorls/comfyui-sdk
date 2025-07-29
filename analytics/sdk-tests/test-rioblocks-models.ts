import { ComfyApi } from "../../src/client";
import * as fs from "fs";

interface HostConfig {
  name: string;
  url: string;
  priority: number;
  enabled: boolean;
  timeout: number;
  maxConcurrentJobs: number;
  tags: string[];
}

interface ComfyConfig {
  hosts: HostConfig[];
  workflows: any[];
  settings: any;
}

interface ModelAnalytics {
  host: string;
  url: string;
  status: "online" | "offline" | "error";
  responseTime?: number;
  models?: {
    checkpoints: string[];
    loras: string[];
    embeddings: string[];
    samplers: any;
  };
  error?: string;
  timestamp: Date;
}

async function testHostConnection(host: HostConfig): Promise<ModelAnalytics> {
  const startTime = Date.now();
  const analytics: ModelAnalytics = {
    host: host.name,
    url: host.url,
    status: "offline",
    timestamp: new Date()
  };

  try {
    const api = new ComfyApi(host.url, `test-client-${host.name}`);
    await api.init(3, host.timeout);

    analytics.responseTime = Date.now() - startTime;
    analytics.status = "online";

    // Coletar informações sobre modelos
    const [checkpoints, loras, embeddings, samplerInfo] = await Promise.all([
      api.getCheckpoints(),
      api.getLoras(),
      api.getEmbeddings(),
      api.getSamplerInfo()
    ]);

    analytics.models = {
      checkpoints,
      loras,
      embeddings,
      samplers: samplerInfo
    };

    return analytics;
  } catch (error) {
    analytics.status = "error";
    analytics.error = error instanceof Error ? error.message : String(error);
    analytics.responseTime = Date.now() - startTime;
    return analytics;
  }
}

async function main() {
  // Carregar configuração
  const configPath = "../../comfyui-config-rioblocks.json";
  const config: ComfyConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  console.log("🔍 ComfyUI SDK Test - Model Discovery");
  console.log("=====================================\n");

  const results: ModelAnalytics[] = [];

  // Testar cada host habilitado
  for (const host of config.hosts.filter((h) => h.enabled)) {
    console.log(`Testing ${host.name} (${host.url})...`);
    const result = await testHostConnection(host);
    results.push(result);

    if (result.status === "online") {
      console.log(`✅ ${host.name}: Online (${result.responseTime}ms)`);
      console.log(`   - Checkpoints (${result.models?.checkpoints.length}): `);
      if (result.models?.checkpoints.length) {
        // Limitar a exibição para não sobrecarregar o console
        const maxDisplay = 10;
        const checkpoints = result.models.checkpoints;

        // Exibir os primeiros checkpoints
        checkpoints.slice(0, maxDisplay).forEach((checkpoint) => {
          console.log(`     • ${checkpoint}`);
        });

        // Indicar se há mais checkpoints além dos exibidos
        if (checkpoints.length > maxDisplay) {
          console.log(`     • ... e mais ${checkpoints.length - maxDisplay} checkpoints`);
        }
      }
      console.log(`   - LoRAs: ${result.models?.loras.length}`);
      console.log(`   - Embeddings: ${result.models?.embeddings.length}`);

      // Exibir informações sobre samplers
      if (result.models?.samplers) {
        const samplerInfo = result.models.samplers;
        console.log(`   - Samplers (${samplerInfo.sampler ? samplerInfo.sampler.length : 0}):`);
        if (samplerInfo.sampler && samplerInfo.sampler.length > 0) {
          samplerInfo.sampler.slice(0, 8).forEach((sampler) => {
            console.log(`     • ${sampler}`);
          });
          if (samplerInfo.sampler.length > 8) {
            console.log(`     • ... e mais ${samplerInfo.sampler.length - 8} samplers`);
          }
        }

        console.log(`   - Schedulers (${samplerInfo.scheduler ? samplerInfo.scheduler.length : 0}):`);
        if (samplerInfo.scheduler && samplerInfo.scheduler.length > 0) {
          samplerInfo.scheduler.forEach((scheduler) => {
            console.log(`     • ${scheduler}`);
          });
        }
      }
    } else {
      console.log(`❌ ${host.name}: ${result.status} - ${result.error}`);
    }
    console.log("");
  }

  // Salvar relatório analítico
  const report = {
    testDate: new Date().toISOString(),
    totalHosts: config.hosts.length,
    enabledHosts: config.hosts.filter((h) => h.enabled).length,
    onlineHosts: results.filter((r) => r.status === "online").length,
    results,
    commonModels: findCommonModels(results)
  };

  // Garantir que o diretório exista
  fs.mkdirSync("./analytics/data", { recursive: true });
  fs.writeFileSync("../data/analytics-models.json", JSON.stringify(report, null, 2));
  console.log("\n📊 Analytics saved to ../data/analytics-models.json");

  // Exibir modelos comuns entre os hosts online
  if (report.onlineHosts > 1) {
    const commonModels = report.commonModels;

    console.log("\n🔄 Modelos comuns entre todos os hosts:");

    console.log(`\n   Checkpoints comuns (${commonModels.checkpoints.length}):`);
    if (commonModels.checkpoints.length > 0) {
      commonModels.checkpoints.slice(0, 15).forEach((model) => {
        console.log(`   • ${model}`);
      });
      if (commonModels.checkpoints.length > 15) {
        console.log(`   • ... e mais ${commonModels.checkpoints.length - 15} checkpoints`);
      }
    } else {
      console.log("   Nenhum checkpoint comum encontrado entre os hosts.");
    }

    console.log(`\n   LoRAs comuns (${commonModels.loras.length}):`);
    if (commonModels.loras.length > 0 && commonModels.loras.length <= 15) {
      commonModels.loras.forEach((lora) => {
        console.log(`   • ${lora}`);
      });
    } else if (commonModels.loras.length > 15) {
      console.log(
        `   • Encontrados ${commonModels.loras.length} LoRAs comuns (detalhes no arquivo analytics-models.json)`
      );
    } else {
      console.log("   Nenhuma LoRA comum encontrada entre os hosts.");
    }

    console.log(`\n   Samplers comuns (${commonModels.samplers?.length || 0}):`);
    if (commonModels.samplers && commonModels.samplers.length > 0) {
      commonModels.samplers.forEach((sampler) => {
        console.log(`   • ${sampler}`);
      });
    } else {
      console.log("   Nenhum sampler comum encontrado entre os hosts.");
    }

    console.log(`\n   Schedulers comuns (${commonModels.schedulers?.length || 0}):`);
    if (commonModels.schedulers && commonModels.schedulers.length > 0) {
      commonModels.schedulers.forEach((scheduler) => {
        console.log(`   • ${scheduler}`);
      });
    } else {
      console.log("   Nenhum scheduler comum encontrado entre os hosts.");
    }
  }
}

function findCommonModels(results: ModelAnalytics[]) {
  const onlineHosts = results.filter((r) => r.status === "online" && r.models);
  if (onlineHosts.length === 0)
    return {
      checkpoints: [],
      loras: [],
      embeddings: [],
      samplers: [],
      schedulers: []
    };

  const allCheckpoints = onlineHosts.map((h) => h.models?.checkpoints || []);
  const allLoras = onlineHosts.map((h) => h.models?.loras || []);
  const allEmbeddings = onlineHosts.map((h) => h.models?.embeddings || []);

  // Extrair samplers e schedulers disponíveis
  const allSamplers = onlineHosts.map((h) => h.models?.samplers?.sampler || []);
  const allSchedulers = onlineHosts.map((h) => h.models?.samplers?.scheduler || []);

  return {
    checkpoints: findIntersection(allCheckpoints),
    loras: findIntersection(allLoras),
    embeddings: findIntersection(allEmbeddings),
    samplers: findIntersection(allSamplers),
    schedulers: findIntersection(allSchedulers)
  };
}

function findIntersection(arrays: string[][]): string[] {
  if (arrays.length === 0) return [];
  return arrays.reduce((acc, curr) => acc.filter((x) => curr.includes(x)));
}

main().catch(console.error);
