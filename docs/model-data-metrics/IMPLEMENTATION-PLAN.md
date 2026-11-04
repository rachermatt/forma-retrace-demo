# Model Data & Metrics: proposed development plan

Status: **proposed backlog, not implemented functionality**. Read the [assessment](README.md), [native capability matrix](NATIVE-CAPABILITIES.md) and [APS options](APS-OPTIONS.md) first. Dependencies below are delivery gates; documentation that a capability exists is not proof of customer access or a completed integration.

## Scope decision before development

The supplied draft MVP requires room relationships and a nested grouping, while comment DD4 proposes deferring spatial classification. DD3/DD8 ask for minimal-interaction automation instead of a human-operated task wizard. Recommended resolution: make trusted metadata and automated exception processing the first release, and qualify spatial enrichment separately. The owner must confirm that revised MVP before treating this recommendation as committed scope.

The business result is reusable approved historical information. It is not the number of workflow screens visited or the number of model elements selected.

## Delivery backlog

| ID | Deliverable | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| MDM-01 | Native proof-of-fit and data profile agreement | Authorized representative files, native-product access, category and attribute priorities | Demonstrate the same category in native Takeoff, evaluate Datum standards/validation and Tandem metadata/spatial import where applicable, and compare supported extraction outputs. Record configure/reuse/build decisions with source/version references. Identify an approved initial category profile and unresolved gaps. |
| MDM-02 | Authorized source catalog and model review | MDM-01; user-context app provisioning; qualified formats/regions; Viewer design | Browse permitted folders/items/exact versions; fail on unauthorized sources without substituting fixtures. Store immutable source identifiers and For-Record/As-Built designation basis. If embedded Viewer remains required, open an authorized model and synchronize table selection/highlighting with version-scoped IDs. Preserve the server-side token rule with a model-authorized proxy or obtain an explicit architecture decision before changing that rule. |
| MDM-03 | Versioned category profiles and typed property normalization | MDM-02 metadata access; representative property definitions | Extract the agreed category's selected properties, preserving raw names/values/units and missing/null states. Apply versioned mappings and dimensional conversions; retain rejected/ambiguous conversions as exceptions. Run against the approved reference set and reconcile the extracted attributes, not only element counts. |
| MDM-04 | Classification bridge and assignment rules | MDM-01 native governance decision; MDM-03; authoritative classification sources | Reuse native structures where suitable; preserve structure/node/version identity and project schema state. Apply a versioned rule pack to properties and category/context. One element can retain multiple independent assignments. Retain rule evidence, conflicts and reasoned overrides; editing a rule must not rewrite published assignments. |
| MDM-05 | Metrics per classification assignment | MDM-03/04; approved measurement definitions | Define a separate property/count/formula/qualified-geometry method, unit, aggregation and basis for each assignment. A foundation's concrete-volume definition must not overwrite its formwork-area definition. Reject missing inputs, incompatible dimensions and unsupported surface claims. Keep descriptive equipment attributes independently queryable. |
| MDM-06 | Durable, unattended processing | MDM-02/03; approved worker identity; durable storage/queue; consumption budget | Execute an approved profile/rule pack without a browser session. Demonstrate checkpoints, pagination, idempotent retries, interruption recovery, visible failures and resource accounting. Repeating the same source/configuration must not duplicate logical results. Route missing data and conflicts to exceptions rather than requiring routine per-element human actions. |
| MDM-07 | Permission-aware historical index and search | MDM-03/04/06; organization identity; approved derived-data reuse policy | Query multiple approved source projects by category, attribute, classification, source state and version. Test both source restrictions and authorized dataset reuse grants. Demonstrate denied reads/exports and revocation behavior. A service identity's broad ingestion access must not automatically become every user's query access. |
| MDM-08 | QA, publication and typed exports | MDM-03/04/05 and publication policy for a single source; MDM-07 additionally gates cross-project publication/search | Show required-property coverage, classification conflicts, invalid units, metric failures and unresolved duplicates separately. Retain reasoned corrections and publication decisions. Export a versioned dataset as CSV/XLSX or an authorized API response with manifest and exact source/rule/profile/metric references. Later corrections produce a new publication and do not alter the earlier one. |
| MDM-09 | Federated spatial relationship engine | Spatial MVP decision; MDM-02; validated geometry; ARCH/MEP/structural test corpus | Normalize units, linked-instance transforms, phase and coordinates; retain them in each run. Test contained/intersecting/adjacent/multi-room/unassigned and cannot-determine cases, including rotated geometry, open or absent rooms, linked spaces and elements across model boundaries. Bounding-box overlap is only a candidate test. Record thresholds, precedence, confidence/limitations and overrides. |
| MDM-10 | Nested business spaces and allocation | MDM-09; hierarchy and multi-membership policy | Define application-owned groups without modifying source rooms/models. Reject cycles; retain source room/model/version identity. Demonstrate roll-up without duplicate counting when a room or element has multiple memberships. Separate membership from quantity allocation; require an explicit allocation method for a measure split across rooms. |
| MDM-11 | Revision impact and pilot qualification | MDM-03 onward; version-change sources; accuracy and acceptance criteria | On a new model, profile, classification or metric revision, identify changed/deleted/unresolved associations and affected results. Preserve every prior publication. Measure attribute completeness/correctness, classification agreement, metric error against approved reference data, processing success/retries and human exception effort. Keep suggested and approved results distinct. |

