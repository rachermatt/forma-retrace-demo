# Model Data & Metrics — implemented increment

Delivery date: November 4, 2026. Application version: **0.4.0**. This page describes working application behavior, not completion of the full production requirements.

## What changed in the application

**Model Data & Metrics** is a new sidebar destination alongside the existing evidence workflow. It has five working sections:

| Section | Working behavior |
| --- | --- |
| Sources & imports | Versioned source catalog; project/model/version and For-Record/As-Built designation filters; search across the latest processed datasets; validated property-extract JSON import in a separate private local workspace. Live mode adds authorized Autodesk project → folder → item → exact version → processed 3D viewable browsing and server-held property-extraction receipts. |
| Element data & review | Search/filter typed equipment and element properties; compare raw and normalized values/units; inspect independent classifications/quantities and room candidates; save reasoned property, measure, spatial and exception dispositions with reviewer/time/revision history. |
| Profiles & rules | Editable category profiles, accepted source-property names, required attributes, dimensional normalization, classification system/version/code rules, separate count/property/formula metrics and spatial tolerances. Saving appends an immutable profile revision. |
| Rooms & spaces | Federated source room/space references, a labeled top-down bounding-box candidate preview, nested application-owned business groups, deduplicated roll-ups and explicit spatial/allocation uncertainty. Source models are unchanged. |
| Runs & fixed exports | Repeatable server-side rule execution, exact source/profile/group bindings, run history, exceptions, immutable reviewed CSV/JSON/HTML publications and snapshot hashes. Existing evidence packets remain separate and unchanged. |

The fixture contains three synthetic source models, six elements, three rooms and nested groups. AHU-01 demonstrates descriptive equipment attributes and conversions (1500 L/s → 1.5 m³/s, 7.5 kW → 7500 W). AHU-02 retains unknown airflow and real zero pressure. Ducts show a source-length measure and a separate illustrative formula. A foundation retains independent concrete-volume and explicit formwork-area properties; another shows missing/invalid units. These are authored examples, not measured installation or validated model geometry.

## Reproduce the workflow

Build and run using the repository README. The model-data fixture initializes independently of the evidence seed, so it is available with either `npm start` or the isolated `npm run demo`.

1. Open **Model Data & Metrics**. Keep **Synthetic demonstration** selected. Inspect the populated **Element data & review** table and select AHU-01. Check source version, raw units, normalized attributes, classification-specific measures and uncertainty.
2. Open **Profiles & rules**, change the profile name or a mapping, and select **Save profile revision**. Select **Run saved profile**. The new run binds that exact revision; the baseline run remains available.
3. In **Element data & review**, select an element, a correction target and reviewed value. Enter a reason and reviewer, then **Save review revision**. Original source/computed values remain separate; correcting a property makes dependent metrics require explicit reassessment rather than silently treating them as approved.
4. Open **Rooms & spaces**. Create a group from source rooms or previously saved child groups. Rerun the profile to bind the new group revision. Candidate-only relationships and unresolved allocation keep totals unknown, with diagnostic subtotals labeled separately.
5. Open **Runs & fixed exports**. Enter title, reviewer and purpose. Explicitly disclose unresolved exceptions when present, then **Create fixed CSV / JSON / HTML snapshot**. Open the report and manifest. Correct a result afterward: the earlier publication retains its original bytes and hash.
6. Choose **Private imported property extracts → Sources & imports**. Import [the labeled test JSON](examples/import-test-dataset.json), or an authorized extract meeting [the contract](DATA-CONTRACT.md). The local workspace starts empty; it does not inherit synthetic records. The included test file validates the mechanism, not customer model accuracy.
7. In the private workspace create an equipment profile. Add a category classification rule and a count metric, save, then run. The test AHU retains manufacturer and 1200 L/s airflow. Reload and reselect the private workspace: the dataset/profile/run remain saved. Local data is stored in `data/model-data-local.sqlite` (or the chosen demo data directory); fixture data uses a different database.
8. For authorized live data, run in live mode, sign in through **APS connection**, then use the source browser in the private model-data workspace. It performs read-only source access and imports via a server-held receipt. It does not create Autodesk records, upload files or expose APS tokens to the browser.

The hosted demo exposes the fixed synthetic example only. Editing, private extracts, Autodesk sign-in and source requests remain disabled there. Use the local application for the editable sequence.

## Run saved local profiles without a browser

