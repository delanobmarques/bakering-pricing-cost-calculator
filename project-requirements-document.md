**PRODUCT REQUIREMENTS DOCUMENT**

**Bakery Pricing & Cost Calculator App**

**Version 1.4**

March 2026

**Status: UPDATED - Brand & Visual Identity Added (§15)**

| **Field**           | **Value**                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Project Name**    | Bakery Pricing & Cost Calculator App                                                                                                   |
| **Source**          | precificacao.xlsx - Operational pricing spreadsheet audit                                                                              |
| **Prepared By**     | Requirements Engineering Team                                                                                                          |
| **Target Users**    | Home / artisan bakery owners (Canada - prices in CAD)                                                                                  |
| **Document Status** | v1.4 - Brand & Visual Identity section added (§15); Garet typography, 5-colour palette, component specs, brand voice, dark mode policy |

# **1\. Introduction & Project Overview**

## **1.1 Purpose**

This Product Requirements Document (PRD) specifies the functional and non-functional requirements for building a Bakery Pricing & Cost Calculator application. It is based on a thorough audit of an operational Excel workbook (precificacao.xlsx) used by an active home bakery business in Nova Scotia, Canada.

The goal is to replace the spreadsheet with a purpose-built digital application that preserves all existing business logic, eliminates manual formula maintenance, and provides a superior user experience.

## **1.2 Business Context**

The source spreadsheet manages 113 ingredients, 10 product recipes, 12 monthly overhead categories, 3 labour tiers, and a full pricing engine - all linked by formulas. Replicating and improving this in a structured application is the scope of this project.

The owner currently prices each baked product by:

- Maintaining a master ingredient price database
- Creating per-recipe sheets that auto-calculate ingredient costs via VLOOKUP
- Adding labour cost (hourly rate × hours), overheads (prorated per cake), and a 30% profit margin
- Applying 15% Canadian tax on the final price

Pain points identified in the spreadsheet include missing ingredient prices (16 items flagged MISSING PRICE), formula errors (REF! errors in sheet "s"), data inconsistencies (e.g. "7;99" instead of 7.99 in Tapioca flower), and no audit trail or user guidance beyond colour-coded cells.

## **1.3 Scope**

In scope for v1.0:

- Ingredient catalogue management (CRUD + pricing)
- Recipe builder with automatic cost calculation
- Overhead tracker (monthly, annualised, per-cake allocation)
- Labour & time tracker (3 complexity tiers)
- Pricing engine (ingredients + labour + overheads + profit + tax)
- Recipe scaling tool
- Multiple cake sizes per recipe
- Dashboard with summary KPIs

Out of scope for v1.0:

- Order management / CRM
- Inventory tracking
- Multi-user / team access
- Payment processing

# **2\. Stakeholders & User Personas**

## **2.1 Primary Persona - The Baker / Business Owner**

| **Attribute**       | **Detail**                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role**            | Owner-operator of a home artisan bakery                                                                                                              |
| **Technical Level** | Comfortable with Excel; not a developer                                                                                                              |
| **Goals**           | Know the true cost of every product; charge a profitable price; update ingredient prices quickly as market fluctuates                                |
| **Pain Points**     | Formula errors are hard to debug; missing price alerts require manual follow-up; no mobile access; hard to add new recipes without breaking formulas |
| **Primary Actions** | Add/update ingredient prices; build new recipes; run "what-if" price simulations; view final selling price                                           |

# **3\. Data Model - Full Spreadsheet Audit**

This section documents every entity, field, formula, and business rule extracted from the source spreadsheet. This is the authoritative reference for the application's data model.

## **3.1 Ingredient Entity (Source: Stock_price sheet)**

The Stock_price sheet is the global ingredient price database. It contains 113 ingredient rows (rows 3-113) plus 4 packaging SKUs (rows 110-113). All recipe sheets look up ingredient data from this single source via VLOOKUP, so any price update in Stock_price automatically propagates to all recipes.

### **3.1.1 Ingredient Fields**

| **Field**          | **Type**           | **Excel Col**   | **Notes**                                                                                                                                                                                                               |
| ------------------ | ------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **name**           | String             | A               | Ingredient name, used as VLOOKUP key - must be unique and exact-match                                                                                                                                                   |
| **price**          | Decimal (CAD)      | B               | Purchase price for the package. Some stored as formula e.g. =7.99 (Strawberry)                                                                                                                                          |
| **package_size**   | Decimal            | C               | Quantity in original purchase unit. Can be formula: =450\*2 (Baking Powder), =4\*250 (Cream Cheese)                                                                                                                     |
| **unit**           | Enum               | D               | KG, G, L, ML, UND (each). Drives conversion logic                                                                                                                                                                       |
| **size_in_grams**  | Decimal (computed) | E               | CRITICAL: all costs normalised to grams. Conversion formulas: KG→=C\*1000, L→=C\*1000, ML→=C\*density_factor (see below), G→=C (no conversion), UND→custom (e.g. eggs: =72\*50)                                         |
| **density_factor** | Decimal            | N/A (new field) | RESOLVED OI-05. Applies only to ML-unit ingredients. Default: 1.03. User-overridable per ingredient. size_in_grams = size_ml × density_factor. Replaces the blanket =C\*1.03 approximation in the original spreadsheet. |
| **status**         | Enum               | F               | OK \| MISSING PRICE \| DOUBLE CHECK. 16 ingredients have MISSING PRICE; 3 have DOUBLE CHECK                                                                                                                             |
| **vendor**         | String             | G               | Supplier name (Costco, Walmart, Sobeys, Konrads, Brazilian Market, NSLC, Amazon, Dollarama, etc.)                                                                                                                       |

### **3.1.2 Unit Conversion Rules**

The application must implement the following conversion logic to derive cost-per-gram for every ingredient:

| **Unit** | **Conversion**                                                                  | **Spreadsheet Formula**            | **Example**                                                                               |
| -------- | ------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| **KG**   | size_g = size \* 1000                                                           | \=C\*1000                          | Almonds: 1360 KG → 1,360,000 g                                                            |
| **G**    | size_g = size (no change)                                                       | \=C                                | Baking Powder: 900 G → 900 g                                                              |
| **L**    | size_g = size \* 1000                                                           | \=C\*1000                          | Coffee cream: 1 L → 1000 g                                                                |
| **ML**   | size_g = size \* density_factor (default 1.03, user-overridable per ingredient) | \=C\*density_factor (was =C\*1.03) | Apple Sauce 620 ML × 1.03 = 638.6 g (default). Honey could use 1.42, olive oil 0.91, etc. |
| **UND**  | Custom per ingredient                                                           | Custom formula                     | Eggs: 72 UND → =72\*50 g (50g per egg avg)                                                |

### **3.1.3 Price Per Gram Calculation**

cost_per_gram = price / size_in_grams This is the core unit cost used throughout all recipe calculations.

### **3.1.4 Known Data Quality Issues in Source**

| **Issue**                               | **Affected Ingredients**                                                                                                                                                    | **App Requirement**                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **MISSING PRICE (no price data)**       | Apple, Apple Vinegar, Baileys, Banana, Blueberries, Carrot, Coconut frozen, Corn, Cranberry, Lime, Maple sugar, Matcha, Pineapple frozen, Pistache, Rum, Vinegar (16 total) | Flag ingredient; block recipe calculation if used; prompt user to complete |
| **DOUBLE CHECK status**                 | Bob's Corn Flour, Ghee Butter, Lemon (3 items)                                                                                                                              | Show warning badge; allow use but display notice                           |
| **Malformed price value**               | Tapioca flour: "7;99" (semicolon instead of decimal)                                                                                                                        | Input validation: reject non-numeric price on entry                        |
| **Missing status labels (rows 68-113)** | Milk chocolate, White chocolate sprinkles, Raisins, etc.                                                                                                                    | Treat null status as unverified; prompt user to confirm                    |
| **Formula REF! errors**                 | Sheet "s" (Quindim recipe) - all VLOOKUP ranges use Stock_price!#REF!                                                                                                       | Rebuild recipe; all lookups should be by name from DB                      |
| **Duplicate category label**            | OVERHEADS sheet: "MACHINE MAINTENANCE" appears twice (rows 8 & 10)                                                                                                          | Deduplicate in app; use unique category keys                               |

## **3.2 Recipe Entity (Source: Product sheets)**

Each product sheet represents one recipe. The spreadsheet contains 10 active recipe sheets. Each recipe sheet can hold multiple cake size variants stacked vertically on the same sheet (e.g. Chocolate cake has both 10cm and 20cm variants).

DECISION (v1.2): In the app, a recipe is a single named entity that owns one or more size variants. The user creates one recipe (e.g. "Chocolate Cake") and adds size variants to it (e.g. 10cm, 20cm) - each variant has its own independent set of ingredient amounts, hourly rate, and time. This replaces the spreadsheet's approach of stacking variants vertically on the same sheet. The recipe name appears once in the Recipe List; expanding it reveals its variants.

### **3.2.1 Recipe Fields**

A recipe is now split into two levels: the recipe (name, type) and the recipe variant (size, ingredients, pricing parameters). This directly implements the multi-size UX decision.

| **Field**                               | **Type**      | **Description**                                                                                                                                                                                                                                |
| --------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RECIPE level**                        |
| **recipe_name**                         | String        | Name of the product (e.g. "Chocolate Cake"). Displayed once in the Recipe List regardless of how many size variants exist.                                                                                                                     |
| **is_brigadeiro**                       | Boolean       | DECISION (v1.2): Toggle set at the recipe level, not per variant. When true, all variants of this recipe use the brigadeiro secondary pricing panel (§4.4) - the 1.5× labour multiplier and independent overhead/profit chain. Default: false. |
| **notes**                               | Text          | Optional free-text notes about the recipe overall.                                                                                                                                                                                             |
| **RECIPE VARIANT level (one per size)** |
| **cake_size_cm**                        | Integer       | Pan/mould diameter in cm. Observed values: 5, 8, 10, 12, 15, 20, 25, 30 cm. Each variant under the same recipe has a unique size.                                                                                                              |
| **complexity**                          | Enum          | Simple \| Medium \| Hard - drives hourly rate default from the global tier rates. Can be overridden per variant.                                                                                                                               |
| **components**                          | Array         | Ordered list of component sections for this size: Massa, Recheio, Calda, Others - each holding ingredient lines with amounts specific to this size.                                                                                            |
| **hourly_rate**                         | Decimal (CAD) | Labour cost per hour for this variant. Defaults to the global tier rate for the selected complexity. Overridable per variant.                                                                                                                  |
| **time_hours**                          | Decimal       | Total production time in hours for this variant. Default suggested by cake size from §6.4 reference table. Overridable.                                                                                                                        |
| **profit_margin**                       | Decimal       | Multiplier applied to total cost. NULL = use global default (1.3). Set per variant for overrides (BR-11). E.g. Valentine's in a Box uses 1.2.                                                                                                  |
| **tax_rate**                            | Decimal       | Canadian HST/GST. Default 0.15 (15%). Inherited from Settings; overridable per variant if needed.                                                                                                                                              |
| **overhead_rate**                       | Decimal       | Overhead proportion. Default 0.05 (5%). Inherited from Settings.                                                                                                                                                                               |
| **quantity_produced**                   | Integer       | Number of units this recipe variant batch makes. Default 1.                                                                                                                                                                                    |

### **3.2.2 Recipe Ingredient Line Fields**

Each line within a recipe component (Massa, Recheio, Calda, Others) has the following fields:

