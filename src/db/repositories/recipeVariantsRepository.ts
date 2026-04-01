import { execute, queryOne, queryRows } from '../client'
import type { RecipeVariantRow } from '../types'

export const recipeVariantsRepository = {
  listByRecipeId(recipeId: string): RecipeVariantRow[] {
    return queryRows<RecipeVariantRow>(
      'SELECT * FROM recipe_variants WHERE recipe_id = ? ORDER BY cake_size_cm ASC;',
      [recipeId],
    )
  },

  getById(id: string): RecipeVariantRow | null {
    return queryOne<RecipeVariantRow>('SELECT * FROM recipe_variants WHERE id = ?;', [id])
  },

  insert(row: RecipeVariantRow): void {
    execute(
      `INSERT INTO recipe_variants (
        id, recipe_id, cake_size_cm, complexity, hourly_rate, time_hours,
        profit_margin, tax_rate, overhead_rate, quantity_produced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        row.id,
        row.recipe_id,
        row.cake_size_cm,
        row.complexity,
        row.hourly_rate,
        row.time_hours,
        row.profit_margin,
        row.tax_rate,
        row.overhead_rate,
        row.quantity_produced,
        row.created_at,
        row.updated_at,
      ],
    )
  },
}
