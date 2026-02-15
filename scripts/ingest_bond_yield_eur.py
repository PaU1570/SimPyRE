#!/usr/bin/env python3

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Dict, List

DEFAULT_CSV = Path("data/historical/bonds/bond_yield_eur_data.csv")
DEFAULT_JSON = Path("data/historical/bonds/euro_gov.json")


def load_bond_yield_csv(csv_path: Path) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []

    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            date_value = (row.get("DATE") or "").strip()
            if not date_value:
                continue

            value_key = None
            for key in row.keys():
                if key not in ("DATE", "TIME PERIOD"):
                    value_key = key
                    break

            if not value_key:
                continue

            raw_value = (row.get(value_key) or "").strip()
            if not raw_value:
                continue

            try:
                value = float(raw_value)
            except ValueError:
                continue

            records.append({"date": date_value, "return": value})

    return records


def update_metadata(metadata: Dict[str, Any], records: List[Dict[str, Any]]) -> Dict[str, Any]:
    metadata = dict(metadata)
    metadata["data_points"] = len(records)

    if records:
        years = []
        for record in records:
            date_value = record.get("date", "")
            if len(date_value) >= 4 and date_value[:4].isdigit():
                years.append(int(date_value[:4]))
        if years:
            metadata["start_year"] = min(years)
            metadata["end_year"] = max(years)

    return metadata


def ingest(csv_path: Path, json_path: Path) -> int:
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 1

    records = load_bond_yield_csv(csv_path)

    existing: Dict[str, Any] = {}
    if json_path.exists():
        existing = json.loads(json_path.read_text(encoding="utf-8"))

    existing["metadata"] = update_metadata(existing.get("metadata", {}), records)
    existing["data"] = records

    json_path.write_text(json.dumps(existing, indent=4), encoding="utf-8")
    print(f"Wrote {len(records)} records to {json_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ingest Euro government bond yields from CSV into JSON."
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    args = parser.parse_args()

    return ingest(args.csv, args.json)


if __name__ == "__main__":
    raise SystemExit(main())