| **Field**           | **Source Formula**                      | **Description**                                                                                       |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **ingredient_name** | _Column A (typed)_                      | Exact match key into Stock_price - must match ingredient.name exactly. Acts as VLOOKUP key.           |
| **price_lookup**    | _VLOOKUP(A, Stock_price!A:D, 2, FALSE)_ | Auto-fetched purchase price from ingredient DB                                                        |
| **size_lookup**     | _VLOOKUP(A, Stock_price!A:E, 5, FALSE)_ | Auto-fetched size_in_grams from ingredient DB                                                         |
| **price_per_gram**  | _\=price / size_in_grams_               | Computed: cost per gram of this ingredient                                                            |
| **obs**             | _Column G (manual)_                     | Optional text notes/observations for this line                                                        |
| **amount_grams**    | _Column H (typed)_                      | Grams of this ingredient used in this recipe/size. User-entered. Some sheets use Column G for amount. |
| **line_cost**       | _\=amount_grams \* price_per_gram_      | Computed: cost of this ingredient in this recipe                                                      |

### **3.2.3 Existing Recipes Catalogue**

| **Recipe Name**                 | **Size(s)**   | **Type**          | **Complexity** | **Notes**                                                                                                                                                                |
| ------------------------------- | ------------- | ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chocolate Brigadeiro**        | 10cm          | Brigadeiro        | Simple         | Two versions (v1 and v2 - slight formula diff)                                                                                                                           |
| **Valentine's in a Box**        | 10cm          | Combo (cake+brig) | Simple         | Box with 18 brigadeiros; note: \$60 target price, 20% cake margin + 10% brig margin                                                                                      |
| **Valentine's Strawberry Choc** | 10cm          | Brigadeiro        | Simple         | Strawberry chocolate variant                                                                                                                                             |
| **Valentine's Strawberry Brig** | 10cm          | Brigadeiro        | Simple         | Strawberry brigadeiro variant                                                                                                                                            |
| **Valentine's Cookie**          | 10cm          | Cookie            | Medium         | Chocolate cookie recipe                                                                                                                                                  |
| **Chocolate Cake**              | 10cm + 20cm   | Cake              | Simple         | Two size variants on same sheet                                                                                                                                          |
| **Vanilla Cake**                | 15cm          | Cake              | Hard           | Hourly rate = \$30/hr                                                                                                                                                    |
| **Queijadinha**                 | No fixed size | Brazilian sweet   | Simple         | Coconut-based Brazilian sweet                                                                                                                                            |
| **Quindim (NOT migrated)**      | No fixed size | Brazilian sweet   | Simple         | OI-02 RESOLVED: Broken REF! formulas throughout. Owner will rebuild from scratch in the app. Reference amounts: Ovos 15g, Coco 150g, Acucar Refinado 360g, Manteiga 45g. |

# **4\. Pricing Engine - Complete Formula Specification**

This section is the single source of truth for all pricing calculations. Every formula below is derived directly from the spreadsheet audit. The application must implement these exact calculations.

## **4.1 Core Pricing Formula (Primary Path)**

This is the formula used by all recipe sheets in the "CAKE VALUE" section (columns P and T):

| **Variable**                   | **Formula / Value**                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **total_ingredient_cost**      | SUM of all line_cost values across all components (Massa + Recheio + Calda + Others)                          |
| **ingredient_cost_with_tax**   | total_ingredient_cost × 1.15 (Source: =I43\*1.15 for 10cm cake)                                               |
| **material_cost**              | ingredient_cost_with_tax (Source: =P17 which references the above; "Material Costs" label in column Q)        |
| **labour_cost**                | hourly_rate × time_hours (Source: =T6\*T8, where T6=rate, T8=hours)                                           |
| **overhead_cost**              | (labour_cost + material_cost) × overhead_rate (Source: =((T6\*T8)+T10)\*S13, where S13=0.05)                  |
| **you_charge (selling price)** | (labour_cost + material_cost + overhead_cost) × profit_margin × 1.15 (Source: =((T6\*T8)+T10+T12)\*T15\*1.15) |

## **4.2 Pricing Formula - Step-by-Step Pseudocode**

The following pseudocode captures the exact sequence the application must execute when calculating a recipe price:

STEP 1: For each ingredient line in recipe: price_per_gram = ingredient.price / ingredient.size_in_grams line_cost = amount_grams × price_per_gram STEP 2: Sum all line costs: total_ingredient_cost = SUM(all line_cost) STEP 3: Apply ingredient tax: ingredient_cost_with_tax = total_ingredient_cost × (1 + tax_rate) // tax_rate = 0.15 STEP 4: Calculate labour: labour_cost = hourly_rate × time_hours STEP 5: Calculate overhead: overhead_cost = (labour_cost + ingredient_cost_with_tax) × overhead_rate // overhead_rate = 0.05 STEP 6: Calculate selling price: selling_price = (labour_cost + ingredient_cost_with_tax + overhead_cost) × profit_margin × (1 + tax_rate) // profit_margin = 1.30, tax_rate = 0.15

## **4.3 Recipe Scaling Formula**

Each recipe sheet includes a "TO SCALE THIS RECIPE" panel that recalculates cost for a different batch quantity:

quantity_produced (base) = user-defined (default: 1) new_quantity_required = user input scaled_cost = (ingredient_cost_with_tax / quantity_produced) × new_quantity_required Source formulas: quantity_produced: P15 = 1 new_quantity: P16 = user input scaled_cost: P17 = (P9/P15)\*P16

## **4.4 Brigadeiro Pricing (Secondary Path)**

Brigadeiro recipes (Chocolate BRIG sheets) use an extended secondary calculation panel alongside the main recipe. This is a separate pricing widget specific to multi-unit products:

// Secondary panel (column T, rows 20-28 in Brigadeiro sheets) time_15x = hourly_rate × 1.5 // T20 = T6\*1.5 - 1.5× time premium base_subtotal = time_15x + material_cost // T21 = T20+T10 overhead_5pct = base_subtotal × 0.05 // T23 = T21\*0.05 subtotal_with_overhead = base_subtotal + overhead_5pct // T26 = T21+T23 price_with_profit = subtotal_with_overhead × 1.3 // T28 = T26\*1.3 tax_on_profit = price_with_profit × 0.15 // T28 col U = T28\*0.15

## **4.5 Default Business Parameters**

| **Parameter**                 | **Default Value** | **Source Cell** | **Notes**                                |
| ----------------------------- | ----------------- | --------------- | ---------------------------------------- |
| **Tax rate**                  | 15%               | Hardcoded ×1.15 | Canadian HST. Must be configurable.      |
| **Profit margin**             | 30% (×1.3)        | T15 = 1.3       | Applied to full cost before tax          |
| **Overhead rate**             | 5%                | S13 = 0.05      | Applied to labour + ingredients          |
| **Simple hourly rate**        | \$20/hr CAD       | List!O2 = 20    | Complexity tier: Simple                  |
| **Medium hourly rate**        | \$25/hr CAD       | List!O3 = 25    | Complexity tier: Medium                  |
| **Hard hourly rate**          | \$30/hr CAD       | List!O4 = 30    | Complexity tier: Hard                    |
| **Default production time**   | 1.5 hours         | T8 = 1.5        | Most recipes; Vanilla cake uses 1.5 also |
| **Default quantity produced** | 1 unit            | P15 = 1         | Per recipe batch                         |

# **5\. Overhead Module - Full Specification**

The OVERHEADS sheet tracks the bakery's fixed and variable monthly business costs and allocates them on a per-cake basis. This is critical for accurate pricing.

## **5.1 Overhead Categories**

| **Category**                   | **Current Monthly Value** | **Notes**                                |
| ------------------------------ | ------------------------- | ---------------------------------------- |
| **BAKING**                     | \$0 (blank)               | Gas or fuel specifically for baking      |
| **GAS**                        | \$0 (blank)               | General gas utility                      |
| **ELECTRICITY**                | \$87.645/mo               | Filled in - \$1,051.74/year              |
| **CLEANING SUPPLIES**          | \$0 (blank)               |                                          |
| **MACHINE MAINTENANCE**        | \$0 (blank)               | Listed twice - app must deduplicate      |
| **KITCHEN EQUIPMENT**          | \$0 (blank)               |                                          |
| **GENERAL**                    | \$0 (blank)               | Miscellaneous expenses                   |
| **PHONE**                      | \$137.27/mo               | Filled in - \$1,647.24/year              |
| **INTERNET**                   | \$0 (blank)               |                                          |
| **MORTGAGE/RENT**              | \$1,950.00/mo             | Filled in - \$23,400/year (largest cost) |
| **HOME INSURANCE**             | \$0 (blank)               |                                          |
| **PUBLIC LIABILITY INSURANCE** | \$0 (blank)               |                                          |
| **ADVERTISING**                | \$0 (blank)               |                                          |
| **OFFICE SUPPLIES**            | \$0 (blank)               |                                          |
| **BUSINESS STATIONERY**        | \$0 (blank)               |                                          |
| **PETROL**                     | \$0 (blank)               |                                          |

## **5.2 Overhead Calculation Chain**

total_per_year = SUM of all 16 category yearly totals (Source: =N4+N5+...+N21) total_per_month = total_per_year / 12 (Source: =D23/12) avg_cakes_per_month = user input (default: 1) (Source: D27) overhead_per_cake = total_per_month / avg_cakes_per_month (Source: =D25/D27) Current values with filled data: Total filled = \$87.645 + \$137.27 + \$1950 = \$2,174.915/mo At 1 cake/mo → overhead_per_cake = \$2,174.915

The app must allow each overhead category to be entered per month for all 12 months separately, OR as a single monthly value repeated across all months - matching the spreadsheet's Jan-Dec column structure.

# **6\. Labour & Time Tracking Module**

The List sheet tracks time spent per task, across 3 complexity tiers and 2 activity categories (order fulfillment and general business admin).

## **6.1 Complexity Tiers & Hourly Rates**

| **Tier**   | **Hourly Rate (CAD)** | **Source** | **Cake Size Association** |
| ---------- | --------------------- | ---------- | ------------------------- |
| **Simple** | \$20/hr               | List!O2    | 5cm, 8cm, 10cm            |
| **Medium** | \$25/hr               | List!O3    | 12cm, 15cm                |
| **Hard**   | \$30/hr               | List!O4    | 20cm, 25cm, 30cm          |

## **6.2 Order Fulfillment Tasks (per cake)**

| **Task**                 | **Simple hrs** | **Medium hrs** | **Hard hrs** |
| ------------------------ | -------------- | -------------- | ------------ |
| Reply to Initial Inquiry | -              | -              | -            |
| Consultation Meeting     | -              | -              | -            |
| Sketching & Researching  | -              | -              | -            |
| Quote                    | -              | -              | 0.5          |
| Booking Order            | 1.5            | 4              | -            |
| Buying Supplies          | -              | -              | -            |
| Baking                   | -              | -              | 2            |
| Decorating               | -              | -              | 2            |
| Tidying / Cleaning       | -              | -              | -            |
| Boxing                   | -              | -              | 1            |
| Delivery / Handover      | -              | -              | -            |
| Setting Up               | -              | -              | 0.5          |
| Selling                  | -              | -              | -            |
| Travel                   | -              | -              | -            |

## **6.3 General Business Tasks (per month)**

Tracked separately from per-cake tasks. The hours are spread across the month and divided by avg_cakes_per_month to compute per-cake admin time:

- Paying Bills
- Updating Website
- Posting to Social Media
- Photographing Cakes
- Planning Events
- Advertising
- Networking Events

total_hours_per_cake = SUM(general_business_hours) / avg_cakes_per_month (Source: =C33/C34 for Simple tier)

## **6.4 Cake Size → Timer Reference Table**

The List sheet also stores a cake size-to-production timer table (List!Q:S):

