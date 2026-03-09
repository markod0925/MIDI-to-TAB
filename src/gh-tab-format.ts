import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import protobuf from "protobufjs";
import type { Tab } from "./tab";
import { Tuning } from "./theory";
import type { MidiSong, MidiTrack, TabEventProcessingDiagnostics } from "./types";

const { parse } = protobuf;

const GH_TAB_PROTO = String.raw`syntax = "proto3";
package guitarhelio.tab.v1;
option optimize_for = LITE_RUNTIME;
message GhTabFile {
  uint32 schema_version = 1;
  string toolchain_version = 2;
  SongInfo song = 3;
  Timeline timeline = 4;
  repeated MidiTrack tracks = 5;
  repeated DifficultyLayer layers = 6;
  bytes source_midi_sha256 = 7;
}
message SongInfo {
  string song_id = 1;
  string title = 2;
  string artist = 3;
  string source_name = 4;
}
message Timeline {
  uint32 ppq = 1;
  uint32 end_tick = 2;
  repeated TempoChange tempo_map = 3;
  repeated TimeSignatureChange time_signatures = 4;
  repeated Marker markers = 5;
}
message TempoChange {
  uint32 tick = 1;
  uint32 microseconds_per_quarter = 2;
}
message TimeSignatureChange {
  uint32 tick = 1;
  uint32 numerator = 2;
  uint32 denominator = 3;
}
message Marker {
  uint32 tick = 1;
  string name = 2;
}
message MidiTrack {
  uint32 track_id = 1;
  string name = 2;
  uint32 midi_channel = 3;
  uint32 midi_program = 4;
  bool is_drum = 5;
  TrackRole role = 6;
  repeated PackedNote notes = 7;
}
enum TrackRole {
  TRACK_ROLE_UNSPECIFIED = 0;
  TRACK_ROLE_LEAD = 1;
  TRACK_ROLE_RHYTHM = 2;
  TRACK_ROLE_BASS = 3;
  TRACK_ROLE_DRUMS = 4;
  TRACK_ROLE_OTHER = 5;
}
message PackedNote {
  uint32 delta_start_tick = 1;
  uint32 duration_tick = 2;
  uint32 pitch = 3;
  uint32 velocity = 4;
}
message DifficultyLayer {
  DifficultyLevel difficulty = 1;
  string tuning_name = 2;
  repeated sint32 tuning_midi = 3;
  repeated TabEvent events = 4;
}
enum DifficultyLevel {
  DIFFICULTY_UNSPECIFIED = 0;
  DIFFICULTY_EASY = 1;
  DIFFICULTY_MEDIUM = 2;
  DIFFICULTY_HARD = 3;
}
message TabEvent {
  uint32 delta_tick = 1;
  uint32 measure_index = 2;
  float measure_timing = 3;
  uint32 source_track_id = 4;
  repeated TabNote notes = 5;
  TabDiagnostics diagnostics = 6;
}
message TabNote {
  uint32 string_index = 1;
  uint32 fret = 2;
  uint32 pitch = 3;
  uint32 sustain_tick = 4;
  uint32 source_note_index = 5;
  NoteTechnique technique = 6;
}
enum NoteTechnique {
  NOTE_TECHNIQUE_NONE = 0;
  NOTE_TECHNIQUE_HAMMER_ON = 1;
  NOTE_TECHNIQUE_PULL_OFF = 2;
  NOTE_TECHNIQUE_SLIDE = 3;
  NOTE_TECHNIQUE_BEND = 4;
  NOTE_TECHNIQUE_PALM_MUTE = 5;
  NOTE_TECHNIQUE_DEAD_NOTE = 6;
}
message TabDiagnostics {
  repeated uint32 original_pitches = 1;
  repeated uint32 merged_pitches = 2;
  repeated uint32 kept_pitches = 3;
  repeated uint32 dropped_pitches = 4;
  uint32 dropped_notes_count = 5;
  float dropped_weight = 6;
  float drop_cost = 7;
  string selected_subset_id = 8;
  uint32 candidate_count = 9;
}
`;

const root = parse(GH_TAB_PROTO).root;
const GH_TAB_FILE_TYPE = root.lookupType("guitarhelio.tab.v1.GhTabFile");

