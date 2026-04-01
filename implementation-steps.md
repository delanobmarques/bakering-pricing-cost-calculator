# Bakery Pricing & Cost Calculator - Implementation Steps

Based on the PRD v1.4, implement the project in the following order.

## 1. Scope Lock and Project Decisions
1. Confirm v1.0 scope includes all P1 requirements and excludes out-of-scope items (CRM, inventory, multi-user, payments).
2. Lock architecture decisions:
- Single-user local app.
- No authentication in v1.0.
- One recipe with multiple size variants.
- Recipe-level brigadeiro mode toggle.
- Light mode only.
3. Freeze critical business rules to avoid accidental formula changes:
- Double tax application remains intentional.
- Overhead/profit/tax order must match the spreadsheet formulas exactly.

## 2. Project Setup and Tooling
1. Initialize React + TypeScript + Vite project.
2. Configure PWA support and offline behavior.
3. Add core libraries:
- Global state management.
- Form validation schemas.
- Decimal arithmetic for finance.
4. Configure quality pipeline:
- ESLint + Prettier.
- Unit test runner.
- E2E test framework.
- Git hooks + CI + dependency security checks.

## 3. Data Layer and Schema
1. Implement local relational storage (SQLite in browser/OPFS).
2. Create tables:
- ingredients
- recipes
- recipe_variants
- recipe_lines
- overheads
- settings
3. Add constraints:
- Unique ingredient names (case-insensitive).
- Foreign-key protections to block deleting ingredients in use.
- Unique variant size per recipe.
4. Add migration scripts/versioning for schema evolution.

## 4. Core Domain Modules
1. Build a pure unit-conversion module:
- KG, G, L, ML (density factor), UND (grams per unit).
2. Build pricing engine modules:
- Standard pricing chain.
- Brigadeiro pricing chain.
3. Build scaling module for quantity recalculation.
4. Enforce rounding policy:
- Store/compute at 4 decimal places.
- Display rounded to 2 decimal places.
5. Ensure all monetary math uses decimal library (no native float math).

## 5. Ingredient Management (FR-01)
1. Build ingredient list screen with search/filter/sort.
2. Build add/edit ingredient form with strict validation:
- Positive price and package size.
- Valid numeric formats.
- Required fields and unit-specific rules.
3. Auto-calculate and show:
- size_in_grams
- cost_per_gram
4. Support statuses:
- OK, MISSING PRICE, DOUBLE CHECK, UNVERIFIED.
5. Add warning behavior for recipes referencing non-OK ingredients.
6. Support soft archive for unused ingredients.

## 6. Recipe Management and Variant UX (FR-02)
1. Build recipe list with expandable variants.
2. Build recipe editor with two levels:
- Recipe header (name, brigadeiro flag, notes).
- Variant tabs (size, complexity, rates, times, margins, quantity).
3. Implement fixed component sections:
- Massa, Recheio, Calda, Others.
4. Add ingredient line operations:
- Add/remove/reorder lines.
- Ingredient autocomplete lookup.
- Line-level notes.
5. Auto-compute line costs and total ingredient costs in real time.
6. Add utilities:
- Copy data from existing variant when creating a new size.
- Duplicate full recipe (all variants).

## 7. Pricing Breakdown and Simulation (FR-03)
1. Build live pricing breakdown panel:
- Ingredients
- Labour
- Overheads
- Profit
- Tax
2. Support per-variant overrides (rate, hours, margin, tax where needed).
3. Branch pricing path by recipe-level brigadeiro flag.
4. Build recipe scaling widget with base quantity and new quantity.
5. Ensure recalculation target performance (<100ms) after edits.

## 8. Overheads and Labour Modules (FR-04, FR-05)
1. Build overhead manager with 12-month input grid and default categories.
2. Add "same value for all months" shortcut.
3. Compute totals:
- total per year
- total per month
- overhead per cake (using avg cakes/month)
4. Build labour/time management:
- Complexity tiers and default rates.
- Task-based time logs.
- General monthly admin hours.
- Total hours per cake calculations.
5. Add cake-size-based time suggestions with per-variant override.

## 9. Dashboard and Core Reporting (FR-06 P1)
1. Build dashboard KPIs:
- Total active ingredients.
- Missing prices count.
- Total recipes.
- Monthly overhead summary.
2. Show recipe list with current selling prices and calculation status.
3. Flag recipes blocked by missing ingredient prices.

## 10. Data Migration Workflow
1. Implement spreadsheet import pipeline.
2. Import:
- 113 ingredients.
- Migratable recipes.
- Existing overhead data.
3. Exclude Quindim from auto-migration and provide reference amounts for manual rebuild.
4. Implement mandatory Missing Prices wizard.
5. Block migration completion until all recipe-used MISSING PRICE ingredients are resolved.
6. Surface data quality issues (DOUBLE CHECK, UNVERIFIED, malformed values).

## 11. Brand and Visual Identity Implementation (Section 15)
1. Implement design tokens using exact brand hex colors.
2. Apply brand typography across all screens.
3. Build component styles per brand specs:
- Buttons
- Badges
- Cards/surfaces
- Inputs
- Navigation
- "You charge" hero display
4. Integrate owner-provided SVG logo assets (no recreation in code).
5. Apply warm brand voice in UX copy.
6. Enforce light-mode-only policy.

## 12. Export, QA, and Release
1. Implement reports/export:
- PDF price card
- CSV export
2. Create unit tests for:
- Unit conversions
- Pricing formulas (including double tax)
- Density factor behavior
- Scaling and overrides
3. Create end-to-end tests for:
- Real-time updates
- Delete-block safeguards
- Missing price wizard
- Migration completion rules
4. Validate all acceptance criteria from PRD Section 12.
5. Package and deploy as installable PWA.

## Suggested Delivery Sequence
1. Setup and schema foundation.
2. Formula engine correctness.
3. Ingredient and recipe builder flows.
4. Overheads/labour integration.
5. Migration and data quality gates.
6. Dashboard, reports, and brand polish.
7. Full acceptance validation and release.
