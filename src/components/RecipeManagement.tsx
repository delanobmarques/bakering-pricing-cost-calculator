import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  recipeLinesRepository,
  recipesRepository,
  recipeVariantsRepository,
  settingsRepository,
  type IngredientRow,
  type RecipeComplexity,
  type RecipeComponent,
  type RecipeLineRow,
  type RecipeRow,
  type RecipeVariantRow,
} from '../db'
import {
  calculateBrigadeiroPricing,
  calculateScaledCost,
  calculateStandardPricing,
  toDisplayString,
} from '../lib/domain'
import { Decimal } from '../lib/decimal'
import { calculateLineCost } from '../lib/pricingEngine'

type DraftLine = {
  id: string
  ingredientId: string
  ingredientName: string
  component: RecipeComponent
  amountGrams: string
  obs: string
  sortOrder: number
}

type DraftVariant = {
  id: string
  cakeSizeCm: string
  complexity: RecipeComplexity
  hourlyRate: string
  timeHours: string
  profitMargin: string
  taxRate: string
  overheadRate: string
  quantityProduced: string
  lines: DraftLine[]
}

type DraftRecipe = {
  id: string
  name: string
  isBrigadeiro: boolean
  notes: string
  variants: DraftVariant[]
  createdAt: string
}

type Props = {
  enabled: boolean
  ingredients: IngredientRow[]
}

const COMPONENTS: RecipeComponent[] = ['MASSA', 'RECHEIO', 'CALDA', 'OTHERS']

const SIZE_TIME_REFERENCE: Record<number, number> = {
  5: 1,
  8: 1.5,
  10: 2,
  12: 2.5,
  15: 3,
  20: 3.5,
  25: 4,
  30: 4.5,
}

function nowIso(): string {
  return new Date().toISOString()
}

function createEmptyVariant(sizeCm: string): DraftVariant {
  return {
    id: crypto.randomUUID(),
    cakeSizeCm: sizeCm,
    complexity: 'SIMPLE',
    hourlyRate: '20',
    timeHours: '1.5',
    profitMargin: '1.3',
    taxRate: '0.15',
    overheadRate: '0.05',
    quantityProduced: '1',
    lines: [],
  }
}

function createEmptyRecipe(): DraftRecipe {
  return {
    id: crypto.randomUUID(),
    name: '',
    isBrigadeiro: false,
    notes: '',
    variants: [createEmptyVariant('10')],
    createdAt: nowIso(),
  }
}

function normalizeLines(lines: DraftLine[]): DraftLine[] {
  return lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line, index) => ({ ...line, sortOrder: index }))
}

