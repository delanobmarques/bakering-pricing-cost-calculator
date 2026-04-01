import { z } from 'zod'

const positiveDecimalText = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Use digits with dot decimal format, e.g. 7.99')
  .refine((value) => Number(value) > 0, 'Value must be greater than 0')

export const ingredientFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingredient name is required'),
    price: positiveDecimalText,
    packageSize: positiveDecimalText,
    unit: z.enum(['KG', 'G', 'L', 'ML', 'UND']),
    densityFactor: positiveDecimalText.default('1.03'),
    gramsPerUnit: z.string().trim().optional(),
    status: z.enum(['OK', 'MISSING_PRICE', 'DOUBLE_CHECK', 'UNVERIFIED']),
    vendor: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.unit === 'UND') {
      const gramsPerUnit = value.gramsPerUnit?.trim() ?? ''

      if (gramsPerUnit.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'gramsPerUnit is required for UND unit',
          path: ['gramsPerUnit'],
        })
        return
      }

      if (!/^\d+(\.\d+)?$/.test(gramsPerUnit) || Number(gramsPerUnit) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'gramsPerUnit must be a positive number using dot decimal format',
          path: ['gramsPerUnit'],
        })
      }
    }
  })

export type IngredientFormValues = z.input<typeof ingredientFormSchema>
