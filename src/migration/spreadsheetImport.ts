import * as XLSX from 'xlsx'
import { execute } from '../db'
import type {
  IngredientRow,
  IngredientStatus,
  IngredientUnit,
  OverheadRow,
  RecipeComplexity,
  RecipeComponent,
  RecipeLineRow,
  RecipeRow,
  RecipeVariantRow,
} from '../db'

type CellRow = unknown[]

type ParsedNumber = {
  value: number | null
  malformed: boolean
}

type ParsedIngredient = IngredientRow

type ParsedRecipe = {
  recipe: RecipeRow
  variants: RecipeVariantRow[]
  lines: RecipeLineRow[]
}

type ImportIssueSeverity = 'warning' | 'error'

export type ImportIssue = {
  severity: ImportIssueSeverity
  code:
    | 'MALFORMED_VALUE'
    | 'MISSING_REFERENCE'
    | 'SKIPPED_RECIPE'
    | 'DATA_QUALITY'
    | 'DUPLICATE_CATEGORY'
    | 'PARSE_WARNING'
  message: string
}

export type SpreadsheetImportResult = {
  counts: {
    ingredients: number
    recipes: number
    variants: number
    lines: number
    overheadRows: number
  }
  skippedRecipes: string[]
  issues: ImportIssue[]
  quindimReference: string
}

const QUINDIM_REFERENCE =
  'Quindim not migrated. Manual rebuild reference: Ovos 15g, Coco 150g, Acucar Refinado 360g, Manteiga 45g.'

const COMPONENT_ALIAS: Record<string, RecipeComponent> = {
  MASSA: 'MASSA',
  RECHEIO: 'RECHEIO',
  CALDA: 'CALDA',
  OTHERS: 'OTHERS',
  OUTROS: 'OTHERS',
}

const KNOWN_NON_RECIPE_SHEETS = [
  'STOCK_PRICE',
  'STOCK PRICE',
  'OVERHEADS',
  'LIST',
  'HOW TO USE',
  'TEMPLATE PAGE',
]

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeSheetName(name: string): string {
  return name.trim().toUpperCase()
}

function normalizeIngredientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function sanitizeNumberString(value: string): string {
  return value.replace(/\$/g, '').replace(/,/g, '.').replace(/\s+/g, '')
}

function parseSimpleFormula(input: string): number | null {
  const expression = input.trim().replace(/^=/, '')
  if (!/^[0-9.+\-*/() ]+$/.test(expression)) {
    return null
  }

  // Supports simple multiplication chains from spreadsheet cells like "=450*2".
  if (/^[0-9.]+(\*[0-9.]+)+$/.test(expression)) {
    return expression
      .split('*')
      .map((part) => Number(part))
      .reduce((acc, value) => acc * value, 1)
  }

  return null
}

function parseNumberish(raw: unknown): ParsedNumber {
  if (raw === null || raw === undefined) {
    return { value: null, malformed: false }
  }

  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { value: raw, malformed: false }
      : { value: null, malformed: true }
  }

  const rawText = String(raw).trim()
  if (!rawText) {
    return { value: null, malformed: false }
  }

  const formulaValue = rawText.startsWith('=') ? parseSimpleFormula(rawText) : null
  if (formulaValue !== null) {
    return { value: formulaValue, malformed: false }
  }

  const normalized = sanitizeNumberString(rawText)
  const hadMalformedToken = normalized.includes(';') || rawText.includes(';')
  const safeNormalized = normalized.replace(/;/g, '.')

  const parsed = Number(safeNormalized)
  if (Number.isFinite(parsed)) {
    return { value: parsed, malformed: hadMalformedToken }
  }

  return { value: null, malformed: true }
}

function normalizeIngredientStatus(raw: unknown): IngredientStatus {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

  if (text.includes('MISSING')) {
    return 'MISSING_PRICE'
  }
  if (text.includes('DOUBLE')) {
    return 'DOUBLE_CHECK'
  }
  if (text === 'OK') {
    return 'OK'
  }
  return 'UNVERIFIED'
}