| **Cake Size** | **Timer (hrs)** |
| ------------- | --------------- |
| 5CM           | 1               |
| 8CM           | 1.5             |
| 10CM          | 2               |
| 12CM          | 2.5             |
| 15CM          | 3               |
| 20CM          | 3.5             |
| 25CM          | 4               |
| 30CM          | 4.5             |

# **7\. Functional Requirements**

Each requirement is tagged with a unique ID, priority (P1=Must Have, P2=Should Have, P3=Nice to Have), and the source module from the spreadsheet.

## **7.1 FR-01: Ingredient Management**

| **ID**       | **Requirement**                                                                                                                                                                                                                                                                                       | **Priority** | **Source**                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------- |
| **FR-01.1**  | User can add a new ingredient with: name (unique, required), purchase price (CAD, required), package size (required), unit (KG/G/L/ML/UND, required), vendor (optional), notes (optional)                                                                                                             | **P1**       | _Stock_price_             |
| **FR-01.2**  | System auto-calculates and stores size_in_grams using unit conversion rules (§3.1.2)                                                                                                                                                                                                                  | **P1**       | _Stock_price col E_       |
| **FR-01.3**  | System auto-calculates and displays cost_per_gram = price / size_in_grams                                                                                                                                                                                                                             | **P1**       | _All recipe sheets col F_ |
| **FR-01.4**  | User can edit any ingredient field; changes propagate to all recipes using that ingredient in real time                                                                                                                                                                                               | **P1**       | _VLOOKUP chain_           |
| **FR-01.5**  | User can set ingredient status: OK \| MISSING PRICE \| DOUBLE CHECK \| UNVERIFIED                                                                                                                                                                                                                     | **P1**       | _Stock_price col F_       |
| **FR-01.6**  | System shows a warning banner when a recipe contains any ingredient with status ≠ OK                                                                                                                                                                                                                  | **P1**       | _Data quality req._       |
| **FR-01.7**  | User can search and filter ingredients by name, status, or vendor                                                                                                                                                                                                                                     | P2           | _Usability_               |
| **FR-01.8**  | System stores vendor name and user can filter/sort by vendor                                                                                                                                                                                                                                          | P2           | _Stock_price col G_       |
| **FR-01.9**  | System validates: price must be positive number; package size must be positive; name must be unique (case-insensitive)                                                                                                                                                                                | **P1**       | _Data quality_            |
| **FR-01.10** | System supports UND unit with a custom grams-per-unit field (e.g. eggs: 50g each)                                                                                                                                                                                                                     | **P1**       | _Stock_price row 46_      |
| **FR-01.11** | Bulk ingredient import via CSV                                                                                                                                                                                                                                                                        | P3           | _Migration from Excel_    |
| **FR-01.12** | User can archive (soft-delete) ingredients no longer in use                                                                                                                                                                                                                                           | P2           | _Housekeeping_            |
| **FR-01.13** | \[OI-05 RESOLVED\] Each ML-unit ingredient has a configurable density_factor field (default: 1.03). size_in_grams = package_size_ml × density_factor. System displays the effective cost_per_gram recomputed from this factor.                                                                        | **P1**       | _OI-05 / BR-12_           |
| **FR-01.14** | \[OI-03 RESOLVED\] On first launch and on the Dashboard, system displays a "Missing Prices" wizard listing all MISSING PRICE ingredients. User is guided to enter each price before migration completes. Migration cannot be marked done while any ingredient used in a recipe remains MISSING PRICE. | **P1**       | _OI-03 / §3.1.4_          |

## **7.2 FR-02: Recipe Builder**

| **ID**       | **Requirement**                                                                                                                                                                                                                                                                                                                                                           | **Priority** | **Source**                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| **FR-02.1**  | User can create a new recipe with: name, cake size (cm), complexity tier, and component sections                                                                                                                                                                                                                                                                          | **P1**       | _Recipe sheets_                     |
| **FR-02.2**  | Recipe supports 4 fixed component sections: Massa, Recheio, Calda, Others - each holding multiple ingredient lines                                                                                                                                                                                                                                                        | **P1**       | _All recipe sheets_                 |
| **FR-02.3**  | User selects an ingredient from the catalogue; system auto-fills price and size; user enters amount_grams                                                                                                                                                                                                                                                                 | **P1**       | _VLOOKUP pattern_                   |
| **FR-02.4**  | System computes line_cost = amount_grams × cost_per_gram for each line, in real time                                                                                                                                                                                                                                                                                      | **P1**       | _Col I formula_                     |
| **FR-02.5**  | System computes total_ingredient_cost = SUM of all line costs across all components                                                                                                                                                                                                                                                                                       | **P1**       | _SUM(I6:I42)_                       |
| **FR-02.6**  | User can add/remove/reorder ingredient lines within each component section                                                                                                                                                                                                                                                                                                | **P1**       | _Usability_                         |
| **FR-02.7**  | User can add notes/observations per ingredient line                                                                                                                                                                                                                                                                                                                       | P2           | _Col G (Obs)_                       |
| **FR-02.8**  | \[DECISION v1.2\] A single recipe owns one or more size variants. The user adds a variant by selecting a size (cm) from the size reference table. Each variant has its own independent ingredient amounts, hourly rate, time hours, and profit margin. The Recipe List shows the recipe name once; expanding it reveals all variants and their individual selling prices. | **P1**       | _Multi-size UX decision_            |
| **FR-02.9**  | When adding a new variant to an existing recipe, the system offers to copy ingredient amounts from an existing variant of the same recipe as a starting point (pre-filled amounts that the user then adjusts for the new size). This replaces the spreadsheet's "duplicate sheet" workflow.                                                                               | **P1**       | _UX improvement over TEMPLATE PAGE_ |
| **FR-02.10** | Recipe shows real-time preview of all cost breakdowns as user enters data                                                                                                                                                                                                                                                                                                 | **P1**       | _Core UX_                           |
| **FR-02.11** | User can set quantity_produced per recipe variant (how many units the batch makes)                                                                                                                                                                                                                                                                                        | **P1**       | _P15 = 1 default_                   |
| **FR-02.12** | User can duplicate an entire recipe (all variants) as a starting point for a new recipe. The duplicate is created with a "Copy of..." name prefix and is fully independent.                                                                                                                                                                                               | **P1**       | _TEMPLATE PAGE pattern_             |
| **FR-02.13** | \[DECISION v1.2\] Each recipe has an is_brigadeiro toggle set at the recipe level. When enabled, all variants of that recipe use the brigadeiro pricing panel (§4.4) instead of the standard pricing chain (§4.1). The toggle is prominently displayed in the recipe header. Default: off.                                                                                | **P1**       | _Brigadeiro mode decision_          |

## **7.3 FR-03: Pricing Engine**

| **ID**       | **Requirement**                                                                                                                                                                                                                                                                                                                                                                                      | **Priority** | **Source**                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------- |
| **FR-03.1**  | System computes ingredient_cost_with_tax = total_ingredient_cost × (1 + tax_rate)                                                                                                                                                                                                                                                                                                                    | **P1**       | _§4.1_                            |
| **FR-03.2**  | System computes labour_cost = hourly_rate × time_hours                                                                                                                                                                                                                                                                                                                                               | **P1**       | _§4.1_                            |
| **FR-03.3**  | System computes overhead_cost = (labour_cost + ingredient_cost_with_tax) × overhead_rate                                                                                                                                                                                                                                                                                                             | **P1**       | _§4.1_                            |
| **FR-03.4**  | System computes selling_price = (labour_cost + ingredient_cost_with_tax + overhead_cost) × profit_margin × (1 + tax_rate)                                                                                                                                                                                                                                                                            | **P1**       | _§4.1 final formula_              |
| **FR-03.5**  | All default parameters (tax_rate, profit_margin, overhead_rate, hourly rates) are user-configurable in a Settings screen                                                                                                                                                                                                                                                                             | **P1**       | _§4.5_                            |
| **FR-03.6**  | \[OI-04 RESOLVED\] User can set a per-recipe profit margin that overrides the global default. Example: Valentine's in a Box uses 20% cake margin + 10% brigadeiro margin instead of the global 30%. When a per-recipe margin is set, it is displayed prominently in the recipe pricing panel and used in all calculations for that recipe.                                                           | **P1**       | _OI-04 / BR-11_                   |
| **FR-03.6b** | User can override labour parameters (hourly rate, time hours) per individual recipe, independently of the global tier defaults                                                                                                                                                                                                                                                                       | **P1**       | _T6, T8 per sheet_                |
| **FR-03.7**  | System shows cost breakdown panel: ingredients \| labour \| overheads \| profit \| tax - all as line items                                                                                                                                                                                                                                                                                           | **P1**       | _Transparency req_                |
| **FR-03.8**  | Recipe Scaling: user inputs new_quantity; system calculates scaled_cost = (ingredient_cost_with_tax / quantity_produced) × new_quantity                                                                                                                                                                                                                                                              | **P1**       | _§4.3_                            |
| **FR-03.9**  | \[DECISION v1.2 - RESOLVED\] Brigadeiro mode: when is_brigadeiro = true on a recipe, the pricing panel switches to the §4.4 calculation chain for all variants. The pricing breakdown panel clearly labels itself "Brigadeiro Pricing" and shows the 1.5× labour time line item explicitly. Standard and brigadeiro panels are mutually exclusive per recipe - the user cannot mix them per variant. | **P1**       | _§4.4 / Brigadeiro mode decision_ |
| **FR-03.10** | User can run what-if simulations: adjust any parameter (profit margin, hourly rate, ingredient cost) and see updated selling price instantly                                                                                                                                                                                                                                                         | P2           | _Planning tool_                   |

## **7.4 FR-04: Overhead Management**

| **ID**      | **Requirement**                                                                             | **Priority** | **Source**         |
| ----------- | ------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| **FR-04.1** | User can enter monthly costs for each of the 16 overhead categories, per month (12 months)  | **P1**       | _OVERHEADS sheet_  |
| **FR-04.2** | System provides "same for all months" shortcut - entering one value fills all 12 months     | **P1**       | _UX improvement_   |
| **FR-04.3** | System auto-calculates: total_per_year, total_per_month, overhead_per_cake from user inputs | **P1**       | _§5.2 formulas_    |
| **FR-04.4** | User can set avg_cakes_per_month; system updates overhead_per_cake dynamically              | **P1**       | _D27 = user input_ |
| **FR-04.5** | User can add custom overhead categories beyond the 16 defaults                              | P2           | _Extensibility_    |
| **FR-04.6** | Overhead total is visible in the recipe pricing breakdown                                   | **P1**       | _Integration req_  |

## **7.5 FR-05: Labour & Time Management**

| **ID**      | **Requirement**                                                                          | **Priority** | **Source**         |
| ----------- | ---------------------------------------------------------------------------------------- | ------------ | ------------------ |
| **FR-05.1** | System supports 3 complexity tiers with configurable hourly rates (Simple, Medium, Hard) | **P1**       | _List!N:O_         |
| **FR-05.2** | User can log time per task for each tier (14 order-fulfillment tasks)                    | P2           | _List sheet tasks_ |
| **FR-05.3** | User can log general business admin hours per month (7 task categories)                  | P2           | _List rows 23-31_  |
| **FR-05.4** | System calculates total hours per cake from logged task times                            | **P1**       | _SUM(C4:C17)_      |
| **FR-05.5** | Cake size auto-suggests a production time based on size-timer reference table (§6.4)     | P2           | _List!Q:S_         |
| **FR-05.6** | User can override default production time per recipe                                     | **P1**       | _Core flexibility_ |

## **7.6 FR-06: Dashboard & Reporting**

