import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ingredientsRepository,
  settingsRepository,
  type DataQualityIssue,
  type MissingPriceUsage,
} from '../db'
import {
  importSpreadsheetWorkbook,
  type SpreadsheetImportResult,
} from '../migration/spreadsheetImport'

type Props = {
  enabled: boolean
  onDataChanged: () => void
}

type MigrationMeta = {
  startedAt: string | null
  sourceFilename: string | null
  completed: boolean
  quindimReference: string | null
}

function readSetting(key: string): string | null {
  return settingsRepository.getByKey(key)?.value ?? null
}

export function MigrationWorkflow({ enabled, onDataChanged }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SpreadsheetImportResult | null>(null)
  const [meta, setMeta] = useState<MigrationMeta>({
    startedAt: null,
    sourceFilename: null,
    completed: false,
    quindimReference: null,
  })
  const [missingPriceUsages, setMissingPriceUsages] = useState<MissingPriceUsage[]>([])
  const [dataQualityIssues, setDataQualityIssues] = useState<DataQualityIssue[]>([])
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [wizardError, setWizardError] = useState<string | null>(null)

  const loadWorkflowState = useCallback(() => {
    const startedAt = readSetting('migration_import_started_at')
    const sourceFilename = readSetting('migration_source_filename')
    const completed = readSetting('migration_completed') === 'true'
    const quindimReference = readSetting('migration_quindim_reference')

    setMeta({ startedAt, sourceFilename, completed, quindimReference })
    setMissingPriceUsages(ingredientsRepository.listRecipeUsedMissingPrices())
    setDataQualityIssues(ingredientsRepository.listDataQualityIssues())
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const timer = window.setTimeout(() => {
      loadWorkflowState()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [enabled, loadWorkflowState])

  const showMissingPricesWizard = useMemo(() => {
    if (!meta.startedAt) {
      return false
    }

    return !meta.completed || missingPriceUsages.length > 0
  }, [meta.completed, meta.startedAt, missingPriceUsages.length])

  const runImport = async () => {
    if (!selectedFile) {
      setImportError('Choose your spreadsheet file first so we can start the migration together.')
      return
    }

    setImporting(true)
    setImportError(null)
    setWizardError(null)

    try {
      const result = await importSpreadsheetWorkbook(selectedFile)
      setLastResult(result)
      setSelectedFile(null)
      loadWorkflowState()
      onDataChanged()
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : 'We could not import that spreadsheet yet. Please try again in a moment.',
      )
    } finally {
      setImporting(false)
    }
  }

  const resolveMissingPrice = (ingredientId: string) => {
    const rawValue = priceDrafts[ingredientId] ?? ''
    const parsed = Number(rawValue)

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWizardError('This ingredient still needs a valid positive price before we can continue.')
      return
    }

    ingredientsRepository.updatePriceAndStatus(ingredientId, parsed, 'OK')
    setWizardError(null)
    setPriceDrafts((current) => ({ ...current, [ingredientId]: '' }))
    loadWorkflowState()
    onDataChanged()
  }

  const completeMigration = () => {
    if (missingPriceUsages.length > 0) {
      setWizardError(
        'Almost there - add prices to the remaining recipe ingredients to unlock migration completion.',
      )
      return
    }

    settingsRepository.upsert('migration_completed', 'true')
    settingsRepository.upsert('migration_completed_at', new Date().toISOString())
    setWizardError(null)
    loadWorkflowState()
  }

  return (
    <section className="recipe-section">
      <article className="card">
        <h2>Data Migration Workflow</h2>
        <p>
          Bring in your spreadsheet and we will map ingredients, recipes, and overhead data for you.
          Quindim stays manual by design so you can rebuild it cleanly.
        </p>

        <div className="toolbar">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={() => void runImport()} disabled={importing}>
            {importing ? 'Importing your workbook...' : 'Start Spreadsheet Import'}
          </button>
        </div>

        {meta.startedAt ? (
          <div className="calc-box">
            <div>Last import: {meta.startedAt}</div>
            <div>Source file: {meta.sourceFilename ?? '-'}</div>
            <div>Migration completed: {meta.completed ? 'Yes' : 'No'}</div>
          </div>
        ) : null}

        {importError ? <div className="error-text">{importError}</div> : null}

        {lastResult ? (
          <div className="migration-summary">
            <h3>Latest Import Summary</h3>
            <div className="migration-count-grid">
              <div>Ingredients: {lastResult.counts.ingredients}</div>
              <div>Recipes: {lastResult.counts.recipes}</div>
              <div>Variants: {lastResult.counts.variants}</div>
              <div>Lines: {lastResult.counts.lines}</div>
              <div>Overhead rows: {lastResult.counts.overheadRows}</div>
            </div>

            {lastResult.skippedRecipes.length > 0 ? (
              <div className="calc-box">
                <strong>Skipped recipes</strong>
                <div>{lastResult.skippedRecipes.join(', ')}</div>
              </div>
            ) : null}

            <div className="calc-box">
              <strong>Quindim reference</strong>
              <div>{lastResult.quindimReference}</div>
            </div>

            {lastResult.issues.length > 0 ? (
              <div className="migration-issues">
                <h4>Import issues surfaced</h4>
                <ul>
                  {lastResult.issues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>
                      [{issue.severity}] {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>

      {showMissingPricesWizard ? (
        <article className="card migration-wizard">
          <h2>Missing Prices Wizard (Mandatory)</h2>
          <p>
            Migration completion is blocked until every recipe-used ingredient with MISSING PRICE is
            resolved.
          </p>

          {missingPriceUsages.length === 0 ? (
            <div className="calc-box">
              <strong>All recipe-used missing prices are resolved.</strong>
            </div>
          ) : (
            <div className="list">
              {missingPriceUsages.map((item) => (
                <div key={item.ingredient_id} className="list-row">
                  <div>
                    <strong>{item.ingredient_name}</strong>
                    <div className="meta">
                      <span className="status-pill status-missing">{item.ingredient_status}</span>
                      <span>Used in {item.used_in_recipes} recipe(s)</span>
                      <span>Used in {item.used_in_variants} variant(s)</span>
                    </div>
                  </div>

                  <div className="row-actions">
                    <input
                      placeholder="Enter price"
                      value={priceDrafts[item.ingredient_id] ?? ''}
                      onChange={(event) =>
                        setPriceDrafts((current) => ({
                          ...current,
                          [item.ingredient_id]: event.target.value,
                        }))
                      }
                    />
                    <button type="button" onClick={() => resolveMissingPrice(item.ingredient_id)}>
                      Save Price + Mark OK
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="actions">
            <button
              type="button"
              disabled={missingPriceUsages.length > 0}
              onClick={completeMigration}
            >
              Finish Migration
            </button>
          </div>

          {wizardError ? <div className="error-text">{wizardError}</div> : null}
        </article>
      ) : null}

      {(dataQualityIssues.length > 0 || meta.quindimReference) && meta.startedAt ? (
        <article className="card">
          <h2>Data Quality Review</h2>
          {meta.quindimReference ? (
            <div className="calc-box">
              <strong>Quindim rebuild note</strong>
              <div>{meta.quindimReference}</div>
            </div>
          ) : null}

          {dataQualityIssues.length > 0 ? (
            <div className="list">
              {dataQualityIssues.map((issue) => (
                <div key={issue.ingredient_id} className="list-row">
                  <div>
                    <strong>{issue.ingredient_name}</strong>
                    <div className="meta">
                      <span
                        className={`status-pill ${
                          issue.issue_type === 'DOUBLE_CHECK' ? 'status-check' : 'status-unverified'
                        }`}
                      >
                        {issue.issue_type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Great news: no DOUBLE CHECK or UNVERIFIED ingredients were found.</p>
          )}
        </article>
      ) : null}
    </section>
  )
}
