import { Decimal } from './decimal'
import { calculateCostPerGram } from './unitConversion'
import { toDecimal, toStoredDecimal } from './money'

export type PricingLineInput = {
  amountGrams: Decimal.Value
  price: Decimal.Value
  sizeInGrams: Decimal.Value
}

export type PricingParams = {
  taxRate: Decimal.Value
  hourlyRate: Decimal.Value
  timeHours: Decimal.Value
  overheadRate: Decimal.Value
  profitMargin: Decimal.Value
}

export type StandardPricingBreakdown = {
  lineCosts: Decimal[]
  totalIngredientCost: Decimal
  ingredientCostWithTax: Decimal
  labourCost: Decimal
  overheadCost: Decimal
  sellingPrice: Decimal
}

export type BrigadeiroPricingBreakdown = {
  lineCosts: Decimal[]
  totalIngredientCost: Decimal
  ingredientCostWithTax: Decimal
  time15x: Decimal
  baseSubtotal: Decimal
  overheadCost: Decimal
  subtotalWithOverhead: Decimal
  priceWithProfit: Decimal
  taxOnProfit: Decimal
  sellingPrice: Decimal
}

export function calculateLineCost(line: PricingLineInput): Decimal {
  const costPerGram = calculateCostPerGram(line.price, line.sizeInGrams)
  return toStoredDecimal(toDecimal(line.amountGrams).mul(costPerGram))
}

function sumLineCosts(lines: PricingLineInput[]): Decimal[] {
  return lines.map((line) => calculateLineCost(line))
}

function getTotalIngredientCost(lineCosts: Decimal[]): Decimal {
  return toStoredDecimal(
    lineCosts.reduce((total, lineCost) => total.plus(lineCost), new Decimal(0)),
  )
}

export function calculateStandardPricing(
  lines: PricingLineInput[],
  params: PricingParams,
): StandardPricingBreakdown {
  const taxRate = toDecimal(params.taxRate)
  const hourlyRate = toDecimal(params.hourlyRate)
  const timeHours = toDecimal(params.timeHours)
  const overheadRate = toDecimal(params.overheadRate)
  const profitMargin = toDecimal(params.profitMargin)

  const lineCosts = sumLineCosts(lines)
  const totalIngredientCost = getTotalIngredientCost(lineCosts)
  const ingredientCostWithTax = toStoredDecimal(
    totalIngredientCost.mul(new Decimal(1).plus(taxRate)),
  )
  const labourCost = toStoredDecimal(hourlyRate.mul(timeHours))
  const overheadCost = toStoredDecimal(labourCost.plus(ingredientCostWithTax).mul(overheadRate))
  const sellingPrice = toStoredDecimal(
    labourCost
      .plus(ingredientCostWithTax)
      .plus(overheadCost)
      .mul(profitMargin)
      .mul(new Decimal(1).plus(taxRate)),
  )

  return {
    lineCosts,
    totalIngredientCost,
    ingredientCostWithTax,
    labourCost,
    overheadCost,
    sellingPrice,
  }
}

export function calculateBrigadeiroPricing(
  lines: PricingLineInput[],
  params: Omit<PricingParams, 'overheadRate'> & { overheadRate?: Decimal.Value },
): BrigadeiroPricingBreakdown {
  const taxRate = toDecimal(params.taxRate)
  const hourlyRate = toDecimal(params.hourlyRate)
  const profitMargin = toDecimal(params.profitMargin)
  const overheadRate = toDecimal(params.overheadRate ?? 0.05)

  const lineCosts = sumLineCosts(lines)
  const totalIngredientCost = getTotalIngredientCost(lineCosts)
  const ingredientCostWithTax = toStoredDecimal(
    totalIngredientCost.mul(new Decimal(1).plus(taxRate)),
  )

  const time15x = toStoredDecimal(hourlyRate.mul(1.5))
  const baseSubtotal = toStoredDecimal(time15x.plus(ingredientCostWithTax))
  const overheadCost = toStoredDecimal(baseSubtotal.mul(overheadRate))
  const subtotalWithOverhead = toStoredDecimal(baseSubtotal.plus(overheadCost))
  const priceWithProfit = toStoredDecimal(subtotalWithOverhead.mul(profitMargin))
  const taxOnProfit = toStoredDecimal(priceWithProfit.mul(taxRate))
  const sellingPrice = toStoredDecimal(priceWithProfit.plus(taxOnProfit))

  return {
    lineCosts,
    totalIngredientCost,
    ingredientCostWithTax,
    time15x,
    baseSubtotal,
    overheadCost,
    subtotalWithOverhead,
    priceWithProfit,
    taxOnProfit,
    sellingPrice,
  }
}