const STANDARD_TUNING_PITCHES = new Tuning(Tuning.standardTuning).strings.map((note) => note.pitch);
const STANDARD_UKULELE_TUNING_PITCHES = new Tuning(Tuning.standardUkuleleTuning).strings.map(
  (note) => note.pitch,
);

const DIFFICULTY_TO_ENUM = {
  unspecified: 0,
  easy: 1,
  medium: 2,
  hard: 3,
} as const;

const TRACK_ROLE_TO_ENUM = {
  unspecified: 0,
  lead: 1,
  rhythm: 2,
  bass: 3,
  drums: 4,
  other: 5,
} as const;

const NOTE_TECHNIQUE_TO_ENUM = {
  none: 0,
  hammer_on: 1,
  pull_off: 2,
  slide: 3,
  bend: 4,
  palm_mute: 5,
  dead_note: 6,
} as const;

const ENUM_TO_DIFFICULTY: Record<number, GhTabDifficulty> = {
  0: "unspecified",
  1: "easy",
  2: "medium",
  3: "hard",
};

const ENUM_TO_TRACK_ROLE: Record<number, GhTrackRole> = {
  0: "unspecified",
  1: "lead",
  2: "rhythm",
  3: "bass",
  4: "drums",
  5: "other",
};

const ENUM_TO_NOTE_TECHNIQUE: Record<number, GhNoteTechnique> = {
  0: "none",
  1: "hammer_on",
  2: "pull_off",
  3: "slide",
  4: "bend",
  5: "palm_mute",
  6: "dead_note",
};

export type GhTabDifficulty = "unspecified" | "easy" | "medium" | "hard";
export type GhTrackRole = "unspecified" | "lead" | "rhythm" | "bass" | "drums" | "other";
export type GhNoteTechnique =
  | "none"
  | "hammer_on"
  | "pull_off"
  | "slide"
  | "bend"
  | "palm_mute"
  | "dead_note";

export interface GhSongInfo {
  songId?: string;
  title?: string;
  artist?: string;
  sourceName?: string;
}

export interface GhTempoChange {
  tick: number;
  microsecondsPerQuarter: number;
}

export interface GhTimeSignatureChange {
  tick: number;
  numerator: number;
  denominator: number;
}

export interface GhMarker {
  tick: number;
  name: string;
}

export interface GhTimeline {
  ppq: number;
  endTick: number;
  tempoMap: GhTempoChange[];
  timeSignatures: GhTimeSignatureChange[];
  markers: GhMarker[];
}

export interface GhTrackNote {
  startTick: number;
  durationTick: number;
  pitch: number;
  velocity: number;
}

export interface GhTrack {
  trackId: number;
  name?: string;
  midiChannel: number;
  midiProgram: number;
  isDrum: boolean;
  role: GhTrackRole;
  notes: GhTrackNote[];
}

export interface GhTabDiagnostics {
  originalPitches: number[];
  mergedPitches: number[];
  keptPitches: number[];
  droppedPitches: number[];
  droppedNotesCount: number;
  droppedWeight: number;
  dropCost: number;
  selectedSubsetId: string;
  candidateCount: number;
}

export interface GhTabNote {
  stringIndex: number;
  fret: number;
  pitch: number;
  sustainTick: number;
  // 0 = unset, otherwise 1-based index in source track note list.
  sourceNoteIndex: number;
  technique: GhNoteTechnique;
}

export interface GhTabEvent {
  tick: number;
  measureIndex: number;
  measureTiming: number;
  // 0 = unset, otherwise 1-based track id.
  sourceTrackId: number;
  notes: GhTabNote[];
  diagnostics?: GhTabDiagnostics;
}

export interface GhDifficultyLayer {
  difficulty: GhTabDifficulty;
  tuningName: string;
  tuningMidi: number[];
  events: GhTabEvent[];
}

export interface GhTabFileData {
  schemaVersion: number;
  toolchainVersion?: string;
  song: GhSongInfo;
  timeline: GhTimeline;
  tracks: GhTrack[];
  layers: GhDifficultyLayer[];
  sourceMidiSha256?: Uint8Array;
}

export interface GhTabBuildOptions {
  songId?: string;
  title?: string;
  artist?: string;
  sourceName?: string;
  toolchainVersion?: string;
  includeDiagnostics?: boolean;
  sourceMidiSha256?: Uint8Array | ArrayBuffer;
}

