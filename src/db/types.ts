export type IngredientStatus = 'OK' | 'MISSING_PRICE' | 'DOUBLE_CHECK' | 'UNVERIFIED'
export type IngredientUnit = 'KG' | 'G' | 'L' | 'ML' | 'UND'
export type RecipeComplexity = 'SIMPLE' | 'MEDIUM' | 'HARD'
export type RecipeComponent = 'MASSA' | 'RECHEIO' | 'CALDA' | 'OTHERS'

export type IngredientRow = {
  id: string
  name: string
  price: number | null
  package_size: number
  unit: IngredientUnit
  density_factor: number
  grams_per_unit: number | null
  size_in_grams: number
  cost_per_gram: number
  status: IngredientStatus
  vendor: string | null
  notes: string | null
  archived: number
  created_at: string
  updated_at: string
}

export type RecipeRow = {
  id: string
  name: string
  is_brigadeiro: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type RecipeVariantRow = {
  id: string
  recipe_id: string
  cake_size_cm: number
  complexity: RecipeComplexity
  hourly_rate: number | null
  time_hours: number
  profit_margin: number | null
  tax_rate: number
  overhead_rate: number
  quantity_produced: number
  created_at: string
  updated_at: string
}

export type RecipeLineRow = {
  id: string
  variant_id: string
  ingredient_id: string
  component: RecipeComponent
  amount_grams: number
  sort_order: number
  obs: string | null
  created_at: string
  updated_at: string
}

export type OverheadRow = {
  id: string
  category: string
  jan: number | null
  feb: number | null
  mar: number | null
  apr: number | null
  may: number | null
  jun: number | null
  jul: number | null
  aug: number | null
  sep: number | null
  oct: number | null
  nov: number | null
  dec: number | null
  created_at: string
  updated_at: string
}

export type SettingRow = {
  key: string
  value: string
  updated_at: string
}
