# MIDI-to-TAB JS (tuttut port)

TypeScript/JavaScript port of the core algorithm from [natecdr/tuttut](https://github.com/natecdr/tuttut), with the original Python implementation included for deterministic A/B output comparison.

## What is included

- `src/`: Node-ready TS implementation of the MIDI-to-TAB core algorithm
  - fretboard modeling
  - fingering search
  - difficulty scoring
  - HMM + Viterbi selection
  - ASCII tab rendering
- `python_original/`: vendored Python baseline (original `tuttut.logic` modules)
- `examples/midi/`: 10 generated MIDI fixtures for comparison
- `scripts/compare-ab.mjs`: Python vs TS output comparator

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Generate MIDI fixtures

```bash
npm run generate:examples
```

This generates 10 files in `examples/midi/`.

## Run A/B comparison (Python vs TS)

1. Install Python dependencies:

```bash
python -m pip install -r python_original/requirements.txt
```

2. Run comparison:

```bash
npm run compare:ab
```

If Python is in a custom location, set `PYTHON`:

```bash
PYTHON=.venv/bin/python npm run compare:ab
```

Results are written to:

- `comparison-output/python/*.txt`
- `comparison-output/js/*.txt`
- `comparison-output/summary.json`

## Library usage (Node / Electron / Capacitor)

```ts
import { convertMidiArrayBufferToTab } from "midi-to-tab-js";

const tab = convertMidiArrayBufferToTab(midiArrayBuffer, {
  name: "song",
  difficulty: "easy", // "easy" | "medium" | "hard"
});

const ascii = tab.toAsciiString();
const json = tab.toJsonString();
```

Node file-path convenience:

```ts
import { convertMidiFileToTab } from "midi-to-tab-js";

const tab = convertMidiFileToTab("./examples/midi/01_single_note.mid");
console.log(tab.toAsciiString());
```

Generate all three difficulties from one MIDI:

```ts
import { convertMidiFileToTabsByDifficulty } from "midi-to-tab-js";

const tabs = convertMidiFileToTabsByDifficulty("./examples/midi/01_single_note.mid", {
  name: "song",
});

tabs.easy.writeAsciiFile("./tabs/song_easy.txt");
tabs.medium.writeAsciiFile("./tabs/song_medium.txt");
tabs.hard.writeAsciiFile("./tabs/song_hard.txt");
```

## Notes

- The algorithm targets the same behavior as the original Python code.
- Complex multi-channel MIDI can still produce suboptimal tabs, same as the upstream project.
