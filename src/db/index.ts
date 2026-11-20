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
  `CREATE TABLE setting (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  // Phase 4: uploads. The server forgets a session after 30 min idle, so its id is only a
  // cache; swipes go back to 'pending' whenever the server session is lost.
  `ALTER TABLE scan ADD COLUMN server_session_id TEXT;
   ALTER TABLE scan ADD COLUMN result_summary TEXT;   -- JSON: latest fit headline
   ALTER TABLE swipe ADD COLUMN upload_state TEXT NOT NULL DEFAULT 'pending'; -- pending | uploaded | rejected
   ALTER TABLE swipe ADD COLUMN upload_error TEXT;
   ALTER TABLE swipe ADD COLUMN job_id TEXT;`,
  // Phase 5: calibration profiles (SRS 5). The newest active one is used for scanning.
  `CREATE TABLE profile (
     id TEXT PRIMARY KEY NOT NULL,
     created_at TEXT NOT NULL,
     app_version TEXT NOT NULL,
     schema_version INTEGER NOT NULL,
     model TEXT NOT NULL,
     android_sdk INTEGER NOT NULL,
     data TEXT NOT NULL,                -- JSON CalibrationProfile
     active INTEGER NOT NULL DEFAULT 1
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
