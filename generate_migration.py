import os

def generate_migration():
    input_file = 'function_list.txt'
    output_file = 'supabase/migrations/20251126220000_fix_search_path_dynamic_oid.sql'
    
    # Extract unique function names
    func_names = set()
    with open(input_file, 'r') as f:
        for line in f:
            line = line.strip()
            if '(' in line:
                name = line.split('(')[0].strip()
                # Remove public. prefix if present
                if name.startswith('public.'):
                    name = name[7:]
                func_names.add(name)

    # Sort for stability
    sorted_names = sorted(list(func_names))
    
    # Format as SQL array literal
    names_sql = ", ".join([f"'{n}'" for n in sorted_names])
    
    sql_content = [
        "-- Migration: Fix Search Path Dynamic OID (v10)",
        "-- Description: Uses dynamic OID resolution to handle signature type mismatches (e.g. timestamptz vs timestamp with time zone).",
        "-- Author: Antigravity",
        "-- Date: 2025-11-26",
        "",
        "DO $$",
        "DECLARE",
        "    r record;",
        f"    target_funcs text[] := ARRAY[{names_sql}];",
        "BEGIN",
        "    FOR r IN",
        "        SELECT p.oid::regprocedure as sig, p.prokind, p.proname",
        "        FROM pg_proc p",
        "        JOIN pg_namespace n ON n.oid = p.pronamespace",
        "        WHERE n.nspname = 'public'",
        "          AND p.proname = ANY(target_funcs)",
        "          AND p.prosecdef -- Only target SECURITY DEFINER functions as requested",
        "    LOOP",
        "        -- Use pg_catalog, public (standard) - hoping signature fix resolves the issue",
        "        -- If strict regex fails on space, we might need to revisit, but signature mismatch is the most likely culprit for 'nothing happened'",
        "        IF r.prokind = 'p' THEN",
        "            EXECUTE format('ALTER PROCEDURE %s SET search_path = pg_catalog, public;', r.sig);",
        "        ELSE",
        "            EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public;', r.sig);",
        "        END IF;",
        "        RAISE NOTICE 'Fixed search_path for %', r.sig;",
        "    END LOOP;",
        "END;",
        "$$;"
    ]
    
    with open(output_file, 'w') as f:
        f.write('\n'.join(sql_content))

if __name__ == '__main__':
    generate_migration()
