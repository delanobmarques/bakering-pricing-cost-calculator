import { execute, queryOne, queryRows } from '../client'
import type { RecipeRow } from '../types'

export const recipesRepository = {
  listAll(): RecipeRow[] {
    return queryRows<RecipeRow>('SELECT * FROM recipes ORDER BY name ASC;')
  },

  getById(id: string): RecipeRow | null {
    return queryOne<RecipeRow>('SELECT * FROM recipes WHERE id = ?;', [id])
  },

  insert(row: RecipeRow): void {
    execute(
      'INSERT INTO recipes (id, name, is_brigadeiro, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
      [row.id, row.name, row.is_brigadeiro, row.notes, row.created_at, row.updated_at],
    )
  },
}