| **ID**      | **Requirement**                                                                                                       | **Priority** | **Source**      |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| **FR-06.1** | Dashboard shows: total active ingredients, ingredients with MISSING PRICE, total recipes, total overhead per month    | **P1**       | _Summary KPIs_  |
| **FR-06.2** | User can view a summary list of all recipes with their current selling price                                          | **P1**       | _Core output_   |
| **FR-06.3** | Per-recipe printable price card showing: recipe name, size, ingredients list, cost breakdown, and final selling price | P2           | _Business use_  |
| **FR-06.4** | System flags any recipe where selling price cannot be computed (missing ingredient prices)                            | **P1**       | _Error surface_ |
| **FR-06.5** | Export all recipe pricing to PDF or CSV                                                                               | P2           | _Reporting_     |

# **8\. Non-Functional Requirements**

## **8.1 Usability**

- All pricing calculations must update in real time (< 100ms) as the user types - no manual "calculate" button
- Colour-coded status indicators must replace the spreadsheet's manual colour-coded cells
- The app must be usable on mobile (responsive design) and desktop
- Critical input fields must have inline validation with human-readable error messages
- The app must require no training beyond a brief onboarding flow

## **8.2 Data Integrity**

- Ingredient name must be the unique key - the app must prevent duplicate names (case-insensitive)
- Deleting an ingredient that is used in any recipe must be blocked; user must be shown which recipes are affected
- All monetary values must be stored and computed at 4 decimal places; displayed rounded to 2 decimal places
- Unit conversion formulas must match §3.1.2 exactly to preserve backward compatibility with source data

## **8.3 Performance**

- App must load the full ingredient catalogue (113+ items) in under 1 second
- Recipe cost recalculation must occur within 100ms of any user input change
- The app must handle up to 500 ingredients and 100 recipes without degradation

## **8.4 Data Migration**

- The 113 ingredients from Stock_price must be importable without manual re-entry
- The 10 existing recipes must be migrated with full ingredient lines and amounts
- All 3 currently filled overhead values (electricity, phone, mortgage) must be migrated
- Data quality issues documented in §3.1.4 must be surfaced to the user during migration, not silently dropped
- \[OI-03 RESOLVED\] Migration process must include a mandatory "Missing Prices" wizard. The 16 MISSING PRICE ingredients and 3 DOUBLE CHECK ingredients must be presented to the user for resolution before migration is marked complete. Migration completes in two phases: (1) import all ingredient structure and prices where available; (2) block final completion until no recipe references an ingredient with MISSING PRICE status.
- \[OI-02 RESOLVED\] The Quindim recipe (sheet "s") will not be migrated automatically due to broken formula references. The owner will rebuild it from scratch in the app using the new recipe builder. The ingredient names (Ovos, Coco, Acucar Refinado, Manteiga) and their amounts must be documented as a reference for the owner during rebuild.

## **8.5 Security & Privacy**

DECISION (v1.2): Authentication is skipped entirely for v1.0. This is a single-user, local-only application with no network-exposed data. There is no login screen, no PIN, and no session management in v1.0. Authentication will be reconsidered if cloud sync (§14.3.3) is added in v1.1, at which point Supabase Auth with magic link is the recommended approach.

- All data is stored locally in the browser's Origin Private File System - inaccessible to other browser origins and not directly browsable by other applications
- No pricing data is transmitted over the network in v1.0 - there is no server, no API, and no external data sharing
- If cloud sync is implemented in v1.1, data must be encrypted in transit (TLS 1.2+) and Supabase Row-Level Security must be enabled on all tables
- Use autocomplete="off" on all financial input fields to prevent browser autofill storing business-sensitive data
- Dependency security: npm audit run in CI pipeline on every build; Dependabot alerts enabled on the GitHub repository

# **9\. Application Screen Inventory**

| **#**  | **Screen**                  | **Key Components**                                                                                                                                                                                                                                                                 | **Maps To (Excel)**                                  |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **01** | **Dashboard**               | KPI tiles (ingredients, recipes, missing prices, monthly overhead); Quick action buttons; Alert badges for issues                                                                                                                                                                  | _Summary of all sheets_                              |
| **02** | **Ingredient Catalogue**    | Searchable/filterable table; Status badges (OK/MISSING/DOUBLE CHECK); Inline edit; Add ingredient button                                                                                                                                                                           | _Stock_price sheet_                                  |
| **03** | **Add / Edit Ingredient**   | Form: name, price, size, unit, vendor, status, notes; Live preview of cost_per_gram; Unit conversion helper                                                                                                                                                                        | _Stock_price row entry_                              |
| **04** | **Recipe List**             | Expandable recipe cards: recipe name + is_brigadeiro badge at top level; size variants listed underneath each with their own selling price and status indicator; Add Variant button per recipe; Add New Recipe + Duplicate Recipe buttons                                          | _All product sheets - multi-size UX decision_        |
| **05** | **Recipe Builder / Editor** | Two-level UI: Recipe header (name, is_brigadeiro toggle, notes) + Variant tabs (one tab per size); each variant tab has: Component tabs (Massa/Recheio/Calda/Others), ingredient line rows with autocomplete, live cost sidebar; Copy-from-variant shortcut when adding a new size | _Individual product sheets - multi-size UX decision_ |
| **06** | **Pricing Breakdown Panel** | Switches between Standard panel (§4.1, 6-step chain) and Brigadeiro panel (§4.4) based on recipe is_brigadeiro flag; shows all cost line items; per-variant overrides (rate, hours, margin) with "custom" badge; Scaling widget                                                    | _CAKE VALUE section - brigadeiro mode decision_      |
| **07** | **Recipe Scaling Widget**   | Input: base quantity; Input: new quantity; Output: scaled cost - live update                                                                                                                                                                                                       | _"TO SCALE THIS RECIPE" panel_                       |
| **08** | **Overhead Manager**        | Category table with 12-month columns; Quick-fill (same all months); Totals: yearly, monthly, per-cake; avg_cakes input                                                                                                                                                             | _OVERHEADS sheet_                                    |
| **09** | **Labour & Time**           | Tier selector (Simple/Medium/Hard); Task time table; General admin hours; Total hours per cake output                                                                                                                                                                              | _List sheet_                                         |
| **10** | **Settings**                | Default tax rate; Default profit margin; Default overhead rate; Hourly rates per tier; Currency; Business name                                                                                                                                                                     | _§4.5 parameters_                                    |
| **11** | **Reports / Export**        | Recipe price card preview; Export to PDF/CSV; Full pricing report                                                                                                                                                                                                                  | _HOW TO USE sheets_                                  |

# **10\. Business Rules**

Business rules are invariants that the system must enforce at all times. These are derived exclusively from observed spreadsheet behaviour and embedded formulas.

| **BR-ID** | **Rule**                                                                                                                         | **Rationale / Source**                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BR-01** | **Ingredient names must be globally unique**                                                                                     | VLOOKUP uses name as exact-match key. Duplicate names would cause incorrect price lookups.                                                                                                                                                                                   |
| **BR-02** | **A recipe line cost is zero if the ingredient has no price**                                                                    | IFERROR(...,"") pattern - blank returned on lookup failure. App must surface this as a warning, not silently zero.                                                                                                                                                           |
| **BR-03** | **Tax (15%) is applied twice in the final selling price - this is intentional and must not be changed**                          | CONFIRMED by owner (OI-01 resolved). Tax is applied first on the ingredients subtotal (Step 3) and again on the final selling price (Step 6). The system must preserve this exact double-application. Any future tax-rate change applies to both occurrences simultaneously. |
| **BR-04** | **Overhead rate of 5% is applied to (labour + ingredient_cost_with_tax)**                                                        | Source: =((T6\*T8)+T10)\*S13. T10 = material costs (already taxed). S13 = 0.05.                                                                                                                                                                                              |
| **BR-05** | **Profit margin (×1.3) is applied to (labour + ingredients_with_tax + overheads)**                                               | Source: =((T6\*T8)+T10+T12)\*T15\*1.15. Applied before the outer ×1.15 tax.                                                                                                                                                                                                  |
| **BR-06** | **Recipe scaling divides the taxed ingredient cost (not the raw cost) by base quantity**                                         | Source: P17=(P9/P15)\*P16. P9=ingredient_cost_with_tax. The scaling applies to the post-tax subtotal.                                                                                                                                                                        |
| **BR-07** | **Deleting an ingredient used in a recipe is not permitted without explicit confirmation**                                       | Data integrity - broken VLOOKUP would silently zero out line costs.                                                                                                                                                                                                          |
| **BR-08** | **Hourly rates and complexity tier are set at the recipe level, not globally inherited**                                         | Each product sheet has its own T6 (rate) and T8 (hours). Vanilla cake uses \$30/hr; others use \$20/hr.                                                                                                                                                                      |
| **BR-09** | **Brigadeiro recipes use a 1.5× labour time multiplier in the secondary pricing panel**                                          | Source: T20=T6\*1.5. Applied specifically to the secondary brigadeiro panel.                                                                                                                                                                                                 |
| **BR-10** | **Packaging items (Packaging 20cm, 15cm, Cupcake packaging, Brigadeiro mold) are treated as ingredients**                        | Source: Stock_price rows 110-113. Unit = UND, cost per unit stored in col E.                                                                                                                                                                                                 |
| **BR-11** | **Each recipe may define its own profit margin, overriding the global default**                                                  | CONFIRMED by owner (OI-04 resolved). The Valentine's in a Box recipe explicitly targets 20% cake margin + 10% brigadeiro margin instead of the global 30%. The system must support a per-recipe profit margin field that overrides the global setting when set.              |
| **BR-12** | **Each ML-unit ingredient stores a per-ingredient density factor (default 1.03 g/mL); size_in_grams = size_ml × density_factor** | CONFIRMED by owner (OI-05 resolved). The blanket 1.03 approximation is replaced by a configurable density_factor field on each ingredient. Default remains 1.03. Users can override for specific liquids (e.g. honey, oils, creams) where the density differs meaningfully.  |

# **11\. Open Issues, Decisions & Design Recommendations**

## **11.0 Decision Register**

The following architectural decisions have been made and are locked for v1.0. They are recorded here as the authoritative reference. Each decision has been propagated into the relevant PRD sections.

| **ID**     | **Question**                  | **Decision**                                                                                                                                                                        | **Impact**                                                                                                                                                       | **Status**      |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **DEC-01** | Authentication model for v1.0 | Skip entirely. No login screen, no PIN, no session management. Single-user local app - no network exposure.                                                                         | Removed PIN from Settings table schema; simplified §8.5; removes ~1 week of implementation work from Phase 0                                                     | **LOCKED v1.2** |
| **DEC-02** | Multi-size recipe UX          | One recipe owns multiple size variants. Recipe List shows recipe name once; variants nested underneath. Adding a variant offers to copy amounts from an existing variant.           | Recipes table split into recipes + recipe_variants; recipe_lines now reference variant_id; FR-02.8, FR-02.9, FR-02.12 updated; Screen 04 and 05 redesigned       | **LOCKED v1.2** |
| **DEC-03** | Brigadeiro mode trigger       | is_brigadeiro toggle set at the recipe level - applies to ALL variants of that recipe. Standard and brigadeiro panels are mutually exclusive. Toggle is prominent in recipe header. | is_brigadeiro field stays on recipes table (not recipe_variants); pricing engine branches at recipe level; FR-02.13 and FR-03.9 added/updated; Screen 06 updated | **LOCKED v1.2** |

## **11.1 Issues - Resolution Status**

All five open issues have been resolved by the owner. The table below is retained as a decision register for stakeholder reference. The resolution for each issue has been propagated into the relevant sections of this document (Business Rules, Functional Requirements, Data Migration).

