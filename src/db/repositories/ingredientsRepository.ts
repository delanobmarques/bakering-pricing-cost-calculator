import { execute, queryOne, queryRows } from '../client'
import type { IngredientRow, IngredientStatus } from '../types'

export type IngredientUsageWarning = {
  ingredient_id: string
  ingredient_name: string
  ingredient_status: IngredientStatus
  affected_recipes: number
}

export type MissingPriceUsage = {
  ingredient_id: string
  ingredient_name: string
  ingredient_status: IngredientStatus
  current_price: number | null
  used_in_variants: number
  used_in_recipes: number
}

export type DataQualityIssue = {
  ingredient_id: string
  ingredient_name: string
  ingredient_status: IngredientStatus
  issue_type: 'DOUBLE_CHECK' | 'UNVERIFIED'
}

type ListFilters = {
  search?: string
  status?: IngredientStatus | 'ALL'
  includeArchived?: boolean
  sortBy?: 'name' | 'status' | 'vendor' | 'updated_at'
  sortDirection?: 'ASC' | 'DESC'
}

export const ingredientsRepository = {
  listAll(filters: ListFilters = {}): IngredientRow[] {
    const clauses: string[] = []
    const bind: Array<string | number | null> = []

    if (!filters.includeArchived) {
      clauses.push('archived = 0')
    }

    if (filters.status && filters.status !== 'ALL') {
      clauses.push('status = ?')
      bind.push(filters.status)
    }

    if (filters.search && filters.search.trim().length > 0) {
      const search = `%${filters.search.trim()}%`
      clauses.push('(name LIKE ? OR vendor LIKE ?)')
      bind.push(search, search)
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const sortBy = filters.sortBy ?? 'name'
    const sortDirection = filters.sortDirection ?? 'ASC'

    return queryRows<IngredientRow>(
      `SELECT * FROM ingredients ${where} ORDER BY ${sortBy} ${sortDirection};`,
      bind,
    )
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

  update(row: IngredientRow): void {
    execute(
      `UPDATE ingredients
       SET name = ?,
           price = ?,
           package_size = ?,
           unit = ?,
           density_factor = ?,
           grams_per_unit = ?,
           size_in_grams = ?,
           cost_per_gram = ?,
           status = ?,
           vendor = ?,
           notes = ?,
           archived = ?,
           updated_at = ?
       WHERE id = ?;`,
      [
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
        row.updated_at,
        row.id,
      ],
    )
  },

  setArchived(id: string, archived: boolean): void {
    execute('UPDATE ingredients SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [
      archived ? 1 : 0,
      id,
    ])
  },

  updatePriceAndStatus(id: string, price: number, status: IngredientStatus): void {
    execute(
      `UPDATE ingredients
       SET price = ?,
           status = ?,
           cost_per_gram = CASE
             WHEN size_in_grams > 0 THEN ROUND(? / size_in_grams, 6)
             ELSE cost_per_gram
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [price, status, price, id],
    )
  },

  listRecipeWarningsForNonOkIngredients(): IngredientUsageWarning[] {
    return queryRows<IngredientUsageWarning>(
      `SELECT
        i.id AS ingredient_id,
        i.name AS ingredient_name,
        i.status AS ingredient_status,
        COUNT(DISTINCT r.id) AS affected_recipes
      FROM ingredients i
      INNER JOIN recipe_lines rl ON rl.ingredient_id = i.id
      INNER JOIN recipe_variants rv ON rv.id = rl.variant_id
      INNER JOIN recipes r ON r.id = rv.recipe_id
      WHERE i.archived = 0 AND i.status != 'OK'
      GROUP BY i.id, i.name, i.status
      ORDER BY i.name ASC;`,
    )
  },

  listRecipeUsedMissingPrices(): MissingPriceUsage[] {
    return queryRows<MissingPriceUsage>(
      `SELECT
        i.id AS ingredient_id,
        i.name AS ingredient_name,
        i.status AS ingredient_status,
        i.price AS current_price,
        COUNT(DISTINCT rv.id) AS used_in_variants,
        COUNT(DISTINCT r.id) AS used_in_recipes
      FROM ingredients i
      INNER JOIN recipe_lines rl ON rl.ingredient_id = i.id
      INNER JOIN recipe_variants rv ON rv.id = rl.variant_id
      INNER JOIN recipes r ON r.id = rv.recipe_id
      WHERE i.archived = 0 AND (i.status = 'MISSING_PRICE' OR i.price IS NULL)
      GROUP BY i.id, i.name, i.status, i.price
      ORDER BY i.name ASC;`,
    )
  },

  listDataQualityIssues(): DataQualityIssue[] {
    return queryRows<DataQualityIssue>(
      `SELECT
        id AS ingredient_id,
        name AS ingredient_name,
        status AS ingredient_status,
        status AS issue_type
      FROM ingredients
      WHERE archived = 0 AND status IN ('DOUBLE_CHECK', 'UNVERIFIED')
      ORDER BY name ASC;`,
    )
  },
}
