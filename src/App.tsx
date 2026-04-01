import { useEffect, useState } from 'react'
import { initializeDatabase } from './db'
import './App.css'

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null)
  const [storage, setStorage] = useState<'opfs' | 'memory' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const db = await initializeDatabase()

        if (!mounted) {
          return
        }

        setSchemaVersion(db.schemaVersion)
        setStorage(db.storage)
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
  }, [])

  return (
    <main style={{ maxWidth: '760px', margin: '3rem auto', padding: '0 1rem' }}>
      <h1>Bakery Pricing & Cost Calculator</h1>
      <p>Step 3 status: Data Layer and Schema</p>

      {status === 'loading' ? <p>Initializing SQLite database...</p> : null}

      {status === 'ready' ? (
        <section>
          <p>Database initialized successfully.</p>
          <p>Storage backend: {storage}</p>
          <p>Schema version: {schemaVersion}</p>
          <p>
            Tables ready: <code>ingredients</code>, <code>recipes</code>,{' '}
            <code>recipe_variants</code>, <code>recipe_lines</code>, <code>overheads</code>,{' '}
            <code>settings</code>
          </p>
        </section>
      ) : null}

      {status === 'error' ? (
        <section>
          <p>Database initialization failed.</p>
          <p>{errorMessage}</p>
        </section>
      ) : null}
    </main>
  )
}

export default App
