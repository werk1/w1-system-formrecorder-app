# Pdfedit App Integration Snippet

Snippet-Version: 2026-10-03
Status: current

This file is the package-owned integration snippet that `w1-system-app-creator`
embeds as `docs/contracts/pdfedit-app-integration-contract.md` into
generated apps with module `pdfedit` active.

## Owning Package

- `@werk1/w1-system-pdfedit` — prepared-data overlay viewer/editor
  (`W1PdfEditBlock`, `W1PdfEditInput`, `W1PdfEditRecord`,
  `W1PdfEditRecordBlock`, `W1FormTextModel`), pure model helpers, RFC-4180 CSV export
  (`recordsToCsv`) and the `pdftotext -bbox-layout` parser at the `/extract`
  subpath (server-side only; keeps `fast-xml-parser` out of client bundles).

## App-Owned Surface

- Payload collections `pdfedits` / `pdfeditrecords`
  (`src/payload/collections/`): document binding `flipbook`; records carry
  `order`, `name`, `pageIndex` and the ordered `blocks` JSON
  (`{ blockId, name?, text, edited? }`).
  Admin-only access.
- `textModel` on `flipbooks` documents: the copied conversion pipeline
  (`src/lib/flipbook/payloadFlipbookConversion.ts` →
  `extractTextLayout` in `pdfConverter.ts`) runs `pdftotext -bbox-layout` and
  stores the parsed `W1FormTextModel` next to the published pages of each
  revision. Extraction failures warn but do not fail the conversion.
- Endpoints (`src/app/(payload)/api/`):
  - `pdfedit-data` — GET `?id=` → the prepared `W1PdfEditInput`
    (page images via `/api/media/file/<name>`, text model, ordered records). Admin-only.
  - `pdfedit-records` — POST upsert / PATCH reorder / DELETE. Admin-only.
  - `pdfedit-export` — GET `?id=&format=csv|json&delimiter=&bom=`,
    CSV via package `recordsToCsv`. Admin-only.
- Admin view `/admin/pdfedit`
  (`src/payload/components/PdfeditEditor.tsx`) — renders
  `W1PdfEditBlock` (modes `read`/`capture`) and persists every
  callback through `pdfedit-records`; `PdfeditEditorLink` on the
  document links editor + exports.

## Generated App Wiring

- Module `pdfedit` auto-adds `flipbook` (`autoDeps`): the flipbook
  backend is the data plane (page images + text model per published
  revision). `@werk1/w1-system-pdfedit` is listed in the flipbook
  module's `packages` because the copied pipeline imports `/extract`
  statically.
- The files above are copied byte-identical from `w1-system-core-v2`;
  `payload.config.ts`, `payload/collections/index.ts` and the admin view are
  gated on `hasPdfedit` in the generator templates.
- No page section is defined: the editor lives in Payload admin only.

## Boundaries

- The package never fetches, writes, or knows Payload — the admin editor is
  the persistence adapter (`onRecordSave`/`onRecordCreate`/`onRecordDelete`/`onRecordReorder`
  → `pdfedit-records` endpoints).
- `pageIndex` is 0-based; `blocks[].blockId` must reference ids of the
  document's `textModel` — keep custom endpoints consistent with
  `W1PdfEditRecordBlock`.
