import { useCallback, useEffect, useState } from 'react'
import {
  ingredientsRepository,
  overheadsRepository,
  recipeLinesRepository,
  recipesRepository,
  recipeVariantsRepository,
  settingsRepository,
  type IngredientRow,
  type RecipeComplexity,
} from '../db'
import {
  calculateBrigadeiroPricing,
  calculateStandardPricing,
  toDisplayString,
} from '../lib/domain'
import { Decimal } from '../lib/decimal'

type Props = {
  enabled: boolean
}

type Kpis = {
  totalActiveIngredients: number
  missingPricesCount: number
  totalRecipes: number
  monthlyOverheadSummary: number
}

type VariantSummary = {
  id: string
  sizeCm: number
  status: 'OK' | 'BLOCKED'
  sellingPrice: string
  reason?: string
}

type RecipeSummary = {
  id: string
  name: string
  isBrigadeiro: boolean
  isBlocked: boolean
  variants: VariantSummary[]
}

function resolveNumber(value: number | null, fallback: string): Decimal {
  if (value !== null && Number.isFinite(value)) {
    return new Decimal(value)
  }

  const parsed = Number(fallback)
  return Number.isFinite(parsed) ? new Decimal(parsed) : new Decimal(0)
}

function buildSettingsMap() {
  return settingsRepository.listAll().reduce<Record<string, string>>((acc, setting) => {
    acc[setting.key] = setting.value
    return acc
  }, {})
}

function calcMonthlyOverheadSummary() {
  const rows = overheadsRepository.listAll()

  const totalPerYear = rows.reduce((acc, row) => {
    const rowTotal =
      Number(row.jan ?? 0) +
      Number(row.feb ?? 0) +
      Number(row.mar ?? 0) +
      Number(row.apr ?? 0) +
      Number(row.may ?? 0) +
      Number(row.jun ?? 0) +
      Number(row.jul ?? 0) +
      Number(row.aug ?? 0) +
      Number(row.sep ?? 0) +
      Number(row.oct ?? 0) +
      Number(row.nov ?? 0) +
      Number(row.dec ?? 0)

    return acc + rowTotal
  }, 0)

  return totalPerYear / 12
}

function buildRecipeSummaries(ingredients: IngredientRow[]): RecipeSummary[] {
  const settingsMap = buildSettingsMap()
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]))

  const recipes = recipesRepository.listAll()

  return recipes.map((recipe) => {
    const variants = recipeVariantsRepository.listByRecipeId(recipe.id)

    const variantSummaries = variants.map((variant) => {
      const lines = recipeLinesRepository.listByVariantId(variant.id)

      const blockedIngredients = lines
        .map((line) => ingredientById.get(line.ingredient_id))
        .filter((ingredient): ingredient is IngredientRow => {
          if (!ingredient) {
            return false
          }

          return ingredient.status === 'MISSING_PRICE' || ingredient.price === null
        })
        .map((ingredient) => ingredient.name)

      if (blockedIngredients.length > 0) {
        return {
          id: variant.id,
          sizeCm: variant.cake_size_cm,
          status: 'BLOCKED' as const,
          sellingPrice: '-',
          reason: `Missing price: ${Array.from(new Set(blockedIngredients)).join(', ')}`,
        }
      }

      const lineInputs = lines
        .map((line) => {
          const ingredient = ingredientById.get(line.ingredient_id)
          if (!ingredient || ingredient.price === null || line.amount_grams <= 0) {
            return null
          }

          return {
            amountGrams: line.amount_grams,
            price: ingredient.price,
            sizeInGrams: ingredient.size_in_grams,
          }
        })
        .filter((line): line is { amountGrams: number; price: number; sizeInGrams: number } =>
          Boolean(line),
        )

      const complexityFallback: Record<RecipeComplexity, string> = {
        SIMPLE: settingsMap.hourly_rate_simple ?? '20',
        MEDIUM: settingsMap.hourly_rate_medium ?? '25',
        HARD: settingsMap.hourly_rate_hard ?? '30',
      }

      const taxRate = resolveNumber(variant.tax_rate, settingsMap.tax_rate ?? '0.15')
      const overheadRate = resolveNumber(variant.overhead_rate, settingsMap.overhead_rate ?? '0.05')
      const profitMargin = resolveNumber(variant.profit_margin, settingsMap.profit_margin ?? '1.3')
      const hourlyRate = resolveNumber(variant.hourly_rate, complexityFallback[variant.complexity])
      const timeHours = resolveNumber(variant.time_hours, '1.5')

      const sellingPrice = recipe.is_brigadeiro
        ? calculateBrigadeiroPricing(lineInputs, {
            taxRate,
            overheadRate,
            profitMargin,
            hourlyRate,
            timeHours,
          }).sellingPrice
        : calculateStandardPricing(lineInputs, {
            taxRate,
            overheadRate,
            profitMargin,
            hourlyRate,
            timeHours,
          }).sellingPrice

      return {
        id: variant.id,
        sizeCm: variant.cake_size_cm,
        status: 'OK' as const,
        sellingPrice: toDisplayString(sellingPrice),
      }
    })

    return {
      id: recipe.id,
      name: recipe.name,
      isBrigadeiro: recipe.is_brigadeiro === 1,
      isBlocked: variantSummaries.some((variant) => variant.status === 'BLOCKED'),
      variants: variantSummaries,
    }
  })
}

