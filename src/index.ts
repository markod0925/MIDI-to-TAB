import { basename, extname } from "node:path";
import { midiFromArrayBuffer, midiFromFile } from "./midi";
import { Tab, type TabOptions } from "./tab";
import { Tuning } from "./theory";

export * from "./difficulty";
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
