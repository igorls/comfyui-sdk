import { spawn } from "child_process";
import * as fs from "fs";
import path from "path";

interface TestResult {
  name: string;
  success: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  output: string;
}

async function runScript(scriptName: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log(`\n\n========================================================`);
    console.log(`🚀 Starting ${scriptName}...`);
    console.log(`========================================================\n`);

    const scriptPath = path.join(__dirname, scriptName);

    // Verificar se o bun está disponível
    const useBun =
      fs.existsSync("/usr/local/bin/bun") ||
      fs.existsSync("/usr/bin/bun") ||
      fs.existsSync(path.join(process.env.HOME || "", ".bun/bin/bun"));

    const child = spawn(useBun ? "bun" : "npx", useBun ? ["run", scriptPath] : ["tsx", scriptPath], {
      stdio: ["inherit", "pipe", "pipe"]
    });

    let output = "";
    let error = "";

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      error += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const endTime = Date.now();
      const success = code === 0;

      console.log(`\n========================================================`);
      console.log(
        `${success ? "✅ Completed" : "❌ Failed"} ${scriptName} in ${((endTime - startTime) / 1000).toFixed(2)}s`
      );
      console.log(`========================================================\n`);

      resolve({
        name: scriptName,
        success,
        startTime,
        endTime,
        duration: endTime - startTime,
        output: output + error
      });
    });
  });
}

async function main() {
  console.log("🔬 RioBlocks ComfyUI SDK Test Suite");
  console.log("=====================================\n");

  const startTime = Date.now();
  const results: TestResult[] = [];

  // 1. Testar descoberta de modelos
  results.push(await runScript("test-rioblocks-models.ts"));

  // 2. Testar geração de imagens
  results.push(await runScript("test-rioblocks-generation.ts"));

  // 3. Testar monitoramento (versão curta)
  results.push(await runScript("test-rioblocks-monitor.ts"));

  const endTime = Date.now();
  const totalDuration = endTime - startTime;

  // Relatório final
  console.log("\n📊 Test Suite Summary");
  console.log("=====================================");
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);

  results.forEach((result) => {
    console.log(`${result.success ? "✅" : "❌"} ${result.name}: ${(result.duration / 1000).toFixed(2)}s`);
  });

  // Salvar relatório
  const report = {
    testSuite: "RioBlocks ComfyUI SDK",
    timestamp: new Date().toISOString(),
    totalDuration,
    tests: results.map((r) => ({
      name: r.name,
      success: r.success,
      duration: r.duration
    })),
    analytics: {
      models: fs.existsSync("./analytics/data/analytics-models.json")
        ? JSON.parse(fs.readFileSync("../data/analytics-models.json", "utf-8"))
        : null,
      generation: fs.existsSync("../data/analytics-generation.json")
        ? JSON.parse(fs.readFileSync("../data/analytics-generation.json", "utf-8"))
        : null,
      monitoring: fs.existsSync("../data/analytics-monitoring.json")
        ? JSON.parse(fs.readFileSync("../data/analytics-monitoring.json", "utf-8"))
        : null
    }
  };

  // Garantir que o diretório exista
  fs.mkdirSync("../data", { recursive: true });
  fs.writeFileSync("../data/analytics-summary.json", JSON.stringify(report, null, 2));
  console.log("\n📊 Summary report saved to ../data/analytics-summary.json");

  // Informar sobre o relatório HTML
  console.log("\n📋 Para visualizar o relatório completo, execute o script view-report.sh ou serve-report.sh");
}

main().catch(console.error);
