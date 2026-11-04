# Model Data & Metrics: native coverage and development scope

Assessment date: November 4, 2026. **A working local model-data increment is now implemented.** Read the [delivery status and walkthrough](IMPLEMENTED.md) for the current application. The native-product assessment below remains the rationale and production scope; it is not a claim of live customer access or complete enterprise delivery.

## Desired outcome

Create a permission-governed library of approved For-Record and As-Built model information that estimators and engineers can reuse on future projects. Retain useful equipment and element attributes alongside quantities, source model versions, calculation bases and quality exceptions. ACC/Forma remains the system of record for projects, files, models, versions and source access.

The supplied `Model_Data_Metrics_Web_App_Requirements.docx` and corresponding PDF were reviewed, including the Word comments and the PDF's margin comments. This document summarizes the technical requirements; the original attachments, customer-specific names and reviewer identities are not distributed with the sample.

The comments materially refine the body of the draft:

- Reusable historical metadata is the business outcome. An air-handling unit's specification and properties matter alongside its count.
- Approved processing should run with minimal human interaction. Humans configure standards and resolve exceptions; the application should not require an operator to complete every node for every element.
- Comment DD4 proposes that room/space classification be a later capability, while the body of the MVP currently requires room relationships and a nested room grouping. That scope conflict remains an explicit decision; the metadata-first sequence below is a recommendation, not a silently approved requirement change.
- Architectural rooms, MEP spaces and elements from other models require a federated source strategy. A room or space cannot be assumed to exist in every model.

## What to reuse before building

The evidence supports a substantial native-product contribution. It does not establish that one existing product fulfills the entire proposed historical dataset and unattended processing workflow.