| **Issue** | **Description**                                                     | **Impact**                                                                          | **Resolution**                                                                                                                                                                                                                                                                        | **Decision**              | **Status** |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------- |
| **OI-01** | Double tax application                                              | Tax applied to ingredients AND final price - potential double-count                 | Owner confirmed: double application is intentional. System must preserve exact double-tax chain. BR-03 updated to reflect this as a hard constraint.                                                                                                                                  | **Keep as-is**            | **CLOSED** |
| **OI-02** | Broken Quindim recipe (sheet "s")                                   | All VLOOKUP formulas show #REF! - recipe cannot be migrated as-is                   | Owner will rebuild the Quindim recipe from scratch using the new recipe builder. Raw ingredient amounts preserved in §3.2.3 as reference. Recipe excluded from migration batch.                                                                                                       | **Owner rebuilds**        | **CLOSED** |
| **OI-03** | 16 MISSING PRICE ingredients                                        | Apple, Lime, Matcha, Banana, and 12 others - any recipe using them cannot be priced | Recommendation applied: mandatory "Missing Prices" wizard added (FR-01.14). Migration blocked until all ingredients used in recipes have a confirmed price. MISSING PRICE ingredients not used in any recipe may be completed post-launch.                                            | **Wizard + block**        | **CLOSED** |
| **OI-04** | Valentine's in a Box uses different margins (20%/10%) vs global 30% | If margin is global-only, this recipe cannot be priced accurately                   | Recommendation applied: per-recipe profit margin override implemented as FR-03.6 (P1). Valentine's in a Box must have its margins set to 20% (cake) and 10% (brigadeiro) during data migration.                                                                                       | **Per-recipe margin**     | **CLOSED** |
| **OI-05** | ML density factor of 1.03 is a blanket approximation                | Inaccurate for dense liquids (honey, oil) or light liquids - affects cost_per_gram  | Recommendation applied: density_factor is now a per-ingredient configurable field (default 1.03). Added to ingredient entity (§3.1.1), conversion rules (§3.1.2), FR-01.13, and BR-12. All existing ML ingredients migrated with density_factor = 1.03; owner can refine post-launch. | **Per-ingredient factor** | **CLOSED** |

## **11.2 App Improvements Over Spreadsheet**

- Replace VLOOKUP dependency with a proper relational lookup - ingredient renames propagate automatically
- Add ingredient price history - user can see how costs have changed over time
- Add a "missing data" wizard that guides the user through completing all MISSING PRICE ingredients
- Allow per-recipe profit margin override (currently all recipes default to 30%)
- Support custom overhead categories beyond the 16 hardcoded ones
- Replace the manual colour-coded cell system with proper form validation and status badges
- Add a profitability simulator: given a target selling price, back-calculate the required profit margin
- Multi-language support: sheet uses mixed English/Portuguese labels (Massa, Recheio, Calda, Ovos, Coco)

# **12\. Acceptance Criteria**

The following criteria must all pass before the application is considered production-ready:

- Ingredient Database: All 113 ingredients from Stock_price are importable with correct price, size, unit, and vendor. Status flags carry over correctly.
- Unit Conversion: Cost-per-gram calculations match the spreadsheet formulas to within \$0.0001 for all 5 unit types (KG, G, L, ML, UND).
- Recipe Calculation: For the Valentine's in a Box recipe with all ingredient amounts entered, the system's "selling price" matches the spreadsheet's "You charge" formula output to within \$0.01.
- Scaling: Scaling a recipe from 1 unit to 3 units produces ingredient cost exactly 3× the single-unit cost.
- Overheads: Entering \$1,950 for MORTGAGE/RENT and 1 cake/month produces overhead_per_cake = \$2,174.915 (matching current spreadsheet with electricity + phone + rent).
- Missing Price Block \[OI-03\]: Adding an ingredient with MISSING PRICE status to a recipe causes the pricing calculation to display an error state - no price is shown. The migration wizard cannot be completed while any recipe-used ingredient remains MISSING PRICE.
- BR-03 / OI-01: The double-tax application (15% on ingredients + 15% on final price) is preserved exactly as in the spreadsheet formulas. Changing the tax rate in Settings updates both occurrences simultaneously.
- Brigadeiro Mode: The secondary pricing panel for brigadeiro recipes applies the 1.5× labour multiplier and 5% overhead correctly per §4.4.
- Real-time Updates: Changing an ingredient's price in the catalogue causes all recipe selling prices to update within 100ms with no page reload.
- Data Integrity: Attempting to delete an ingredient that is used in at least one recipe shows an error listing the affected recipes - deletion is blocked.
- Per-recipe Margin \[OI-04\]: Setting a custom profit margin on the Valentine's in a Box recipe (e.g. 20%) overrides the global 30% default. The selling price calculated using 20% matches the expected formula output. Removing the override reverts to the global default.
- Density Factor \[OI-05\]: For an ML-unit ingredient (e.g. Apple Sauce, 620 mL), updating density_factor from 1.03 to 1.10 changes size_in_grams from 638.6 to 682.0, and cost_per_gram updates accordingly in real time. All recipes using that ingredient reprice automatically.

# **13\. Glossary**

| **Term**                         | **Definition**                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Massa**                        | Portuguese: batter/dough. The main cake base component in a recipe.                                                                              |
| **Recheio**                      | Portuguese: filling. The inner layer or filling component of a recipe.                                                                           |
| **Calda**                        | Portuguese: syrup/glaze. The liquid topping or soak applied to a recipe.                                                                         |
| **Brigadeiro**                   | Brazilian chocolate truffle confection. A key product in this bakery. Sold individually or in batches.                                           |
| **Queijadinha**                  | Brazilian coconut cheese cake / sweet. A small moulded pastry.                                                                                   |
| **Quindim**                      | Brazilian coconut egg custard dessert. Draft recipe in the spreadsheet with broken formulas.                                                     |
| **cost_per_gram**                | Derived field: purchase_price / size_in_grams. The normalised unit cost for all ingredients.                                                     |
| **size_in_grams**                | The package size converted to grams using unit-specific conversion rules.                                                                        |
| **selling_price / "You charge"** | The final price the baker charges the customer, including ingredients + labour + overheads + profit margin + tax.                                |
| **overhead_per_cake**            | Monthly overhead total divided by average number of cakes produced per month.                                                                    |
| **VLOOKUP**                      | Excel function used to look up ingredient prices by name from the Stock_price sheet. Replaced in the app by a database foreign-key relationship. |
| **IFERROR**                      | Excel function that returns a fallback value if a formula errors. Used throughout recipe sheets to return empty string on missing lookups.       |
| **CAD**                          | Canadian Dollar. All monetary values in this system are in CAD.                                                                                  |
| **HST**                          | Harmonised Sales Tax. Canadian federal+provincial consumption tax. Rate used: 15%.                                                               |
| **Complexity Tier**              | Simple / Medium / Hard classification of a recipe that determines the hourly labour rate applied.                                                |

# **14\. Technology Recommendations**

This section provides a recommended technology stack for implementing the Bakery Pricing & Cost Calculator App. Recommendations are grounded in the specific constraints and requirements identified during the spreadsheet audit: a single non-technical user, real-time formula recalculation, offline-first usage, a modest data footprint (< 500 ingredients, < 100 recipes), and a Canadian-market deployment context.

These are recommendations, not mandates. The development team retains final authority over stack decisions. Each recommendation includes the rationale tied to specific PRD requirements so trade-offs can be evaluated against the actual constraints of this project.

## **14.1 Recommended Deployment Target**

Recommended: Progressive Web App (PWA) - installable on both desktop and mobile, works offline, no app store required.

| **Option**                          | **Pros**                                                                                                                                             | **Cons / Why Not**                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **✅ PWA (Recommended)**            | Single codebase for desktop + mobile; no app store approval; installable offline; works on any OS; easy to deploy and update; zero distribution cost | Slightly less native feel than a native app; push notifications limited on iOS                                    |
| **Native Mobile App (iOS/Android)** | Best mobile UX; access to device features                                                                                                            | Two codebases or React Native complexity; App Store approval required; higher cost; overkill for single-user tool |
| **Desktop App (Electron)**          | Full offline; file system access for exports                                                                                                         | No mobile access; large install size; update distribution complexity                                              |
| **Web App only (no offline)**       | Simplest deployment                                                                                                                                  | Baker works in a kitchen - internet may be intermittent; §8.3 real-time requirement needs reliable connection     |

## **14.2 Frontend Framework**

Recommended: React with TypeScript.

| **Option**                              | **Pros**                                                                                                                                                                                                               | **Cons / Why Not**                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **✅ React + TypeScript (Recommended)** | Large ecosystem; TypeScript enforces type safety on all monetary calculations (critical for §4); component model fits the recipe builder's dynamic ingredient rows; excellent PWA support via Vite; strong hiring pool | More boilerplate than Vue for simple forms; requires discipline to avoid over-engineering                                       |
| **Vue 3 + TypeScript**                  | Gentle learning curve; good PWA support                                                                                                                                                                                | Smaller ecosystem; fewer specialised finance/calculation libraries                                                              |
| **Svelte / SvelteKit**                  | Smallest bundle; reactive by default - good for real-time calc requirement                                                                                                                                             | Smaller community; fewer senior developers available; less mature tooling                                                       |
| **Vanilla JS**                          | No framework overhead                                                                                                                                                                                                  | Untenable for a dynamic UI with 11 screens, real-time recalculation, and complex state (recipe builder, scaling widget, wizard) |

### **14.2.1 Key Frontend Libraries**

| **Library**                       | **Purpose**              | **Rationale**                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zustand or Redux Toolkit**      | Global state management  | Ingredient catalogue and global settings (tax rate, profit margin, hourly rates) must be accessible from all 11 screens simultaneously. Changes must propagate in real time per §8.1. Zustand is lighter and simpler for a single-user app; Redux Toolkit if the team expects complex async flows. |
| **React Hook Form + Zod**         | Form validation          | Every input field has validation rules (§8.2, FR-01.9). Zod provides schema-level type safety and runtime validation - catching "7;99" style errors at the boundary before they enter state.                                                                                                       |
| **Decimal.js or big.js**          | Monetary arithmetic      | CRITICAL: JavaScript floating-point arithmetic is unsafe for financial calculations. 0.1 + 0.2 = 0.30000000000000004 in native JS. §8.2 requires 4 decimal place precision. Decimal.js provides exact decimal arithmetic for all pricing engine calculations.                                      |
| **Recharts or Chart.js**          | Dashboard visualisations | Cost breakdown charts on the Dashboard (§9 Screen 01) and the pricing breakdown panel (Screen 06). Recharts integrates natively with React.                                                                                                                                                        |
| **React PDF / jsPDF**             | PDF export               | FR-06.5 requires PDF export of recipe price cards. React PDF allows building PDF layouts as React components - consistent with the rest of the frontend.                                                                                                                                           |
| **Workbox (via Vite PWA plugin)** | Service worker / offline | Enables offline-first behaviour (§8.1 - no internet dependency in kitchen). Caches the app shell and syncs data changes when connectivity resumes.                                                                                                                                                 |
| **Fuse.js**                       | Fuzzy ingredient search  | The recipe builder autocomplete (FR-02.3) needs forgiving search - a baker typing "choc powder" should find "Cocoa powder". Fuse.js provides lightweight fuzzy matching with no server round-trip.                                                                                                 |

## **14.3 Data Persistence**

Recommended: SQLite via sql.js-httpvfs (browser) + optional Supabase cloud sync.

This project has a small, well-defined relational data model (ingredients → recipe_lines → recipes → overheads). A relational database is the natural fit - replacing the VLOOKUP relationships with proper foreign keys.

### **14.3.1 Local Storage Layer**

