# Common MIDI/TAB File Format (`GhTabFile`)

This repository defines a shared binary schema for both projects:

- producer: `MIDI-to-TAB`
- consumer: `GuitarHelio`

Schema file: `schemas/gh_tab.proto`

## Why Protobuf

- Compact binary encoding (much less redundant than JSON).
- Backward-compatible evolution through optional/unknown fields.
- Good tooling support across languages/platforms.
- Fast enough for runtime loading on desktop/mobile.

## Data Model

`GhTabFile` contains:

1. `song` metadata
2. `timeline` (PPQ, tempo map, time signatures, markers)
3. normalized source tracks (`tracks`)
4. one or more playable TAB layers (`layers`) for difficulty targets

## Encoding Rules (Normative)

1. `schema_version` is required and starts at `1`.
2. Tracks must be sorted by `track_id`.
3. Notes in each track must be sorted by `(start_tick, pitch, duration_tick)`.
4. `PackedNote.delta_start_tick` is delta from previous note start tick in the same track.
5. Events in each difficulty layer must be sorted by start tick.
6. `TabEvent.delta_tick` is delta from previous event in the same difficulty layer.
7. `string_index` is zero-based.
8. `source_track_id` and `source_note_index` are 1-based references; `0` means unset.
9. `source_note_index` references the canonical sorted note list in `tracks[source_track_id].notes`.
10. Time values are tick-based integers; real-time seconds are derived from `tempo_map`.
11. If diagnostics are not needed, leave `TabEvent.diagnostics` unset.

## Compatibility Policy

- Additive changes (new fields, new enum values) are allowed in `v1`.
- Breaking changes require:
  - new package namespace (for example `guitarhelio.tab.v2`)
  - incremented `schema_version`
- Never reuse or repurpose old field numbers.

## Compression Notes

Primary size savings come from:

- protobuf varint encoding
- delta tick fields (`delta_start_tick`, `delta_tick`)
- omitting debug diagnostics in production

If you need further compression for distribution, wrap the `.bin` payload with gzip/zstd.
