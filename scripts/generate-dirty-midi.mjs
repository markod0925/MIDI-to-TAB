import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ToneMidi from "@tonejs/midi";

const { Midi } = ToneMidi;

const PPQ = 480;
const DURATION_SECONDS = 25;
const TICKS_PER_SECOND = PPQ * 2; // 120 BPM default
const DURATION_TICKS = DURATION_SECONDS * TICKS_PER_SECOND;

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function addDirtyNotes(track, rng, cfg) {
  for (let tick = 0; tick < DURATION_TICKS; tick += cfg.stepTicks) {
    if (rng() > cfg.density) {
      continue;
    }

    const jitter = randInt(rng, -cfg.jitterTicks, cfg.jitterTicks);
    const baseTick = Math.max(0, tick + jitter);

    const chordSize = randInt(rng, cfg.minChord, cfg.maxChord);
    for (let i = 0; i < chordSize; i++) {
      const pickOutlier = rng() < cfg.outlierChance;
      const pitch = pickOutlier
        ? randInt(rng, cfg.outlierMinPitch, cfg.outlierMaxPitch)
        : randInt(rng, cfg.minPitch, cfg.maxPitch);

      const duration = randInt(rng, cfg.minDurationTicks, cfg.maxDurationTicks);
      const velocity = randInt(rng, cfg.minVelocity, cfg.maxVelocity) / 127;
      track.addNote({
        midi: Math.max(0, Math.min(127, pitch)),
        ticks: baseTick,
        durationTicks: duration,
        velocity,
      });

      // Duplicate/spurious near-onset note to force merge pressure.
      if (rng() < cfg.duplicateChance) {
        track.addNote({
          midi: Math.max(0, Math.min(127, pitch + randInt(rng, -1, 1))),
          ticks: Math.max(0, baseTick + randInt(rng, 1, cfg.duplicateJitterTicks)),
          durationTicks: Math.max(8, duration + randInt(rng, -20, 40)),
          velocity: Math.max(0.02, velocity * (0.6 + rng() * 0.5)),
        });
      }
    }
  }
}

function generateDirtyMidi(outputPath) {
  const rng = createRng(0x5eeda11);
  const midi = new Midi();

  const lead = midi.addTrack();
  const harmony = midi.addTrack();
  const texture = midi.addTrack();
  const drums = midi.addTrack();
  drums.channel = 9;

  addDirtyNotes(lead, rng, {
    stepTicks: 120,
    density: 0.62,
    jitterTicks: 22,
    minChord: 1,
    maxChord: 2,
    minPitch: 57,
    maxPitch: 88,
    outlierChance: 0.08,
    outlierMinPitch: 24,
    outlierMaxPitch: 110,
    minDurationTicks: 14,
    maxDurationTicks: 360,
    minVelocity: 8,
    maxVelocity: 127,
    duplicateChance: 0.18,
    duplicateJitterTicks: 18,
  });

  addDirtyNotes(harmony, rng, {
    stepTicks: 144,
    density: 0.55,
    jitterTicks: 26,
    minChord: 2,
    maxChord: 4,
    minPitch: 45,
    maxPitch: 76,
    outlierChance: 0.12,
    outlierMinPitch: 18,
    outlierMaxPitch: 102,
    minDurationTicks: 10,
    maxDurationTicks: 420,
    minVelocity: 6,
    maxVelocity: 120,
    duplicateChance: 0.2,
    duplicateJitterTicks: 26,
  });

  addDirtyNotes(texture, rng, {
    stepTicks: 168,
    density: 0.46,
    jitterTicks: 30,
    minChord: 1,
    maxChord: 4,
    minPitch: 40,
    maxPitch: 92,
    outlierChance: 0.18,
    outlierMinPitch: 10,
    outlierMaxPitch: 120,
    minDurationTicks: 6,
    maxDurationTicks: 220,
    minVelocity: 4,
    maxVelocity: 118,
    duplicateChance: 0.16,
    duplicateJitterTicks: 22,
  });

  // Dense drum noise, ignored by tab conversion but makes file realistic/dirty.
  for (let tick = 0; tick < DURATION_TICKS; tick += 48) {
    if (rng() < 0.88) {
      const drumTick = Math.max(0, tick + randInt(rng, -8, 8));
      drums.addNote({
        midi: [36, 38, 42, 46, 49][randInt(rng, 0, 4)],
        ticks: drumTick,
        durationTicks: randInt(rng, 10, 80),
        velocity: randInt(rng, 40, 127) / 127,
      });
    }
  }

  const out = resolve(outputPath);
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, Buffer.from(midi.toArray()));

  const nNotes = midi.tracks.reduce((acc, track) => acc + track.notes.length, 0);
  process.stdout.write(`Generated dirty MIDI: ${out}\n`);
  process.stdout.write(`Total tracks: ${midi.tracks.length}\n`);
  process.stdout.write(`Total notes: ${nNotes}\n`);
  process.stdout.write(`Approx duration: ${DURATION_SECONDS}s\n`);
}

const output = process.argv[2] ?? "examples/midi/dirty_1min.mid";
generateDirtyMidi(output);
