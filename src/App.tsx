import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import {
  ingredientsRepository,
  initializeDatabase,
  type IngredientRow,
  type IngredientStatus,
} from './db'
import './App.css'
import { RecipeManagement } from './components/RecipeManagement'
import { toDisplayString, toStoredString } from './lib/domain'
import { ingredientFormSchema, type IngredientFormValues } from './lib/validation'
import { calculateCostPerGram, toGrams } from './lib/unitConversion'

const STATUS_OPTIONS: IngredientStatus[] = ['OK', 'MISSING_PRICE', 'DOUBLE_CHECK', 'UNVERIFIED']

const DEFAULT_FORM_VALUES: IngredientFormValues = {
  name: '',
  price: '',
  packageSize: '',
  unit: 'G',
  densityFactor: '1.03',
  gramsPerUnit: '',
  status: 'UNVERIFIED',
  vendor: '',
  notes: '',
}

type SortBy = 'name' | 'status' | 'vendor' | 'updated_at'

function nowIso(): string {
  return new Date().toISOString()
}

function statusClass(status: IngredientStatus): string {
  switch (status) {
    case 'OK':
      return 'status-ok'
    case 'MISSING_PRICE':
      return 'status-missing'
    case 'DOUBLE_CHECK':
      return 'status-check'
    case 'UNVERIFIED':
      return 'status-unverified'
    default:
      return 'status-unverified'
  }
}

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<IngredientStatus | 'ALL'>('ALL')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC')
  const [warnings, setWarnings] = useState<
    Array<{
      ingredient_id: string
      ingredient_name: string
      ingredient_status: IngredientStatus
      affected_recipes: number
    }>
  >([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  })

  const watchedPrice = useWatch({ control, name: 'price' })
  const watchedPackageSize = useWatch({ control, name: 'packageSize' })
  const watchedUnit = useWatch({ control, name: 'unit' })
  const watchedDensityFactor = useWatch({ control, name: 'densityFactor' })
  const watchedGramsPerUnit = useWatch({ control, name: 'gramsPerUnit' })

  const costPreview = useMemo(() => {
    try {
      if (!watchedPrice || !watchedPackageSize) {
        return null
      }

      const sizeInGrams = toGrams({
        size: watchedPackageSize,
        unit: watchedUnit,
        densityFactor: watchedDensityFactor || '1.03',
        gramsPerUnit: watchedGramsPerUnit,
      })

      const costPerGram = calculateCostPerGram(watchedPrice, sizeInGrams)

      return {
        sizeInGramsStored: toStoredString(sizeInGrams),
        sizeInGramsDisplay: toDisplayString(sizeInGrams),
        costPerGramStored: toStoredString(costPerGram),
        costPerGramDisplay: toDisplayString(costPerGram),
      }
    } catch {
      return null
    }
  }, [watchedDensityFactor, watchedGramsPerUnit, watchedPackageSize, watchedPrice, watchedUnit])

  const loadIngredients = useCallback(() => {
    const rows = ingredientsRepository.listAll({ includeArchived: true, status: 'ALL' })
    setIngredients(rows)
    setWarnings(ingredientsRepository.listRecipeWarningsForNonOkIngredients())
  }, [])

  const visibleIngredients = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()

    const filtered = ingredients.filter((row) => {
      if (!includeArchived && row.archived === 1) {
        return false
      }

      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false
      }

      if (searchTerm.length === 0) {
        return true
      }

      const haystack = `${row.name} ${row.vendor ?? ''}`.toLowerCase()
      return haystack.includes(searchTerm)
    })

    const direction = sortDirection === 'ASC' ? 1 : -1

    return filtered.sort((a, b) => {
      const valueA = String(a[sortBy] ?? '').toLowerCase()
      const valueB = String(b[sortBy] ?? '').toLowerCase()
      if (valueA < valueB) {
        return -1 * direction
      }
      if (valueA > valueB) {
        return 1 * direction
      }
      return 0
    })
  }, [includeArchived, ingredients, search, sortBy, sortDirection, statusFilter])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        await initializeDatabase()

        if (!mounted) {
          return
        }

        loadIngredients()
        setStatus('ready')
      } catch (error) {
        if (!mounted) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unknown database error')
        setStatus('error')
      }
    }

    void init()

    return () => {
      mounted = false
    }
  }, [loadIngredients])

  const onSubmit = (values: IngredientFormValues) => {
    setSubmitError(null)

    const trimmedName = values.name.trim()
    const existing = ingredientsRepository.getByName(trimmedName)
    if (existing && existing.id !== editingId) {
      setError('name', {
        type: 'manual',
        message: 'An ingredient with this name already exists.',
      })
      return
    }

    const sizeInGrams = toGrams({
      size: values.packageSize,
      unit: values.unit,
      densityFactor: values.densityFactor,
      gramsPerUnit: values.gramsPerUnit,
    })
    const costPerGram = calculateCostPerGram(values.price, sizeInGrams)

    const baseRow: IngredientRow = {
      id: editingId ?? crypto.randomUUID(),
      name: trimmedName,
      price: Number(values.price),
      package_size: Number(values.packageSize),
      unit: values.unit,
      density_factor: Number(values.densityFactor),
      grams_per_unit: values.unit === 'UND' ? Number(values.gramsPerUnit) : null,
      size_in_grams: Number(sizeInGrams.toString()),
      cost_per_gram: Number(costPerGram.toString()),
      status: values.status,
      vendor: values.vendor?.trim() ? values.vendor.trim() : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
      archived: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    }

    try {
      if (editingId) {
        const previous = ingredientsRepository.getById(editingId)
        if (!previous) {
          setSubmitError('Ingredient not found for update.')
          return
        }

        ingredientsRepository.update({
          ...baseRow,
          created_at: previous.created_at,
          archived: previous.archived,
        })
      } else {
        ingredientsRepository.insert(baseRow)
      }

      setEditingId(null)
      reset(DEFAULT_FORM_VALUES)
      loadIngredients()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save ingredient.')
    }
  }

  const startEdit = (row: IngredientRow) => {
    setEditingId(row.id)
    setValue('name', row.name)
    setValue('price', row.price?.toString() ?? '')
    setValue('packageSize', row.package_size.toString())
    setValue('unit', row.unit)
    setValue('densityFactor', row.density_factor.toString())
    setValue('gramsPerUnit', row.grams_per_unit?.toString() ?? '')
    setValue('status', row.status)
    setValue('vendor', row.vendor ?? '')
    setValue('notes', row.notes ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    reset(DEFAULT_FORM_VALUES)
    setSubmitError(null)
  }

  const toggleArchive = (row: IngredientRow) => {
    ingredientsRepository.setArchived(row.id, row.archived === 0)
    loadIngredients()
  }

  return (
    <main className="container">
      <h1>Bakery Pricing & Cost Calculator</h1>

      {status === 'loading' ? <p>Initializing database...</p> : null}
      {status === 'error' ? (
        <div className="alert error">
          <strong>Database error:</strong> {errorMessage}
        </div>
      ) : null}

      {status === 'ready' && warnings.length > 0 ? (
        <div className="alert warning">
          <strong>Recipe warning:</strong> Some recipes use ingredients with status different from
          OK.
          <ul>
            {warnings.map((warning) => (
              <li key={warning.ingredient_id}>
                {warning.ingredient_name} ({warning.ingredient_status}) is used in{' '}
                {warning.affected_recipes} recipe(s).
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status === 'ready' ? (
        <>
          <section className="grid">
            <article className="card">
              <h2>Ingredient Management</h2>
              <h3>{editingId ? 'Edit Ingredient' : 'Add Ingredient'}</h3>
              <form onSubmit={handleSubmit(onSubmit)} className="form">
                <label>
                  Name *
                  <input {...register('name')} />
                  {errors.name ? <span className="error-text">{errors.name.message}</span> : null}
                </label>

                <label>
                  Price (CAD) *
                  <input {...register('price')} placeholder="7.99" />
                  {errors.price ? <span className="error-text">{errors.price.message}</span> : null}
                </label>

                <label>
                  Package Size *
                  <input {...register('packageSize')} placeholder="500" />
                  {errors.packageSize ? (
                    <span className="error-text">{errors.packageSize.message}</span>
                  ) : null}
                </label>

                <label>
                  Unit *
                  <select {...register('unit')}>
                    <option value="KG">KG</option>
                    <option value="G">G</option>
                    <option value="L">L</option>
                    <option value="ML">ML</option>
                    <option value="UND">UND</option>
                  </select>
                  {errors.unit ? <span className="error-text">{errors.unit.message}</span> : null}
                </label>

                <label>
                  Density Factor (ML)
                  <input {...register('densityFactor')} placeholder="1.03" />
                  {errors.densityFactor ? (
                    <span className="error-text">{errors.densityFactor.message}</span>
                  ) : null}
                </label>

                {watchedUnit === 'UND' ? (
                  <label>
                    Grams Per Unit *
                    <input {...register('gramsPerUnit')} placeholder="50" />
                    {errors.gramsPerUnit ? (
                      <span className="error-text">{errors.gramsPerUnit.message}</span>
                    ) : null}
                  </label>
                ) : null}

                <label>
                  Status *
                  <select {...register('status')}>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Vendor
                  <input {...register('vendor')} />
                </label>

                <label>
                  Notes
                  <textarea {...register('notes')} rows={3} />
                </label>

                {costPreview ? (
                  <div className="calc-box">
                    <div>
                      size_in_grams: {costPreview.sizeInGramsStored} (display:{' '}
                      {costPreview.sizeInGramsDisplay})
                    </div>
                    <div>
                      cost_per_gram: {costPreview.costPerGramStored} (display:{' '}
                      {costPreview.costPerGramDisplay})
                    </div>
                  </div>
                ) : null}

                {submitError ? <div className="error-text">{submitError}</div> : null}

                <div className="actions">
                  <button type="submit" disabled={isSubmitting}>
                    {editingId ? 'Update' : 'Add'} Ingredient
                  </button>
                  {editingId ? (
                    <button type="button" className="secondary" onClick={cancelEdit}>
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </form>
            </article>

            <article className="card">
              <h2>Ingredient List</h2>
              <div className="toolbar">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or vendor"
                />
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as IngredientStatus | 'ALL')
                  }
                >
                  <option value="ALL">All statuses</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortBy)}
                >
                  <option value="name">Sort: Name</option>
                  <option value="status">Sort: Status</option>
                  <option value="vendor">Sort: Vendor</option>
                  <option value="updated_at">Sort: Updated</option>
                </select>
                <select
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as 'ASC' | 'DESC')}
                >
                  <option value="ASC">ASC</option>
                  <option value="DESC">DESC</option>
                </select>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(event) => setIncludeArchived(event.target.checked)}
                  />
                  Show archived
                </label>
              </div>

              <div className="list">
                {visibleIngredients.length === 0 ? <p>No ingredients found.</p> : null}
                {visibleIngredients.map((row) => (
                  <div key={row.id} className="list-row">
                    <div>
                      <strong>{row.name}</strong>
                      <div className="meta">
                        <span className={`status-pill ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                        <span>Unit: {row.unit}</span>
                        <span>Price: {row.price ?? '-'} CAD</span>
                        <span>size_in_grams: {row.size_in_grams}</span>
                        <span>cost_per_gram: {row.cost_per_gram}</span>
                        <span>{row.archived ? 'Archived' : 'Active'}</span>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="secondary" onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => toggleArchive(row)}
                      >
                        {row.archived ? 'Unarchive' : 'Archive'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
          <RecipeManagement enabled={status === 'ready'} ingredients={ingredients} />
        </>
      ) : null}
    </main>
  )
}

export default App
