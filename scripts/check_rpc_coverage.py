#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


RPC_CALL_RES: list[re.Pattern[str]] = [
    # Direct supabase-js usage: supabase.rpc("fn", ...)
    re.compile(r"\.rpc\(\s*['\"]([a-zA-Z0-9_]+)['\"]"),
    # App wrapper: callRpc("fn", ...)
    # Also supports generics: callRpc<Foo>("fn", ...)
    re.compile(r"\bcallRpc(?:<[^>]+>)?\(\s*['\"]([a-zA-Z0-9_]+)['\"]"),
]
SQL_FN_RE = re.compile(
    r"(?is)\bcreate\s+(?:or\s+replace\s+)?function\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*\(",
)


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


def find_rpc_calls(search_roots: list[Path]) -> set[str]:
    rpcs: set[str] = set()
    for root in search_roots:
        for file in iter_code_files(root):
            try:
                text = file.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for rx in RPC_CALL_RES:
                for match in rx.finditer(text):
                    rpcs.add(match.group(1))
    return rpcs


def find_defined_functions(migrations_dir: Path) -> set[str]:
    fns: set[str] = set()
    for sql in sorted(migrations_dir.glob("*.sql")):
        try:
            text = sql.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for match in SQL_FN_RE.finditer(text):
            fns.add(match.group(1))
    return fns


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail CI if app uses Supabase RPCs not present in supabase/migrations/*.sql",
    )
    parser.add_argument(
        "--migrations-dir",
        default="supabase/migrations",
        help="Directory containing SQL migrations (default: supabase/migrations)",
    )
    parser.add_argument(
        "--search-root",
        action="append",
        default=["src", "supabase/functions"],
        help="Directory to scan for `.rpc('...')` calls (repeatable). Default: src and supabase/functions",
    )
    args = parser.parse_args()

    repo_root = Path.cwd()
    migrations_dir = repo_root / args.migrations_dir
    search_roots = [repo_root / p for p in args.search_root]

    used_rpcs = find_rpc_calls(search_roots)
    defined_fns = find_defined_functions(migrations_dir)

    missing = sorted(used_rpcs - defined_fns)
    if missing:
        print("Missing RPCs in supabase/migrations (used by app code):", file=sys.stderr)
        for name in missing:
            print(f"- {name}", file=sys.stderr)
        return 1

    print(f"RPC coverage OK ({len(used_rpcs)} RPCs referenced).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
