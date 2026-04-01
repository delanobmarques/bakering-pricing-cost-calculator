import { Decimal } from './decimal'
import { toDecimal, toStoredDecimal } from './money'

export type IngredientUnit = 'KG' | 'G' | 'L' | 'ML' | 'UND'

export type ToGramsInput = {
  size: Decimal.Value
  unit: IngredientUnit
  densityFactor?: Decimal.Value
  gramsPerUnit?: Decimal.Value
}

export function toGrams({ size, unit, densityFactor = 1.03, gramsPerUnit }: ToGramsInput) {
  const normalizedSize = toDecimal(size)

  switch (unit) {
    case 'KG':
    case 'L':
      return toStoredDecimal(normalizedSize.mul(1000))
    case 'G':
      return toStoredDecimal(normalizedSize)
    case 'ML':
      return toStoredDecimal(normalizedSize.mul(toDecimal(densityFactor)))
    case 'UND': {
      if (gramsPerUnit === undefined || gramsPerUnit === null) {
        throw new Error('gramsPerUnit is required for UND unit conversion.')
      }

      return toStoredDecimal(normalizedSize.mul(toDecimal(gramsPerUnit)))
    }
    default:
      throw new Error(`Unsupported unit: ${String(unit)}`)
  }
}

export function calculateCostPerGram(price: Decimal.Value, sizeInGrams: Decimal.Value) {
  const grams = toDecimal(sizeInGrams)
  if (grams.lte(0)) {
    throw new Error('sizeInGrams must be greater than 0.')
  }

  return toStoredDecimal(toDecimal(price).div(grams))
}