interface TrackNoteLookup {
  trackId: number;
  isDrum: boolean;
  byPitch: Map<number, Array<{ startTick: number; index: number; durationTick: number }>>;
}

interface SourceMatch {
  trackId: number;
  sourceNoteIndex: number;
  sustainTick: number;
  distance: number;
  isDrum: boolean;
}

export function buildGhTabFileFromTabs(tabs: Tab[], options: GhTabBuildOptions = {}): GhTabFileData {
  if (tabs.length === 0) {
    throw new Error("buildGhTabFileFromTabs requires at least one Tab.");
  }

  const baseTab = tabs[0];
  const includeDiagnostics = options.includeDiagnostics ?? false;
  const canonicalTracks = canonicalizeTracks(baseTab.midi);
  const trackLookups = buildTrackLookups(canonicalTracks);
  const layers = tabs.map((tab) => buildLayerFromTab(tab, trackLookups, includeDiagnostics));

  return {
    schemaVersion: 1,
    toolchainVersion: options.toolchainVersion ?? "midi-to-tab-js",
    song: {
      songId: options.songId,
      title: options.title ?? baseTab.name,
      artist: options.artist,
      sourceName: options.sourceName ?? baseTab.name,
    },
    timeline: buildTimeline(baseTab.midi),
    tracks: canonicalTracks,
    layers,
    sourceMidiSha256: options.sourceMidiSha256
      ? ensureUint8Array(options.sourceMidiSha256)
      : undefined,
  };
}

export function encodeGhTabFromTabs(tabs: Tab[], options: GhTabBuildOptions = {}): Uint8Array {
  return encodeGhTabFile(buildGhTabFileFromTabs(tabs, options));
}

export function encodeGhTabFromTab(tab: Tab, options: GhTabBuildOptions = {}): Uint8Array {
  return encodeGhTabFromTabs([tab], options);
}

export function encodeGhTabFile(file: GhTabFileData): Uint8Array {
  const payload = toProtoPayload(file);
  const verifyError = GH_TAB_FILE_TYPE.verify(payload);
  if (verifyError) {
    throw new Error(`Invalid GhTab payload: ${verifyError}`);
  }
  const message = GH_TAB_FILE_TYPE.create(payload);
  return GH_TAB_FILE_TYPE.encode(message).finish();
}

export function decodeGhTabBinary(data: Uint8Array | ArrayBuffer): GhTabFileData {
  const decoded = GH_TAB_FILE_TYPE.decode(ensureUint8Array(data));
  const object = GH_TAB_FILE_TYPE.toObject(decoded, {
    longs: Number,
    enums: Number,
    bytes: Array,
    defaults: true,
    arrays: true,
    objects: true,
  }) as ProtoGhTabFile;

  return fromProtoObject(object);
}

export function writeGhTabFile(
  path: string,
  file: GhTabFileData,
): string {
  const finalPath = resolve(path);
  mkdirSync(dirname(finalPath), { recursive: true });
  const encoded = encodeGhTabFile(file);
  writeFileSync(finalPath, encoded);
  return finalPath;
}

export function writeGhTabFromTabs(
  path: string,
  tabs: Tab[],
  options: GhTabBuildOptions = {},
): string {
  const finalPath = resolve(path);
  mkdirSync(dirname(finalPath), { recursive: true });
  const encoded = encodeGhTabFromTabs(tabs, options);
  writeFileSync(finalPath, encoded);
  return finalPath;
}

export function writeGhTabFromTab(
  path: string,
  tab: Tab,
  options: GhTabBuildOptions = {},
): string {
  return writeGhTabFromTabs(path, [tab], options);
}

export function readGhTabBinaryFile(path: string): GhTabFileData {
  const finalPath = resolve(path);
  const bytes = readFileSync(finalPath);
  return decodeGhTabBinary(bytes);
}