export function RecipeManagement({ enabled, ingredients }: Props) {
  const [recipes, setRecipes] = useState<DraftRecipe[]>([])
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({})
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null)
  const [editorRecipe, setEditorRecipe] = useState<DraftRecipe | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [copyFromVariantId, setCopyFromVariantId] = useState<string>('')
  const [newVariantSize, setNewVariantSize] = useState('')
  const [newQuantityRequired, setNewQuantityRequired] = useState('1')
  const [recipeError, setRecipeError] = useState<string | null>(null)

  const ingredientById = useMemo(() => {
    return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]))
  }, [ingredients])

  const ingredientIdByName = useMemo(() => {
    return new Map(ingredients.map((ingredient) => [ingredient.name.toLowerCase(), ingredient.id]))
  }, [ingredients])

  const buildDraftFromDatabase = useCallback(
    (row: RecipeRow): DraftRecipe => {
      const variantRows = recipeVariantsRepository.listByRecipeId(row.id)

      const variants: DraftVariant[] = variantRows.map((variant) => {
        const lineRows = recipeLinesRepository.listByVariantId(variant.id)

        const lines: DraftLine[] = lineRows.map((line) => ({
          id: line.id,
          ingredientId: line.ingredient_id,
          ingredientName: ingredientById.get(line.ingredient_id)?.name ?? '',
          component: line.component,
          amountGrams: String(line.amount_grams),
          obs: line.obs ?? '',
          sortOrder: line.sort_order,
        }))

        return {
          id: variant.id,
          cakeSizeCm: String(variant.cake_size_cm),
          complexity: variant.complexity,
          hourlyRate: variant.hourly_rate === null ? '' : String(variant.hourly_rate),
          timeHours: String(variant.time_hours),
          profitMargin: variant.profit_margin === null ? '' : String(variant.profit_margin),
          taxRate: String(variant.tax_rate),
          overheadRate: String(variant.overhead_rate),
          quantityProduced: String(variant.quantity_produced),
          lines: normalizeLines(lines),
        }
      })

      return {
        id: row.id,
        name: row.name,
        isBrigadeiro: row.is_brigadeiro === 1,
        notes: row.notes ?? '',
        variants,
        createdAt: row.created_at,
      }
    },
    [ingredientById],
  )

  const loadRecipes = useCallback(() => {
    const rows = recipesRepository.listAll()
    setRecipes(rows.map((row) => buildDraftFromDatabase(row)))
    const allSettings = settingsRepository.listAll()
    setSettingsMap(
      allSettings.reduce<Record<string, string>>((acc, setting) => {
        acc[setting.key] = setting.value
        return acc
      }, {}),
    )
  }, [buildDraftFromDatabase])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const timer = window.setTimeout(() => {
      loadRecipes()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [enabled, loadRecipes])

  const activeVariant = useMemo(() => {
    if (!editorRecipe || !selectedVariantId) {
      return null
    }
    return editorRecipe.variants.find((variant) => variant.id === selectedVariantId) ?? null
  }, [editorRecipe, selectedVariantId])

  const suggestedTimeForActiveVariant = useMemo(() => {
    if (!activeVariant) {
      return null
    }

    const size = Number(activeVariant.cakeSizeCm)
    if (!Number.isFinite(size)) {
      return null
    }

    return SIZE_TIME_REFERENCE[size] ?? null
  }, [activeVariant])

  const pricingPanel = useMemo(() => {
    if (!editorRecipe || !activeVariant) {
      return null
    }

    const lineInputs = activeVariant.lines
      .map((line) => {
        const ingredient = ingredientById.get(line.ingredientId)
        const amount = Number(line.amountGrams)
        if (!ingredient || ingredient.price === null || !Number.isFinite(amount) || amount <= 0) {
          return null
        }

        return {
          amountGrams: amount,
          price: ingredient.price,
          sizeInGrams: ingredient.size_in_grams,
        }
      })
      .filter((line): line is { amountGrams: number; price: number; sizeInGrams: number } =>
        Boolean(line),
      )

    const fallbackByComplexity: Record<RecipeComplexity, string> = {
      SIMPLE: settingsMap.hourly_rate_simple ?? '20',
      MEDIUM: settingsMap.hourly_rate_medium ?? '25',
      HARD: settingsMap.hourly_rate_hard ?? '30',
    }

    const resolveNumber = (rawValue: string, fallback: string): Decimal => {
      const source = rawValue.trim().length > 0 ? rawValue : fallback
      const value = Number(source)
      return Number.isFinite(value) ? new Decimal(value) : new Decimal(fallback)
    }

    const hourlyRate = resolveNumber(
      activeVariant.hourlyRate,
      fallbackByComplexity[activeVariant.complexity],
    )
    const timeHours = resolveNumber(activeVariant.timeHours, '1.5')
    const profitMargin = resolveNumber(
      activeVariant.profitMargin,
      settingsMap.profit_margin ?? '1.3',
    )
    const taxRate = resolveNumber(activeVariant.taxRate, settingsMap.tax_rate ?? '0.15')
    const overheadRate = resolveNumber(
      activeVariant.overheadRate,
      settingsMap.overhead_rate ?? '0.05',
    )

    const quantityProduced = resolveNumber(activeVariant.quantityProduced, '1')
    const requiredQuantity = resolveNumber(newQuantityRequired, '1')

    if (editorRecipe.isBrigadeiro) {
      const breakdown = calculateBrigadeiroPricing(lineInputs, {
        hourlyRate,
        taxRate,
        profitMargin,
        overheadRate,
        timeHours,
      })
      const scaledCost = calculateScaledCost(
        breakdown.ingredientCostWithTax,
        quantityProduced,
        requiredQuantity,
      )
      const subtotalBeforeProfit = breakdown.subtotalWithOverhead
      const profitAmount = breakdown.priceWithProfit.minus(subtotalBeforeProfit)

      return {
        mode: 'brigadeiro' as const,
        ingredients: breakdown.ingredientCostWithTax,
        labour: breakdown.time15x,
        overheads: breakdown.overheadCost,
        profit: profitAmount,
        tax: breakdown.taxOnProfit,
        sellingPrice: breakdown.sellingPrice,
        scaledCost,
      }
    }

    const breakdown = calculateStandardPricing(lineInputs, {
      hourlyRate,
      taxRate,
      profitMargin,
      overheadRate,
      timeHours,
    })
    const scaledCost = calculateScaledCost(
      breakdown.ingredientCostWithTax,
      quantityProduced,
      requiredQuantity,
    )

    const subtotalBeforeProfit = breakdown.labourCost
      .plus(breakdown.ingredientCostWithTax)
      .plus(breakdown.overheadCost)
    const subtotalWithProfit = subtotalBeforeProfit.mul(profitMargin)
    const profitAmount = subtotalWithProfit.minus(subtotalBeforeProfit)
    const taxAmount = subtotalWithProfit.mul(taxRate)

    return {
      mode: 'standard' as const,
      ingredients: breakdown.ingredientCostWithTax,
      labour: breakdown.labourCost,
      overheads: breakdown.overheadCost,
      profit: profitAmount,
      tax: taxAmount,
      sellingPrice: breakdown.sellingPrice,
      scaledCost,
    }
  }, [
    activeVariant,
    editorRecipe,
    ingredientById,
    newQuantityRequired,
    settingsMap.hourly_rate_hard,
    settingsMap.hourly_rate_medium,
    settingsMap.hourly_rate_simple,
    settingsMap.overhead_rate,
    settingsMap.profit_margin,
    settingsMap.tax_rate,
  ])

  const computeLineDisplayCost = (line: DraftLine): string => {
    const ingredient = ingredientById.get(line.ingredientId)
    if (!ingredient || ingredient.price === null || Number(line.amountGrams) <= 0) {
      return '-'
    }

    try {
      const lineCost = calculateLineCost({
        amountGrams: line.amountGrams,
        price: ingredient.price,
        sizeInGrams: ingredient.size_in_grams,
      })
      return toDisplayString(lineCost)
    } catch {
      return '-'
    }
  }

  const computeVariantTotal = (variant: DraftVariant): string => {
    const total = variant.lines.reduce((acc, line) => {
      const ingredient = ingredientById.get(line.ingredientId)
      if (!ingredient || ingredient.price === null || Number(line.amountGrams) <= 0) {
        return acc
      }

      try {
        const lineCost = calculateLineCost({
          amountGrams: line.amountGrams,
          price: ingredient.price,
          sizeInGrams: ingredient.size_in_grams,
        })
        return acc.plus(lineCost)
      } catch {
        return acc
      }
    }, new Decimal(0))

    return toDisplayString(total)
  }

  const beginNewRecipe = () => {
    const recipe = createEmptyRecipe()
    setEditorRecipe(recipe)
    setSelectedVariantId(recipe.variants[0]?.id ?? null)
    setCopyFromVariantId('')
    setNewVariantSize('')
    setRecipeError(null)
  }

  const beginEditRecipe = (recipe: DraftRecipe) => {
    const clone = structuredClone(recipe) as DraftRecipe
    setEditorRecipe(clone)
    setSelectedVariantId(clone.variants[0]?.id ?? null)
    setCopyFromVariantId('')
    setNewVariantSize('')
    setRecipeError(null)
  }

  const updateRecipeHeader = (patch: Partial<DraftRecipe>) => {
    if (!editorRecipe) {
      return
    }
    setEditorRecipe({ ...editorRecipe, ...patch })
  }

  const updateVariant = (variantId: string, patch: Partial<DraftVariant>) => {
    if (!editorRecipe) {
      return
    }

    setEditorRecipe({
      ...editorRecipe,
      variants: editorRecipe.variants.map((variant) =>
        variant.id === variantId ? { ...variant, ...patch } : variant,
      ),
    })
  }

  const addVariant = () => {
    if (!editorRecipe) {
      return
    }

    const size = newVariantSize.trim()
    if (!size || Number(size) <= 0) {
      setRecipeError('Variant size must be a positive number.')
      return
    }

    if (editorRecipe.variants.some((variant) => variant.cakeSizeCm === size)) {
      setRecipeError('A variant with this size already exists for the recipe.')
      return
    }

    const source = copyFromVariantId
      ? editorRecipe.variants.find((variant) => variant.id === copyFromVariantId)
      : null

    const nextVariant: DraftVariant = source
      ? {
          ...structuredClone(source),
          id: crypto.randomUUID(),
          cakeSizeCm: size,
          lines: source.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
        }
      : createEmptyVariant(size)

    setEditorRecipe({ ...editorRecipe, variants: [...editorRecipe.variants, nextVariant] })
    setSelectedVariantId(nextVariant.id)
    setNewVariantSize('')
    setCopyFromVariantId('')
    setRecipeError(null)
  }

  const removeVariant = (variantId: string) => {
    if (!editorRecipe || editorRecipe.variants.length <= 1) {
      return
    }

    const remaining = editorRecipe.variants.filter((variant) => variant.id !== variantId)
    setEditorRecipe({ ...editorRecipe, variants: remaining })
    setSelectedVariantId(remaining[0]?.id ?? null)
  }

  const updateLine = (lineId: string, patch: Partial<DraftLine>) => {
    if (!editorRecipe || !activeVariant) {
      return
    }

    const nextLines = activeVariant.lines.map((line) => {
      if (line.id !== lineId) {
        return line
      }

      const merged = { ...line, ...patch }
      if (patch.ingredientName !== undefined) {
        const ingredientId = ingredientIdByName.get(patch.ingredientName.trim().toLowerCase())
        merged.ingredientId = ingredientId ?? ''
      }
      return merged
    })

    updateVariant(activeVariant.id, { lines: nextLines })
  }

  const addLine = (component: RecipeComponent) => {
    if (!activeVariant) {
      return
    }

    const line: DraftLine = {
      id: crypto.randomUUID(),
      ingredientId: '',
      ingredientName: '',
      component,
      amountGrams: '',
      obs: '',
      sortOrder: activeVariant.lines.length,
    }

    updateVariant(activeVariant.id, { lines: [...activeVariant.lines, line] })
  }

  const removeLine = (lineId: string) => {
    if (!activeVariant) {
      return
    }

    const nextLines = normalizeLines(activeVariant.lines.filter((line) => line.id !== lineId))
    updateVariant(activeVariant.id, { lines: nextLines })
  }

  const moveLine = (lineId: string, direction: -1 | 1) => {
    if (!activeVariant) {
      return
    }

    const ordered = activeVariant.lines.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    const index = ordered.findIndex((line) => line.id === lineId)
    const targetIndex = index + direction

    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
      return
    }

    const current = ordered[index]
    ordered[index] = ordered[targetIndex]
    ordered[targetIndex] = current

    updateVariant(activeVariant.id, { lines: normalizeLines(ordered) })
  }

  const saveRecipe = () => {
    if (!editorRecipe) {
      return
    }

    setRecipeError(null)

    if (editorRecipe.name.trim().length === 0) {
      setRecipeError('Recipe name is required.')
      return
    }

    if (editorRecipe.variants.length === 0) {
      setRecipeError('At least one variant is required.')
      return
    }

    for (const variant of editorRecipe.variants) {
      if (!variant.cakeSizeCm || Number(variant.cakeSizeCm) <= 0) {
        setRecipeError('Each variant must have a valid size.')
        return
      }

      for (const line of variant.lines) {
        if (!line.ingredientId) {
          setRecipeError('Each line must select an ingredient from autocomplete results.')
          return
        }
      }
    }

    const existing = recipesRepository.getById(editorRecipe.id)
    const timestamp = nowIso()

    const recipeRow: RecipeRow = {
      id: editorRecipe.id,
      name: editorRecipe.name.trim(),
      is_brigadeiro: editorRecipe.isBrigadeiro ? 1 : 0,
      notes: editorRecipe.notes.trim() ? editorRecipe.notes.trim() : null,
      created_at: existing?.created_at ?? editorRecipe.createdAt,
      updated_at: timestamp,
    }

    if (existing) {
      recipesRepository.update(recipeRow)
      recipeVariantsRepository.deleteByRecipeId(editorRecipe.id)
    } else {
      recipesRepository.insert(recipeRow)
    }

    for (const variant of editorRecipe.variants) {
      const variantRow: RecipeVariantRow = {
        id: variant.id,
        recipe_id: editorRecipe.id,
        cake_size_cm: Number(variant.cakeSizeCm),
        complexity: variant.complexity,
        hourly_rate: variant.hourlyRate.trim() ? Number(variant.hourlyRate) : null,
        time_hours: Number(variant.timeHours || '0'),
        profit_margin: variant.profitMargin.trim() ? Number(variant.profitMargin) : null,
        tax_rate: Number(variant.taxRate || '0.15'),
        overhead_rate: Number(variant.overheadRate || '0.05'),
        quantity_produced: Number(variant.quantityProduced || '1'),
        created_at: timestamp,
        updated_at: timestamp,
      }

      recipeVariantsRepository.insert(variantRow)

      const lines = normalizeLines(variant.lines)
      for (const line of lines) {
        const lineRow: RecipeLineRow = {
          id: line.id,
          variant_id: variant.id,
          ingredient_id: line.ingredientId,
          component: line.component,
          amount_grams: Number(line.amountGrams || '0'),
          sort_order: line.sortOrder,
          obs: line.obs.trim() ? line.obs.trim() : null,
          created_at: timestamp,
          updated_at: timestamp,
        }

        recipeLinesRepository.insert(lineRow)
      }
    }

    loadRecipes()
  }

  const duplicateRecipe = (sourceRecipe: DraftRecipe) => {
    const timestamp = nowIso()
    const duplicate: DraftRecipe = {
      ...structuredClone(sourceRecipe),
      id: crypto.randomUUID(),
      name: `Copy of ${sourceRecipe.name}`,
      createdAt: timestamp,
      variants: sourceRecipe.variants.map((variant) => ({
        ...structuredClone(variant),
        id: crypto.randomUUID(),
        lines: variant.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
      })),
    }

    const recipeRow: RecipeRow = {
      id: duplicate.id,
      name: duplicate.name,
      is_brigadeiro: duplicate.isBrigadeiro ? 1 : 0,
      notes: duplicate.notes.trim() ? duplicate.notes.trim() : null,
      created_at: timestamp,
      updated_at: timestamp,
    }

    recipesRepository.insert(recipeRow)

    for (const variant of duplicate.variants) {
      recipeVariantsRepository.insert({
        id: variant.id,
        recipe_id: duplicate.id,
        cake_size_cm: Number(variant.cakeSizeCm),
        complexity: variant.complexity,
        hourly_rate: variant.hourlyRate.trim() ? Number(variant.hourlyRate) : null,
        time_hours: Number(variant.timeHours || '0'),
        profit_margin: variant.profitMargin.trim() ? Number(variant.profitMargin) : null,
        tax_rate: Number(variant.taxRate || '0.15'),
        overhead_rate: Number(variant.overheadRate || '0.05'),
        quantity_produced: Number(variant.quantityProduced || '1'),
        created_at: timestamp,
        updated_at: timestamp,
      })

      const lines = normalizeLines(variant.lines)
      for (const line of lines) {
        recipeLinesRepository.insert({
          id: line.id,
          variant_id: variant.id,
          ingredient_id: line.ingredientId,
          component: line.component,
          amount_grams: Number(line.amountGrams || '0'),
          sort_order: line.sortOrder,
          obs: line.obs.trim() ? line.obs.trim() : null,
          created_at: timestamp,
          updated_at: timestamp,
        })
      }
    }

    loadRecipes()
  }

  return (
    <section className="recipe-section">
      <article className="card">
        <div className="recipe-list-header">
          <h2>Recipe List</h2>
          <button type="button" onClick={beginNewRecipe}>
            Create New Recipe
          </button>
        </div>

        <div className="list">
          {recipes.length === 0 ? (
            <p>You haven't created any recipes yet. Let's build your first one!</p>
          ) : null}
          {recipes.map((recipe) => (
            <div key={recipe.id} className="list-row">
              <div>
                <strong>{recipe.name}</strong>
                <div className="meta">
                  <span
                    className={`status-pill ${recipe.isBrigadeiro ? 'status-check' : 'status-ok'}`}
                  >
                    {recipe.isBrigadeiro ? 'Brigadeiro mode' : 'Standard mode'}
                  </span>
                  <span>{recipe.variants.length} variant(s)</span>
                </div>

                {expandedRecipeId === recipe.id ? (
                  <div className="variant-summary-list">
                    {recipe.variants.map((variant) => (
                      <div key={variant.id} className="variant-summary-row">
                        <span>{variant.cakeSizeCm}cm</span>
                        <span>{variant.complexity}</span>
                        <span>Total ingredients: {computeVariantTotal(variant)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="row-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setExpandedRecipeId((current) => (current === recipe.id ? null : recipe.id))
                  }
                >
                  {expandedRecipeId === recipe.id ? 'Collapse' : 'Expand'}
                </button>
                <button type="button" className="secondary" onClick={() => beginEditRecipe(recipe)}>
                  Edit Recipe
                </button>
                <button type="button" className="secondary" onClick={() => duplicateRecipe(recipe)}>
                  Duplicate Recipe
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card">
        <h2>Recipe Editor</h2>

        {!editorRecipe ? <p>Select a recipe from the list or create a new one.</p> : null}

        {editorRecipe ? (
          <div className="recipe-editor">
            <div className="recipe-header-grid">
              <label>
                Recipe name
                <input
                  value={editorRecipe.name}
                  onChange={(event) => updateRecipeHeader({ name: event.target.value })}
                />
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editorRecipe.isBrigadeiro}
                  onChange={(event) => updateRecipeHeader({ isBrigadeiro: event.target.checked })}
                />
                Brigadeiro mode
              </label>
            </div>

            <label>
              Recipe notes
              <textarea
                rows={2}
                value={editorRecipe.notes}
                onChange={(event) => updateRecipeHeader({ notes: event.target.value })}
              />
            </label>

            <div className="variant-tabs">
              {editorRecipe.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  className={variant.id === selectedVariantId ? 'tab active' : 'tab'}
                  onClick={() => setSelectedVariantId(variant.id)}
                >
                  {variant.cakeSizeCm}cm
                </button>
              ))}
            </div>

            <div className="toolbar">
              <input
                value={newVariantSize}
                onChange={(event) => setNewVariantSize(event.target.value)}
                placeholder="New variant size (cm)"
              />
              <select
                value={copyFromVariantId}
                onChange={(event) => setCopyFromVariantId(event.target.value)}
              >
                <option value="">Copy from (optional)</option>
                {editorRecipe.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.cakeSizeCm}cm
                  </option>
                ))}
              </select>
              <button type="button" onClick={addVariant}>
                Add Variant
              </button>
              {activeVariant ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => removeVariant(activeVariant.id)}
                >
                  Remove Variant
                </button>
              ) : null}
            </div>

            <div className="pricing-panel">
              <h3>{editorRecipe.isBrigadeiro ? 'Brigadeiro Pricing' : 'Standard Pricing'}</h3>
              {pricingPanel ? (
                <>
                  <div className="you-charge-card">
                    {editorRecipe.isBrigadeiro ? (
                      <span className="status-pill status-check">brigadeiro pricing</span>
                    ) : null}
                    <div className="you-charge-label">YOU CHARGE</div>
                    <div className="you-charge-value">
                      <span className="you-charge-currency">$</span>
                      <span>{toDisplayString(pricingPanel.sellingPrice)}</span>
                    </div>
                  </div>

                  <div className="pricing-grid">
                    <span>Ingredients</span>
                    <strong>{toDisplayString(pricingPanel.ingredients)}</strong>
                    <span>Labour</span>
                    <strong>{toDisplayString(pricingPanel.labour)}</strong>
                    <span>Overheads</span>
                    <strong>{toDisplayString(pricingPanel.overheads)}</strong>
                    <span>Profit</span>
                    <strong>{toDisplayString(pricingPanel.profit)}</strong>
                    <span>Tax</span>
                    <strong>{toDisplayString(pricingPanel.tax)}</strong>
                  </div>

                  <div className="scaling-widget">
                    <h4>Recipe Scaling</h4>
                    <label>
                      Base quantity produced
                      <input
                        value={activeVariant?.quantityProduced ?? ''}
                        onChange={(event) =>
                          activeVariant
                            ? updateVariant(activeVariant.id, {
                                quantityProduced: event.target.value,
                              })
                            : undefined
                        }
                      />
                    </label>
                    <label>
                      New quantity required
                      <input
                        value={newQuantityRequired}
                        onChange={(event) => setNewQuantityRequired(event.target.value)}
                      />
                    </label>
                    <div>
                      Scaled ingredient cost (with tax):{' '}
                      <strong>{toDisplayString(pricingPanel.scaledCost)}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <p>
                  Almost there - add ingredients with valid amounts and your final price will show
                  up here.
                </p>
              )}
            </div>

            {activeVariant ? (
              <>
                <div className="variant-fields-grid">
                  <label>
                    Size (cm)
                    <input
                      value={activeVariant.cakeSizeCm}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { cakeSizeCm: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Complexity
                    <select
                      value={activeVariant.complexity}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, {
                          complexity: event.target.value as RecipeComplexity,
                        })
                      }
                    >
                      <option value="SIMPLE">Simple</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </label>

                  <label>
                    Hourly rate
                    <input
                      value={activeVariant.hourlyRate}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { hourlyRate: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Time (hours)
                    <input
                      value={activeVariant.timeHours}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { timeHours: event.target.value })
                      }
                    />
                    {suggestedTimeForActiveVariant !== null ? (
                      <div className="meta">
                        Suggested for {activeVariant.cakeSizeCm}cm: {suggestedTimeForActiveVariant}{' '}
                        hours
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            updateVariant(activeVariant.id, {
                              timeHours: String(suggestedTimeForActiveVariant),
                            })
                          }
                        >
                          Use suggestion
                        </button>
                      </div>
                    ) : null}
                  </label>

                  <label>
                    Profit margin
                    <input
                      value={activeVariant.profitMargin}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { profitMargin: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Tax rate
                    <input
                      value={activeVariant.taxRate}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { taxRate: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Overhead rate
                    <input
                      value={activeVariant.overheadRate}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { overheadRate: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Quantity produced
                    <input
                      value={activeVariant.quantityProduced}
                      onChange={(event) =>
                        updateVariant(activeVariant.id, { quantityProduced: event.target.value })
                      }
                    />
                  </label>
                </div>

                <datalist id="ingredient-options">
                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.name} />
                  ))}
                </datalist>

                {COMPONENTS.map((component) => {
                  const sectionLines = activeVariant.lines
                    .filter((line) => line.component === component)
                    .sort((a, b) => a.sortOrder - b.sortOrder)

                  return (
                    <section key={component} className="component-section">
                      <div className="component-header">
                        <h3>{component}</h3>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => addLine(component)}
                        >
                          Add Line
                        </button>
                      </div>

                      {sectionLines.length === 0 ? <p>No lines yet.</p> : null}
                      {sectionLines.map((line) => (
                        <div key={line.id} className="line-row">
                          <input
                            list="ingredient-options"
                            value={line.ingredientName}
                            onChange={(event) =>
                              updateLine(line.id, { ingredientName: event.target.value })
                            }
                            placeholder="Ingredient"
                          />
                          <input
                            value={line.amountGrams}
                            onChange={(event) =>
                              updateLine(line.id, { amountGrams: event.target.value })
                            }
                            placeholder="Amount (g)"
                          />
                          <input
                            value={line.obs}
                            onChange={(event) => updateLine(line.id, { obs: event.target.value })}
                            placeholder="Obs"
                          />
                          <span className="line-cost">
                            Line cost: {computeLineDisplayCost(line)}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => moveLine(line.id, -1)}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => moveLine(line.id, 1)}
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => removeLine(line.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </section>
                  )
                })}

                <div className="calc-box">
                  Total ingredient cost (active variant): {computeVariantTotal(activeVariant)}
                </div>
              </>
            ) : null}

            {recipeError ? <div className="error-text">{recipeError}</div> : null}

            <div className="actions">
              <button type="button" onClick={saveRecipe}>
                Save Recipe
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  )
}
