import { execute, queryOne, queryRows } from '../client'
import type { SettingRow } from '../types'

export const settingsRepository = {
  listAll(): SettingRow[] {
    return queryRows<SettingRow>('SELECT * FROM settings ORDER BY key ASC;')
  },

  getByKey(key: string): SettingRow | null {
    return queryOne<SettingRow>('SELECT * FROM settings WHERE key = ?;', [key])
  },

  upsert(key: string, value: string): void {
    execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`,
      [key, value],
    )
  },
}
