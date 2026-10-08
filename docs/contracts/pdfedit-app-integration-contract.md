# Pdfedit App Integration Snippet

Snippet-Version: 2026-10-08
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
  (`{ blockId, name?, text, edited?, rect?, spans? }`; `rect` is the block's own
  frame, normalized to the page).
  Admin-only access.
- `textModel` on `flipbooks` documents: the copied conversion pipeline
  (`src/lib/flipbook/payloadFlipbookConversion.ts` →
  `extractTextLayout` in `pdfConverter.ts`) runs `pdftotext -bbox-layout` and
  stores the parsed `W1FormTextModel` next to the published pages of each
  revision. Extraction failures warn but do not fail the conversion.
- Endpoints (`src/app/(payload)/api/`):
  - `pdfedit-data` — GET `?id=` → the prepared `W1PdfEditInput`
    (page images via `/api/media/file/<name>`, text model, ordered records,
    `manifestUrl` of the PDF the reading view shows). Admin-only.
  - `pdfedit-records` — POST `{ pdfeditId, record }` upsert / PATCH `{ pdfeditId, ids }` reorder
    (writes only changed `order` values) / DELETE `{ pdfeditId, recordId }`. Every call names its
    pdfedit; records of another pdfedit are not found (404) and an update never moves a record.
    Admin-only.
  - `pdfedit-textmodel` — POST `{ pdfeditId, op: 'merge', blockIds }` or
    `{ pdfeditId, op: 'split', blockId }` merges or splits text blocks of the
    published text model (`mergeTextBlocks` / `splitTextBlock` from `/export`;
    `src/lib/pdfedit/textModelEdit.ts`) → `{ changed }`. Admin-only.
  - `pdfedit-pdf` — POST `{ pdfeditId, action: 'apply' | 'restore' | 'restore-all', pageIndex? }`.
    Writes the edited record texts into the PDF with `applyTextEdits`
    (`@werk1/w1-system-pdfedit/pdf`), starting from the backed-up original,
    and re-renders the changed pages (`pdftoppm`).
    `restore` writes the PDF without the texts and image edits of one page; `restore-all` without any
    (the PDF is the original again). The records and image edits are reset only after that PDF was
    stored, so a failed update leaves them untouched. Admin-only. Responds with
    `{ applied, skipped, warnings, editedPageIndexes, resetRecordIds, appliedImages, skippedImages }`.
    Image replacements (`pdfedits.imageEdits`) are written first with `applyImageEdits`
    (`@werk1/w1-system-pdfedit/pdf`; media are read from the media storage, WebP is converted to PNG
    with `sharp` in `src/lib/pdfedit/imageFiles.ts`), the texts on top of that result. A `restore` of a
    page also drops its image edits. The response additionally carries `appliedImages` and
    `skippedImages`. A text is written when its block is flagged `edited` and still differs from
    the source in text, styled runs or frame (`collectEdits`). The image edits the update wrote are marked `applied`; an image edit
    saved later is pending. Like edited texts, replacements reach the PDF with "PDF aktualisieren" —
    the editor draws pending ones over the page preview. Removing or resetting an image starts the
    update at once (only a new page preview shows what lies beneath; pending texts are written too).
    The editor runs all updates through one queue (no `BUSY`).
  - `pdfedit-images` — POST `{ pdfeditId, edit: { imageId, mediaId, rect?, zoom?, panX?, panY? } }` upserts one image
    replacement (`rect` is the container, `zoom`/`panX`/`panY` position the image inside it) (`edit: { imageId, remove: true }` deletes the image from the PDF instead, no media), DELETE `{ pdfeditId, imageId }` restores the original. Admin-only. Validates
    against the image model of the published revision: unknown ids, full-page (scan) and
    rotated images are refused, the media must be JPEG/PNG/WebP (WebP is converted to PNG when the PDF is updated), `rect` must lie (almost) on the page.
    It stores intent only; the PDF is written by `pdfedit-pdf`. Changes of `imageEdits` (here and in
    `pdfedit-pdf`) are read-modify-writes serialized per pdfedit, so two saves never drop each other.
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
- `imageEdits` on `pdfedits` (json): `[{ imageId, revision, pageIndex, mediaId, rect, remove?, zoom?, panX?, panY?, applied? }]`,
  maintained by `pdfedit-images` and marked `applied` by `pdfedit-pdf`; validation and bookkeeping are
  the package's `./host` (`buildImageEdit`, `currentImageEdits`, `markAppliedImageEdits`, …); entries
  of another revision or with an invalid box/fit are ignored.
  `pdfedit-data` returns `imageModel` and `imageEdits` (with `mediaUrl`, and `applied` while the
  updated PDF of the published revision is shown) in the input.
