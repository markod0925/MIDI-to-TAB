export interface MidiNoteEvent {
  pitch: number;
  velocity: number;
  startTicks: number;
  endTicks: number;
  startTime: number;
  endTime: number;
}

export interface MidiTrack {
  isDrum: boolean;
  notes: MidiNoteEvent[];
}

export interface TimeSignatureEvent {
  numerator: number;
  denominator: number;
  ticks: number;
  time: number;
}

export interface MidiSong {
  ppq: number;
  tracks: MidiTrack[];
  timeSignatures: TimeSignatureEvent[];
  endTicks: number;
  ticksToSeconds: (ticks: number) => number;
}

export interface TabNote {
  degree: string;
  octave: string;
  string: number;
  fret: number;
}

export interface TabEvent {
  time: number;
  time_ticks: number;
  measure_timing: number;
  time_signature_change?: [number, number];
  notes?: TabNote[];
}

export interface TabMeasure {
  events: TabEvent[];
}

export interface TabJson {
  tuning: number[];
  measures: TabMeasure[];
}

export interface TabWeights {
  b: number;
  height: number;
  length: number;
  n_changed_strings: number;
}

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface FretboardConstraints {
  maxFretSpan: number;
  maxReachFret: number;
}

export interface DifficultyPreset {
  level: DifficultyLevel;
  weights: TabWeights;
  fretboard: FretboardConstraints;
}

export interface TimelineEventData {
  notes?: MidiNoteEvent[];
  time_signature?: TimeSignatureEvent;
}
