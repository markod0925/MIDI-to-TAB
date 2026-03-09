import { mkdirSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const t0 = process.hrtime.bigint();
  const result = spawnSync(command, args, { encoding: "utf8" });
  const t1 = process.hrtime.bigint();
  const elapsedMs = Number(t1 - t0) / 1e6;

  if (result.error) {
    return { ok: false, elapsedMs, error: String(result.error) };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      elapsedMs,
      error: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    };
  }

  return { ok: true, elapsedMs };
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    runs: sorted.length,
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    avgMs: Number((sum / sorted.length).toFixed(2)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
  };
}

function benchmarkScenario(name, command, argsFactory, runs) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const runRes = run(command, argsFactory(i));
    if (!runRes.ok) {
      throw new Error(`${name} failed at run ${i + 1}: ${runRes.error}`);
    }
    times.push(runRes.elapsedMs);
  }
  return {
    name,
    times: times.map((v) => Number(v.toFixed(2))),
    ...stats(times),
  };
}

function speedup(baseAvg, otherAvg) {
  return Number((baseAvg / otherAvg).toFixed(2));
}

function main() {
  const runs = Number(process.argv[2] ?? "5");
  const midiPath = resolve(process.argv[3] ?? "examples/midi/dirty_1min.mid");
  const outDir = resolve("comparison-output/runtime-benchmark");
  const python = process.env.PYTHON ?? ".venv/bin/python";

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // Warm-up build once
  const build = run("npm", ["run", "build"]);
  if (!build.ok) {
    throw new Error(`Build failed: ${build.error}`);
  }

  const legacy = benchmarkScenario(
    "Legacy Python",
    python,
    (i) => [
      resolve("python_original/run_converter.py"),
      "--midi",
      midiPath,
      "--ascii",
      resolve(outDir, `legacy_${i}.txt`),
    ],
    runs,
  );

  const nodeMedium = benchmarkScenario(
    "Node Medium",
    "node",
    (i) => [
      "-e",
      `import('./dist/index.js').then(m=>{const tab=m.convertMidiFileToTab(${JSON.stringify(midiPath)},{name:'bench_medium_${i}',difficulty:'medium'}); tab.writeAsciiFile(${JSON.stringify(resolve(outDir, `node_medium_${i}.txt`))});}).catch(e=>{console.error(e);process.exit(1);});`,
    ],
    runs,
  );

  const nodeEasy = benchmarkScenario(
    "Node Easy Soft",
    "node",
    (i) => [
      "-e",
      `import('./dist/index.js').then(m=>{const tab=m.convertMidiFileToTab(${JSON.stringify(midiPath)},{name:'bench_easy_${i}',difficulty:'easy'}); tab.writeAsciiFile(${JSON.stringify(resolve(outDir, `node_easy_${i}.txt`))});}).catch(e=>{console.error(e);process.exit(1);});`,
    ],
    runs,
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    midiPath,
    runs,
    scenarios: [legacy, nodeMedium, nodeEasy],
    relative: {
      nodeMediumVsLegacy: speedup(legacy.avgMs, nodeMedium.avgMs),
      nodeEasyVsLegacy: speedup(legacy.avgMs, nodeEasy.avgMs),
      nodeEasyVsMedium: speedup(nodeMedium.avgMs, nodeEasy.avgMs),
    },
  };

  const reportPath = resolve(outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");

  for (const scenario of summary.scenarios) {
    process.stdout.write(`${scenario.name}\n`);
    process.stdout.write(`  runs: ${scenario.runs}\n`);
    process.stdout.write(`  min/avg/median/max ms: ${scenario.minMs} / ${scenario.avgMs} / ${scenario.medianMs} / ${scenario.maxMs}\n`);
  }

  process.stdout.write(`\nSpeedup (x)\n`);
  process.stdout.write(`  Node Medium vs Legacy: ${summary.relative.nodeMediumVsLegacy}x\n`);
  process.stdout.write(`  Node Easy Soft vs Legacy: ${summary.relative.nodeEasyVsLegacy}x\n`);
  process.stdout.write(`  Node Easy Soft vs Node Medium: ${summary.relative.nodeEasyVsMedium}x\n`);
  process.stdout.write(`\nReport: ${reportPath}\n`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
