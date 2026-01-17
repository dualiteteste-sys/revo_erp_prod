#!/usr/bin/env python3
import csv
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: tenant_csv_cols.py <csv_path>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        row = next(reader, None)
        print(0 if row is None else len(row))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