function normalizeUnit(raw: unknown): IngredientUnit {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase()
  if (text === 'KG' || text === 'G' || text === 'L' || text === 'ML' || text === 'UND') {
    return text
  }
  return 'G'
}

function computeSizeInGrams(params: {
  unit: IngredientUnit
  packageSize: number
  densityFactor: number
  gramsPerUnit: number | null
}): number {
  switch (params.unit) {
    case 'KG':
      return params.packageSize * 1000
    case 'G':
      return params.packageSize
    case 'L':
      return params.packageSize * 1000
    case 'ML':
      return params.packageSize * params.densityFactor
    case 'UND':
      return params.packageSize * (params.gramsPerUnit ?? 50)
    default:
      return params.packageSize
  }
}

function complexityBySize(sizeCm: number): RecipeComplexity {
  if (sizeCm <= 10) {
    return 'SIMPLE'
  }
  if (sizeCm <= 15) {
    return 'MEDIUM'
  }
  return 'HARD'
}

function isLikelyRecipeSheet(name: string): boolean {
  const normalized = normalizeSheetName(name)
  if (KNOWN_NON_RECIPE_SHEETS.includes(normalized)) {
    return false
  }

  return true
}

function readSheetRows(sheet: XLSX.WorkSheet): CellRow[] {
  return XLSX.utils.sheet_to_json<CellRow>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  })
}

function parseIngredients(
  sheet: XLSX.WorkSheet,
  issues: ImportIssue[],
): { ingredients: ParsedIngredient[]; byName: Map<string, IngredientRow> } {
  const rows = readSheetRows(sheet)
  const ingredients: ParsedIngredient[] = []
  const byName = new Map<string, IngredientRow>()

  for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const name = String(row[0] ?? '').trim()
    if (!name) {
      continue
    }

    const priceParsed = parseNumberish(row[1])
    const packageParsed = parseNumberish(row[2])
    const unit = normalizeUnit(row[3])
    const status = normalizeIngredientStatus(row[5])
    const vendorRaw = String(row[6] ?? '').trim()

    if (packageParsed.value === null || packageParsed.value <= 0) {
      issues.push({
        severity: 'warning',
        code: 'MALFORMED_VALUE',
        message: `Ingredient "${name}" has invalid package size and was skipped.`,
      })
      continue
    }

    const densityFactor = 1.03
    const explicitSizeInGrams = parseNumberish(row[4]).value
    const gramsPerUnit =
      unit === 'UND' && explicitSizeInGrams !== null
        ? explicitSizeInGrams / packageParsed.value
        : unit === 'UND'
          ? 50
          : null

    const sizeInGrams =
      explicitSizeInGrams && explicitSizeInGrams > 0
        ? explicitSizeInGrams
        : computeSizeInGrams({
            unit,
            packageSize: packageParsed.value,
            densityFactor,
            gramsPerUnit,
          })

    const effectiveStatus: IngredientStatus = priceParsed.value === null ? 'MISSING_PRICE' : status

    if (priceParsed.malformed || packageParsed.malformed) {
      issues.push({
        severity: 'warning',
        code: 'MALFORMED_VALUE',
        message: `Ingredient "${name}" contains malformed numeric data and was normalized where possible.`,
      })
    }

    if (effectiveStatus === 'DOUBLE_CHECK' || effectiveStatus === 'UNVERIFIED') {
      issues.push({
        severity: 'warning',
        code: 'DATA_QUALITY',
        message: `Ingredient "${name}" imported with status ${effectiveStatus}.`,
      })
    }

    const price = priceParsed.value
    const costPerGram = price !== null && sizeInGrams > 0 ? price / sizeInGrams : 0

    const ingredient: IngredientRow = {
      id: crypto.randomUUID(),
      name,
      price,
      package_size: packageParsed.value,
      unit,
      density_factor: densityFactor,
      grams_per_unit: unit === 'UND' ? gramsPerUnit : null,
      size_in_grams: sizeInGrams,
      cost_per_gram: costPerGram,
      status: effectiveStatus,
      vendor: vendorRaw.length > 0 ? vendorRaw : null,
      notes: null,
      archived: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    }

    ingredients.push(ingredient)
    byName.set(normalizeIngredientName(name), ingredient)
  }

  return { ingredients, byName }
}

