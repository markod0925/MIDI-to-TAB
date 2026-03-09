#!/usr/bin/env python3
"""Python baseline converter using the original tuttut algorithm."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pretty_midi  # noqa: E402
from tuttut.logic.tab import Tab  # noqa: E402
from tuttut.logic.theory import Tuning  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert MIDI to ASCII tab with original Python algorithm")
    parser.add_argument("--midi", type=Path, required=True, help="Path to MIDI file")
    parser.add_argument("--ascii", type=Path, required=True, help="Path to output ASCII tab")
    parser.add_argument("--json", dest="json_path", type=Path, default=None, help="Optional JSON output path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    midi = pretty_midi.PrettyMIDI(args.midi.as_posix())
    tab = Tab(args.midi.stem, Tuning(), midi)

    args.ascii.parent.mkdir(parents=True, exist_ok=True)
    args.ascii.write_text("\n".join(tab.to_string()) + "\n", encoding="utf-8")

    if args.json_path is not None:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(json.dumps(tab.tab, indent=2), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
