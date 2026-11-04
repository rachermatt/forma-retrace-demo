# Model-data import and publication contract

Implemented version: `forma-retrace.model-data/1`. The TypeScript definitions in [shared/model-data.ts](../../shared/model-data.ts) and strict validation in [server/model-data.ts](../../server/model-data.ts) define the supported contract. This is separate from existing evidence-packet formats.

## Import a property extract

Open **Model Data & Metrics → Private imported property extracts → Sources & imports**. Select a JSON file (UI maximum 4 MiB) or paste JSON. The API accepts up to 16 MiB and rejects oversized or malformed input without saving a partial dataset. Raw RVT/IFC files are not this JSON contract.

The [small import test file](examples/import-test-dataset.json) contains hand-authored test values, not customer model data. Its `imported` label describes the import mechanism; the title and source description explicitly identify test content. Do not relabel the bundled `synthetic` dataset as real customer evidence.

Required records:

- Dataset: title, data mode, source description, source models and elements. Optional rooms/spaces carry source geometry.
- Model: project ID/name, model ID/name, exact version, format, unique model key, source designation and its basis, length unit. `unknown` is allowed for metadata-only extracts. Geometry requires a supported known length unit. Optional 16-number column-major affine transform maps authored coordinates to common coordinates in the source length unit; transform validation is recorded separately.
- Element: model key, external ID scoped to that source version, name, category and typed properties. Each property has `value` (string, finite number, Boolean or null) and optional source `unit`. Optional bounds are not mesh geometry. Optional physical asset identity is explicit duplicate-detection input, not inferred cross-version matching.
- Room/space: model key, source room ID, name, kind and bounds. Rooms can be supplied from another included federated source.

Only the server-held APS receipt path may create `data_mode: aps`. JSON imports must use `imported`; a client cannot assert verified APS provenance. Source For-Record/As-Built designations are self-asserted for imported files and always retain a basis. Neither designation proves physical completion or acceptance.

Import validation rejects duplicate source/element identities, invalid references, unsafe keys, unsupported units for geometry, nonfinite values, malformed/singular transforms and unsupported fields. Identical logical extracts are idempotent even when the arrival title/description/extraction timestamp differs; the first immutable source record is preserved. Changed source versions or properties create a separate dataset.

## Rules and quantities

Save a category profile, field mappings, classification rules and metrics together as an immutable profile revision. Fields preserve raw value/unit separately from normalized value/unit and status. Null, invalid and zero remain distinct. Common source units are converted only when dimensions are compatible; a number embedded in unparsed source text is not a qualified measure.

Each classification uses a system ID, system version and code. An element can receive several independent assignments. A metric belongs to the exact classification, carries its own unit/basis and uses count, property or the allowlisted arithmetic expression grammar. No imported JavaScript is executed. Formulas cannot establish contact surfaces or validated formwork geometry.

Runs bind the exact dataset, profile and group revisions. A federated dataset may contain different source models or transformed instances, but mixed revisions of the same source model are rejected. Roll-ups remain separate by source project and For-Record/As-Built/unverified designation. Repeating that input reuses the logical run. Property corrections append history and invalidate dependent results for explicit metric reassessment. Original source values and original computed results remain available. Nested memberships are deduplicated; uncertain spatial membership/allocation and unresolved physical duplicates cannot silently become approved totals. Unknown totals retain diagnostic known subtotals, clearly labeled.

## API and fixed exports

Local API operations require the existing local session, same-origin policy and CSRF token for mutations. Workspaces are separate under `/api/model-data/{fixture|local}`:

| Route | Method | Purpose |
| --- | --- | --- |
| `bootstrap` | GET | Catalog, current profile/group revisions, run history and publication links |
| `datasets` / `datasets/:id` | POST / GET | Import a validated extract / read its original snapshot |
| `profiles` / `groups` | POST | Save a validated revision; existing revisions require their previous revision ID |
| `runs` / `runs/:id` | POST / GET | Execute a saved profile / inspect source, results, exceptions and overrides |
| `overrides` | POST | Append a reasoned property/metric/spatial/exception review revision |
| `search` | GET | Filter latest processed results by text, project, category, classification or designation |
| `exports` | POST | Create a fixed reviewed snapshot, explicitly disclosing unresolved exceptions |
| `exports/:id/{manifest|csv|report}` | GET | Versioned JSON, spreadsheet-safe CSV and sandboxed HTML |

The manifest schema is `forma-retrace.model-data-publication/1`. It includes the exact run, raw source properties, normalized results, profile/rule/metric/group revisions, reviewer corrections, exceptions, timestamps and snapshot SHA-256. CSV/HTML are generated from and stored with that same fixed snapshot. Later edits never regenerate an earlier publication. CSV is the spreadsheet deliverable for this slice; an XLSX writer is not included.

Public Vercel allows only fixed synthetic reads. It rejects every mutation, private dataset access, APS sign-in and live source browsing. The local API is not an enterprise multi-tenant authorization layer.