| **Option**                                                 | **Pros**                                                                                                                                                                   | **Cons / Why Not**                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **✅ SQLite via Origin Private File System (Recommended)** | Full SQL query power; relational integrity (ingredient FK constraint for BR-07); works completely offline; zero server cost; data stays on device; standard SQL migrations | Slightly complex setup with WASM build; not supported in Safari < 15.2 (check target devices)                                                      |
| **IndexedDB (via Dexie.js)**                               | Native browser API; good offline support; well-supported                                                                                                                   | Document-oriented, not relational - enforcing FK integrity (BR-07) requires application-level logic; more complex queries for pricing aggregations |
| **localStorage**                                           | Simplest possible                                                                                                                                                          | Hard 5MB limit - will fail at scale; no query capability; JSON serialisation of nested recipe data is fragile                                      |
| **Cloud-only (no local storage)**                          | Always in sync                                                                                                                                                             | Violates offline requirement; kitchen internet is unreliable; single user does not need multi-device sync in v1.0                                  |

### **14.3.2 Recommended Database Schema**

The following schema directly maps the PRD data model to relational tables, replacing all VLOOKUP relationships with foreign keys:

TABLE ingredients id UUID PRIMARY KEY name TEXT UNIQUE NOT NULL -- BR-01: globally unique price DECIMAL(10,4) NOT NULL -- purchase price CAD package_size DECIMAL(10,4) NOT NULL -- in original unit unit ENUM(KG,G,L,ML,UND) density_factor DECIMAL(6,4) DEFAULT 1.03 -- BR-12: ML only grams_per_unit DECIMAL(10,4) -- UND only (e.g. 50g per egg) size_in_grams DECIMAL(10,4) COMPUTED -- derived via unit conversion rules §3.1.2 cost_per_gram DECIMAL(10,6) COMPUTED -- price / size_in_grams status ENUM(OK, MISSING_PRICE, DOUBLE_CHECK, UNVERIFIED) vendor TEXT notes TEXT archived BOOLEAN DEFAULT FALSE created_at TIMESTAMP updated_at TIMESTAMP TABLE recipes -- DECISION v1.2: recipe = name + type only id UUID PRIMARY KEY name TEXT NOT NULL is_brigadeiro BOOLEAN DEFAULT FALSE -- triggers §4.4 for ALL variants (BR decision) notes TEXT created_at TIMESTAMP updated_at TIMESTAMP TABLE recipe_variants -- DECISION v1.2: one row per size under a recipe id UUID PRIMARY KEY recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE cake_size_cm INTEGER NOT NULL -- 5,8,10,12,15,20,25,30 complexity ENUM(SIMPLE, MEDIUM, HARD) hourly_rate DECIMAL(8,2) -- NULL = use global tier rate time_hours DECIMAL(5,2) DEFAULT 1.5 profit_margin DECIMAL(5,4) -- NULL = use global default (BR-11) tax_rate DECIMAL(5,4) DEFAULT 0.15 overhead_rate DECIMAL(5,4) DEFAULT 0.05 quantity_produced INTEGER DEFAULT 1 UNIQUE(recipe_id, cake_size_cm) -- one variant per size per recipe TABLE recipe_lines id UUID PRIMARY KEY variant_id UUID REFERENCES recipe_variants(id) ON DELETE CASCADE -- belongs to variant ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT -- BR-07 component ENUM(MASSA, RECHEIO, CALDA, OTHERS) amount_grams DECIMAL(10,4) NOT NULL sort_order INTEGER obs TEXT TABLE overheads id UUID PRIMARY KEY category TEXT NOT NULL jan DECIMAL(10,2), feb DECIMAL(10,2), mar DECIMAL(10,2), apr DECIMAL(10,2), may DECIMAL(10,2), jun DECIMAL(10,2), jul DECIMAL(10,2), aug DECIMAL(10,2), sep DECIMAL(10,2), oct DECIMAL(10,2), nov DECIMAL(10,2), dec DECIMAL(10,2) TABLE settings key TEXT PRIMARY KEY value TEXT NOT NULL -- Keys: tax_rate, profit_margin, overhead_rate, -- hourly_rate_simple, hourly_rate_medium, hourly_rate_hard, -- avg_cakes_per_month, currency, business_name -- NOTE: No auth keys - authentication skipped in v1.0 (DECISION v1.2)

### **14.3.3 Optional Cloud Sync - v1.1+**

For v1.0, local-only storage is sufficient. If the owner requests cross-device access (e.g. phone in the kitchen, laptop for admin), the recommended addition is:

| **Component**         | **Recommendation**                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud backend**     | Supabase (PostgreSQL + Auth + Realtime). Mirrors the SQLite schema exactly. Free tier covers this use case indefinitely.                                             |
| **Sync strategy**     | Last-write-wins with updated_at timestamp. Single user - no merge conflicts expected. On reconnect, upload local changes; pull remote changes; resolve by timestamp. |
| **Auth**              | Supabase Auth with magic link (email). No password to forget - the owner receives a login link by email. Simple and secure for a non-technical user.                 |
| **Offline behaviour** | App always reads/writes to local SQLite first. Supabase sync runs in the background. A sync status indicator shows "Last synced: X minutes ago".                     |

## **14.4 Backend**

Recommended: No dedicated backend for v1.0.

All business logic (pricing engine, unit conversions, scaling formulas) runs client-side in the browser. This is feasible because:

- The data model is small and fully known at design time
- There is one user - no concurrency, no API authentication surface to secure
- All calculations are deterministic and stateless - ideal for client-side execution
- A backend would add operational cost, deployment complexity, and a single point of failure for a kitchen tool

If cloud sync is added in v1.1 (§14.3.3), Supabase's auto-generated REST and Realtime APIs serve as the backend with zero custom server code.

## **14.5 Pricing Engine Implementation**

The pricing engine (§4) is the most critical and complexity-sensitive part of the application. The following implementation guidelines must be followed:

### **14.5.1 Arithmetic Safety**

// ❌ NEVER use native JS arithmetic for monetary values const cost = 0.1 + 0.2; // → 0.30000000000000004 // ✅ ALWAYS use Decimal.js for all pricing calculations import Decimal from 'decimal.js'; Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP }); const price = new Decimal("6.877"); // Butter Natrel const sizeG = new Decimal("454"); // 454g const costPerGram = price.div(sizeG); // 0.01515... const amountG = new Decimal("56"); // recipe uses 56g const lineCost = costPerGram.mul(amountG); // → 0.8484... // Display only: round to 2dp for UI, store 4dp in DB lineCost.toFixed(2); // "0.85"

### **14.5.2 Reactive Recalculation Architecture**

The real-time recalculation requirement (§8.1 - < 100ms) must be implemented as a reactive computation graph, not an event-driven cascade of manual updates:

// Recommended: derived state via useMemo / Zustand computed // Each node depends only on its direct inputs const pricingEngine = useMemo(() => { // Step 1: line costs (recipe*lines belong to the variant) const lines = variant.lines.map(line => ({ ...line, costPerGram: line.ingredient.price / line.ingredient.sizeInGrams, lineCost: line.amountGrams \* costPerGram, })); // Step 2-6: chain formula from §4.2 // is_brigadeiro lives on the recipe (parent); variant supplies the numbers const totalIngredients = sum(lines.map(l => l.lineCost)); const ingredientsWithTax = totalIngredients \* (1 + (variant.taxRate ?? settings.taxRate)); const hourlyRate = variant.hourlyRate ?? settings\[\`hourlyRate*\${variant.complexity}\`\]; const labourCost = hourlyRate \* variant.timeHours; const overheadCost = (labourCost + ingredientsWithTax) \* (variant.overheadRate ?? settings.overheadRate); const profitMargin = variant.profitMargin ?? settings.profitMargin; // BR-11 // Standard path (§4.1) vs Brigadeiro path (§4.4) - decided by recipe.is_brigadeiro const sellingPrice = recipe.isBrigadeiro ? brigadeiroPricingEngine(variant, settings) // §4.4 : (labourCost + ingredientsWithTax + overheadCost) \* profitMargin \* (1 + (variant.taxRate ?? settings.taxRate)); return { lines, totalIngredients, ingredientsWithTax, labourCost, overheadCost, sellingPrice }; }, \[recipe, variant, settings\]); // recalculates when recipe, variant, or settings change

### **14.5.3 Unit Conversion Module**

Unit conversion must be isolated in a pure, independently testable module - not scattered through components:

// src/lib/unitConversion.ts export function toGrams( size: Decimal, unit: Unit, densityFactor = new Decimal("1.03"), gramsPerUnit?: Decimal ): Decimal { switch (unit) { case "KG": return size.mul(1000); case "G": return size; case "L": return size.mul(1000); case "ML": return size.mul(densityFactor); // BR-12 case "UND": return size.mul(gramsPerUnit!); // e.g. 72 eggs × 50g } }

## **14.6 Build Tooling & Developer Experience**

| **Tool**                | **Category**       | **Rationale**                                                                                                                                                                    |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vite**                | Build / Dev server | Fast HMR critical for UI-heavy development; native PWA plugin (vite-plugin-pwa) generates service worker and manifest automatically; TypeScript and React support out of the box |
| **Vitest**              | Unit testing       | Same config as Vite; co-located with source; essential for pricing engine tests - the formula accuracy acceptance criteria (§12 items 1-7) should all be automated unit tests    |
| **Playwright**          | End-to-end testing | Acceptance criteria §12 items 8-12 require full browser interaction (real-time updates, delete blocking, wizard flows). Playwright runs against the actual PWA.                  |
| **ESLint + Prettier**   | Code quality       | Enforces consistent code style; ESLint rules for no-floating-point arithmetic (custom rule to flag raw + - \* / on numeric variables, enforcing Decimal.js usage)                |
| **Husky + lint-staged** | Pre-commit hooks   | Runs ESLint, Prettier, and Vitest on changed files before every commit - prevents broken pricing logic from entering the codebase                                                |
| **GitHub Actions**      | CI/CD              | Run full test suite on every PR; deploy to GitHub Pages or Vercel on merge to main; zero infrastructure cost for this scale                                                      |

## **14.7 Hosting & Deployment**

| **Option**                         | **Monthly Cost (est.)** | **Notes**                                                                                                              |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **✅ Vercel (Recommended)**        | \$0 (hobby tier)        | Automatic HTTPS; global CDN; deploy on git push; custom domain support; PWA static files served perfectly; zero config |
| **GitHub Pages**                   | \$0                     | Free static hosting; slightly more config for SPA routing; no server-side features (not needed for v1.0)               |
| **Netlify**                        | \$0 (starter)           | Similar to Vercel; good PWA support; form handling if ever needed                                                      |
| **Self-hosted VPS**                | \$5-20/mo               | Maximum control; unnecessary complexity for a static PWA with no backend                                               |
| **Supabase (if cloud sync added)** | \$0 (free tier)         | Free tier: 500MB database, 2GB bandwidth, 50K monthly active users - vastly exceeds single-user needs                  |

## **14.8 Security Implementation**

DECISION (v1.2): Authentication is skipped entirely for v1.0. The full security posture for each version is defined below.

| **Concern**                  | **v1.0 Approach**                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**           | NONE in v1.0. Single-user local app with no network-exposed data. No login screen, no PIN, no session. If cloud sync is added in v1.1, Supabase Auth with magic link (passwordless email) is the recommended approach, with Row-Level Security on all tables. |
| **Data at rest**             | SQLite database stored in the browser's Origin Private File System - inaccessible to other origins and not directly browsable by the user or other apps. No additional encryption needed for v1.0 threat model.                                               |
| **Data in transit**          | No data leaves the device in v1.0. If cloud sync is added in v1.1, Supabase enforces TLS 1.3 for all API calls.                                                                                                                                               |
| **Sensitive field exposure** | Use autocomplete="off" on all financial input fields (margins, prices, selling prices) to prevent browser autofill storing business-sensitive data.                                                                                                           |
| **Dependency security**      | npm audit run in CI pipeline on every build. Dependabot alerts enabled on the GitHub repository. No server-side code means no SQL injection or server-side RCE attack surface.                                                                                |

