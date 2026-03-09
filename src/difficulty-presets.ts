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
    soft: {
      allowNoteDrop: true,
      velocityThreshold: 35,
      minDurationTicks: 70,
      onsetMergeWindowTicks: 30,
      maxNotesPerEvent: 4,
      maxSubsetCandidates: 24,
      alpha: 0.7,
      beta: 1.1,
      dropPenalty: 0.25,
      fallbackStrategy: "greedy_drop",
      includeEventDiagnostics: true,
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
    soft: {
      allowNoteDrop: false,
      velocityThreshold: 0,
      minDurationTicks: 0,
      onsetMergeWindowTicks: 0,
      maxNotesPerEvent: 6,
      maxSubsetCandidates: 16,
      alpha: 0.5,
      beta: 1,
      dropPenalty: 0.4,
      fallbackStrategy: "none",
      includeEventDiagnostics: false,
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
    soft: {
      allowNoteDrop: false,
      velocityThreshold: 0,
      minDurationTicks: 0,
      onsetMergeWindowTicks: 0,
      maxNotesPerEvent: 6,
      maxSubsetCandidates: 10,
      alpha: 0.25,
      beta: 0.55,
      dropPenalty: 0.9,
      fallbackStrategy: "none",
      includeEventDiagnostics: false,
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
    soft: { ...preset.soft },
  };
}
