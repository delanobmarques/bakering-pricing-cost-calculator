import { useEffect, useMemo, useState } from 'react'
import { overheadsRepository, settingsRepository, type OverheadRow } from '../db'

type Props = {
  enabled: boolean
}

type MonthKey =
  | 'jan'
  | 'feb'
  | 'mar'
  | 'apr'
  | 'may'
  | 'jun'
  | 'jul'
  | 'aug'
  | 'sep'
  | 'oct'
  | 'nov'
  | 'dec'

type Tier = 'simple' | 'medium' | 'hard'

type TaskEntry = { task: string; simple: string; medium: string; hard: string }
type AdminTaskEntry = { task: string; hours: string }

const MONTHS: MonthKey[] = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const DEFAULT_OVERHEAD_CATEGORIES = [
  'BAKING',
  'GAS',
  'ELECTRICITY',
  'CLEANING SUPPLIES',
  'MACHINE MAINTENANCE',
  'KITCHEN EQUIPMENT',
  'GENERAL',
  'PHONE',
  'INTERNET',
  'MORTGAGE/RENT',
  'HOME INSURANCE',
  'PUBLIC LIABILITY INSURANCE',
  'ADVERTISING',
  'OFFICE SUPPLIES',
  'BUSINESS STATIONERY',
  'PETROL',
]

const ORDER_TASKS = [
  'Reply to Initial Inquiry',
  'Consultation Meeting',
  'Sketching & Researching',
  'Quote',
  'Booking Order',
  'Buying Supplies',
  'Baking',
  'Decorating',
  'Tidying / Cleaning',
  'Boxing',
  'Delivery / Handover',
  'Setting Up',
  'Selling',
  'Travel',
]

const ADMIN_TASKS = [
  'Paying Bills',
  'Updating Website',
  'Posting to Social Media',
  'Photographing Cakes',
  'Planning Events',
  'Advertising',
  'Networking Events',
]

const SIZE_TIME_SUGGESTIONS = [
  { sizeCm: 5, hours: 1 },
  { sizeCm: 8, hours: 1.5 },
  { sizeCm: 10, hours: 2 },
  { sizeCm: 12, hours: 2.5 },
  { sizeCm: 15, hours: 3 },
  { sizeCm: 20, hours: 3.5 },
  { sizeCm: 25, hours: 4 },
  { sizeCm: 30, hours: 4.5 },
]

function nowIso(): string {
  return new Date().toISOString()
}

function parseNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toTaskDefaults(tasks: string[]): TaskEntry[] {
  return tasks.map((task) => ({ task, simple: '', medium: '', hard: '' }))
}

