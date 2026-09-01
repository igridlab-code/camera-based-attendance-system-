"""Fix camera database entries - rename bad default and remove duplicate."""
import sqlite3

conn = sqlite3.connect(r"data\attendance.db")
cur = conn.cursor()

# Show current state
cur.execute("SELECT id, name, source_url, is_active, health_status FROM cameras")
print("BEFORE:", cur.fetchall())

# Rename camera 2 from "a" to proper name
cur.execute(
    "UPDATE cameras SET name=?, location=?, health_status=? WHERE id=2",
    ("Default Webcam", "Main Entrance", "online")
)

# Delete the duplicate camera 3 (same source=0, conflicts with camera 2)
cur.execute("DELETE FROM cameras WHERE id=3")

conn.commit()

cur.execute("SELECT id, name, source_url, is_active, health_status FROM cameras")
print("AFTER:", cur.fetchall())
conn.close()
print("Done!")
