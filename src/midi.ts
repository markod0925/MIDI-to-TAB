import { readFileSync } from "node:fs";
import ToneMidi from "@tonejs/midi";
import type { MidiSong, MidiTrack, TimeSignatureEvent } from "./types";

const { Midi } = ToneMidi;

function safeTicksToSeconds(midi: InstanceType<typeof Midi>, ticks: number): number {
  const seconds = midi.header.ticksToSeconds(ticks);
  return Number.isFinite(seconds) ? seconds : 0;
}

export function midiFromArrayBuffer(arrayBuffer: ArrayBuffer): MidiSong {
  const midi = new Midi(arrayBuffer);

  const tracks: MidiTrack[] = midi.tracks.map((track) => ({
    isDrum: track.instrument.percussion || track.channel === 9,
    notes: track.notes.map((note) => ({
      pitch: note.midi,
      velocity: Math.round(note.velocity * 127),
      startTicks: note.ticks,
      endTicks: note.ticks + note.durationTicks,
      startTime: note.time,
      endTime: note.time + note.duration,
    })),
  }));

  const timeSignatures: TimeSignatureEvent[] = midi.header.timeSignatures
    .map((sig) => ({
      numerator: sig.timeSignature[0],
      denominator: sig.timeSignature[1],
      ticks: sig.ticks,
      time: safeTicksToSeconds(midi, sig.ticks),
    }))
    .sort((a, b) => a.ticks - b.ticks);

  const endTicks = Math.max(
    midi.durationTicks,
    ...tracks.flatMap((track) => track.notes.map((note) => note.endTicks)),
    0,
  );

  return {
    ppq: midi.header.ppq,
    tracks,
    timeSignatures,
    endTicks,
    ticksToSeconds: (ticks: number) => safeTicksToSeconds(midi, ticks),
  };
}

export function midiFromFile(path: string): MidiSong {
  const data = readFileSync(path);
  const offset = data.byteOffset;
  const bytes = data.byteLength;
  const buffer = data.buffer.slice(offset, offset + bytes);
  return midiFromArrayBuffer(buffer);
}
