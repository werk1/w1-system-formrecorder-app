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
  - `pdfedit-pdf` — POST `{ pdfeditId, action: 'apply' | 'restore', pageIndex? }`.
    Writes the edited record texts into the PDF with `applyTextEdits`
    (`@werk1/w1-system-pdfedit/pdf`), starting from the backed-up original,
    and re-renders the changed pages (`pdftoppm`). `restore` first resets the
    texts of one page to the source. Admin-only. Responds with
    `{ applied, skipped, warnings, editedPageIndexes, resetRecordIds }`.
  - `pdfedit-images` — POST `{ pdfeditId, edit: { imageId, mediaId, rect? } }` upserts one image
    replacement, DELETE `{ pdfeditId, imageId }` restores the original. Admin-only. Validates
    against the image model of the published revision: unknown ids, full-page (scan) and
    rotated images are refused, the media must be JPEG/PNG, `rect` must lie (almost) on the page.
    It stores intent only; the PDF is not written yet (no writer in this stage).
  - `pdfedit-export` — GET `?id=&format=csv|json&delimiter=&bom=`,
    CSV via package `recordsToCsv`. Admin-only.
- Collection fields on `pdfedits` (collapsible "Aktualisiertes PDF"):
  `originalPdf` (backup), `editedPdf`, `editedPages[]` (`pageIndex`, `image`,
  `width`, `height`), `editedAt`, `editedRevision` (the flipbook revision the
  update is based on; a mismatch hides it). Generated media carry
  `generatedBy: 'pdfedit'` so they stay out of the media list and out of the
  flipbook cleanup.
- Image model: `imageModel` on `flipbooks` (server-only like `textModel`) holds the
  `W1PdfImageModel` (`extractImagePlacements` from `/pdf`), bound to the published revision. It is
  extracted lazily from the source PDF on first use (`src/lib/pdfedit/imageModel.ts`,
  `ensureImageModel`) and re-extracted when the revision changes; the flipbook conversion is not
  involved. Images inside Form XObjects are not listed.
- `imageEdits` on `pdfedits` (json): `[{ imageId, revision, pageIndex, mediaId, rect }]`, maintained
  by `pdfedit-images` (`src/lib/pdfedit/imageEdits.ts`); entries of another revision are ignored.
  `pdfedit-data` returns `imageModel` and `imageEdits` (with `mediaUrl`) in the input.
- Reader hook on `flipbooks` (module-neutral fields): `pageOverrides[]`
  (`pageIndex`, `image`, `width`, `height`), `pdfOverride`, `overrideRevision`,
  `overrideSource`. `pdfUpdate.ts` mirrors the updated pages and PDF onto the
  flipbook (and clears them again when the pdfedit has no edits left);
  `mapFlipbookToInput` (`src/lib/blocks/flipbook/`, from `flipbook-system`)
  substitutes them in the reader while `overrideRevision` equals
  `publishedRevision`. The media delete guard protects the override media.
- Server libs `src/lib/pdfedit/`: `pdfUpdate.ts` (apply/restore orchestration,
  `collectEdits`, `resetPageBlocks`), `googleFonts.ts` (font provider via the
  Google Fonts Developer API and a disk cache, key `APP_FONTS_GOOGLE_API_KEY`),
  `textStyles.ts` (adds block styles to documents converted before style
  extraction existed). The conversion pipeline additionally runs
  `pdftohtml -xml -zoom 1 -i` (`extractStyleLayout`) and `applyTextStyles`.
- Admin view `/admin/pdfedit`
  (`src/payload/components/PdfeditEditor.tsx`) — renders
  `W1PdfEditBlock` (modes `read`/`capture`) and persists every
  callback through `pdfedit-records`, loads the fonts of the text model from
  Google Fonts (`googleFontsCssUrl`) and runs the PDF update bar through
  `pdfedit-pdf`; `PdfeditEditorLink` on the
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
