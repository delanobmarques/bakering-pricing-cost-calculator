import { z } from 'zod'

export const ingredientFormSchema = z.object({
  name: z.string().trim().min(1, 'Ingredient name is required'),
  price: z.coerce.number().positive('Price must be greater than 0'),
  packageSize: z.coerce.number().positive('Package size must be greater than 0'),
  unit: z.enum(['KG', 'G', 'L', 'ML', 'UND']),
})

export type IngredientFormValues = z.infer<typeof ingredientFormSchema>
