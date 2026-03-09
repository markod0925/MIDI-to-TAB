import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { convertMidiFileToTab, midiFromFile } from "../dist/index.js";

const PRESETS = [
  { label: "Easy", level: "easy" },
  { label: "Normal", level: "medium" },
  { label: "Hard", level: "hard" },
];

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) {
    return { ok: false, output: String(result.error) };
  }
  if (result.status !== 0) {
    return { ok: false, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
  }
  return { ok: true, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

function firstDifference(a, b) {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    if ((aLines[i] ?? "") !== (bLines[i] ?? "")) {
      return {
        line: i + 1,
        legacy: aLines[i] ?? "<missing>",
        current: bLines[i] ?? "<missing>",
      };
    }
  }
  return null;
}

function preprocessStats(song, options) {
  const nonDrumNotes = song.tracks
    .filter((t) => !t.isDrum)
    .flatMap((t) => t.notes)
    .sort((a, b) => a.startTicks - b.startTicks);

  const rawNotes = nonDrumNotes.length;
  const rawEvents = new Set(nonDrumNotes.map((n) => n.startTicks)).size;

  const clusters = [];
  let current = [];
  let anchor = null;

  for (const note of nonDrumNotes) {
    if (anchor === null) {
      anchor = note.startTicks;
      current = [note];
      continue;
    }

    if (note.startTicks - anchor <= options.onsetMergeWindowTicks) {
      current.push(note);
    } else {
      clusters.push(current);
      anchor = note.startTicks;
      current = [note];
    }
  }
  if (current.length > 0) {
    clusters.push(current);
  }

  let aggregatedNotes = 0;
  let filteredNotes = 0;

  for (const cluster of clusters) {
    const byPitch = new Map();
    for (const note of cluster) {
      const curr = byPitch.get(note.pitch);
      if (!curr) {
        byPitch.set(note.pitch, {
          velocity: note.velocity,
          startTicks: note.startTicks,
          endTicks: note.endTicks,
        });
      } else {
        curr.velocity = Math.max(curr.velocity, note.velocity);
        curr.startTicks = Math.min(curr.startTicks, note.startTicks);
        curr.endTicks = Math.max(curr.endTicks, note.endTicks);
      }
    }

    const agg = [...byPitch.values()];
    aggregatedNotes += agg.length;

    const kept = agg.filter((n) => {
      const duration = n.endTicks - n.startTicks;
      return n.velocity >= options.velocityThreshold && duration >= options.minDurationTicks;
    });
    filteredNotes += kept.length;
  }

  return {
    rawNotes,
    rawEvents,
    clusteredEvents: clusters.length,
    mergedEvents: rawEvents - clusters.length,
    mergedNotes: rawNotes - aggregatedNotes,
    filteredOut: aggregatedNotes - filteredNotes,
    notesAfterPreFilter: filteredNotes,
  };
}

function tabStats(tab) {
  const events = tab.tab.measures.flatMap((m) => m.events);
  let droppedNotes = 0;
  let droppedWeight = 0;
  let withDiagnostics = 0;
  let outputNotes = 0;

  for (const event of events) {
    if (Array.isArray(event.notes)) {
      outputNotes += event.notes.length;
    }
    if (event.processing) {
      withDiagnostics += 1;
      droppedNotes += event.processing.droppedNotesCount;
      droppedWeight += event.processing.droppedWeight;
    }
  }

  return {
    outputNotes,
    droppedNotes,
    droppedWeight: Number(droppedWeight.toFixed(4)),
    eventsWithDiagnostics: withDiagnostics,
    totalEvents: events.length,
  };
}

function main() {
  const midiPath = resolve(process.argv[2] ?? "examples/midi/dirty_1min.mid");
  const outDir = resolve("comparison-output/dirty-benchmark");
  mkdirSync(outDir, { recursive: true });

  const song = midiFromFile(midiPath);

  const presetResults = [];

  for (const preset of PRESETS) {
    const startedAt = Date.now();
    const tab = convertMidiFileToTab(midiPath, {
      name: `dirty_1min_${preset.level}`,
      difficulty: preset.level,
      includeEventDiagnostics: true,
    });
    const elapsedMs = Date.now() - startedAt;

    const asciiPath = resolve(outDir, `dirty_1min_${preset.level}.txt`);
    const jsonPath = resolve(outDir, `dirty_1min_${preset.level}.json`);
    tab.writeAsciiFile(asciiPath);
    tab.writeJsonFile(jsonPath);

    const pre = preprocessStats(song, tab.softOptions);
    const out = tabStats(tab);

    presetResults.push({
      preset: preset.label,
      level: preset.level,
      softOptions: tab.softOptions,
      preprocess: pre,
      output: out,
      elapsedMs,
      asciiPath,
      jsonPath,
    });
  }

  const python = process.env.PYTHON ?? ".venv/bin/python";
  const legacyAscii = resolve(outDir, "dirty_1min_legacy.txt");
  const legacyJson = resolve(outDir, "dirty_1min_legacy.json");

  const pyRun = runCommand(python, [
    resolve("python_original/run_converter.py"),
    "--midi",
    midiPath,
    "--ascii",
    legacyAscii,
    "--json",
    legacyJson,
  ]);

  if (!pyRun.ok) {
    process.stderr.write(`Legacy conversion failed: ${pyRun.output}\n`);
    process.exit(2);
  }

  const legacyAsciiContent = readFileSync(legacyAscii, "utf8");
  const legacyJsonObj = JSON.parse(readFileSync(legacyJson, "utf8"));
  const legacyOutputNotes = legacyJsonObj.measures
    .flatMap((m) => m.events)
    .reduce((acc, e) => acc + ((e.notes && e.notes.length) || 0), 0);

  const ab = [];
  for (const result of presetResults) {
    const currentAscii = readFileSync(result.asciiPath, "utf8");
    const exactMatch = currentAscii === legacyAsciiContent;
    const diff = exactMatch ? null : firstDifference(legacyAsciiContent, currentAscii);
    ab.push({
      preset: result.preset,
      level: result.level,
      exactMatch,
      firstDiff: diff,
    });
  }

  const report = {
    midiPath,
    generatedAt: new Date().toISOString(),
    durationSeconds: Number(song.ticksToSeconds(song.endTicks).toFixed(3)),
    presets: presetResults,
    legacy: {
      asciiPath: legacyAscii,
      jsonPath: legacyJson,
      outputNotes: legacyOutputNotes,
    },
    ab,
  };

  const reportPath = resolve(outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  process.stdout.write(`Dirty MIDI: ${midiPath}\n`);
  process.stdout.write(`Legacy output notes: ${legacyOutputNotes}\n\n`);

  for (const result of presetResults) {
    process.stdout.write(`${result.preset} (${result.level})\n`);
    process.stdout.write(`  merged events: ${result.preprocess.mergedEvents}\n`);
    process.stdout.write(`  merged notes: ${result.preprocess.mergedNotes}\n`);
    process.stdout.write(`  filtered out: ${result.preprocess.filteredOut}\n`);
    process.stdout.write(`  dropped notes: ${result.output.droppedNotes}\n`);
    process.stdout.write(`  output notes: ${result.output.outputNotes}\n`);
    process.stdout.write(`  elapsed ms: ${result.elapsedMs}\n`);
  }

  process.stdout.write("\nA/B vs legacy\n");
  for (const row of ab) {
    if (row.exactMatch) {
      process.stdout.write(`  ${row.preset}: exact match\n`);
    } else {
      process.stdout.write(
        `  ${row.preset}: differs at line ${row.firstDiff.line}\n` +
          `    legacy: ${row.firstDiff.legacy}\n` +
          `    current: ${row.firstDiff.current}\n`,
      );
    }
  }

  process.stdout.write(`\nFull report: ${reportPath}\n`);
}

main();
