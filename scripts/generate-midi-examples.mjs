import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ToneMidi from "@tonejs/midi";

const { Midi } = ToneMidi;

const PPQ = 480;

function addTrack(midi, spec) {
  const track = midi.addTrack();
  if (typeof spec.channel === "number") {
    track.channel = spec.channel;
  }

  if (spec.percussion) {
    track.channel = 9;
  }

  for (const note of spec.notes) {
    track.addNote({
      midi: note.midi,
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      velocity: note.velocity ?? 0.8,
    });
  }
}

function createExample(spec) {
  const midi = new Midi();

  const timeSignatures = spec.timeSignatures ?? [{ ticks: 0, numerator: 4, denominator: 4 }];
  midi.header.timeSignatures = timeSignatures.map((ts) => ({
    ticks: ts.ticks,
    timeSignature: [ts.numerator, ts.denominator],
    measures: 0,
  }));

  for (const track of spec.tracks) {
    addTrack(midi, track);
  }

  return midi;
}

const quarter = PPQ;
const eighth = PPQ / 2;
const half = PPQ * 2;

const examples = [
  {
    file: "01_single_note.mid",
    tracks: [{ notes: [{ midi: 64, ticks: 0, durationTicks: half }] }],
  },
  {
    file: "02_ascending_scale.mid",
    tracks: [
      {
        notes: [64, 66, 68, 69, 71, 73, 75, 76].map((pitch, i) => ({
          midi: pitch,
          ticks: i * quarter,
          durationTicks: quarter,
        })),
      },
    ],
  },
  {
    file: "03_descending_scale.mid",
    tracks: [
      {
        notes: [76, 75, 73, 71, 69, 68, 66, 64].map((pitch, i) => ({
          midi: pitch,
          ticks: i * quarter,
          durationTicks: quarter,
        })),
      },
    ],
  },
  {
    file: "04_major_triad_chords.mid",
    tracks: [
      {
        notes: [
          { midi: 60, ticks: 0, durationTicks: half },
          { midi: 64, ticks: 0, durationTicks: half },
          { midi: 67, ticks: 0, durationTicks: half },
          { midi: 62, ticks: half, durationTicks: half },
          { midi: 65, ticks: half, durationTicks: half },
          { midi: 69, ticks: half, durationTicks: half },
          { midi: 59, ticks: half * 2, durationTicks: half },
          { midi: 62, ticks: half * 2, durationTicks: half },
          { midi: 67, ticks: half * 2, durationTicks: half },
        ],
      },
    ],
  },
  {
    file: "05_arpeggio_pattern.mid",
    tracks: [
      {
        notes: [
          52, 59, 64, 67, 64, 59, 52, 59, 55, 62, 67, 71, 67, 62, 55, 62,
        ].map((pitch, i) => ({ midi: pitch, ticks: i * eighth, durationTicks: eighth })),
      },
    ],
  },
  {
    file: "06_out_of_range_notes.mid",
    tracks: [
      {
        notes: [
          { midi: 24, ticks: 0, durationTicks: quarter },
          { midi: 28, ticks: quarter, durationTicks: quarter },
          { midi: 92, ticks: quarter * 2, durationTicks: quarter },
          { midi: 96, ticks: quarter * 3, durationTicks: quarter },
          { midi: 31, ticks: quarter * 4, durationTicks: quarter },
          { midi: 88, ticks: quarter * 5, durationTicks: quarter },
        ],
      },
    ],
  },
  {
    file: "07_polyphonic_progression.mid",
    tracks: [
      {
        notes: [
          { midi: 52, ticks: 0, durationTicks: quarter * 4 },
          { midi: 55, ticks: 0, durationTicks: quarter * 4 },
          { midi: 59, ticks: 0, durationTicks: quarter * 4 },
          { midi: 64, ticks: 0, durationTicks: quarter * 4 },
          { midi: 50, ticks: quarter * 4, durationTicks: quarter * 4 },
          { midi: 57, ticks: quarter * 4, durationTicks: quarter * 4 },
          { midi: 62, ticks: quarter * 4, durationTicks: quarter * 4 },
          { midi: 65, ticks: quarter * 4, durationTicks: quarter * 4 },
        ],
      },
      {
        notes: [
          { midi: 76, ticks: 0, durationTicks: quarter },
          { midi: 74, ticks: quarter, durationTicks: quarter },
          { midi: 72, ticks: quarter * 2, durationTicks: quarter },
          { midi: 71, ticks: quarter * 3, durationTicks: quarter },
          { midi: 69, ticks: quarter * 4, durationTicks: quarter },
          { midi: 67, ticks: quarter * 5, durationTicks: quarter },
          { midi: 65, ticks: quarter * 6, durationTicks: quarter },
          { midi: 64, ticks: quarter * 7, durationTicks: quarter },
        ],
      },
    ],
  },
  {
    file: "08_repeated_note_cache.mid",
    tracks: [
      {
        notes: Array.from({ length: 16 }, (_, i) => ({
          midi: i % 2 === 0 ? 64 : 67,
          ticks: i * eighth,
          durationTicks: eighth,
        })),
      },
    ],
  },
  {
    file: "09_with_drums.mid",
    tracks: [
      {
        notes: [64, 66, 68, 69, 71, 73, 75, 76].map((pitch, i) => ({
          midi: pitch,
          ticks: i * quarter,
          durationTicks: quarter,
        })),
      },
      {
        percussion: true,
        notes: Array.from({ length: 8 }, (_, i) => ({
          midi: i % 2 === 0 ? 36 : 38,
          ticks: i * quarter,
          durationTicks: eighth,
          velocity: 0.95,
        })),
      },
    ],
  },
  {
    file: "10_time_signature_change.mid",
    timeSignatures: [
      { ticks: 0, numerator: 4, denominator: 4 },
      { ticks: quarter * 8, numerator: 3, denominator: 4 },
    ],
    tracks: [
      {
        notes: [
          { midi: 60, ticks: 0, durationTicks: quarter },
          { midi: 62, ticks: quarter, durationTicks: quarter },
          { midi: 64, ticks: quarter * 2, durationTicks: quarter },
          { midi: 65, ticks: quarter * 3, durationTicks: quarter },
          { midi: 67, ticks: quarter * 4, durationTicks: quarter },
          { midi: 69, ticks: quarter * 5, durationTicks: quarter },
          { midi: 71, ticks: quarter * 6, durationTicks: quarter },
          { midi: 72, ticks: quarter * 7, durationTicks: quarter },
          { midi: 74, ticks: quarter * 8, durationTicks: quarter },
          { midi: 76, ticks: quarter * 9, durationTicks: quarter },
          { midi: 77, ticks: quarter * 10, durationTicks: quarter },
        ],
      },
    ],
  },
];

const outputDir = resolve("examples/midi");
mkdirSync(outputDir, { recursive: true });

for (const example of examples) {
  const midi = createExample(example);
  const outputPath = resolve(outputDir, example.file);
  writeFileSync(outputPath, Buffer.from(midi.toArray()));
  process.stdout.write(`Generated ${example.file}\n`);
}

process.stdout.write(`Total generated MIDI files: ${examples.length}\n`);
