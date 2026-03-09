import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getDifficultyPreset } from "./difficulty-presets";
import { computeIsolatedPathDifficulty } from "./difficulty";
import { Fretboard } from "./fretboard";
import {
  buildTransitionMatrix,
  difficultiesToProbabilities,
  expandEmissionMatrix,
  viterbi,
} from "./graph-utils";
import {
  fillMeasureStr,
  getEventsBetween,
  getNonDrum,
  measureLengthTicks,
} from "./midi-utils";
import { Measure, Note, Tuning } from "./theory";
import type {
  MidiSong,
  TabEvent,
  TabJson,
  TabWeights,
  TimeSignatureEvent,
  TimelineEventData,
  DifficultyLevel,
  FretboardConstraints,
} from "./types";

interface BuildHmmResult {
  notesSequence: number[];
  fingeringsVocabulary: Note[][];
  emissionMatrix: number[][];
  initialProbabilities: number[] | null;
}

export interface TabOptions {
  difficulty?: DifficultyLevel;
  weights?: TabWeights;
  fretboardConstraints?: Partial<FretboardConstraints>;
  outputDir?: string;
}

export class Tab {
  readonly name: string;
  readonly tuning: Tuning;
  readonly midi: MidiSong;
  readonly difficulty: DifficultyLevel;
  readonly weights: TabWeights;
  readonly outputDir?: string;
  readonly timeSignatures: TimeSignatureEvent[];
  readonly nstrings: number;
  readonly fretboard: Fretboard;
  readonly timeline: Map<number, TimelineEventData>;
  readonly measures: Measure[];
  readonly tab: TabJson;

  constructor(name: string, tuning: Tuning, midi: MidiSong, options: TabOptions = {}) {
    const preset = getDifficultyPreset(options.difficulty ?? "medium");

    this.name = name;
    this.tuning = tuning;
    this.midi = midi;
    this.difficulty = preset.level;
    this.weights = options.weights ?? preset.weights;
    this.outputDir = options.outputDir;
    this.timeSignatures =
      midi.timeSignatures.length > 0
        ? midi.timeSignatures
        : [{ numerator: 4, denominator: 4, ticks: 0, time: 0 }];
    this.nstrings = tuning.nstrings;
    this.fretboard = new Fretboard(tuning, {
      ...preset.fretboard,
      ...(options.fretboardConstraints ?? {}),
    });
    this.timeline = this.buildTimeline();
    this.measures = [];

    this.populate();
    this.tab = this.genTab();
  }

  private populate(): void {
    for (let i = 0; i < this.timeSignatures.length; i++) {
      const timeSignature = this.timeSignatures[i];
      const measureLengthInTicks = measureLengthTicks(this.midi, timeSignature);
      const timeSigStart = timeSignature.ticks;
      const timeSigEnd =
        i < this.timeSignatures.length - 1 ? this.timeSignatures[i + 1].ticks : this.midi.endTicks;

      let imeasure = 0;
      for (let measureStart = timeSigStart; measureStart < timeSigEnd; measureStart += measureLengthInTicks) {
        const measureEnd = Math.min(measureStart + measureLengthInTicks, timeSigEnd);
        this.measures.push(
          new Measure(
            imeasure,
            timeSignature,
            measureStart,
            measureEnd,
            getEventsBetween(this.timeline, measureStart, measureEnd),
          ),
        );
        imeasure += 1;
      }
    }
  }

  private buildTimeline(): Map<number, TimelineEventData> {
    const timeline = new Map<number, TimelineEventData>();
    const nonDrumInstruments = getNonDrum(this.midi.tracks);

    for (const instrument of nonDrumInstruments) {
      const notes = [...instrument.notes].sort((a, b) => a.startTicks - b.startTicks);

      for (const note of notes) {
        const noteTick = note.startTicks;
        const event = timeline.get(noteTick) ?? {};
        const eventNotes = event.notes ?? [];
        eventNotes.push(note);
        event.notes = eventNotes;
        timeline.set(noteTick, event);
      }
    }

    for (const timeSignature of this.timeSignatures) {
      const tick = timeSignature.ticks;
      const event = timeline.get(tick) ?? {};
      event.time_signature = timeSignature;
      timeline.set(tick, event);
    }

    return new Map([...timeline.entries()].sort(([a], [b]) => a - b));
  }

  private genTab(): TabJson {
    const tab: TabJson = {
      tuning: this.tuning.strings.map((string) => string.pitch),
      measures: [],
    };

    const { notesSequence, fingeringsVocabulary, emissionMatrix, initialProbabilities } =
      this.buildHmmInputs(tab);

    const finalSequence = this.runViterbi(
      notesSequence,
      fingeringsVocabulary,
      emissionMatrix,
      initialProbabilities,
    );

    return this.populateTabNotes(tab, finalSequence);
  }

