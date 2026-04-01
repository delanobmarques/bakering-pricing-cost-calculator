import { Decimal } from './decimal'
import { toDecimal, toStoredDecimal } from './money'

export function calculateScaledCost(
  ingredientCostWithTax: Decimal.Value,
  quantityProduced: Decimal.Value,
  newQuantityRequired: Decimal.Value,
) {
  const baseQuantity = toDecimal(quantityProduced)

  if (baseQuantity.lte(0)) {
    throw new Error('quantityProduced must be greater than 0.')
  }

  return toStoredDecimal(
    toDecimal(ingredientCostWithTax).div(baseQuantity).mul(toDecimal(newQuantityRequired)),
  )
}
