import { execute, queryOne, queryRows } from '../client'
import type { IngredientRow } from '../types'

export const ingredientsRepository = {
  listAll(): IngredientRow[] {
    return queryRows<IngredientRow>('SELECT * FROM ingredients ORDER BY name ASC;')
  },

  getById(id: string): IngredientRow | null {
    return queryOne<IngredientRow>('SELECT * FROM ingredients WHERE id = ?;', [id])
  },

  getByName(name: string): IngredientRow | null {
    return queryOne<IngredientRow>('SELECT * FROM ingredients WHERE name = ? COLLATE NOCASE;', [
      name,
    ])
  },

  insert(row: IngredientRow): void {
    execute(
      `INSERT INTO ingredients (
        id, name, price, package_size, unit, density_factor, grams_per_unit, size_in_grams,
        cost_per_gram, status, vendor, notes, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        row.id,
        row.name,
        row.price,
        row.package_size,
        row.unit,
        row.density_factor,
        row.grams_per_unit,
        row.size_in_grams,
        row.cost_per_gram,
        row.status,
        row.vendor,
        row.notes,
        row.archived,
        row.created_at,
        row.updated_at,
      ],
    )
  },
}
