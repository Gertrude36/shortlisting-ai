#!/usr/bin/env python3
"""
Add published_at column to applications table.
"""

import sqlite3
import sys

db_path = "capstone.db"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("PRAGMA table_info(applications);")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "published_at" in columns:
        print("✓ Column 'published_at' already exists")
    else:
        print("Adding 'published_at' column to applications table...")
        cursor.execute("ALTER TABLE applications ADD COLUMN published_at DATETIME NULL;")
        conn.commit()
        print("✓ Column 'published_at' added successfully")
    
    # Verify
    cursor.execute("PRAGMA table_info(applications);")
    columns_after = {col[1]: col[2] for col in cursor.fetchall()}
    
    if "published_at" in columns_after:
        print(f"✓ Verification: 'published_at' column type = {columns_after['published_at']}")
    else:
        print("❌ Verification failed")
        sys.exit(1)
    
    conn.close()
    print("\n✅ Database migration completed successfully")
    
except Exception as e:
    print(f"❌ Migration failed: {str(e)}")
    sys.exit(1)
