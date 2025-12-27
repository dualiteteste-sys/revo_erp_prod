#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


INVOKE_RE = re.compile(r"\.functions\.invoke\(\s*[`'\"]([a-zA-Z0-9_-]+)")


def iter_code_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    allowed = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
    paths: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in allowed:
            continue
        if any(part.startswith(".") for part in path.parts):
            continue
        paths.append(path)
    return paths


def find_invoked_functions(search_roots: list[Path]) -> set[str]:
    names: set[str] = set()
    for root in search_roots:
        for file in iter_code_files(root):
            try:
                text = file.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for match in INVOKE_RE.finditer(text):
                names.add(match.group(1))
    return names


def list_defined_functions(functions_dir: Path) -> set[str]:
    if not functions_dir.exists():
        return set()
    names: set[str] = set()
    for path in functions_dir.iterdir():
        if not path.is_dir():
            continue
        if path.name.startswith("_"):
            continue
        names.add(path.name)
    return names


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail CI if app invokes Edge Functions not present in supabase/functions/*",
    )
    parser.add_argument(
        "--functions-dir",
        default="supabase/functions",
        help="Directory containing edge functions (default: supabase/functions)",
    )
    parser.add_argument(
        "--search-root",
        action="append",
        default=["src"],
        help="Directory to scan for `.functions.invoke(...)` calls (repeatable). Default: src",
    )
    args = parser.parse_args()

    repo_root = Path.cwd()
    functions_dir = repo_root / args.functions_dir
    search_roots = [repo_root / p for p in args.search_root]

    invoked = find_invoked_functions(search_roots)
    defined = list_defined_functions(functions_dir)

    missing = sorted(invoked - defined)
    if missing:
        print("Missing Edge Functions in supabase/functions (invoked by app code):", file=sys.stderr)
        for name in missing:
            print(f"- {name}", file=sys.stderr)
        return 1

    print(f"Edge Function coverage OK ({len(invoked)} functions invoked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