  private buildHmmInputs(tab: TabJson): BuildHmmResult {
    const notesVocabulary = new Map<string, number>();
    const notesSequence: number[] = [];
    const fingeringsVocabulary: Note[][] = [];
    let emissionMatrix: number[][] = [];
    let initialProbabilities: number[] | null = null;

    for (const measure of this.measures) {
      const resultMeasure = { events: [] as TabEvent[] };

      for (const [eventTick, eventTypes] of measure.timeline.entries()) {
        const event: TabEvent = {
          time: this.midi.ticksToSeconds(eventTick),
          time_ticks: eventTick,
          measure_timing: (eventTick - measure.measureStart) / measure.durationTicks,
        };

        if (eventTypes.time_signature) {
          event.time_signature_change = [
            eventTypes.time_signature.numerator,
            eventTypes.time_signature.denominator,
          ];
        }

        if (eventTypes.notes) {
          event.notes = [];
          const notesPitches = [...new Set(eventTypes.notes.map((note) => note.pitch))].sort((a, b) => a - b);
          const noteKey = notesPitches.join(",");

          const notes = this.fretboard.fixOobNotes(
            notesPitches.map((pitch) => new Note(pitch)),
            false,
          );
          const noteOptions = this.fretboard.getNoteOptions(notes);

          if (!notesVocabulary.has(noteKey)) {
            const fingeringOptions = this.fretboard.getPossibleFingerings(noteOptions);
            if (fingeringOptions.length > 0) {
              notesVocabulary.set(noteKey, notesVocabulary.size);
              fingeringsVocabulary.push(...fingeringOptions);

              if (initialProbabilities === null) {
                const isolatedDifficulties = fingeringOptions.map((path) =>
                  computeIsolatedPathDifficulty(this.fretboard.positions, path, this.tuning),
                );
                initialProbabilities = difficultiesToProbabilities(isolatedDifficulties);
              }

              emissionMatrix = expandEmissionMatrix(emissionMatrix, fingeringOptions);
            }
          }

          if (notesVocabulary.has(noteKey)) {
            notesSequence.push(notesVocabulary.get(noteKey) ?? -1);
          } else {
            notesSequence.push(-1);
          }
        }

        resultMeasure.events.push(event);
      }

      tab.measures.push(resultMeasure);
    }

    return { notesSequence, fingeringsVocabulary, emissionMatrix, initialProbabilities };
  }

  private runViterbi(
    notesSequence: number[],
    fingeringsVocabulary: Note[][],
    emissionMatrix: number[][],
    initialProbabilities: number[] | null,
  ): Note[][] {
    if (notesSequence.length === 0 || fingeringsVocabulary.length === 0 || emissionMatrix.length === 0) {
      return [];
    }

    const transitionMatrix = buildTransitionMatrix(
      this.fretboard.positions,
      fingeringsVocabulary,
      this.weights,
      this.tuning,
    );

    const initial = initialProbabilities
      ? [
          ...initialProbabilities,
          ...Array(Math.max(0, transitionMatrix.length - initialProbabilities.length)).fill(0),
        ]
      : Array(transitionMatrix.length).fill(1 / transitionMatrix.length);

    const sequenceIndices = viterbi(notesSequence, transitionMatrix, emissionMatrix, initial);
    return sequenceIndices.map((index) => fingeringsVocabulary[index]);
  }

  private populateTabNotes(tab: TabJson, sequence: Note[][]): TabJson {
    let ievent = 0;

    for (const measure of tab.measures) {
      for (const event of measure.events) {
        if (!event.notes) {
          continue;
        }

        const fingering = sequence[ievent] ?? [];
        for (const pathNote of fingering) {
          const position = this.fretboard.positions.get(pathNote);
          if (!position) {
            continue;
          }

          const [string, fret] = position;
          event.notes.push({
            degree: pathNote.degree,
            octave: pathNote.octave,
            string,
            fret,
          });
        }

        ievent += 1;
      }
    }

    return tab;
  }

  toStringLines(): string[] {
    let result = this.tuning.strings.map((string) => `${string.degree}${string.degree.length > 1 ? "||" : " ||"}`);

    for (const measure of this.tab.measures) {
      for (let i = 0; i < measure.events.length; i++) {
        const event = measure.events[i];
        if (!event.notes) {
          continue;
        }

        for (const note of event.notes) {
          result[note.string] += String(note.fret);
        }

        const nextTiming = i < measure.events.length - 1 ? measure.events[i + 1].measure_timing : 1;
        const dashesToAdd = Math.max(1, Math.floor((nextTiming - event.measure_timing) * 16));

        result = fillMeasureStr(result);
        for (let string = 0; string < this.nstrings; string++) {
          result[string] += "-".repeat(dashesToAdd);
        }
      }

      for (let string = 0; string < this.nstrings; string++) {
        result[string] += "|";
      }
    }

    return result;
  }

  toAsciiString(): string {
    return `${this.toStringLines().join("\n")}\n`;
  }

  toJsonString(pretty = true): string {
    return JSON.stringify(this.tab, null, pretty ? 2 : 0);
  }

  writeAsciiFile(path?: string): string {
    const finalPath = path
      ? resolve(path)
      : resolve(this.outputDir ?? "./tabs", `${this.name}.txt`);
    mkdirSync(dirname(finalPath), { recursive: true });
    writeFileSync(finalPath, this.toAsciiString(), "utf8");
    return finalPath;
  }

  writeJsonFile(path?: string): string {
    const finalPath = path
      ? resolve(path)
      : resolve(this.outputDir ?? "./json", `${this.name}.json`);
    mkdirSync(dirname(finalPath), { recursive: true });
    writeFileSync(finalPath, this.toJsonString(true), "utf8");
    return finalPath;
  }
}
