import { Decimal } from './decimal'

export const STORAGE_DECIMALS = 4
export const DISPLAY_DECIMALS = 2

export function toDecimal(value: Decimal.Value): Decimal {
  return new Decimal(value)
}

export function toStoredDecimal(value: Decimal.Value): Decimal {
  return toDecimal(value).toDecimalPlaces(STORAGE_DECIMALS, Decimal.ROUND_HALF_UP)
}

export function toDisplayDecimal(value: Decimal.Value): Decimal {
  return toDecimal(value).toDecimalPlaces(DISPLAY_DECIMALS, Decimal.ROUND_HALF_UP)
}

export function toDisplayString(value: Decimal.Value): string {
  return toDisplayDecimal(value).toFixed(DISPLAY_DECIMALS)
}

export function toStoredString(value: Decimal.Value): string {
  return toStoredDecimal(value).toFixed(STORAGE_DECIMALS)
}