function toAdminDefaults(tasks: string[]): AdminTaskEntry[] {
  return tasks.map((task) => ({ task, hours: '' }))
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function OverheadsLabourManagement({ enabled }: Props) {
  const [rows, setRows] = useState<OverheadRow[]>([])
  const [sameValue, setSameValue] = useState('')
  const [avgCakesPerMonth, setAvgCakesPerMonth] = useState('1')
  const [hourlyRateSimple, setHourlyRateSimple] = useState('20')
  const [hourlyRateMedium, setHourlyRateMedium] = useState('25')
  const [hourlyRateHard, setHourlyRateHard] = useState('30')
  const [orderTasks, setOrderTasks] = useState<TaskEntry[]>(toTaskDefaults(ORDER_TASKS))
  const [adminTasks, setAdminTasks] = useState<AdminTaskEntry[]>(toAdminDefaults(ADMIN_TASKS))
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const loadData = () => {
    const existingRows = overheadsRepository.listAll()
    const byCategory = new Map(existingRows.map((row) => [row.category, row]))

    const mergedRows = DEFAULT_OVERHEAD_CATEGORIES.map((category) => {
      const existing = byCategory.get(category)
      if (existing) {
        return existing
      }

      return {
        id: crypto.randomUUID(),
        category,
        jan: 0,
        feb: 0,
        mar: 0,
        apr: 0,
        may: 0,
        jun: 0,
        jul: 0,
        aug: 0,
        sep: 0,
        oct: 0,
        nov: 0,
        dec: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      }
    })

    setRows(mergedRows)

    const settings = settingsRepository.listAll().reduce<Record<string, string>>((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    setAvgCakesPerMonth(settings.avg_cakes_per_month ?? '1')
    setHourlyRateSimple(settings.hourly_rate_simple ?? '20')
    setHourlyRateMedium(settings.hourly_rate_medium ?? '25')
    setHourlyRateHard(settings.hourly_rate_hard ?? '30')

    setOrderTasks(
      parseJson<TaskEntry[]>(settings.labour_order_tasks_json, toTaskDefaults(ORDER_TASKS)),
    )
    setAdminTasks(
      parseJson<AdminTaskEntry[]>(settings.labour_admin_tasks_json, toAdminDefaults(ADMIN_TASKS)),
    )
  }

  useEffect(() => {
    if (!enabled) {
      return
    }

    const timer = window.setTimeout(() => {
      loadData()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [enabled])

  const updateCell = (rowId: string, month: MonthKey, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [month]: parseNumber(value) } : row)),
    )
  }

  const applySameValueToAllMonths = () => {
    const value = parseNumber(sameValue)
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        jan: value,
        feb: value,
        mar: value,
        apr: value,
        may: value,
        jun: value,
        jul: value,
        aug: value,
        sep: value,
        oct: value,
        nov: value,
        dec: value,
      })),
    )
  }

  const totals = useMemo(() => {
    const totalPerYear = rows.reduce((acc, row) => {
      const rowYear = MONTHS.reduce((sum, month) => sum + Number(row[month] ?? 0), 0)
      return acc + rowYear
    }, 0)

    const totalPerMonth = totalPerYear / 12
    const avgCakes = Math.max(parseNumber(avgCakesPerMonth), 1)
    const overheadPerCake = totalPerMonth / avgCakes

    return { totalPerYear, totalPerMonth, overheadPerCake }
  }, [avgCakesPerMonth, rows])

  const orderTotalsByTier = useMemo(() => {
    const byTier: Record<Tier, number> = { simple: 0, medium: 0, hard: 0 }

    for (const item of orderTasks) {
      byTier.simple += parseNumber(item.simple)
      byTier.medium += parseNumber(item.medium)
      byTier.hard += parseNumber(item.hard)
    }

    return byTier
  }, [orderTasks])

  const adminHoursTotal = useMemo(() => {
    return adminTasks.reduce((sum, item) => sum + parseNumber(item.hours), 0)
  }, [adminTasks])

  const totalHoursPerCake = useMemo(() => {
    const avgCakes = Math.max(parseNumber(avgCakesPerMonth), 1)
    const adminPerCake = adminHoursTotal / avgCakes

    return {
      simple: orderTotalsByTier.simple + adminPerCake,
      medium: orderTotalsByTier.medium + adminPerCake,
      hard: orderTotalsByTier.hard + adminPerCake,
    }
  }, [adminHoursTotal, avgCakesPerMonth, orderTotalsByTier])

  const saveAll = () => {
    const ts = nowIso()

    for (const row of rows) {
      overheadsRepository.upsertByCategory({
        ...row,
        updated_at: ts,
      })
    }

    settingsRepository.upsert('avg_cakes_per_month', avgCakesPerMonth || '1')
    settingsRepository.upsert('hourly_rate_simple', hourlyRateSimple || '20')
    settingsRepository.upsert('hourly_rate_medium', hourlyRateMedium || '25')
    settingsRepository.upsert('hourly_rate_hard', hourlyRateHard || '30')
    settingsRepository.upsert('labour_order_tasks_json', JSON.stringify(orderTasks))
    settingsRepository.upsert('labour_admin_tasks_json', JSON.stringify(adminTasks))

    setSavedMessage('Overheads and labour settings saved.')
  }

  const updateOrderTask = (index: number, tier: Tier, value: string) => {
    setOrderTasks((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [tier]: value } : entry)),
    )
  }

  const updateAdminTask = (index: number, value: string) => {
    setAdminTasks((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, hours: value } : entry)),
    )
  }

  return (
    <section className="recipe-section">
      <article className="card">
        <h2>Overhead Manager</h2>
        <div className="toolbar">
          <input
            value={sameValue}
            onChange={(event) => setSameValue(event.target.value)}
            placeholder="Same monthly value"
          />
          <button type="button" onClick={applySameValueToAllMonths}>
            Apply same for all months
          </button>
        </div>

        <div className="overhead-grid-wrap">
          <table className="overhead-table">
            <thead>
              <tr>
                <th>Category</th>
                {MONTHS.map((month) => (
                  <th key={month}>{month.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.category}</td>
                  {MONTHS.map((month) => (
                    <td key={`${row.id}-${month}`}>
                      <input
                        value={String(row[month] ?? '')}
                        onChange={(event) => updateCell(row.id, month, event.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="calc-box">
          <div>Total per year: {totals.totalPerYear.toFixed(2)}</div>
          <div>Total per month: {totals.totalPerMonth.toFixed(2)}</div>
          <label>
            Average cakes per month
            <input
              value={avgCakesPerMonth}
              onChange={(event) => setAvgCakesPerMonth(event.target.value)}
            />
          </label>
          <div>Overhead per cake: {totals.overheadPerCake.toFixed(2)}</div>
        </div>
      </article>

      <article className="card">
        <h2>Labour & Time Management</h2>

        <div className="variant-fields-grid">
          <label>
            Simple hourly rate
            <input
              value={hourlyRateSimple}
              onChange={(event) => setHourlyRateSimple(event.target.value)}
            />
          </label>
          <label>
            Medium hourly rate
            <input
              value={hourlyRateMedium}
              onChange={(event) => setHourlyRateMedium(event.target.value)}
            />
          </label>
          <label>
            Hard hourly rate
            <input
              value={hourlyRateHard}
              onChange={(event) => setHourlyRateHard(event.target.value)}
            />
          </label>
        </div>

        <h3>Order Tasks (hours per cake)</h3>
        <div className="overhead-grid-wrap">
          <table className="overhead-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Simple</th>
                <th>Medium</th>
                <th>Hard</th>
              </tr>
            </thead>
            <tbody>
              {orderTasks.map((task, index) => (
                <tr key={task.task}>
                  <td>{task.task}</td>
                  <td>
                    <input
                      value={task.simple}
                      onChange={(event) => updateOrderTask(index, 'simple', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={task.medium}
                      onChange={(event) => updateOrderTask(index, 'medium', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={task.hard}
                      onChange={(event) => updateOrderTask(index, 'hard', event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>General Business Tasks (hours per month)</h3>
        <div className="overhead-grid-wrap">
          <table className="overhead-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {adminTasks.map((task, index) => (
                <tr key={task.task}>
                  <td>{task.task}</td>
                  <td>
                    <input
                      value={task.hours}
                      onChange={(event) => updateAdminTask(index, event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="calc-box">
          <div>Total order-task hours (Simple): {orderTotalsByTier.simple.toFixed(2)}</div>
          <div>Total order-task hours (Medium): {orderTotalsByTier.medium.toFixed(2)}</div>
          <div>Total order-task hours (Hard): {orderTotalsByTier.hard.toFixed(2)}</div>
          <div>General admin hours/month: {adminHoursTotal.toFixed(2)}</div>
          <div>Total hours per cake (Simple): {totalHoursPerCake.simple.toFixed(2)}</div>
          <div>Total hours per cake (Medium): {totalHoursPerCake.medium.toFixed(2)}</div>
          <div>Total hours per cake (Hard): {totalHoursPerCake.hard.toFixed(2)}</div>
        </div>

        <div className="calc-box">
          <strong>Cake size to suggested production time (hours)</strong>
          {SIZE_TIME_SUGGESTIONS.map((item) => (
            <div key={item.sizeCm}>
              {item.sizeCm}cm: {item.hours}
            </div>
          ))}
          <div>Recipe variant editor keeps manual override available at all times.</div>
        </div>

        <div className="actions">
          <button type="button" onClick={saveAll}>
            Save Overheads & Labour
          </button>
        </div>
        {savedMessage ? <div className="meta">{savedMessage}</div> : null}
      </article>
    </section>
  )
}