The local CLI processes an existing imported dataset with a saved profile. Copy the IDs from the source/run/profile details or the local bootstrap API. It does not import raw models, read `.env`, authenticate to APS, create profile revisions or start an independent job worker.

```sh
npm run model-data:process -- --data-dir data \
  --dataset-id <saved-local-dataset-id> --profile-id <saved-profile-id> \
  --profile-revision-id <exact-profile-revision-id>
```

Optionally publish with `--publish-title`, `--reviewer` and `--reason`. Add `--include-unresolved` only when deliberately disclosing unresolved exceptions. Repeating identical inputs reuses the run and identical publication. JSON output records the exact revisions, status and publication links. Invalid input, failed processing and missing exception disclosure return a nonzero exit code. The local server can display the persisted result after refresh. This is browser-independent local execution; durable extraction queues, scheduling and production worker identity remain future work.

## Requirement coverage and remaining gates

| Ticket | Delivered slice | Remaining acceptance dependency |
| --- | --- | --- |
| MDM-01 native proof-of-fit | Source-backed native capability assessment retained | Customer native Takeoff/Datum/Tandem access, representative category and agreed data profile |
| MDM-02 authorized sources/review | Read-only authorized source chain, metadata extraction/import and source-supplied native Autodesk link | Verify actual customer permissions, formats/region and 3D derivative; embedded Viewer/highlighting requires a qualified model-authorized server proxy for derivative/CDN/WebSocket access |
| MDM-03 typed normalization | Editable versioned mappings; raw typed source values/units; compatible conversions; null/zero/invalid distinctions | Approved category reference set and property completeness/accuracy qualification |
| MDM-04 classifications | Independent system/version/code assignments from saved rules; exact profile provenance | Native Classifications/Datum governance bridge, authoritative structures and governance owner; no licensed taxonomy is bundled |
| MDM-05 metrics | Independent count/property/safe-formula metrics per assignment with explicit units/basis/aggregation | Approved measurement definitions and qualified geometry-derived surface methods; a box is not formwork area |
| MDM-06 automation | Deterministic local server processing, a noninteractive saved-record CLI, idempotent runs and visible exceptions without per-element routine input | Durable queue/worker identity, checkpoints/recovery, scheduled extraction and actual service consumption accounting |
| MDM-07 historical library | Local search across saved datasets/projects with exact version lineage; latest-run policy and private/public isolation | Enterprise identities, project/dataset reuse grants, revocation and durable multi-user storage; source read access is not a redistribution grant |
| MDM-08 QA/export | Reasoned append-only corrections and immutable versioned CSV/JSON/HTML snapshots with unresolved-exception disclosure | Organizational publication authority and acceptance policy; local reviewer identities remain self-asserted. CSV supplies the spreadsheet path; no XLSX writer is included |
| MDM-09 spatial engine | Unit/transform-aware bounding-box candidate relationships with explicit uncertainty and manual review | Federated geometry corpus, solid geometry/phase/instance qualification and accuracy tests; no verified containment or automatic capture registration |
| MDM-10 nested spaces | Revisioned groups, cycle rejection, deduplicated membership and uncertainty-aware roll-ups | Agreed allocation policy for split measures and production hierarchy governance |
| MDM-11 revision/pilot | Exact source/profile/group history and preserved publications | Model-change impact/mapping review, real reference data, completeness/classification/measurement accuracy and processing-effort pilot |

The complete enterprise use case is not declared finished. The local slice supports implementation and validation now while the [production backlog](IMPLEMENTATION-PLAN.md) retains those dependencies and acceptance criteria.

## Validation evidence

Automated checks cover source authorization and trusted receipts, public/private/live isolation, raw values/units, exact source identities, classification metrics, safe dimensional formulas, duplicate prevention, spatial candidates/groups, reasoned revision chains, SQLite reload and fixed exports. HTTP tests also compare all four existing evidence packet reports before and after the new workflow.

Browser verification exercised profile revision/save/run, property correction, fixed publication, private JSON import, a new category rule/count measure, processing, reload persistence and nested-group creation. Both the running interface and generated HTML report were visually inspected. The test input was hand-authored and explicitly labeled; no customer model was used. [The focused tests](../../tests/model-data.test.ts), [HTTP checks](../../tests/model-data-http.test.ts) and [source-adapter checks](../../tests/aps-models.test.ts) and [CLI checks](../../tests/model-data-cli.test.ts) are reproducible acceptance evidence.