## **14.9 Recommended Stack - Full Summary**

This stack is entirely free to run for a single user, requires no server management, works offline in the kitchen, and can be built and deployed by a solo developer or small team within the typical timeframe for a project of this scope.

| **Layer**               | **Recommended Choice**           | **Key Reason**                                                                                                          |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Deployment Target**   | **PWA (Progressive Web App)**    | Desktop + mobile from one codebase; offline-first; no app store                                                         |
| **UI Framework**        | **React 18 + TypeScript**        | Type-safe monetary calculations; reactive state for real-time pricing                                                   |
| **State Management**    | **Zustand**                      | Lightweight global state for settings + ingredient catalogue propagation                                                |
| **Form Validation**     | **React Hook Form + Zod**        | Runtime validation prevents malformed price entries (e.g. "7;99")                                                       |
| **Monetary Arithmetic** | **Decimal.js**                   | Exact decimal precision - required for all pricing engine calculations                                                  |
| **Local Database**      | **SQLite (OPFS via wa-sqlite)**  | 5 tables: ingredients, recipes, recipe_variants, recipe_lines, overheads, settings; full FK integrity; replaces VLOOKUP |
| **Authentication**      | **None (v1.0)**                  | DECISION v1.2: skipped - single-user local app; revisit in v1.1 with Supabase magic link if cloud sync added            |
| **Cloud Sync (v1.1)**   | **Supabase (PostgreSQL + Auth)** | Free tier; mirrors local schema; magic link auth; RLS security                                                          |
| **Build Tool**          | **Vite + vite-plugin-pwa**       | Fast dev loop; PWA manifest + service worker auto-generated                                                             |
| **Unit Tests**          | **Vitest**                       | Pricing formula accuracy tests - all §12 formula criteria automated                                                     |
| **E2E Tests**           | **Playwright**                   | Wizard flows, real-time update, delete-block acceptance criteria                                                        |
| **CI/CD**               | **GitHub Actions → Vercel**      | Zero cost; auto-deploy on push; HTTPS included                                                                          |
| **PDF Export**          | **React PDF**                    | Recipe price cards rendered as React components                                                                         |
| **Fuzzy Search**        | **Fuse.js**                      | Ingredient autocomplete in recipe builder (tolerates typos)                                                             |

## **14.10 Suggested Implementation Phases**

The following phasing aligns the technology stack build-up with the PRD priority tiers (P1 → P2 → P3):

| **Phase**                  | **Duration (est.)** | **Scope**                                                                                                                                                                              | **Deliverable**                                                |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **0 - Setup**              | 1 week              | Vite + React + TypeScript scaffold; Zustand store; SQLite setup; Decimal.js integration; Vitest config; basic routing for 11 screens                                                   | **Running shell app with empty screens and DB connected**      |
| **1 - Core Engine**        | 2-3 weeks           | Ingredient CRUD (FR-01.1-01.10); unit conversion module with tests; pricing engine steps 1-6 with full Vitest coverage; settings screen with all default parameters                    | **Pricing engine passing all §12 formula acceptance criteria** |
| **2 - Recipe Builder**     | 2-3 weeks           | Recipe list + builder (FR-02.1-02.11); ingredient autocomplete (Fuse.js); real-time cost sidebar; pricing breakdown panel; recipe scaling widget; per-recipe margin override (FR-03.6) | **Complete recipe creation and pricing flow**                  |
| **3 - Overheads & Labour** | 1-2 weeks           | Overhead manager with 12-month grid (FR-04.1-04.6); labour time tracker (FR-05.1-05.6); overhead per cake integration into pricing engine                                              | **Full cost model including overheads**                        |
| **4 - Migration & Polish** | 1-2 weeks           | Data migration wizard with missing-price gate (FR-01.14); import 113 ingredients; import 9 recipes; Dashboard KPIs; PWA manifest + service worker; offline testing                     | **Production-ready v1.0 with all existing data migrated**      |
| **5 - Reporting & Export** | 1 week              | PDF recipe price cards (React PDF); CSV export; print-friendly recipe view (FR-06.3-06.5)                                                                                              | **Complete reporting module**                                  |
| **6 - Cloud Sync (v1.1)**  | Future              | Supabase integration; magic link auth; background sync; sync status indicator                                                                                                          | **Cross-device access**                                        |

Total estimated duration for v1.0 (Phases 0-5): 8-12 weeks for a single experienced full-stack developer, or 4-6 weeks for a two-person team.

# **15\. Brand & Visual Identity**

This section translates the official "Made With Love by Cinthia" brand identity document into concrete implementation requirements for the application UI. Every colour, typeface, and tone specification below is derived directly from the brand guide and must be respected throughout the app to ensure visual consistency with the owner's existing business identity.

Source: made-with-love-by-cinthia-brand-visual-identity.pdf - official brand guide. This is the authoritative reference. Any UI decision that conflicts with this section must be escalated and approved before implementation.

## **15.1 Brand Overview**

Made With Love by Cinthia is a bakery specialising in bolos (cakes), brigadeiros, and event decoration. The brand guide describes the identity as built on afeto (affection), alegria (joy), calor humano (human warmth), the vibrant colours of Brazil, and chocolate. The app must feel like an extension of this personality - warm, inviting, handcrafted, and joyful - never cold, clinical, or corporate.

