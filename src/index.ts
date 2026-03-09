import { basename, extname } from "node:path";
import { DIFFICULTY_LEVELS } from "./difficulty-presets";
import { midiFromArrayBuffer, midiFromFile } from "./midi";
import { Tab, type TabOptions } from "./tab";
import { Tuning } from "./theory";
import type { DifficultyLevel } from "./types";

export * from "./difficulty";
export * from "./difficulty-presets";
export * from "./fretboard";
export * from "./graph-utils";
export * from "./midi";
export * from "./midi-utils";
export * from "./tab";
export * from "./theory";
export * from "./types";

export interface ConvertOptions extends TabOptions {
  tuning?: Tuning;
  name?: string;
}

export interface DifficultyBatchOptions {
  tuning?: Tuning;
  outputDir?: string;
  name?: string;
}

export function convertMidiFileToTab(filePath: string, options: ConvertOptions = {}): Tab {
  const midi = midiFromFile(filePath);
  const name = options.name ?? basename(filePath, extname(filePath));
  const tuning = options.tuning ?? new Tuning();
  return new Tab(name, tuning, midi, options);
}

export function convertMidiArrayBufferToTab(
  midiArrayBuffer: ArrayBuffer,
  options: ConvertOptions = {},
): Tab {
  const midi = midiFromArrayBuffer(midiArrayBuffer);
  const tuning = options.tuning ?? new Tuning();
  const name = options.name ?? "midi_to_tab";
  return new Tab(name, tuning, midi, options);
}

export function convertMidiFileToTabsByDifficulty(
  filePath: string,
  options: DifficultyBatchOptions = {},
): Record<DifficultyLevel, Tab> {
  const midi = midiFromFile(filePath);
  const baseName = options.name ?? basename(filePath, extname(filePath));
  const tuning = options.tuning ?? new Tuning();

  return {
    easy: new Tab(`${baseName}_easy`, tuning, midi, {
      difficulty: "easy",
      outputDir: options.outputDir,
    }),
    medium: new Tab(`${baseName}_medium`, tuning, midi, {
      difficulty: "medium",
      outputDir: options.outputDir,
    }),
    hard: new Tab(`${baseName}_hard`, tuning, midi, {
      difficulty: "hard",
      outputDir: options.outputDir,
    }),
  };
}

export function convertMidiArrayBufferToTabsByDifficulty(
  midiArrayBuffer: ArrayBuffer,
  options: DifficultyBatchOptions = {},
): Record<DifficultyLevel, Tab> {
  const midi = midiFromArrayBuffer(midiArrayBuffer);
  const baseName = options.name ?? "midi_to_tab";
  const tuning = options.tuning ?? new Tuning();
  const tabs = {} as Record<DifficultyLevel, Tab>;

  for (const level of DIFFICULTY_LEVELS) {
    tabs[level] = new Tab(`${baseName}_${level}`, tuning, midi, {
      difficulty: level,
      outputDir: options.outputDir,
    });
  }

  return tabs;
}
