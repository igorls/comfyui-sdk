/// <reference types="bun-types" />
import fs from "fs";
import { dependencies, peerDependencies } from "./package.json";

// Create build folder if not exist
if (!fs.existsSync("./build")) {
  fs.mkdirSync("./build");
}

const start = Date.now();

console.log("Building ESM bundle...");

(async () => {
  // Build ESM JavaScript bundle
  await Bun.build({
    entrypoints: ["./index.ts"],
    external: Object.keys(dependencies || {}).concat(Object.keys(peerDependencies || {})),
    format: "esm",
    minify: false, // Keep readable for debugging
    outdir: "./build",
    naming: "index.js",
    sourcemap: "external",
    target: "node"
  });

  console.log("ESM bundle completed!");

  // Copy TypeScript declaration files using tsc
  console.log("Generating TypeScript declarations...");

  const result = Bun.spawnSync({
    cmd: ["npx", "tsc", "--emitDeclarationOnly", "--outDir", "build"],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe"
  });

  if (result.exitCode !== 0) {
    console.error("TypeScript compilation failed:");
    console.log(result.stderr.toString());
    console.log(result.stdout.toString());
    process.exit(1);
  }

  console.log("TypeScript declarations generated!");
  console.log(`Build completed successfully in ${Date.now() - start}ms`);
})();