| **Brand Attribute**                      | **App UI Implication**                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afeto (affection)**                    | Rounded corners everywhere. Generous padding. Avoid sharp, angular layouts. Error messages must be friendly and helpful, never cold or technical.                       |
| **Alegria (joy)**                        | Use brand amber and orange as primary accent colours for CTAs, success states, and highlights. Avoid desaturated or monochrome-heavy layouts.                           |
| **Calor humano (warmth)**                | Off-white (#F3FBFF) as the primary background - never pure white or grey. Warm browns for text hierarchy.                                                               |
| **Cores do Brasil (Brazilian vibrancy)** | The red (#DF4545), amber (#FFBD59), and orange (#FF914D) palette must be present throughout - not just in edge cases. These are primary brand colours, not accent-only. |
| **Chocolate**                            | Deep brown (#904213) is the primary text and heading colour - warm and rich, not black. It anchors the warmth of the palette.                                           |

## **15.2 Colour Palette - Exact Specifications**

The following five colours are specified exactly in the brand guide. All hex values are taken verbatim from the document. No approximations or substitutions are permitted.

| **Name**                 | **Hex**     | **Role in Brand**                            | **App UI Usage**                                                                                                                                      |
| ------------------------ | ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coral Red**            | **#DF4545** | _Primary brand colour - energy, passion_     | Danger/error states; delete confirmations; MISSING PRICE badges; destructive action buttons. Also valid as a primary CTA colour on light backgrounds. |
| **Amber Yellow**         | **#FFBD59** | _Primary brand colour - joy, warmth_         | Primary CTA buttons (e.g. "Save & next", "Calculate price"); highlight borders; active tab indicators; progress bar fills; star/featured callouts.    |
| **Burnt Orange**         | **#FF914D** | _Primary brand colour - vibrancy, Brasil_    | Secondary CTAs; hover states; DOUBLE CHECK badge background; "custom override" badge background; brigadeiro mode toggle accent.                       |
| **Chocolate Brown**      | **#904213** | _Primary brand colour - chocolate, richness_ | Primary heading text colour (h1, h2, h3); logo text; ingredient name labels; recipe titles. The main typographic colour throughout the app.           |
| **Ice Blue / Off-White** | **#F3FBFF** | _Background - calm, clean_                   | App background colour (replaces pure white); card surfaces; sidebar background; wizard step background.                                               |

### **15.2.1 Derived Colour Tokens**

The following derived tokens must be defined in the app's CSS/design system. They do not appear in the brand guide but are necessary for a complete UI system built on the 5 brand colours:

| **Token Name**                | **Value** | **Usage**                                                                                                |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| **\--color-bg-app**           | #F3FBFF   | App-wide background. Every screen sits on this.                                                          |
| **\--color-bg-card**          | #FFFFFF   | Card surfaces elevated above the app background.                                                         |
| **\--color-bg-card-warm**     | #FFF8F0   | Warm card variant for recipe and pricing panels - a very subtle warm white derived from the orange ramp. |
| **\--color-text-heading**     | #904213   | All h1, h2, h3 headings. Chocolate brown from brand guide.                                               |
| **\--color-text-body**        | #5C2E08   | Body text - a darker shade of the brown ramp for readability.                                            |
| **\--color-text-muted**       | #B07040   | Secondary/muted text, labels, hints.                                                                     |
| **\--color-border-default**   | #F0D5B8   | Default card and input borders - a warm beige derived from the orange ramp.                              |
| **\--color-border-focus**     | #FF914D   | Input focus ring - burnt orange.                                                                         |
| **\--color-cta-primary**      | #FFBD59   | Primary button background (amber).                                                                       |
| **\--color-cta-primary-text** | #904213   | Primary button text (chocolate on amber - high contrast).                                                |
| **\--color-cta-secondary**    | #FF914D   | Secondary button / outline accent (burnt orange).                                                        |
| **\--color-danger**           | #DF4545   | Error states, MISSING PRICE, destructive actions.                                                        |
| **\--color-danger-bg**        | #FDF0F0   | Light red background for danger callouts.                                                                |
| **\--color-success**          | #4E9A5A   | Success / OK status - not in brand guide; use a warm green that complements the palette.                 |
| **\--color-brigadeiro**       | #904213   | Brigadeiro mode accent - uses the chocolate brown to suggest the confection.                             |

## **15.3 Typography**

The brand guide specifies a single typeface family: Garet, in two weights - Garet (regular/bold) and Garet Book (lighter weight). Both are used throughout the brand identity for headings, subheadings, and body text.

| **Variant**              | **Weight**  | **App Usage**                                                                                                                                   |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Garet (Regular/Bold)** | 700 bold    | All headings (h1, h2, h3); recipe names in the Recipe List; the "You charge" final price display; navigation labels; button text; badge labels. |
| **Garet Book**           | 400 regular | Body text; ingredient names in recipe lines; form field labels; muted supporting text; cost breakdown line items; wizard body copy.             |

### **15.3.1 Typography Implementation**

Garet is available on Google Fonts. Add to the app as follows:

/\* In index.html &lt;head&gt; \*/ &lt;link href="<https://fonts.googleapis.com/css2?family=Garet:wght@400;700&display=swap>" rel="stylesheet"&gt; /\* In global CSS \*/ :root { --font-brand: "Garet", "Helvetica Neue", Arial, sans-serif; } body { font-family: var(--font-brand); font-weight: 400; /\* Garet Book equivalent \*/ color: var(--color-text-body); background-color: var(--color-bg-app); /\* #F3FBFF \*/ } h1, h2, h3 { font-family: var(--font-brand); font-weight: 700; /\* Garet Bold \*/ color: var(--color-text-heading); /\* #904213 \*/ }

### **15.3.2 Type Scale**

| **Level**   | **Size** | **Weight** | **Usage**                                                            |
| ----------- | -------- | ---------- | -------------------------------------------------------------------- |
| **Display** | 28px     | 700        | "You charge" selling price; recipe name hero on builder screen       |
| **h1**      | 22px     | 700        | Screen titles (e.g. "Chocolate Cake", "Ingredient Catalogue")        |
| **h2**      | 18px     | 700        | Section headings within a screen (e.g. "Massa", "Pricing breakdown") |
| **h3**      | 15px     | 700        | Subsection labels, component tab titles                              |
| **Body**    | 14px     | 400        | Default UI text, ingredient names, descriptions                      |
| **Small**   | 12px     | 400        | Badges, labels, timestamps, annotation text, units                   |
| **Micro**   | 11px     | 400        | PRD annotation callouts, formula source references (dev-only)        |

## **15.4 Logo & Brand Mark Usage**

The brand guide provides five logo variants. The app must use them appropriately for different contexts:

| **Logo Variant**                                  | **Context**                                                 | **Notes**                                                               |
| ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| **MADE WITH LOVE / by Cinthia (full circle)**     | App splash/loading screen; PWA install icon                 | Primary logo. Brown text, circle composition with heart accents.        |
| **MADEWITHLOVE by Cinthia (horizontal wordmark)** | App header / top navigation bar                             | Horizontal layout fits nav bar. Use the full wordmark on wider screens. |
| **MW by Cinthia (monogram)**                      | Mobile nav bar; PWA home screen icon (192×192, 512×512)     | Compact form for small spaces. Preferred for the PWA manifest icon.     |
| **MWL by Cinthia (abbreviated)**                  | Favicon (32×32, 16×16); browser tab title icon              | Shortest form for the smallest contexts.                                |
| **MWL / MW (icon only, no "by Cinthia")**         | Loading spinner background; watermark on price card exports | Used when "by Cinthia" sub-text would be too small to read.             |

The developer must request the logo files as SVG assets from the owner. Do not recreate the logo in code - use the provided SVG files to ensure exact reproduction of the hand-lettered "by Cinthia" script element.

## **15.5 UI Component Design Requirements**

The following specifies how the brand identity translates to each key UI component across the 11 application screens:

### **15.5.1 Buttons**

| **Type**            | **Background**  | **Text**                   | **Border / Hover**                                         |
| ------------------- | --------------- | -------------------------- | ---------------------------------------------------------- |
| **Primary CTA**     | #FFBD59 (amber) | #904213 (chocolate) - bold | No border; hover → darken to #F0AD45; active → scale(0.97) |
| **Secondary CTA**   | Transparent     | #FF914D (burnt orange)     | 1px solid #FF914D; hover → #FF914D bg with white text      |
| **Danger**          | Transparent     | #DF4545 (coral red)        | 1px solid #DF4545; hover → #DF4545 bg with white text      |
| **Ghost / neutral** | Transparent     | #904213 (chocolate)        | 1px solid #F0D5B8 (warm beige); hover → #FFF8F0 bg         |
| **Disabled**        | #F3FBFF         | #B07040 (muted brown)      | 1px solid #F0D5B8; cursor: not-allowed; opacity: 0.6       |

### **15.5.2 Status Badges**

| **Badge**           | **Background** | **Text Colour** | **Trigger**                                        |
| ------------------- | -------------- | --------------- | -------------------------------------------------- |
| **OK**              | #E8F5E9        | #2E7D32         | Ingredient status = OK; recipe fully priceable     |
| **MISSING PRICE**   | #FDF0F0        | #DF4545         | Ingredient has no price; blocks recipe calculation |
| **DOUBLE CHECK**    | #FFF8EC        | #FF914D         | Ingredient price flagged for verification          |
| **UNVERIFIED**      | #F3FBFF        | #904213         | Imported ingredient not yet confirmed by owner     |
| **CUSTOM**          | #FFF8EC        | #FF914D         | Per-recipe override active (margin, rate, hours)   |
| **Brigadeiro mode** | #FFF3E0        | #904213         | is_brigadeiro = true on this recipe                |

### **15.5.3 Cards & Surfaces**

| **Element**                      | **Specification**                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **App background**               | #F3FBFF (ice blue from brand guide) - all screens sit on this                                                                                |
| **Standard card**                | White (#FFFFFF) background; 1px solid #F0D5B8 border; border-radius: 16px; padding: 20px 24px; box-shadow: none (flat, per brand warmth)     |
| **Warm card (recipes, pricing)** | #FFF8F0 background; 1px solid #F0D5B8 border; border-radius: 16px - used for recipe builder panels and the pricing breakdown                 |
| **Danger callout**               | #FDF0F0 background; 1px solid #DF4545 left border (4px); border-radius: 8px - for MISSING PRICE warnings within a recipe                     |
| **Info callout**                 | #FFF8EC background; 1px solid #FF914D left border (4px) - for DOUBLE CHECK and general tips                                                  |
| **Section divider**              | 1px solid #F0D5B8 (warm beige) - never grey or black dividers                                                                                |
| **Input fields**                 | White bg; 1px solid #F0D5B8 border; border-radius: 10px; focus ring: 2px solid #FF914D (burnt orange); font: Garet Book 14px; color: #5C2E08 |
| **Progress bars**                | Track: #F0D5B8; Fill: #FFBD59 (amber) for progress; #DF4545 for danger; #4E9A5A for complete                                                 |

### **15.5.4 Navigation & App Header**

| **Element**               | **Specification**                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Top navigation bar**    | Background: white; bottom border: 1px solid #F0D5B8; height: 56px; logo: MADEWITHLOVE wordmark left-aligned; right side: business name from Settings |
| **Active nav item**       | Text: #904213 bold; underline accent: 2px solid #FFBD59 (amber)                                                                                      |
| **Inactive nav item**     | Text: #B07040 (muted brown); hover: #904213                                                                                                          |
| **Mobile bottom tab bar** | Background: white; top border: 1px solid #F0D5B8; icons in #B07040; active icon + label in #904213 with #FFBD59 dot indicator                        |
| **Screen titles (h1)**    | Font: Garet Bold 22px; colour: #904213; margin-bottom: 20px                                                                                          |

### **15.5.5 The "You Charge" Price Display**

The final selling price - the most important number in the entire app - deserves special visual treatment that reflects the brand's joy and warmth. This is the payoff moment for the owner after entering all their data.

| **Element**                    | **Specification**                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Price display container**    | Warm card (#FFF8F0) background; border-radius: 20px; padding: 24px; border: 2px solid #FFBD59 (amber) - the one place a 2px brand-colour border is used |
| **"You charge" label**         | Garet Book 13px; colour: #B07040 (muted brown); letter-spacing: 0.08em; uppercase                                                                       |
| **Price value**                | Garet Bold 36px; colour: #904213 (chocolate brown); e.g. "\$50.95"                                                                                      |
| **Currency symbol**            | Garet Bold 20px; #FF914D (burnt orange); vertically aligned top of price digits                                                                         |
| **Error state (cannot price)** | Price replaced by "-"; container border changes to #DF4545; label changes to "missing data" in red                                                      |
| **Brigadeiro variant label**   | Small tag above price: "brigadeiro pricing" badge in chocolate brown on amber bg                                                                        |

## **15.6 Brand Voice & UX Copy**

All in-app text - button labels, error messages, empty states, wizard copy, and tooltips - must reflect the brand's warm, Brazilian-influenced personality. The owner is the sole user: the app speaks to her as a collaborator, not a software user.

| **Context**                   | **Avoid (cold / generic)**           | **Use instead (warm / brand-aligned)**                                     |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| **Empty recipe list**         | _"No recipes found."_                | "You haven't created any recipes yet. Let's build your first one!"         |
| **Missing price error**       | _"Error: price not set."_            | "This ingredient still needs a price before we can calculate."             |
| **Ingredient saved**          | _"Record saved."_                    | "Got it! Price updated across all your recipes."                           |
| **Migration wizard complete** | _"Migration complete."_              | "All done! Your recipes are ready to price. Time to bake! 🎂"              |
| **Delete confirmation**       | _"Are you sure you want to delete?"_ | "Remove this recipe? This can't be undone."                                |
| **Brigadeiro mode on**        | _"Mode: Brigadeiro"_                 | "Brigadeiro mode on - using the brigadeiro pricing formula."               |
| **Calculation blocked**       | _"Cannot calculate."_                | "Almost there - add a price to \[ingredient name\] to unlock this recipe." |

## **15.7 Price Card Export - Brand Specifications**

The PDF price cards exported from the Reports screen (FR-06.3) are customer-facing documents. They must carry the full brand identity:

- Header: "Made With Love by Cinthia" wordmark SVG, centred, on #F3FBFF background
- Tagline: "Decor, cakes, brigadeiros" - Garet Book 12px, #B07040, below the logo
- Recipe name: Garet Bold 20px, #904213
- Selling price: large display, Garet Bold 32px, #904213, inside an amber (#FFBD59) rounded box
- Cost breakdown table: warm beige (#F0D5B8) header row; Garet Book 11px body text; #904213 text
- Footer: small MWL monogram watermark, right-aligned; "Made with love" tagline in #B07040
- Page background: #F3FBFF (ice blue) - not white

## **15.8 Dark Mode Policy**

The Made With Love brand is built entirely on warm, light, vibrant colours. A dark mode would fundamentally conflict with the brand's identity - replacing the warm ice-blue (#F3FBFF) background and chocolate-brown (#904213) headings with inverted values that are inconsistent with the joyful, artisan aesthetic. Dark mode is therefore explicitly out of scope for v1.0 and v1.1. The app is light-mode only. This decision is made on brand grounds, not technical grounds, and should not be overridden without owner approval.

## **15.9 Brand Functional Requirements**

| **ID**      | **Requirement**                                                                                                                                                                             | **Priority** | **Source**                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------- |
| **FR-B.1**  | The entire app must use the Garet font family (Bold for headings, Book/Regular for body). No other typeface may be used.                                                                    | **P1**       | _Brand guide - typography_                |
| **FR-B.2**  | All 5 brand hex colours (#DF4545, #FFBD59, #FF914D, #904213, #F3FBFF) must be present in the app's CSS design token file and used as specified in §15.2.                                    | **P1**       | _Brand guide - colour palette_            |
| **FR-B.3**  | The app background colour must be #F3FBFF (ice blue from brand guide) on all screens. Pure white (#FFFFFF) must not be used as a background.                                                | **P1**       | _Brand guide - colour palette_            |
| **FR-B.4**  | All heading text (h1, h2, h3, recipe names) must use #904213 (chocolate brown). Black (#000000) must not be used as a text colour.                                                          | **P1**       | _Brand guide - chocolate identity_        |
| **FR-B.5**  | The "Made With Love by Cinthia" wordmark must appear in the app navigation header. The appropriate logo variant (§15.4) must be used for each context (nav, PWA icon, favicon, price card). | **P1**       | _Brand guide - logo usage_                |
| **FR-B.6**  | Logo assets must be provided as SVG files by the owner. The developer must not recreate the script "by Cinthia" element in code.                                                            | **P1**       | _Brand guide - logo fidelity_             |
| **FR-B.7**  | The "You charge" selling price display must use the amber-bordered warm card design specified in §15.5.5. It is the visual centrepiece of the pricing breakdown screen.                     | **P1**       | _Brand guide - joy, afeto_                |
| **FR-B.8**  | All UX copy must follow the warm, brand-aligned voice specified in §15.6. Technical or generic error messages are not acceptable.                                                           | P2           | _Brand guide - brand voice_               |
| **FR-B.9**  | PDF price card exports must carry the full brand identity per §15.7 - logo, brand colours, and Garet typography.                                                                            | P2           | _Brand guide - customer-facing materials_ |
| **FR-B.10** | Dark mode is explicitly out of scope. The app must be implemented as light-mode only. The system prefers-color-scheme media query must be ignored.                                          | **P1**       | _§15.8 - brand decision_                  |

**END OF DOCUMENT**

Bakery Pricing & Cost Calculator PRD - Version 1.4 - March 2026