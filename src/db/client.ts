import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { migrations } from './migrations'

type RawSqliteDb = {
  exec: (
    arg: string | { sql: string; bind?: unknown[]; rowMode?: string; returnValue?: string },
  ) => unknown
  selectValues: (sql: string, bind?: unknown[]) => Array<number | string>
}

type RawSqlite3 = {
  oo1: {
    OpfsDb?: new (filename?: string, flags?: string) => RawSqliteDb
    DB: new (filename?: string, flags?: string) => RawSqliteDb
  }
}

export type DatabaseHandle = {
  db: RawSqliteDb
  schemaVersion: number
  storage: 'opfs' | 'memory'
}

let dbHandle: DatabaseHandle | null = null

function createDatabase(sqlite3: RawSqlite3): { db: RawSqliteDb; storage: 'opfs' | 'memory' } {
  if (sqlite3.oo1.OpfsDb) {
    return {
      db: new sqlite3.oo1.OpfsDb('/bakery-pricing-cost-calculator.db', 'c'),
      storage: 'opfs',
    }
  }

  return {
    db: new sqlite3.oo1.DB(':memory:', 'c'),
    storage: 'memory',
  }
}

function ensureMigrationTable(db: RawSqliteDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`)
}

function getAppliedVersions(db: RawSqliteDb): Set<number> {
  const values = db.selectValues('SELECT version FROM schema_migrations ORDER BY version;')
  return new Set(values.map((value) => Number(value)))
}

function applyMigrations(db: RawSqliteDb): number {
  ensureMigrationTable(db)
  const appliedVersions = getAppliedVersions(db)

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    db.exec('BEGIN;')
    try {
      for (const statement of migration.up) {
        db.exec(statement)
      }

      db.exec({
        sql: 'INSERT INTO schema_migrations(version, name) VALUES (?, ?);',
        bind: [migration.version, migration.name],
      })

      db.exec(`PRAGMA user_version = ${migration.version};`)
      db.exec('COMMIT;')
    } catch (error) {
      db.exec('ROLLBACK;')
      throw error
    }
  }

  return migrations.length === 0 ? 0 : migrations[migrations.length - 1].version
}

export async function initializeDatabase(): Promise<DatabaseHandle> {
  if (dbHandle) {
    return dbHandle
  }

  const sqlite3 = (await sqlite3InitModule()) as RawSqlite3

  const { db, storage } = createDatabase(sqlite3)

  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')

  const schemaVersion = applyMigrations(db)
  dbHandle = { db, schemaVersion, storage }

  return dbHandle
}
