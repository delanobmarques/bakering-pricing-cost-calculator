import { execute, queryOne, queryRows } from '../client'
import type { OverheadRow } from '../types'

export const overheadsRepository = {
  listAll(): OverheadRow[] {
    return queryRows<OverheadRow>('SELECT * FROM overheads ORDER BY category ASC;')
  },

  getById(id: string): OverheadRow | null {
    return queryOne<OverheadRow>('SELECT * FROM overheads WHERE id = ?;', [id])
  },

  insert(row: OverheadRow): void {
    execute(
      `INSERT INTO overheads (
        id, category, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        row.id,
        row.category,
        row.jan,
        row.feb,
        row.mar,
        row.apr,
        row.may,
        row.jun,
        row.jul,
        row.aug,
        row.sep,
        row.oct,
        row.nov,
        row.dec,
        row.created_at,
        row.updated_at,
      ],
    )
  },
}
