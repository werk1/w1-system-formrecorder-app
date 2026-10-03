# Strict Review: <title>

Date: <YYYY-MM-DD>
Reviewer: <name>
Area: <module or surface>

Prioritize: correctness, regressions, boundary violations, missing tests.

## Scope

## App-Package Boundary Check

- Does app code import package internals? Cite evidence.
- Does package code import app internals? Cite evidence.

## Server-Client Boundary Check

- Are server components passing non-serializable props to client components?
- Are client components accessing server-only resources?

## Generated Types And Import Maps

- Is `payload-types.ts` up to date with the current schema?
- Is the import map current?

## Package Imports And transpilePackages

- Are all consumed packages listed in `transpilePackages` in `next.config.mjs`?

## Findings

Each finding must cite concrete file paths and lines.

### Critical

### Major

### Minor

## Verification

## Conclusion

Accept / Accept with conditions / Reject.
