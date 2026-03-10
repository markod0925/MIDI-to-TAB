import assert from "node:assert/strict";
import ToneMidi from "@tonejs/midi";
import {
  convertMidiArrayBufferToTab,
} from "../dist/index.js";

const { Midi } = ToneMidi;
const PPQ = 480;

function toArrayBuffer(bytes) {
  const buffer = Buffer.from(bytes);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function makeMidi(addNotesFn) {
  const midi = new Midi();
  const track = midi.addTrack();
  addNotesFn(track);
  return midi;
}

function getFirstProcessedEvent(tab) {
  return tab.tab.measures
    .flatMap((measure) => measure.events)
    .find((event) => event.processing);
}

function totalOutputNotes(tab) {
  return tab.tab.measures
    .flatMap((measure) => measure.events)
    .reduce((acc, event) => acc + (event.notes?.length ?? 0), 0);
}

function testMergeBeforeFilter() {
  const midi = makeMidi((track) => {
    track.addNote({ midi: 64, ticks: 0, durationTicks: 30, velocity: 0.75 });
    track.addNote({ midi: 64, ticks: 20, durationTicks: 40, velocity: 0.8 });
  });

  const tab = convertMidiArrayBufferToTab(toArrayBuffer(midi.toArray()), {
    name: "merge_before_filter",
    difficulty: "medium",
    allowNoteDrop: false,
    onsetMergeWindowTicks: 30,
    minDurationTicks: 50,
    includeEventDiagnostics: true,
  });

  assert.ok(totalOutputNotes(tab) > 0, "Merged-duration note should survive minDuration filter.");
}

function testTemporalStabilityInRanking() {
  const midi = makeMidi((track) => {
    const notes = [
      { pitch: 40, tick: 0 },
      { pitch: 45, tick: 0 },
      { pitch: 50, tick: 15 },
      { pitch: 55, tick: 30 },
      { pitch: 60, tick: 0 },
    ];

    for (const note of notes) {
      track.addNote({
        midi: note.pitch,
        ticks: note.tick,
        durationTicks: 120,
        velocity: 0.78,
      });
    }
  });

  const tab = convertMidiArrayBufferToTab(toArrayBuffer(midi.toArray()), {
    name: "temporal_stability",
    difficulty: "medium",
    allowNoteDrop: false,
    onsetMergeWindowTicks: 40,
    maxNotesPerEvent: 4,
    includeEventDiagnostics: true,
  });

  const processed = getFirstProcessedEvent(tab);
  assert.ok(processed, "Expected diagnostics event for temporal stability test.");
  assert.ok(
    processed.processing.droppedNotes.includes(55),
    "Least temporally stable middle note (pitch 55) should be dropped first.",
  );
}

function testSubsetCapAndDropCost() {
  const midi = makeMidi((track) => {
    const pitches = [45, 50, 54, 57, 62];
    for (const pitch of pitches) {
      track.addNote({ midi: pitch, ticks: 0, durationTicks: 180, velocity: 0.85 });
    }
  });

  const tab = convertMidiArrayBufferToTab(toArrayBuffer(midi.toArray()), {
    name: "subset_cap",
    difficulty: "easy",
    allowNoteDrop: true,
    maxSubsetCandidates: 3,
    maxNotesPerEvent: 4,
    includeEventDiagnostics: true,
    dropPenalty: 0.3,
  });

  const processed = getFirstProcessedEvent(tab);
  assert.ok(processed, "Expected diagnostics event for subset cap test.");
  assert.ok(
    processed.processing.candidateCount <= 3,
    "Candidate count should respect maxSubsetCandidates cap.",
  );

  if (processed.processing.droppedNotesCount > 0) {
    assert.equal(
      processed.processing.dropCost,
      0.3,
      "Drop cost should equal configured dropPenalty when notes are dropped.",
    );
  } else {
    assert.equal(processed.processing.dropCost, 0, "Drop cost must be 0 when no notes are dropped.");
  }

  assert.ok(processed.processing.selectedSubsetId.length > 0, "Expected selected subset identifier.");
}

function testDirtyIntegrationAndPerformance() {
  const midi = makeMidi((track) => {
    for (let step = 0; step < 180; step++) {
      const tick = step * 36;
      const base = 45 + (step % 12);
      for (let i = 0; i < 6; i++) {
        track.addNote({
          midi: base + i * 3,
          ticks: tick + (i % 2 === 0 ? 0 : 8),
          durationTicks: 45 + (i * 10),
          velocity: (20 + ((step + i) % 100)) / 127,
        });
      }
    }
  });

  const data = toArrayBuffer(midi.toArray());

  const startedAt = Date.now();
  const easy = convertMidiArrayBufferToTab(data, {
    name: "dirty_easy",
    difficulty: "easy",
    includeEventDiagnostics: true,
  });
  const medium = convertMidiArrayBufferToTab(data, {
    name: "dirty_medium",
    difficulty: "medium",
    includeEventDiagnostics: true,
  });
  const hard = convertMidiArrayBufferToTab(data, {
    name: "dirty_hard",
    difficulty: "hard",
    includeEventDiagnostics: true,
  });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(totalOutputNotes(easy) > 0 && totalOutputNotes(medium) > 0 && totalOutputNotes(hard) > 0);
  assert.ok(elapsedMs < 15000, `High-polyphony benchmark too slow: ${elapsedMs}ms`);
}

function testPlayablePositionConstraints() {
  const midi = makeMidi((track) => {
    const pitches = [40, 45, 47, 50, 52, 55, 59, 64];
    for (let i = 0; i < pitches.length; i++) {
      track.addNote({
        midi: pitches[i],
        ticks: i * (PPQ / 2),
        durationTicks: PPQ / 3,
        velocity: 0.9,
      });
    }
  });

  const data = toArrayBuffer(midi.toArray());

  const unconstrained = convertMidiArrayBufferToTab(data, {
    name: "constraints_off",
    difficulty: "hard",
  });
  const constrained = convertMidiArrayBufferToTab(data, {
    name: "constraints_on",
    difficulty: "hard",
    fretboardConstraints: {
      allowedStrings: [5, 6],
      allowedFrets: [0, 5, 6, 7],
    },
  });

  const constrainedNotes = constrained.tab.measures
    .flatMap((measure) => measure.events)
    .flatMap((event) => event.notes ?? []);

  assert.ok(constrainedNotes.length > 0, "Expected constrained conversion to keep playable notes.");
  assert.ok(
    constrainedNotes.every((note) => note.string + 1 === 5 || note.string + 1 === 6),
    "Constrained conversion must keep only selected strings.",
  );
  assert.ok(
    constrainedNotes.every((note) => [0, 5, 6, 7].includes(note.fret)),
    "Constrained conversion must keep only selected frets.",
  );
  assert.ok(
    totalOutputNotes(constrained) < totalOutputNotes(unconstrained),
    "Constrained conversion should drop notes outside playable positions.",
  );
}

function main() {
  testMergeBeforeFilter();
  testTemporalStabilityInRanking();
  testSubsetCapAndDropCost();
  testDirtyIntegrationAndPerformance();
  testPlayablePositionConstraints();
  process.stdout.write("Soft-mode tests: PASS\n");
}

main();