function parseRecipeSizes(rows: CellRow[]): number[] {
  const sizes = new Set<number>()

  for (const row of rows) {
    for (const cell of row) {
      const text = String(cell ?? '')
      const match = text.match(/\b(\d{1,2})\s*cm\b/i)
      if (!match) {
        continue
      }

      const parsed = Number(match[1])
      if (Number.isFinite(parsed)) {
        sizes.add(parsed)
      }
    }
  }

  if (sizes.size === 0) {
    sizes.add(10)
  }

  return Array.from(sizes).sort((a, b) => a - b)
}

function shouldSkipRecipeName(name: string): boolean {
  const normalized = normalizeSheetName(name)
  return normalized === 'S' || normalized.includes('QUINDIM')
}

function parseRecipeLines(
  rows: CellRow[],
  ingredientByName: Map<string, IngredientRow>,
  issues: ImportIssue[],
): {
  lines: Array<{
    ingredientId: string
    component: RecipeComponent
    amountGrams: number
    obs: string | null
    sortOrder: number
  }>
  copiedForMultipleSizes: boolean
} {
  let currentComponent: RecipeComponent = 'MASSA'
  let sortOrder = 0
  const lines: Array<{
    ingredientId: string
    component: RecipeComponent
    amountGrams: number
    obs: string | null
    sortOrder: number
  }> = []

  for (const row of rows) {
    const rawName = String(row[0] ?? '').trim()
    if (!rawName) {
      continue
    }

    const normalizedLabel = rawName.toUpperCase()
    const nextComponent = COMPONENT_ALIAS[normalizedLabel]
    if (nextComponent) {
      currentComponent = nextComponent
      continue
    }

    if (normalizedLabel.includes('INGREDIENT') || normalizedLabel.includes('CAKE VALUE')) {
      continue
    }

    const amountParsed = parseNumberish(row[7] ?? row[6])
    if (amountParsed.value === null || amountParsed.value <= 0) {
      continue
    }

    const ingredient = ingredientByName.get(normalizeIngredientName(rawName))
    if (!ingredient) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_REFERENCE',
        message: `Recipe ingredient "${rawName}" was not found in imported ingredient catalogue and was skipped.`,
      })
      continue
    }

    const obsText = String(row[6] ?? '').trim()

    lines.push({
      ingredientId: ingredient.id,
      component: currentComponent,
      amountGrams: amountParsed.value,
      obs: obsText.length > 0 ? obsText : null,
      sortOrder,
    })
    sortOrder += 1
  }

  return { lines, copiedForMultipleSizes: false }
}