function buildTimeline(midi: MidiSong): GhTimeline {
  const tempoMap =
    midi.tempos.length > 0
      ? midi.tempos.map((tempo) => ({
          tick: tempo.ticks,
          microsecondsPerQuarter: tempo.microsecondsPerQuarter,
        }))
      : [{ tick: 0, microsecondsPerQuarter: 500_000 }];

  const timeSignatures =
    midi.timeSignatures.length > 0
      ? midi.timeSignatures.map((sig) => ({
          tick: sig.ticks,
          numerator: sig.numerator,
          denominator: sig.denominator,
        }))
      : [{ tick: 0, numerator: 4, denominator: 4 }];

  return {
    ppq: midi.ppq,
    endTick: midi.endTicks,
    tempoMap,
    timeSignatures,
    markers: [],
  };
}

function canonicalizeTracks(midi: MidiSong): GhTrack[] {
  return midi.tracks.map((track, index) => {
    const sortedNotes = [...track.notes].sort(
      (a, b) =>
        a.startTicks - b.startTicks ||
        a.pitch - b.pitch ||
        (a.endTicks - a.startTicks) - (b.endTicks - b.startTicks),
    );

    return {
      trackId: index + 1,
      name: track.name,
      midiChannel: normalizeByte(track.channel),
      midiProgram: normalizeByte(track.program),
      isDrum: track.isDrum,
      role: inferTrackRole(track),
      notes: sortedNotes.map((note) => ({
        startTick: note.startTicks,
        durationTick: Math.max(0, note.endTicks - note.startTicks),
        pitch: clampMidi(note.pitch),
        velocity: clampVelocity(note.velocity),
      })),
    };
  });
}

function buildTrackLookups(tracks: GhTrack[]): TrackNoteLookup[] {
  return tracks.map((track) => {
    const byPitch = new Map<number, Array<{ startTick: number; index: number; durationTick: number }>>();
    for (let i = 0; i < track.notes.length; i++) {
      const note = track.notes[i];
      const entries = byPitch.get(note.pitch) ?? [];
      entries.push({ startTick: note.startTick, index: i + 1, durationTick: note.durationTick });
      byPitch.set(note.pitch, entries);
    }
    return { trackId: track.trackId, isDrum: track.isDrum, byPitch };
  });
}

function buildLayerFromTab(
  tab: Tab,
  trackLookups: TrackNoteLookup[],
  includeDiagnostics: boolean,
): GhDifficultyLayer {
  const tuningMidi = tab.tuning.strings.map((note) => note.pitch);
  const tuningName = inferTuningName(tuningMidi);
  const onsetWindow = Math.max(0, tab.softOptions.onsetMergeWindowTicks);
  const events: GhTabEvent[] = [];

  for (let measureIndex = 0; measureIndex < tab.tab.measures.length; measureIndex++) {
    const measure = tab.tab.measures[measureIndex];
    for (const event of measure.events) {
      if (!event.notes || event.notes.length === 0) {
        continue;
      }

      const noteEntries = event.notes.map((tabNote) => {
        const stringPitch = tuningMidi[tabNote.string] ?? 0;
        const pitch = clampMidi(stringPitch + tabNote.fret);
        const match = findBestSourceMatch(trackLookups, pitch, event.time_ticks, onsetWindow);
        return {
          note: {
            stringIndex: tabNote.string,
            fret: tabNote.fret,
            pitch,
            sustainTick: match?.sustainTick ?? 0,
            sourceNoteIndex: match?.sourceNoteIndex ?? 0,
            technique: "none" as const,
          },
          match,
        };
      });

      const matchedTrackIds = noteEntries
        .map((entry) => entry.match?.trackId ?? 0)
        .filter((trackId) => trackId > 0);
      const uniqueTrackIds = [...new Set(matchedTrackIds)];
      const sourceTrackId = uniqueTrackIds.length === 1 ? uniqueTrackIds[0] : 0;

      events.push({
        tick: event.time_ticks,
        measureIndex,
        measureTiming: event.measure_timing,
        sourceTrackId,
        notes: noteEntries.map((entry) => entry.note),
        diagnostics:
          includeDiagnostics && event.processing ? diagnosticsFromTab(event.processing) : undefined,
      });
    }
  }

  events.sort((a, b) => a.tick - b.tick || a.measureIndex - b.measureIndex);

  return {
    difficulty: tab.difficulty,
    tuningName,
    tuningMidi,
    events,
  };
}

