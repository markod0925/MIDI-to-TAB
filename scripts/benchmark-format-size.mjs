import assert from "node:assert/strict";
import { basename, extname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  convertMidiFileToTabsByDifficulty,
  decodeGhTabBinary,
  encodeGhTabFromTab,
  encodeGhTabFromTabs,
} from "../dist/index.js";

function utf8Bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

function gzipBytes(data) {
  if (typeof data === "string") {
    return gzipSync(Buffer.from(data, "utf8")).byteLength;
  }
  return gzipSync(Buffer.from(data)).byteLength;
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString("en-US")} B`;
}

function ratio(base, current) {
  if (base <= 0) {
    return "n/a";
  }
  return `${((current / base) * 100).toFixed(1)}%`;
}

function buildJsonBundle(tabsByDifficulty) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      layers: {
        easy: tabsByDifficulty.easy.tab,
        medium: tabsByDifficulty.medium.tab,
        hard: tabsByDifficulty.hard.tab,
      },
    },
    null,
    0,
  );
}

function main() {
  const midiArg = process.argv[2] || "./examples/midi/09_with_drums.mid";
  const midiPath = resolve(midiArg);
  const baseName = basename(midiPath, extname(midiPath));

  const tabsByDifficulty = convertMidiFileToTabsByDifficulty(midiPath, { name: baseName });
  const tabs = [tabsByDifficulty.easy, tabsByDifficulty.medium, tabsByDifficulty.hard];

  const mediumJson = tabsByDifficulty.medium.toJsonString(false);
  const mediumBin = encodeGhTabFromTab(tabsByDifficulty.medium, {
    title: baseName,
    sourceName: basename(midiPath),
  });

  const allJson = buildJsonBundle(tabsByDifficulty);
  const allBin = encodeGhTabFromTabs(tabs, {
    title: baseName,
    sourceName: basename(midiPath),
  });

  const decoded = decodeGhTabBinary(allBin);
  assert.equal(decoded.layers.length, 3, "Decoded binary must contain 3 difficulty layers.");

  const rows = [
    {
      label: "JSON (medium only)",
      raw: utf8Bytes(mediumJson),
      gzip: gzipBytes(mediumJson),
    },
    {
      label: "BIN  (medium only)",
      raw: mediumBin.byteLength,
      gzip: gzipBytes(mediumBin),
      ratioRaw: ratio(utf8Bytes(mediumJson), mediumBin.byteLength),
      ratioGzip: ratio(gzipBytes(mediumJson), gzipBytes(mediumBin)),
    },
    {
      label: "JSON (easy+medium+hard)",
      raw: utf8Bytes(allJson),
      gzip: gzipBytes(allJson),
    },
    {
      label: "BIN  (easy+medium+hard)",
      raw: allBin.byteLength,
      gzip: gzipBytes(allBin),
      ratioRaw: ratio(utf8Bytes(allJson), allBin.byteLength),
      ratioGzip: ratio(gzipBytes(allJson), gzipBytes(allBin)),
    },
  ];

  process.stdout.write(`Format size benchmark for ${midiPath}\n`);
  process.stdout.write("------------------------------------------------------------\n");
  process.stdout.write("Payload                      | Raw           | Gzip          | Ratio vs JSON\n");
  process.stdout.write("------------------------------------------------------------\n");
  for (const row of rows) {
    const ratioText =
      row.ratioRaw && row.ratioGzip
        ? `${row.ratioRaw} raw / ${row.ratioGzip} gzip`
        : "-";
    process.stdout.write(
      `${row.label.padEnd(28)} | ${formatBytes(row.raw).padEnd(13)} | ${formatBytes(
        row.gzip,
      ).padEnd(13)} | ${ratioText}\n`,
    );
  }
}

main();
