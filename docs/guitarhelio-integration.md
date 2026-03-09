# GuitarHelio Integration Guide (`GhTabFile`)

This document describes how GuitarHelio can consume the shared binary format produced by MIDI-to-TAB.

Schema reference:

- `schemas/gh_tab.proto`

Runtime API reference in this project:

- `src/gh-tab-format.ts`

## Producer Side (MIDI-to-TAB)

Generate one binary containing all difficulty layers:

```ts
import {
  convertMidiFileToTabsByDifficulty,
  writeGhTabFromTabs,
} from "midi-to-tab-js";

const tabs = convertMidiFileToTabsByDifficulty("./song.mid", { name: "song" });

writeGhTabFromTabs("./tabs/song.ghlbin", [tabs.easy, tabs.medium, tabs.hard], {
  title: "Song",
  sourceName: "song.mid",
});
```

## Consumer Side (GuitarHelio)

Read and decode:

```ts
import { readGhTabBinaryFile } from "midi-to-tab-js";

const ghl = readGhTabBinaryFile("./tabs/song.ghlbin");
```

Then:

1. Select one `layer` by difficulty (`easy`, `medium`, `hard`).
2. Rebuild absolute ticks from `TabEvent.delta_tick`.
3. Convert ticks to seconds using `timeline.tempo_map`.
4. Schedule note hints from `TabEvent.notes`.

## Rebuilding Absolute Event Ticks

`events` are delta-encoded. Reconstruct absolute ticks with:

```ts
let tick = 0;
for (const event of layer.events) {
  tick += event.deltaTick;
  // event absolute tick = tick
}
```

## Tick to Time Conversion

Use timeline data:

- `timeline.ppq`
- `timeline.tempoMap` (tick + microseconds per quarter)

Algorithm:

1. Sort `tempoMap` by `tick`.
2. Walk tempo segments up to target tick.
3. Convert segment ticks to seconds:
   - `seconds = (segmentTicks / ppq) * (microsecondsPerQuarter / 1_000_000)`

## Gameplay Mapping

For each event note:

- `stringIndex` and `fret` drive UI lane/fret hint.
- `pitch` is the resolved MIDI pitch.
- `sustainTick` gives hold duration in ticks.
- `sourceTrackId` and `sourceNoteIndex` optionally link back to source notes.

Recommended runtime prep:

1. Precompute `eventTick -> eventSeconds`.
2. Precompute `sustainTick -> sustainSeconds` by tempo conversion.
3. Cache an array of playable prompts: `(timeSec, stringIndex, fret, holdSec)`.

## Seek / Scrub

For fast seeking:

1. Keep a sorted array of absolute event ticks.
2. Keep a second sorted array of event seconds.
3. On seek, binary-search nearest event index and resume scheduling from there.

## Diagnostics

`event.diagnostics` is optional and usually omitted in production exports.

If present, it can power debug overlays:

- dropped source pitches
- chosen subset id
- candidate count

## Validation Checklist

1. `schemaVersion === 1`
2. `timeline.ppq > 0`
3. selected layer exists and has events
4. `stringIndex` within tuning bounds
5. `fret` non-negative