function parseRecipes(
  workbook: XLSX.WorkBook,
  ingredientByName: Map<string, IngredientRow>,
  issues: ImportIssue[],
): { recipes: ParsedRecipe[]; skippedRecipes: string[] } {
  const recipes: ParsedRecipe[] = []
  const skippedRecipes: string[] = []

  for (const sheetName of workbook.SheetNames) {
    if (!isLikelyRecipeSheet(sheetName)) {
      continue
    }

    if (shouldSkipRecipeName(sheetName)) {
      skippedRecipes.push(sheetName)
      issues.push({
        severity: 'warning',
        code: 'SKIPPED_RECIPE',
        message: `Recipe sheet "${sheetName}" was excluded from auto-migration. ${QUINDIM_REFERENCE}`,
      })
      continue
    }

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      continue
    }

    const rows = readSheetRows(sheet)
    const sizes = parseRecipeSizes(rows)
    const lineParse = parseRecipeLines(rows, ingredientByName, issues)

    if (lineParse.lines.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'PARSE_WARNING',
        message: `Recipe sheet "${sheetName}" did not produce ingredient lines and was skipped.`,
      })
      continue
    }

    const recipeId = crypto.randomUUID()
    const isBrigadeiro = normalizeSheetName(sheetName).includes('BRIG') ? 1 : 0
    const recipeRow: RecipeRow = {
      id: recipeId,
      name: sheetName.trim(),
      is_brigadeiro: isBrigadeiro,
      notes: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }

    const variants: RecipeVariantRow[] = sizes.map((size) => ({
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      cake_size_cm: size,
      complexity: complexityBySize(size),
      hourly_rate: null,
      time_hours: 1.5,
      profit_margin: null,
      tax_rate: 0.15,
      overhead_rate: 0.05,
      quantity_produced: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    }))

    const lines: RecipeLineRow[] = []
    for (const variant of variants) {
      for (const line of lineParse.lines) {
        lines.push({
          id: crypto.randomUUID(),
          variant_id: variant.id,
          ingredient_id: line.ingredientId,
          component: line.component,
          amount_grams: line.amountGrams,
          sort_order: line.sortOrder,
          obs: line.obs,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
      }
    }

    if (sizes.length > 1) {
      issues.push({
        severity: 'warning',
        code: 'PARSE_WARNING',
        message: `Recipe "${sheetName}" had multiple sizes and ingredient lines were copied across variants as a migration baseline.`,
      })
    }

    recipes.push({ recipe: recipeRow, variants, lines })
  }

  return { recipes, skippedRecipes }
}

function parseOverheads(sheet: XLSX.WorkSheet | undefined, issues: ImportIssue[]): OverheadRow[] {
  if (!sheet) {
    return []
  }

  const rows = readSheetRows(sheet)
  const seenCategories = new Set<string>()
  const overheadRows: OverheadRow[] = []

  for (const row of rows) {
    const rawCategory = String(row[0] ?? '').trim()
    if (!rawCategory) {
      continue
    }

    const categoryUpper = rawCategory.toUpperCase()
    if (
      categoryUpper.includes('CATEGORY') ||
      categoryUpper.includes('TOTAL') ||
      categoryUpper.includes('AVERAGE')
    ) {
      continue
    }

    const categoryKey = categoryUpper.replace(/\s+/g, ' ')
    if (seenCategories.has(categoryKey)) {
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_CATEGORY',
        message: `Overhead category "${rawCategory}" duplicated in spreadsheet; imported once.`,
      })
      continue
    }

    seenCategories.add(categoryKey)

    const monthValues = Array.from(
      { length: 12 },
      (_, index) => parseNumberish(row[index + 1]).value,
    )

    overheadRows.push({
      id: crypto.randomUUID(),
      category: rawCategory,
      jan: monthValues[0],
      feb: monthValues[1],
      mar: monthValues[2],
      apr: monthValues[3],
      may: monthValues[4],
      jun: monthValues[5],
      jul: monthValues[6],
      aug: monthValues[7],
      sep: monthValues[8],
      oct: monthValues[9],
      nov: monthValues[10],
      dec: monthValues[11],
      created_at: nowIso(),
      updated_at: nowIso(),
    })
  }

  return overheadRows
}