| Requirement | Native reuse / configuration candidate | Remaining proof or application work |
| --- | --- | --- |
| Authorized source files, model versions and model review | Forma Data Management and native model viewers; APS Data Management and Viewer when an embedded experience is required | Extend the current project-only adapter into authorized model/version access. Prove source format, properties and permissions on representative files. [API options](APS-OPTIONS.md). |
| Takeoff quantities, formulas, inventory, classifications and exports | Forma Takeoff, the shared Classifications Library and Data Connector | Demonstrate the requested outputs in the actual project and category. Native multiple classifications and outputs should be evaluated before building equivalents. [Native capability matrix](NATIVE-CAPABILITIES.md). |
| Governed information requirements and standards | Autodesk Datum and Datum Class Library | Perform a buy/configure proof-of-fit for standards, classification governance and validation. Its public API overview confirms automation interfaces, but detailed endpoints and customer access still need qualification. [Datum](https://www.autodesk.com/products/datum/overview), [API overview](https://aps.autodesk.com/developer/overview/autodesk-datum-api). |
| Asset information, handover and room-linked model information | Forma Build Assets and Autodesk Tandem | Test native asset parameters, classifications and room assignment. This does not by itself prove the requested federated relationship types, estimating measures or organization-wide reuse policy. [Native capability matrix](NATIVE-CAPABILITIES.md). |
| Reusable, normalized metadata across completed projects | Evaluate native extraction and governance as inputs and services | Build or configure the missing integration: category profiles, raw-to-normalized mappings, source lineage, automated runs, historical indexing, dataset permissions and QA. Do not infer arbitrary element-property coverage from an operational report extract. [Native matrix](NATIVE-CAPABILITIES.md), [API options](APS-OPTIONS.md). |

The recommended development boundary is the governed connection between these services and the estimating use case. Each proof-of-fit may remove a custom component from the backlog.

## Starting implementation audited before this increment

The application was inspected in `autodesk-platform-services/forma-retrace` at `0e17ad7` and `rachermatt/forma-retrace-demo` at `c09570b`. Their application/server implementations match for this audit. They remain an evidence-review prototype with a public synthetic, read-only deployment.

| Existing implementation | Reuse | Missing for this use case |
| --- | --- | --- |
| Confidential OAuth, configured-hub access and paginated project listing | Server-side credentials, failure handling and authorization patterns | Folder/item/version browsing, model ingestion, property extraction and extraction eligibility checks. [Adapter](../../server/aps.ts), [routes](../../server/index.ts). |
| Manual model references and fixture media; actual Viewer explicitly unavailable | Existing visual style and context navigation | Model loading, property/element selection synchronization, viewable/external-ID mapping and geometry qualification. [Review configuration](../../server/review.ts), [review interface](../../src/ReviewWorkbench.tsx). |
| Append-only scope/finding revisions, reasoned corrections and exception queues | QA workflow and historical-reference patterns | Model-data quality exceptions and a separate derived-data publication lifecycle. [Scope operations](../../server/scope-operations.ts). |
| Versioned manually entered measurement templates and comparable-quantity safeguards | Unit, basis, unknown-value and revision protections | Metrics per element-classification assignment, property mappings, approved formulas and qualified geometry methods. Existing numbers are not automatically extracted model quantities. [Commercial operations](../../server/commercial-operations.ts). |
| A bounded image-experiment research workbench | Proposal/decision separation | A model classification taxonomy, property rules and processing workers. Image labels such as duct/terminal are not an estimating classification engine. [Research operations](../../server/research-operations.ts). |
| Fixed HTML/JSON packets and isolated local workspaces | Provenance and immutable-snapshot patterns | Typed dataset exports, multiple-project indexing, organization identities/grants and durable background processing. Existing evidence packets retain their current contract. [Packet implementation](../../server/commercial-operations.ts), [server boundaries](../../server/index.ts). |

That audit identified the starting gaps. The subsequent [implemented increment](IMPLEMENTED.md) adds a source adapter and local metadata/rules/review/export workflow in both repositories. The complete enterprise MVP, validated geometry and organization-wide warehouse still have the dependencies listed in the implementation plan.

## Proposed implementation sequence

1. **Native proof-of-fit and source qualification.** Use approved architectural and engineering model versions to test Takeoff outputs/classifications, Datum governance, Tandem metadata/room assignment and available extraction APIs. Record what can be configured, what needs an adapter, and what remains unsupported or unverified.
2. **Metadata-first vertical slice.** Select one approved model version and a category such as air-handling units. Preserve raw properties and source units; apply a versioned data profile; produce normalized attributes, quality exceptions and a traceable typed export. Build embedded Viewer review alongside this if it remains a required acceptance condition. Background extraction must not depend on an open browser.
3. **Governed automation and cross-project reuse.** Add repeatable jobs, classification/metric rules, approved publication, durable indexing and a tested derived-data reuse policy across projects. Prefer native standards management where the proof-of-fit succeeds.
4. **Qualified spatial enrichment.** Add federated room/space relationships and nested business groupings after the spatial scope decision and evaluation dataset are agreed. Preserve every source version and transform. A bounding box is a candidate relationship aid, not proof of room containment or a formwork measurement.

[Implementation tickets, acceptance criteria and data-contract outline](IMPLEMENTATION-PLAN.md) make this sequence actionable. It extends the existing architecture as a separate model-data workstream; it does not relabel saved field observations as model facts.

## Rules that need an explicit owner

- **Source designation:** define who may mark a model/version For-Record or As-Built and what evidence supports that designation. A filename, upload date or drawn element does not establish the physical installed condition.
- **Data profiles:** specify priority categories, required attributes, accepted source properties, normalization rules and units. Begin with an explicit selection rather than promising every property from every source format.
- **Classification governance:** choose authoritative structures, native administration where suitable, rule precedence, multi-assignment and conflict handling. Record structure/version identity rather than assuming a numbered classification field identifies a fixed system.
- **Quantity semantics:** approve each classification's property, formula or geometry basis and permitted aggregation. Concrete volume, formwork area, equipment attributes and visual installation observations remain different records.
- **Automation and publication:** define deterministic rules permitted to run unattended, quality gates, exception owners and publication authority. AI suggestions need their own evaluation and decision history; an agent cannot invent missing model properties or approve its own unsupported measure.
- **Dataset authorization:** define how source project permissions and owner-approved reuse grants govern ingestion, search, viewing, export and revocation. Being allowed to read a source model is not an automatic grant to redistribute its derived data to all organization members.
- **Accuracy:** agree category-specific tolerances, reference data and coverage criteria before describing a dataset as estimate-ready or high accuracy. Missing values stay unknown; source inconsistencies remain visible.

## Current platform considerations

The assessment should not freeze older assumptions about Autodesk capabilities:

- The new Forma Classifications model supports up to five classifications per item, while legacy projects retain a different schema during conversion. Resolve the system through the classification node's structure and inspect each project's migration flag. [Change notice](https://help.autodesk.com/cloudhelp/ENU/Docs-Insight/files/data-connector/Data_Connector_Change_Notice.html).
- AEC Data Model geometry and GraphQL subscriptions have documented Public Beta paths. Treat beta geometry and success-only extraction notifications as qualified options, with explicit fallbacks and processing-failure visibility. [API options](APS-OPTIONS.md).
- Secure Service Accounts provide a documented unattended-access option; customer provisioning, least-privilege access and secure runtime storage still need validation. [Authentication guidance](https://aps.autodesk.com/blog/3-legged-oauth-vs-secure-service-accounts).
- AEC Data Model extraction has entitlement and Data Out consumption considerations. Verify the customer's applicable subscription/team setup before planning the processing volume. [APS guidance](https://aps.autodesk.com/blog/data-model-apis-included-subscriptions-plus-flexible-ways-scale).

## Evidence and status

External product claims link to official documentation in this assessment, the [native matrix](NATIVE-CAPABILITIES.md) and [API options](APS-OPTIONS.md), checked on November 4, 2026. Customer entitlements, model access, representative source files, category-specific accuracy and organization reuse policy are not established by those documents.

The original assessment-only update has been followed by application implementation. Current delivered behavior, tests and remaining dependencies are recorded in [IMPLEMENTED.md](IMPLEMENTED.md). The public demo remains read-only; historical evidence records and exports retain their separate contracts. The APS README structure, MIT license and ignore protections are preserved.