### Recommended first vertical slice

Use one approved model version and one agreed category, such as air-handling units. Include a selected set of specification attributes, source units, a normalized profile, classification assignments and supported property/count metrics. Produce a single-source validation export with exceptions and exact lineage after MDM-03/04/05. Its QA/export path does not depend on the later cross-project index; broader publication/search requires MDM-07 and the publication policy. Prove repeatability and access denial before expanding the source catalog. Viewer review can run in parallel with the ingestion slice; the background worker must not depend on Viewer being open.

After that slice, demonstrate a second authorized source project and a source-version change before claiming a reusable cross-project library. The room/space engine remains a separately qualified increment unless the owner keeps it in the first release's acceptance criteria.

## Proposed data-contract boundaries

This is a design outline for a new model-data contract, not a replacement for existing evidence-packet schemas. Keep model-derived attributes and measures separate from capture observations, installation assessments, inspection acceptance and payment approvals.

| Record | Minimum identity and provenance |
| --- | --- |
| Source snapshot | Tenant/hub/project, file item and exact version IDs, source format/region, derivative or element-group/viewable identity when applicable, extraction reference, designation and designation basis, recorded source-access policy. |
| Element version | Compound source/model/version/external-element identity and linked-instance identity where relevant. Viewer `dbId` is a view-specific lookup. Cross-version or cross-model physical-asset equivalence requires an explicit mapping, not an ID coincidence. |
| Property observation | Source property path/definition, typed raw value and unit, missing/unknown status, normalized value and unit, profile/mapping revision, transformation basis and any error. Preserve descriptive text without coercing it to a number. |
| Classification assignment | Element version, classification structure/node/version, rule-pack revision, match evidence, source-native versus application-derived origin, assignment status, prior revision and reasoned override when applicable. |
| Metric definition/result | Assignment reference, source inputs, method/formula revision, output unit, permitted aggregation, scope and allocation basis, calculated value or unknown/error state, QA/publication status and run reference. |
| Processing run | Exact source/configuration revisions, actor or service principal, entitlement context, input/output hashes or equivalent integrity references, start/end/status, checkpoints/retries, exceptions and resource consumption. |
| Spatial membership | Element and room/space source versions, linked-instance transforms and units, relationship type, method/threshold revision, validation state and any human override. Business groups and quantity allocations are separate records. |
| Dataset publication | Manifest/schema version, included runs and exact result revisions, authorized reuse scope, publication authority/policy, unresolved exceptions, source cutoffs and immutable output identity. |

### Required invariants

- Preserve both source and normalized values; missing, unknown, invalid and zero are different states.
- A model state marked As-Built needs a recorded source designation. It is not proof of physical inspection, measured installation or contractual acceptance.
- Do not use a bare external element ID or Viewer `dbId` as a global cross-project identity. Do not silently migrate historical results to a new source version.
- Multiple classifications and multiple views of the same physical item must not create accidental quantity duplication. Detect unresolved federated duplicates before automatic aggregation.
- Compare or aggregate only compatible scope, unit dimensions, installation/design stage, metric definition, source/version basis and allocation policy. A shared numeric unit alone does not make two measures analytically comparable.
- Distinguish properties derived from authoring data, geometry-derived estimates, AI proposals, human corrections and published approved results.
- Formula evaluation must use an approved, versioned expression language with an allowlist of operations. Do not execute arbitrary imported code.
- Preserve spreadsheet string types and protect CSV/XLSX exports from formula interpretation while retaining the original source value in the dataset contract.
- A stale source grant, failed processing run or unqualified geometry method must not silently publish a complete or accurate result.

## Native-integration gates

1. Test both legacy and new Forma Classifications projects. Resolve classification structures through identity, not numbered-slot position; preserve missing values and schema state. [Current migration notice](https://help.autodesk.com/cloudhelp/ENU/Docs-Insight/files/data-connector/Data_Connector_Change_Notice.html).
2. Obtain Datum/Class Library access before defining an adapter against undocumented endpoints. Validate multi-classification, versioning, governance and estimating-specific metric behavior in the actual environment. [Datum API overview](https://aps.autodesk.com/developer/overview/autodesk-datum-api).
3. Qualify AEC Data Model versus Model Properties/Model Derivative for each format and property profile. Record extraction eligibility, region, exact-version mapping, pagination and consumption limits. [API options](APS-OPTIONS.md).
4. Treat geometry and event-subscription beta features as explicit evaluated dependencies. Include failure monitoring and a documented fallback; a success-only notification is not a durable job system. [API options](APS-OPTIONS.md).
5. Obtain an agreed category attribute list, authoritative classification structures, representative source files and a reference QA dataset before committing to accuracy or an unattended publication threshold.

## Validation scenarios for implementation

The future implementation should add focused tests for denied/revoked access; compound identities; source-version changes; job retries and interruption; raw/normalized values; dimensional conversions; unknowns; multiple assignments; per-assignment metrics; overlapping memberships and duplicate physical items; reasoned overrides; immutable publication; spreadsheet-safe typed output; and unauthorized external writes. Geometry cases additionally need a representative federated reference set with documented expected relationships and measurement tolerances.

These are acceptance criteria for future development. This assessment update does not introduce an extraction adapter, processing worker, geometry engine, organization database or automatic quantity estimator into either current application.
