#!/usr/bin/env python3
import csv
import sys


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: tenant_csv_pad_trim.py <input.csv> <output.csv> <target_cols>", file=sys.stderr)
        return 2
    inp, outp, n_s = sys.argv[1], sys.argv[2], sys.argv[3]
    n = int(n_s)
    with open(inp, newline="", encoding="utf-8") as f_in, open(
        outp, "w", newline="", encoding="utf-8"
    ) as f_out:
        reader = csv.reader(f_in)
        writer = csv.writer(f_out)
        for row in reader:
            if len(row) < n:
                row = row + [""] * (n - len(row))
            elif len(row) > n:
                row = row[:n]
            writer.writerow(row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