- Reader hook on `flipbooks` (module-neutral fields): `pageOverrides[]`
  (`pageIndex`, `image`, `width`, `height`), `pdfOverride`, `overrideRevision`,
  `overrideSource`, `overrideManifestUrl`, `overrideManifestFor`. The reader takes
  `overrideManifestUrl` (text layer and links of the updated PDF) only while
  `overrideManifestFor` names the current `pdfOverride`; without active overrides it
  takes the conversion's `manifestUrl`. `pdfUpdate.ts` mirrors the updated pages and PDF onto the
  flipbook (and clears them again when the pdfedit has no edits left);
  `mapFlipbookToInput` (`src/lib/blocks/flipbook/`, from `flipbook-system`)
  substitutes them in the reader while `overrideRevision` equals
  `publishedRevision`. The media delete guard protects the override media.
- Server libs `src/lib/pdfedit/`: `context.ts` (shared loading of pdfedit, flipbook, records and
  media files, `errorJson`, the per-pdfedit `serialize` queue), `pdfUpdate.ts` (apply/restore orchestration;
  the planning functions `collectEdits`/`resetPageBlocks` come from the package's `./host`),
  `adminAuth.ts` (the admin check shared by all pdfedit endpoints), `imageModel.ts`,
  `imageFiles.ts` (media storage + WebP→PNG with `sharp`), `googleFonts.ts` (font provider via the
  Google Fonts Developer API and a disk cache, key `APP_FONTS_GOOGLE_API_KEY`),
  `textStyles.ts` (adds block styles to documents converted before style
  extraction existed or with an older style revision), `readManifest.ts`
  (`ensureReadManifest`: PDF.js manifest — text layer, links — of the PDF the
  reading view shows. Without an updated PDF that is the conversion's
  `flipbooks.manifestUrl` (no copy; an own manifest of an earlier update is
  released). For the updated PDF the pdfedit builds it itself with
  `@werk1/w1-system-flipbook/pdf/server`, in the background — started right after
  "PDF aktualisieren", `manifestUrl` is absent until it is done — and publishes it
  to the flipbook as `overrideManifestUrl`/`overrideManifestFor`; stored in the `pdfedits` fields `manifestUrl`,
  `manifestPdf`, `manifestMedia`; artifacts carry `generatedBy: 'pdfedit'`),
  `retryWrite.ts` (repeats a write on a MongoDB write conflict). The conversion pipeline additionally runs
  `pdftohtml -xml -zoom 1 -i` (`extractStyleLayout`) and `applyTextStyles`.
- Editor (the only editor page, no Payload admin view): the start page
  (`FlipbookHome`) shows the flipbook; the header carries an account menu
  (`AccountMenu`, Payload login of `users`). After an `admin` login
  `/?book=<slug>&edit=1` shows `src/components/pdfedit/PdfeditWorkspace.tsx`
  (mounted by `PdfeditEditView`) for the first `pdfedits` entry of that PDF
  document, in the app theme. Not in the phone-landscape bar. It renders
  `W1PdfEditBlock` (modes `read`/`capture`), persists every callback through
  `pdfedit-records`, loads the fonts of the text model from Google Fonts
  (`googleFontsCssUrl`) and runs the PDF update bar through `pdfedit-pdf`;
  `PdfeditEditorLink` on the pdfedit document links to it plus the exports.
  Image editing: `useFrontendMediaPicker.tsx` (plain dialog on `/api/media`,
  upload via REST) feeds the package's `onPickImageFromMedia` / `onUploadImage`;
  `onImageEditSave` / `onImageEditReset` persist through `pdfedit-images` (optimistic, reload on
  error; a replacement is pending until the next PDF update, a removal or reset updates at once). Saves of one record go out one after another.

## Generated App Wiring

- Module `pdfedit` auto-adds `flipbook` (`autoDeps`): the flipbook
  backend is the data plane (page images + text model per published
  revision). `@werk1/w1-system-pdfedit` is listed in the flipbook
  module's `packages` because the copied pipeline imports `/extract`
  statically.
- The server files above, `src/lib/pdfedit/`, `src/components/pdfedit/` and
  the start page files (`AccountMenu`, `FlipbookHome`/`Header`/`Reader`,
  `PdfeditEditorLink`) are copied from `w1-system-pdfedit-app`
  (`pdfeditAppCopy`; core-v2 is not a source) and replace the flipbook-system
  versions; the pdfedit labels of that pdfedit-only source app are reverted to
  neutral texts and set again only for pdfedit-only apps.
  `payload.config.ts`, `payload/collections/index.ts` and the `edit` parameter
  of the host page are gated on `hasPdfedit` in the generator templates.
- No page section is defined: the editor is the start page after an admin login.

## Boundaries

- The package never fetches, writes, or knows Payload — the start page editor is
  the persistence adapter (`onRecordSave`/`onRecordCreate`/`onRecordDelete`/`onRecordReorder`
  → `pdfedit-records` endpoints).
- Rules that every host needs identically live in the package's `./host` (pure TypeScript, no Payload):
  image edit validation, text update planning and record payload sanitizing. A host imports them and
  keeps only persistence, auth and admin binding.
- `pageIndex` is 0-based; `blocks[].blockId` must reference ids of the
  document's `textModel` — keep custom endpoints consistent with
  `W1PdfEditRecordBlock`.
