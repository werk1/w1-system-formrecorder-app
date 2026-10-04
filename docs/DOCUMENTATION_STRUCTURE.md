# Documentation Structure

This document defines where `w1-system-pdfedit-app` documentation belongs.

## App-Local First

Documentation is app-local by default. Put plans, bugs, tickets, roadmaps and reports in this repository's `docs/` tree.

## Folder Rules

```text
docs/
  contracts/       local app and module contracts
    done/          completed or superseded contracts (keep originals)
  ideas/           loose concepts not yet committed plans
    done/
  planning/        concrete pre-roadmap planning and option notes
    done/
  bugs/            confirmed app defects
    done/
  tickets/         non-defect work items
    done/
  roadmaps/        phased work roadmaps
    active/
    future/
    done/
  reports/         implementation, review and audit evidence
    implementation/
    technical-review/
    review/
  templates/       reusable documentation templates
  archive/         superseded documents kept for reference
  audit/           audit records and compliance notes
```

## Document Placement

| Document type | Location |
|---|---|
| Confirmed defect | `docs/bugs/BUG_<YYYY-MM-DD>_<SHORT_TITLE>.md` |
| Non-defect work | `docs/tickets/TICKET_<YYYY-MM-DD>_<SHORT_TITLE>.md` |
| Loose concept | `docs/ideas/IDEA_<THEME>.md` |
| Implementation plan | `docs/planning/PLAN_<THEME>.md` |
| Active roadmap | `docs/roadmaps/active/<THEME>/ROADMAP_<THEME>.md` |
| Implementation report | `docs/reports/implementation/REPORT_<THEME>_IMPLEMENTATION_<YYYY-MM-DD>.md` |
| Technical review | `docs/reports/technical-review/REPORT_<THEME>_TECHNICAL_REVIEW_<YYYY-MM-DD>.md` |
| Review output | `docs/reports/review/REPORT_<THEME>_<REVIEW_KIND>_<YYYY-MM-DD>.md` |
| Review template | `docs/templates/` |
| Local contract | `docs/contracts/` |
| Superseded doc | `docs/archive/` |
| Audit record | `docs/audit/` |

## Forbidden Paths

Do not create a top-level `docs/reviews/` folder. Review reports belong under `docs/reports/review/`. Review templates belong under `docs/templates/`.

## Lifecycle Folder Rule

Lifecycle folders must be real, tracked paths with index files. Completed ideas, plans, bugs and tickets keep their original file names when they move to `done/`.

## Current Truth Rule

Contracts, overview documents and documentation-structure documents are current-state documents. They must not accumulate historical change logs or superseded designs. Put history and evidence in `docs/reports/`.

## Language Rule

Contracts, reports, roadmaps and current maps are English-first. Ideas, plans, bugs and tickets may be German-first. Keep code identifiers, package names, route names, file names and commands unchanged.
