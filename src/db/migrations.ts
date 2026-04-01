export type Migration = {
  version: number
  name: string
  up: string[]
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_base_schema',
    up: [
      `CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        price DECIMAL(10,4),
        package_size DECIMAL(10,4) NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('KG', 'G', 'L', 'ML', 'UND')),
        density_factor DECIMAL(6,4) NOT NULL DEFAULT 1.03,
        grams_per_unit DECIMAL(10,4),
        size_in_grams DECIMAL(10,4) NOT NULL,
        cost_per_gram DECIMAL(10,6) NOT NULL,
        status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('OK', 'MISSING_PRICE', 'DOUBLE_CHECK', 'UNVERIFIED')),
        vendor TEXT,
        notes TEXT,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS idx_ingredients_status ON ingredients(status);`,
      `CREATE INDEX IF NOT EXISTS idx_ingredients_vendor ON ingredients(vendor);`,

      `CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_brigadeiro INTEGER NOT NULL DEFAULT 0 CHECK (is_brigadeiro IN (0,1)),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS recipe_variants (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        cake_size_cm INTEGER NOT NULL,
        complexity TEXT NOT NULL CHECK (complexity IN ('SIMPLE', 'MEDIUM', 'HARD')),
        hourly_rate DECIMAL(8,2),
        time_hours DECIMAL(6,2) NOT NULL DEFAULT 1.50,
        profit_margin DECIMAL(6,4),
        tax_rate DECIMAL(6,4) NOT NULL DEFAULT 0.15,
        overhead_rate DECIMAL(6,4) NOT NULL DEFAULT 0.05,
        quantity_produced INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT uq_recipe_variant_size UNIQUE (recipe_id, cake_size_cm)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_variants_recipe_id ON recipe_variants(recipe_id);`,

      `CREATE TABLE IF NOT EXISTS recipe_lines (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL,
        ingredient_id TEXT NOT NULL,
        component TEXT NOT NULL CHECK (component IN ('MASSA', 'RECHEIO', 'CALDA', 'OTHERS')),
        amount_grams DECIMAL(10,4) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        obs TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (variant_id) REFERENCES recipe_variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT ON UPDATE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_lines_variant_id ON recipe_lines(variant_id);`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_lines_ingredient_id ON recipe_lines(ingredient_id);`,

      `CREATE TABLE IF NOT EXISTS overheads (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        jan DECIMAL(10,2),
        feb DECIMAL(10,2),
        mar DECIMAL(10,2),
        apr DECIMAL(10,2),
        may DECIMAL(10,2),
        jun DECIMAL(10,2),
        jul DECIMAL(10,2),
        aug DECIMAL(10,2),
        sep DECIMAL(10,2),
        oct DECIMAL(10,2),
        nov DECIMAL(10,2),
        dec DECIMAL(10,2),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS idx_overheads_category ON overheads(category);`,

      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
    ],
  },
  {
    version: 2,
    name: 'seed_default_settings',
    up: [
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '0.15');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('profit_margin', '1.3');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('overhead_rate', '0.05');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('hourly_rate_simple', '20');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('hourly_rate_medium', '25');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('hourly_rate_hard', '30');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('avg_cakes_per_month', '1');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'CAD');`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('business_name', 'Made With Love by Cinthia');`,
    ],
  },
]