export function DashboardReporting({ enabled }: Props) {
  const [kpis, setKpis] = useState<Kpis>({
    totalActiveIngredients: 0,
    missingPricesCount: 0,
    totalRecipes: 0,
    monthlyOverheadSummary: 0,
  })
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])

  const loadDashboard = useCallback(() => {
    const ingredients = ingredientsRepository.listAll({ includeArchived: false, status: 'ALL' })
    const missingPricesCount = ingredients.filter(
      (ingredient) => ingredient.status === 'MISSING_PRICE' || ingredient.price === null,
    ).length

    const monthlyOverheadSummary = calcMonthlyOverheadSummary()
    const summaries = buildRecipeSummaries(ingredients)

    setKpis({
      totalActiveIngredients: ingredients.length,
      missingPricesCount,
      totalRecipes: summaries.length,
      monthlyOverheadSummary,
    })
    setRecipes(summaries)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const timer = window.setTimeout(() => {
      loadDashboard()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [enabled, loadDashboard])

  return (
    <section className="recipe-section">
      <article className="card">
        <h2>Dashboard</h2>
        <div className="kpi-grid">
          <div className="kpi-item">
            <span>Active ingredients</span>
            <strong>{kpis.totalActiveIngredients}</strong>
          </div>
          <div className="kpi-item">
            <span>Missing prices</span>
            <strong>{kpis.missingPricesCount}</strong>
          </div>
          <div className="kpi-item">
            <span>Total recipes</span>
            <strong>{kpis.totalRecipes}</strong>
          </div>
          <div className="kpi-item">
            <span>Monthly overhead summary</span>
            <strong>{toDisplayString(kpis.monthlyOverheadSummary)}</strong>
          </div>
        </div>
      </article>

      <article className="card">
        <h2>Recipe Pricing Summary</h2>
        <div className="list">
          {recipes.length === 0 ? (
            <p>
              Your recipe list is still empty. Add your first recipe and let's price it together.
            </p>
          ) : null}
          {recipes.map((recipe) => (
            <div key={recipe.id} className="list-row">
              <div>
                <strong>{recipe.name}</strong>
                <div className="meta">
                  <span
                    className={`status-pill ${recipe.isBlocked ? 'status-missing' : 'status-ok'}`}
                  >
                    {recipe.isBlocked ? 'Blocked' : 'Ready'}
                  </span>
                  <span>{recipe.isBrigadeiro ? 'Brigadeiro' : 'Standard'}</span>
                </div>

                <div className="variant-summary-list">
                  {recipe.variants.map((variant) => (
                    <div key={variant.id} className="variant-summary-row">
                      <span>{variant.sizeCm}cm</span>
                      <span>{variant.status}</span>
                      <span>Selling price: {variant.sellingPrice}</span>
                      {variant.reason ? <span>{variant.reason}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