function findBestSourceMatch(
  trackLookups: TrackNoteLookup[],
  pitch: number,
  eventTick: number,
  onsetWindow: number,
): SourceMatch | null {
  let best: SourceMatch | null = null;
  const minTick = eventTick - onsetWindow;
  const maxTick = eventTick + onsetWindow;

  for (const track of trackLookups) {
    const candidates = track.byPitch.get(pitch);
    if (!candidates || candidates.length === 0) {
      continue;
    }

    for (const candidate of candidates) {
      if (candidate.startTick < minTick || candidate.startTick > maxTick) {
        continue;
      }
      const distance = Math.abs(candidate.startTick - eventTick);
      const current: SourceMatch = {
        trackId: track.trackId,
        sourceNoteIndex: candidate.index,
        sustainTick: candidate.durationTick,
        distance,
        isDrum: track.isDrum,
      };
      if (isSourceMatchBetter(current, best)) {
        best = current;
      }
    }
  }

  return best;
}

function isSourceMatchBetter(candidate: SourceMatch, current: SourceMatch | null): boolean {
  if (!current) {
    return true;
  }
  if (candidate.distance !== current.distance) {
    return candidate.distance < current.distance;
  }
  if (candidate.isDrum !== current.isDrum) {
    return !candidate.isDrum;
  }
  return candidate.trackId < current.trackId;
}

function diagnosticsFromTab(value: TabEventProcessingDiagnostics): GhTabDiagnostics {
  return {
    originalPitches: [...value.originalNotes],
    mergedPitches: [...value.mergedNotes],
    keptPitches: [...value.keptNotes],
    droppedPitches: [...value.droppedNotes],
    droppedNotesCount: value.droppedNotesCount,
    droppedWeight: value.droppedWeight,
    dropCost: value.dropCost,
    selectedSubsetId: value.selectedSubsetId,
    candidateCount: value.candidateCount,
  };
}

function inferTuningName(tuningMidi: number[]): string {
  if (areIntArraysEqual(tuningMidi, STANDARD_TUNING_PITCHES)) {
    return "standard_guitar";
  }
  if (areIntArraysEqual(tuningMidi, STANDARD_UKULELE_TUNING_PITCHES)) {
    return "standard_ukulele";
  }
  return "custom";
}

function inferTrackRole(track: MidiTrack): GhTrackRole {
  if (track.isDrum) {
    return "drums";
  }
  return "other";
}

function areIntArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function ensureUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toProtoPayload(file: GhTabFileData): ProtoGhTabFile {
  return {
    schemaVersion: file.schemaVersion,
    toolchainVersion: file.toolchainVersion ?? "",
    song: {
      songId: file.song.songId ?? "",
      title: file.song.title ?? "",
      artist: file.song.artist ?? "",
      sourceName: file.song.sourceName ?? "",
    },
    timeline: {
      ppq: file.timeline.ppq,
      endTick: file.timeline.endTick,
      tempoMap: [...file.timeline.tempoMap]
        .sort((a, b) => a.tick - b.tick)
        .map((tempo) => ({
          tick: tempo.tick,
          microsecondsPerQuarter: tempo.microsecondsPerQuarter,
        })),
      timeSignatures: [...file.timeline.timeSignatures]
        .sort((a, b) => a.tick - b.tick)
        .map((sig) => ({
          tick: sig.tick,
          numerator: sig.numerator,
          denominator: sig.denominator,
        })),
      markers: [...file.timeline.markers]
        .sort((a, b) => a.tick - b.tick)
        .map((marker) => ({ tick: marker.tick, name: marker.name })),
    },
    tracks: [...file.tracks]
      .sort((a, b) => a.trackId - b.trackId)
      .map((track) => {
        const sortedNotes = [...track.notes].sort(
          (a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.durationTick - b.durationTick,
        );
        let previousStart = 0;
        const packedNotes = sortedNotes.map((note) => {
          const delta = note.startTick - previousStart;
          previousStart = note.startTick;
          return {
            deltaStartTick: Math.max(0, delta),
            durationTick: Math.max(0, note.durationTick),
            pitch: clampMidi(note.pitch),
            velocity: clampVelocity(note.velocity),
          };
        });

        return {
          trackId: track.trackId,
          name: track.name ?? "",
          midiChannel: normalizeByte(track.midiChannel),
          midiProgram: normalizeByte(track.midiProgram),
          isDrum: track.isDrum,
          role: TRACK_ROLE_TO_ENUM[track.role] ?? TRACK_ROLE_TO_ENUM.unspecified,
          notes: packedNotes,
        };
      }),
    layers: file.layers.map((layer) => {
      const sortedEvents = [...layer.events].sort(
        (a, b) => a.tick - b.tick || a.measureIndex - b.measureIndex,
      );
      let previousTick = 0;
      return {
        difficulty: DIFFICULTY_TO_ENUM[layer.difficulty] ?? DIFFICULTY_TO_ENUM.unspecified,
        tuningName: layer.tuningName,
        tuningMidi: layer.tuningMidi.map((value) => Math.round(value)),
        events: sortedEvents.map((event) => {
          const deltaTick = Math.max(0, event.tick - previousTick);
          previousTick = event.tick;
          return {
            deltaTick,
            measureIndex: Math.max(0, event.measureIndex),
            measureTiming: event.measureTiming,
            sourceTrackId: Math.max(0, event.sourceTrackId),
            notes: event.notes.map((note) => ({
              stringIndex: Math.max(0, note.stringIndex),
              fret: Math.max(0, note.fret),
              pitch: clampMidi(note.pitch),
              sustainTick: Math.max(0, note.sustainTick),
              sourceNoteIndex: Math.max(0, note.sourceNoteIndex),
              technique: NOTE_TECHNIQUE_TO_ENUM[note.technique] ?? NOTE_TECHNIQUE_TO_ENUM.none,
            })),
            diagnostics: event.diagnostics
              ? {
                  originalPitches: event.diagnostics.originalPitches.map(clampMidi),
                  mergedPitches: event.diagnostics.mergedPitches.map(clampMidi),
                  keptPitches: event.diagnostics.keptPitches.map(clampMidi),
                  droppedPitches: event.diagnostics.droppedPitches.map(clampMidi),
                  droppedNotesCount: Math.max(0, event.diagnostics.droppedNotesCount),
                  droppedWeight: event.diagnostics.droppedWeight,
                  dropCost: event.diagnostics.dropCost,
                  selectedSubsetId: event.diagnostics.selectedSubsetId,
                  candidateCount: Math.max(0, event.diagnostics.candidateCount),
                }
              : undefined,
          };
        }),
      };
    }),
    sourceMidiSha256: file.sourceMidiSha256 ? [...file.sourceMidiSha256] : [],
  };
}

function fromProtoObject(object: ProtoGhTabFile): GhTabFileData {
  return {
    schemaVersion: object.schemaVersion ?? 1,
    toolchainVersion: object.toolchainVersion || undefined,
    song: {
      songId: object.song?.songId || undefined,
      title: object.song?.title || undefined,
      artist: object.song?.artist || undefined,
      sourceName: object.song?.sourceName || undefined,
    },
    timeline: {
      ppq: object.timeline?.ppq ?? 480,
      endTick: object.timeline?.endTick ?? 0,
      tempoMap: (object.timeline?.tempoMap ?? []).map((tempo) => ({
        tick: tempo.tick ?? 0,
        microsecondsPerQuarter: tempo.microsecondsPerQuarter ?? 500_000,
      })),
      timeSignatures: (object.timeline?.timeSignatures ?? []).map((sig) => ({
        tick: sig.tick ?? 0,
        numerator: sig.numerator ?? 4,
        denominator: sig.denominator ?? 4,
      })),
      markers: (object.timeline?.markers ?? []).map((marker) => ({
        tick: marker.tick ?? 0,
        name: marker.name ?? "",
      })),
    },
    tracks: (object.tracks ?? []).map((track) => {
      let tickCursor = 0;
      const notes = (track.notes ?? []).map((note) => {
        tickCursor += note.deltaStartTick ?? 0;
        return {
          startTick: tickCursor,
          durationTick: note.durationTick ?? 0,
          pitch: note.pitch ?? 0,
          velocity: note.velocity ?? 0,
        };
      });
      return {
        trackId: track.trackId ?? 0,
        name: track.name || undefined,
        midiChannel: track.midiChannel ?? 0,
        midiProgram: track.midiProgram ?? 0,
        isDrum: track.isDrum ?? false,
        role: ENUM_TO_TRACK_ROLE[track.role ?? 0] ?? "unspecified",
        notes,
      };
    }),
    layers: (object.layers ?? []).map((layer) => {
      let tickCursor = 0;
      const events = (layer.events ?? []).map((event) => {
        tickCursor += event.deltaTick ?? 0;
        return {
          tick: tickCursor,
          measureIndex: event.measureIndex ?? 0,
          measureTiming: event.measureTiming ?? 0,
          sourceTrackId: event.sourceTrackId ?? 0,
          notes: (event.notes ?? []).map((note) => ({
            stringIndex: note.stringIndex ?? 0,
            fret: note.fret ?? 0,
            pitch: note.pitch ?? 0,
            sustainTick: note.sustainTick ?? 0,
            sourceNoteIndex: note.sourceNoteIndex ?? 0,
            technique: ENUM_TO_NOTE_TECHNIQUE[note.technique ?? 0] ?? "none",
          })),
          diagnostics: event.diagnostics
            ? {
                originalPitches: event.diagnostics.originalPitches ?? [],
                mergedPitches: event.diagnostics.mergedPitches ?? [],
                keptPitches: event.diagnostics.keptPitches ?? [],
                droppedPitches: event.diagnostics.droppedPitches ?? [],
                droppedNotesCount: event.diagnostics.droppedNotesCount ?? 0,
                droppedWeight: event.diagnostics.droppedWeight ?? 0,
                dropCost: event.diagnostics.dropCost ?? 0,
                selectedSubsetId: event.diagnostics.selectedSubsetId ?? "",
                candidateCount: event.diagnostics.candidateCount ?? 0,
              }
            : undefined,
        };
      });
      return {
        difficulty: ENUM_TO_DIFFICULTY[layer.difficulty ?? 0] ?? "unspecified",
        tuningName: layer.tuningName ?? "",
        tuningMidi: layer.tuningMidi?.map((value) => Math.round(value)) ?? [],
        events,
      };
    }),
    sourceMidiSha256:
      object.sourceMidiSha256 && object.sourceMidiSha256.length > 0
        ? new Uint8Array(object.sourceMidiSha256)
        : undefined,
  };
}

function normalizeByte(value: number | undefined): number {
  const numeric = Number.isFinite(value) ? Math.round(value as number) : 0;
  return Math.min(127, Math.max(0, numeric));
}

function clampMidi(value: number): number {
  return Math.min(127, Math.max(0, Math.round(value)));
}

function clampVelocity(value: number): number {
  return Math.min(127, Math.max(0, Math.round(value)));
}

interface ProtoGhTabFile {
  schemaVersion?: number;
  toolchainVersion?: string;
  song?: {
    songId?: string;
    title?: string;
    artist?: string;
    sourceName?: string;
  };
  timeline?: {
    ppq?: number;
    endTick?: number;
    tempoMap?: Array<{ tick?: number; microsecondsPerQuarter?: number }>;
    timeSignatures?: Array<{ tick?: number; numerator?: number; denominator?: number }>;
    markers?: Array<{ tick?: number; name?: string }>;
  };
  tracks?: Array<{
    trackId?: number;
    name?: string;
    midiChannel?: number;
    midiProgram?: number;
    isDrum?: boolean;
    role?: number;
    notes?: Array<{
      deltaStartTick?: number;
      durationTick?: number;
      pitch?: number;
      velocity?: number;
    }>;
  }>;
  layers?: Array<{
    difficulty?: number;
    tuningName?: string;
    tuningMidi?: number[];
    events?: Array<{
      deltaTick?: number;
      measureIndex?: number;
      measureTiming?: number;
      sourceTrackId?: number;
      notes?: Array<{
        stringIndex?: number;
        fret?: number;
        pitch?: number;
        sustainTick?: number;
        sourceNoteIndex?: number;
        technique?: number;
      }>;
      diagnostics?: {
        originalPitches?: number[];
        mergedPitches?: number[];
        keptPitches?: number[];
        droppedPitches?: number[];
        droppedNotesCount?: number;
        droppedWeight?: number;
        dropCost?: number;
        selectedSubsetId?: string;
        candidateCount?: number;
      };
    }>;
  }>;
  sourceMidiSha256?: number[];
}
