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

async function runScript(scriptName: string, timeoutMs: number = 180000): Promise<TestResult> {
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

    // Implementar timeout para o processo
    const timeoutId = setTimeout(() => {
      console.error(`\n⚠️ Timeout exceeded (${timeoutMs / 1000}s) for ${scriptName}`);
      child.kill("SIGTERM");

      // Esperar um pouco e forçar o encerramento se necessário
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 3000);
    }, timeoutMs);

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
      // Limpar o timeout quando o processo terminar
      clearTimeout(timeoutId);

      const endTime = Date.now();
      const success = code === 0;

      const wasTimeout = endTime - startTime >= timeoutMs;
      const statusText = wasTimeout ? "⏱️ Timed out" : success ? "✅ Completed" : "❌ Failed";

      console.log(`\n========================================================`);
      console.log(`${statusText} ${scriptName} in ${((endTime - startTime) / 1000).toFixed(2)}s`);
      console.log(`========================================================\n`);

      resolve({
        name: scriptName,
        success: success && !wasTimeout,
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

  // 1. Testar descoberta de modelos (2 minutos de timeout)
  results.push(await runScript("test-rioblocks-models.ts", 120000));

  // 2. Testar geração de imagens (5 minutos de timeout - geração pode demorar)
  results.push(await runScript("test-rioblocks-generation.ts", 300000));

  // 3. Testar monitoramento (1 minuto de timeout)
  results.push(await runScript("test-rioblocks-monitor.ts", 60000));

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
      models: fs.existsSync("../data/analytics-models.json")
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

  // Forçar encerramento após tempo suficiente para finalizar I/O
  setTimeout(() => {
    console.log("\n👋 Encerrando processo...");
    process.exit(0);
  }, 1000);
}

// Garantir que o processo não fique preso
main().catch((error) => {
  console.error("❌ Erro na execução da suite de testes:", error);
  process.exit(1);
});

// Timeout de segurança global (15 minutos)
setTimeout(
  () => {
    console.error("\n⚠️ Timeout global da suite de testes atingido (15 minutos)");
    process.exit(1);
  },
  15 * 60 * 1000
);
