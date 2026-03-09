import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { convertMidiFileToTab } from "../dist/index.js";

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) {
    return { ok: false, output: String(result.error) };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    };
  }

  return { ok: true, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

function diffLines(a, b) {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const max = Math.max(aLines.length, bLines.length);

  for (let i = 0; i < max; i++) {
    if ((aLines[i] ?? "") !== (bLines[i] ?? "")) {
      return `line ${i + 1}\npython: ${aLines[i] ?? "<missing>"}\njs:     ${bLines[i] ?? "<missing>"}`;
    }
  }

  return "exact match";
}

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");

function detectPythonCommand() {
  if (process.env.PYTHON) {
    return process.env.PYTHON;
  }

  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }

  return "python3";
}

const pythonCmd = detectPythonCommand();

const midiDir = resolve("examples/midi");
const outRoot = resolve("comparison-output");
const pyOutDir = resolve(outRoot, "python");
const jsOutDir = resolve(outRoot, "js");
const summaryPath = resolve(outRoot, "summary.json");

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(pyOutDir, { recursive: true });
mkdirSync(jsOutDir, { recursive: true });

const dependencyCheck = runCommand(pythonCmd, ["-c", "import pretty_midi, numpy"]);
if (!dependencyCheck.ok) {
  process.stderr.write(
    "Python dependencies missing. Install them with:\n" +
      `${pythonCmd} -m pip install -r python_original/requirements.txt\n` +
      `Details: ${dependencyCheck.output}\n`,
  );
  process.exit(2);
}

let midiFiles = readdirSync(midiDir)
  .filter((name) => name.toLowerCase().endsWith(".mid"))
  .sort((a, b) => a.localeCompare(b));

if (quick) {
  midiFiles = midiFiles.slice(0, 2);
}

const results = [];

for (const midiFile of midiFiles) {
  const midiPath = resolve(midiDir, midiFile);
  const pythonOutput = resolve(pyOutDir, midiFile.replace(/\.mid$/i, ".txt"));
  const jsOutput = resolve(jsOutDir, midiFile.replace(/\.mid$/i, ".txt"));

  const pyRun = runCommand(pythonCmd, [
    resolve("python_original/run_converter.py"),
    "--midi",
    midiPath,
    "--ascii",
    pythonOutput,
  ]);

  if (!pyRun.ok) {
    results.push({
      midi: midiFile,
      match: false,
      pythonOutput,
      jsOutput,
      details: `python conversion failed: ${pyRun.output}`,
    });
    continue;
  }

  try {
    const tab = convertMidiFileToTab(midiPath, { name: midiFile.replace(/\.mid$/i, "") });
    tab.writeAsciiFile(jsOutput);
  } catch (error) {
    results.push({
      midi: midiFile,
      match: false,
      pythonOutput,
      jsOutput,
      details: `js conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    continue;
  }

  const pyText = readFileSync(pythonOutput, "utf8");
  const jsText = readFileSync(jsOutput, "utf8");
  const match = pyText === jsText;

  results.push({
    midi: midiFile,
    match,
    pythonOutput,
    jsOutput,
    details: match ? "exact match" : diffLines(pyText, jsText),
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  matches: results.filter((r) => r.match).length,
  mismatches: results.filter((r) => !r.match).length,
  results,
};

writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

for (const result of results) {
  process.stdout.write(`${result.match ? "PASS" : "FAIL"} ${result.midi} - ${result.details}\n`);
}

process.stdout.write(`\nSummary: ${summary.matches}/${summary.total} exact matches\n`);
process.stdout.write(`Report: ${summaryPath}\n`);

if (summary.mismatches > 0) {
  process.exit(1);
}
