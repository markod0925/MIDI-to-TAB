import type { DifficultyLevel, DifficultyPreset } from "./types";

export const DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyPreset> = {
  easy: {
    level: "easy",
    weights: {
      b: 0.7,
      height: 2.2,
      length: 2.5,
      n_changed_strings: 1.8,
    },
    fretboard: {
      maxFretSpan: 4,
      maxReachFret: 12,
    },
  },
  medium: {
    level: "medium",
    weights: {
      b: 1,
      height: 1,
      length: 1,
      n_changed_strings: 1,
    },
    fretboard: {
      maxFretSpan: 5,
      maxReachFret: 20,
    },
  },
  hard: {
    level: "hard",
    weights: {
      b: 1.6,
      height: 0.65,
      length: 0.7,
      n_changed_strings: 0.75,
    },
    fretboard: {
      maxFretSpan: 6,
      maxReachFret: 20,
    },
  },
};

export const DIFFICULTY_LEVELS: DifficultyLevel[] = ["easy", "medium", "hard"];

export function getDifficultyPreset(level: DifficultyLevel = "medium"): DifficultyPreset {
  const preset = DIFFICULTY_PRESETS[level];
  return {
    level: preset.level,
    weights: { ...preset.weights },
    fretboard: { ...preset.fretboard },
  };
}