function importIntoDatabase(
  ingredients: IngredientRow[],
  recipes: ParsedRecipe[],
  overheadRows: OverheadRow[],
  sourceFilename: string,
): void {
  execute('BEGIN;')
  try {
    execute('DELETE FROM recipe_lines;')
    execute('DELETE FROM recipe_variants;')
    execute('DELETE FROM recipes;')
    execute('DELETE FROM overheads;')
    execute('DELETE FROM ingredients;')

    for (const ingredient of ingredients) {
      execute(
        `INSERT INTO ingredients (
          id, name, price, package_size, unit, density_factor, grams_per_unit, size_in_grams,
          cost_per_gram, status, vendor, notes, archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          ingredient.id,
          ingredient.name,
          ingredient.price,
          ingredient.package_size,
          ingredient.unit,
          ingredient.density_factor,
          ingredient.grams_per_unit,
          ingredient.size_in_grams,
          ingredient.cost_per_gram,
          ingredient.status,
          ingredient.vendor,
          ingredient.notes,
          ingredient.archived,
          ingredient.created_at,
          ingredient.updated_at,
        ],
      )
    }

    for (const recipe of recipes) {
      execute(
        'INSERT INTO recipes (id, name, is_brigadeiro, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
        [
          recipe.recipe.id,
          recipe.recipe.name,
          recipe.recipe.is_brigadeiro,
          recipe.recipe.notes,
          recipe.recipe.created_at,
          recipe.recipe.updated_at,
        ],
      )

      for (const variant of recipe.variants) {
        execute(
          `INSERT INTO recipe_variants (
            id, recipe_id, cake_size_cm, complexity, hourly_rate, time_hours,
            profit_margin, tax_rate, overhead_rate, quantity_produced, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            variant.id,
            variant.recipe_id,
            variant.cake_size_cm,
            variant.complexity,
            variant.hourly_rate,
            variant.time_hours,
            variant.profit_margin,
            variant.tax_rate,
            variant.overhead_rate,
            variant.quantity_produced,
            variant.created_at,
            variant.updated_at,
          ],
        )
      }

      for (const line of recipe.lines) {
        execute(
          `INSERT INTO recipe_lines (
            id, variant_id, ingredient_id, component, amount_grams, sort_order, obs, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            line.id,
            line.variant_id,
            line.ingredient_id,
            line.component,
            line.amount_grams,
            line.sort_order,
            line.obs,
            line.created_at,
            line.updated_at,
          ],
        )
      }
    }

    for (const row of overheadRows) {
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
    }

    execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('migration_import_started_at', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`,
      [nowIso()],
    )
    execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('migration_source_filename', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`,
      [sourceFilename],
    )
    execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('migration_completed', 'false', CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = CURRENT_TIMESTAMP;`,
    )
    execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('migration_quindim_reference', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`,
      [QUINDIM_REFERENCE],
    )

    execute('COMMIT;')
  } catch (error) {
    execute('ROLLBACK;')
    throw error
  }
}

function getSheetByApproximateName(
  workbook: XLSX.WorkBook,
  partialName: string,
): XLSX.WorkSheet | undefined {
  const wanted = partialName.toUpperCase()
  const sheetName = workbook.SheetNames.find((name) => normalizeSheetName(name).includes(wanted))
  return sheetName ? workbook.Sheets[sheetName] : undefined
}

export async function importSpreadsheetWorkbook(file: File): Promise<SpreadsheetImportResult> {
  const issues: ImportIssue[] = []
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const ingredientSheet = getSheetByApproximateName(workbook, 'STOCK')
  if (!ingredientSheet) {
    throw new Error('Could not find Stock_price sheet in workbook.')
  }

  const { ingredients, byName } = parseIngredients(ingredientSheet, issues)
  const { recipes, skippedRecipes } = parseRecipes(workbook, byName, issues)
  const overheadSheet = getSheetByApproximateName(workbook, 'OVERHEAD')
  const overheadRows = parseOverheads(overheadSheet, issues)

  importIntoDatabase(ingredients, recipes, overheadRows, file.name)

  return {
    counts: {
      ingredients: ingredients.length,
      recipes: recipes.length,
      variants: recipes.reduce((acc, recipe) => acc + recipe.variants.length, 0),
      lines: recipes.reduce((acc, recipe) => acc + recipe.lines.length, 0),
      overheadRows: overheadRows.length,
    },
    skippedRecipes,
    issues,
    quindimReference: QUINDIM_REFERENCE,
  }
}
