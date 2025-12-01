import re
import sys

def fix_migration_v2(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Pattern:
    # DO $$ BEGIN
    #   alter table ... add constraint ...;
    # EXCEPTION
    #   WHEN duplicate_object THEN null;
    # END $$;
    
    # We want to change:
    #   WHEN duplicate_object THEN null;
    # to:
    #   WHEN duplicate_object THEN null;
    #   WHEN SQLSTATE '55000' THEN null;
    
    # However, we need to be careful to only target the constraint blocks.
    # The previous script wrapped them in a specific way.
    
    # Let's verify the structure.
    # We can search for the specific block structure.
    
    # Regex to match the exception block inside a DO block that contains "add constraint"
    # We look for "add constraint" inside the BEGIN ... EXCEPTION block.
    
    pattern = re.compile(r'(DO \$\$ BEGIN\s+alter table\s+.*?\s+add constraint\s+.*?;)(\s+EXCEPTION\s+WHEN duplicate_object THEN null;\s+END \$\$;)', re.IGNORECASE | re.DOTALL)
    
    def replacement(match):
        start_block = match.group(1)
        end_block = match.group(2)
        # We replace the end block
        new_end_block = "\nEXCEPTION\n  WHEN duplicate_object THEN null;\n  WHEN SQLSTATE '55000' THEN null;\nEND $$;"
        return start_block + new_end_block

    new_content = pattern.sub(replacement, content)
    
    # Also, just in case, let's look for any "using index" constraint creation that might have been missed or formatted differently?
    # But the previous script was pretty uniform.
    
    with open(file_path, 'w') as f:
        f.write(new_content)

    print(f"Successfully processed {file_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fix_migration_v2.py <file_path>")
        sys.exit(1)
    fix_migration_v2(sys.argv[1])
