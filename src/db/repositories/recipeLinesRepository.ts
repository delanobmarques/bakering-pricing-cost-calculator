import { execute, queryRows } from '../client'
import type { RecipeLineRow } from '../types'

export const recipeLinesRepository = {
  listByVariantId(variantId: string): RecipeLineRow[] {
    return queryRows<RecipeLineRow>(
      'SELECT * FROM recipe_lines WHERE variant_id = ? ORDER BY sort_order ASC, created_at ASC;',
      [variantId],
    )
  },

  insert(row: RecipeLineRow): void {
    execute(
      `INSERT INTO recipe_lines (
        id, variant_id, ingredient_id, component, amount_grams, sort_order, obs, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        row.id,
        row.variant_id,
        row.ingredient_id,
        row.component,
        row.amount_grams,
        row.sort_order,
        row.obs,
        row.created_at,
        row.updated_at,
      ],
    )
  },

  deleteByVariantId(variantId: string): void {
    execute('DELETE FROM recipe_lines WHERE variant_id = ?;', [variantId])
  },
}
