import Decimal from 'decimal.js'

Decimal.set({
  precision: 12,
  rounding: Decimal.ROUND_HALF_UP,
})

export { Decimal }
