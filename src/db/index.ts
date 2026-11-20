import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/** Schema migrations, applied in order; PRAGMA user_version records how many ran (SRS 5). */
const MIGRATIONS: string[] = [
  `CREATE TABLE scan (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL,
     status TEXT NOT NULL,              -- 'recording' | 'finished'
     tracking_mode TEXT NOT NULL,
     profile_id TEXT,
     table_z_m REAL NOT NULL,
     yaw_alignment_rad REAL,
     android_bias_ut TEXT,              -- JSON [x,y,z]
     noise_ut TEXT,                     -- JSON [x,y,z]
     range_ut REAL,
     baseline_start_ut TEXT,            -- JSON [x,y,z], world frame
     baseline_end_ut TEXT,
     result_field_grid TEXT,            -- filled from Phase 3 on
     magnet_estimate TEXT
   );
   CREATE TABLE swipe (
     id TEXT PRIMARY KEY NOT NULL,
     scan_id TEXT NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
     ord INTEGER NOT NULL,
     format_version INTEGER NOT NULL,
     file_uri TEXT NOT NULL,            -- swipe format v1 JSON, as uploaded
     created_at TEXT NOT NULL,
     mag_samples INTEGER NOT NULL,
     mag_rate_hz REAL NOT NULL,
     duration_s REAL NOT NULL,
     saturated_samples INTEGER NOT NULL,
     mean_speed_m_s REAL,
     UNIQUE (scan_id, ord)
   );`,
];

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (db) return db;
  const d = openDatabaseSync('magnet-eye.db');
  d.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < MIGRATIONS.length; v++) {
    d.withTransactionSync(() => {
      d.execSync(MIGRATIONS[v]);
      d.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  db = d;
  return d;
}
