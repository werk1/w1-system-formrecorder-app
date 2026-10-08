# flipbook App Integration Contract

Status: generated from cloned/file snippet
Module: `flipbook`
Package: `@werk1/w1-system-flipbook`
Snippet version: `2026-09-29`
Snippet source: local generated contract snapshot
Package integration: `file: sibling package`

## Local Contract Snapshot

The following content was copied into this app during generation so the app remains standalone.

# Flipbook App Integration Snippet

Snippet-Version: 2026-09-29
Status: current (roadmap step G4)

This file is the package-owned integration snippet that `w1-system-app-creator`
embeds as `docs/contracts/flipbook-app-integration-contract.md` into generated
apps with module `flipbook` active.

## Owning Package

- `@werk1/w1-system-flipbook` — headless, prepared-data flipbook viewer
  (`W1FlipbookBlock`, `W1FlipbookInput`, `W1FlipbookConfig`, `W1FlipbookPage`).

## App-Owned Surface

- Payload collection `flipbooks` (`src/payload/collections/Flipbooks.ts`):
  PDF upload via `media`, conversion status, ordered page list.
- Module-neutral reader hook on `flipbooks`, written by other modules (pdfedit
  "PDF aktualisieren"): `pageOverrides[]` (`pageIndex`, `image`, `width`, `height`),
  `pdfOverride`, `overrideRevision`, `overrideSource`, `overrideManifestUrl`,
  `overrideManifestFor`. The reader shows the overrides only while
  `overrideRevision` equals `publishedRevision`. The manifest it passes on
  (`manifestUrl` of `W1FlipbookInput`: text layer, links) is the conversion's
  `manifestUrl` without active overrides, and with active overrides
  `overrideManifestUrl`, but only while `overrideManifestFor` names the current
  `pdfOverride` (else none). Without such a module the fields stay empty.
- Conversion queue and admin endpoint
  (`src/app/(payload)/api/flipbook-convert/` + `src/lib/flipbook/`):
  in-process serial queue (no persistence; aborted or failed conversions end
  in `error` and are restarted by an admin), server-side PDF-to-page-image
  rendering (`pdftoppm`/poppler-utils plus fontconfig and base fonts in the
  Docker image), WebP sizes via the `media` upload config, delayed cleanup of
  superseded revisions. Assumes a single app instance.
- Neutral `media` extensions: `application/pdf` MIME, `generatedBy`/
  `generatedFor`/`generatedRevision`/`generatedReleasedAt` fields and a delete
  guard for referenced flipbook PDFs, published pages and uploaded covers.
- Payload block `w1-flipbook-block`
  (`src/payload/blocks/FlipbookSection.ts`) with `flipbookSlug` and per-section
  config overrides.
- Resolver `src/lib/blocks/flipbook/resolveFlipbookBlockInput.ts`: maps a
  `flipbooks` document to `W1FlipbookInput`.
- Section renderer `src/components/page/W1FlipbookSectionRenderer.tsx` and its
  registration in `PageSectionComponents`/`resolvePageSections`.
- Frontend routes `src/app/(frontend)/flipbooks/` (listing) and
  `flipbooks/[slug]` (fullscreen reader, canonical deep link for external
  references). The start page `/` is the flipbook host: header bar with a
  menu of all published flipbooks, first entry open by default,
  `?book=<slug>` selects another book.
- Cover selection on the `flipbooks` document (page 1 by default, another
  page or an uploaded image), resolved into `coverImage` for listing and OG
  image.
- Thumbnail rail adapter `src/components/flipbook/FlipbookThumbnailRail.tsx`
  (+ `.module.css`), passed to `W1FlipbookBlock` as `renderThumbnails` by the
  reader and the section renderer (added 2026-09-30). It renders the package's
  thumbnail tiles with `W1StripRail` from
  `@werk1/w1-system-carouselblock/strip`: kinetic rail when device info is
  ready and `is_deviceM`, native free strip otherwise; `thumbFit: 'fitHeight'`
  (90 px), `followSelection` with `nearest` (the active tile is only scrolled
  into view when hidden, no re-centring), spread tiles composed from the two page
  thumbnails on paper. Colours come from the `--w1-flipbook-*` theme
  variables (focus outline: `--w1-flipbook-focus-ring`, 3 px). The active
  tile carries `aria-current`, the strip is named by `labels.thumbnails`,
  tiles show the page reference as tooltip. Pointer enter or press on a tile
  calls the strip's `onPrefetch`, so a picked page is usually loaded before
  the jump.
- Viewer toolbar `src/components/flipbook/FlipbookToolbar.tsx` (+ `.module.css`),
  passed as `renderToolbar`: icon buttons from `@werk1/w1-system-ui`
  (`W1Button` ghost/neutral, `pressed` for toggles; Lucide icons
  `file_pdf` (PDF in a new tab), `page_single`/`page_double`, `text_search`,
  `expand`/`shrink`; the side toolbar also carries `zoom_out`/`zoom_in`,
  while horizontal toolbar callers set `showZoom={false}` and
  `showThumbnails={false}` because the bottom widget carries these controls), themed
  through the `--w1-flipbook-*` variables. On the start page host the
  controls sit at the right of `FlipbookHeader` (the header is rendered
  inside the viewer, so it stays in fullscreen; its "Flipbooks" menu is
  hidden behind `showMenu` until the archive feature). The deep link
  (`/flipbooks/[slug]`, also the embed link) shows the same header with the
  client name or logo, never the menu; in page sections a slim
  bar holds the controls. The bottom bar holds
  `FlipbookNavigationWidget` (passed as `renderNavigation`), built from the
  `@werk1/w1-system-widgets` layouts: `WidgetArea` (`theme="light"`; light
  and dark come from the app palette through the widget tokens in
  `FlipbookWidgetTheme.module.css`, shared with the search panel) with a compact, pill-shaped `WidgetShell` in the
  `search` tone (search widget gradient; overflow visible so the page popup
  is not clipped): the round `.w1-widget-search__submit` buttons with the
  widget chevrons around the page field in its own `.w1-widget-search` pill
  (`W1Select` `tone="glass"`, `popupMode="custom"`,
  `popoverSurface="liquid"`, popup and option values from the ticketing
  search panel, one entry per spread, list opens upwards above stage and
  rail). The horizontal widget starts with the zoom magnifier at the far left,
  followed by the thumbnail rail toggle (`gallery_strip`) and the arrows/page
  field. Both toggles are round ghost buttons with their active `pressed` state.
  The magnifier (`zoom_in`/`zoom_out`) toggles between flat pages and the kept
  zoom value; wheel and pinch on the pages zoom as well, see the package zoom
  contract. In phone landscape both toggles remain in the side icon bar.
- Search panel `src/components/flipbook/FlipbookSearchPanel.tsx` (+
  `.module.css`), passed as `renderSearch`; the package owns the session
  (query, hits, picked hit, page mark), the panel adds only `expanded`
  (reader state). Built from `WidgetSearch` (live query; the round submit
  goes to the first hit), `WidgetResultList` and `WidgetResultLink` (snippet
  as title, `labels.searchPage` as accent, the link is the hit's `?page=`
  deep link; a plain click jumps in the reader, the picked hit carries
  `aria-current`) and `WidgetIconButton`; texts in
  `createFlipbookSearchPanelLabels`. Placement per reader layout:
  desktop (`default`) a classic sidebar at the viewer start
  (`searchPlacement="start"`, 340 px, the pages shrink), folded a 56 px icon
  column whose search button opens or unfolds it; the header carries no
  search button there. Phones and tablets get a sheet over the pages
  (`searchPlacement="overlay"`, above the zoom layer): from the top in
  portrait (PP, TP; full width, at most 72 % of the stage height, clear of
  the navigation widget), sliding in from the left in landscape (PL, TL;
  360 px, full height, out of the side bar that holds the search button).
  A sheet is one surface, built like the sidebar: it sits flush
  against its edge of the stage and grows from under the header, frosted
  over the pages (`--flipbook-app-popover-bg` with `blur(16px)`, the same
  pair the navigation widget's page popup uses; without `backdrop-filter`
  support it stays opaque in the toolbar colour) with square corners, a
  hairline on the edge it grows from and 14 px / 16 px / 10 px of padding.
  Inside it the search bar sits on top, quieter than the navigation widget
  although it keeps its spacings — 3 px around its row, 6 px between the
  controls, one 43 px control height; only the text field keeps its own
  padding. Quieter means: `--w1-widget-tint: 0`, so the widget surfaces drop
  the tone tint they derive from the primary and turn neutral; the grouping
  pill carries no surface, border or shadow of its own, because field and
  buttons bring their own; and the controls are light circles in the toolbar
  colour with the field's hairline instead of filled primary discs, which
  stay with the reader's main navigation below. The field searches as you
  type: it has no submit and shows its native clear button (`WidgetSearch`
  `clearable`, drawn by the widget package as a muted disc with the cross cut
  out); it carries the toolbar colour rather than a translucent white,
  because folded it stands alone over the pages. The previous/next hit
  buttons sit beside the field, not inside it. The arrows walk the hits and
  move the page mark without folding anything, so the collapsed bar alone
  works like find-in-page; they do not wrap and grey out at the ends of the
  list. The round toggle that folds the hits away sits outside the pill,
  because it belongs to the panel, not to the search, and points the way the
  hits fold: `chevron_up`/`chevron_down` in the top sheet,
  `chevron_left`/`chevron_right` in the landscape sheet and the sidebar,
  where the hits fold sideways. Folded, a sheet shrinks to its search bar and
  keeps its surface, which the bar needs as a backdrop. There
  is no close button, the viewer's search button is the on/off. Opening the
  list scrolls the picked hit into view. The hits follow below as one rounded card each (`WidgetResultLink` on a tinted
  surface, because the toolbar colour would swallow its translucent card
  background) — the same bar and cards fill the desktop sidebar. The header
  or side-bar search button opens a sheet and then folds and unfolds its
  results; folded, only the search bar remains with the query. A picked hit folds a sheet so the marked block stays visible;
  the sidebar stays open. The close button (or Escape) ends the session and
  clears the mark. While zoomed the zoom stays and the view moves to the
  picked hit (package contract).
  The viewer status bar below the rail starts with the client name as text
  (never a logo; without a client name the flipbook title), then the issue
  (the `flipbooks` field `issue`, e.g. "Nr. 7/27", omitted when empty;
  `issueOf`), both passed as `statusStart` and cut with an ellipsis when the
  bar gets narrow, followed by the counter (`labels.counter`, "Seite 58–59 |
  78", a straight line between pages and page count). The word before the
  pages comes from Site Settings (`clientLogo.pageWordMode`: language
  default, none or the custom `pageWord`). The end of the bar carries the fixed W1System
  wordmark (`W1SystemMark`, passed as `status`: `public/w1-logos/W1System.svg`
  as a CSS mask in the scheme's text colour, so it is dark on light and light
  on dark). The side arrangement (phone landscape) has no status bar. In
  phone portrait the counter drops the word, "58–59 | 78"
  (`createFlipbookLabels(locale, { compactCounter: true })`). The app
  depends on `@werk1/w1-system-ui`, its dependency `@werk1/w1-system-calendar`
  and `@werk1/w1-system-widgets` (styles imported in the frontend layout)
  via `package.json`, `transpilePackages`, `Dockerfile`, `LOCAL_DEPS` and
  `scripts/workspace-update.mjs`.
- Client name and marks (Site Settings → "Kunde: Name, Logo, Piktogramm",
  group `clientLogo` with the text `name`, the page word (`pageWordMode`,
  `pageWord`) and the uploads `positive`,
  `negative`, `pictogramPositive` and `pictogramNegative`; loader `src/lib/theme/clientLogo.ts`, client-safe
  types and `pickLogoVariants` in `clientLogoVariants.ts`): the
  header shows the client `name` at the top left (without one the flipbook
  title); when a logo is set, `FlipbookHeader` shows it instead (28 px high,
  the name stays as alt text). `logoScale` (percent, 60 to 170, default 100,
  `LOGO_SCALE`) sizes that logo from the admin: it grows and shrinks from
  its left edge and may reach into the bar's padding, the bar keeps its
  height. `positive` is for light
  surfaces, `negative` for dark ones (`prefers-color-scheme: dark`); a
  single variant serves both modes. The phone-landscape side bar keeps its
  square pictogram slot.
- Dev tools (`src/components/flipbook/dev/`): with `next dev` (`IS_DEV`,
  compiled out of production builds) the top bar shows a settings button
  (`DevToolsButton`) with two tabs:
  - "Shader": a live panel for every `W1FlipbookCurlTuning` value (sliders,
    ease select, reset, copy as JSON). It mutates one shared `devCurlTuning`
    object, stored in `localStorage`, which the reader and page sections
    pass as `curlTuning`; the engine reads it on every frame, so the book
    never re-renders while tuning. Copied values become the package
    defaults (`DEFAULT_CURL_TUNING`).
  - "Farben": the colour scheme editor (`ColorSchemeEditor`). It loads the
    schemes from `/api/color-schemes`, edits light or dark with colour and
    text fields and previews the edited mode live on the real reader
    (`<style id="dev-color-scheme-preview">` with `:root:root`, forcing the
    mode regardless of the system). "Speichern" PATCHes the scheme, "Als
    neues Schema" POSTs a copy; both need an admin login in the browser.
  The panel stays mounted once opened and is only hidden while closed; the
  chosen scheme, mode, unsaved edits and the last tab are also kept for the
  browser session, so closing, reopening or rotating does not reset them.
- App colour schemes (Payload collection `color-schemes` "Farbschemata",
  `src/lib/theme/colorSchemeTokens.ts`, `src/lib/theme/appColorScheme.ts`,
  `src/app/(frontend)/theme/palettes.css`): each scheme has a name, an
  optional `key` and a `light` and `dark` group with the
  `--flipbook-app-*` tokens (primary, primary-strong, primary-text,
  secondary, bg, toolbar, stage, paper, border, text, muted, panel gradient,
  panel border, panel shadow). Values are validated as colours or gradients
  only (`isSafeCssValue`), because they are rendered into every page. The
  built-in schemes Graphit (`graphite`), Advantage-Blau gedämpft
  (`advantage`), Salbei / Stein (`sage`; panel gradients of these three
  from the widget gradients neutral-warm / neutral-cool / teal), Bordeaux /
  Sand (`bordeaux`), Aubergine / Altrosa (`aubergine`) and Terrakotta /
  Petrol (`terracotta`) are created on init when missing. Site Settings → "Farbschema" (`colorScheme`, relationship) picks
  the active one; without a choice Graphit applies, without a database the
  built-in Graphit values. The frontend layout renders it as
  `<style id="app-color-scheme">` (light on `:root`, dark under
  `prefers-color-scheme: dark`; there is no user switch) and sets
  `data-color-scheme-id` on `<html>`. `palettes.css` holds only the per-mode
  tokens shared by all schemes and the mapping. The scheme feeds the viewer
  tokens (`--w1-flipbook-*`, for books with theme
  "inherit"), the toolbar icon buttons (icons in primary, active toggle in a
  soft secondary with a secondary icon), the navigation widget (widget
  tokens, page popup) and the rail (active tile in secondary). Books forced
  to "light"/"dark" keep the package's own colors.
- Reader device layouts (`FlipbookReader.tsx`, `readerDevice.ts`,
  `FlipbookReader.module.css`): the reader picks its structure once from
  device-info after hydration (`default`, `phonePortrait`,
  `phoneLandscape`, `tabletPortrait`, `tabletLandscape`) and sets
  `w1-flipbook_devicePP`/`_devicePL`/`_deviceTP`/`_deviceTL` plus the
  device-info identifier class (`_devicePPSM`, `_devicePLSM`, `_deviceDL`,
  ...). The identifier is used, not `deviceStyleSuffix`, because the suffix
  maps tablets to desktop (`DS`/`DL`). Desktop uses `default`. Server
  render and hydration use `default`. The reader owns the current page
  (`page`/`onPageChange`, synced to `?page=`), and the viewer keeps its tree
  position, so rotation changes the chrome without remounting the book. PP,
  PL, TP and TL have their own CSS sections (TL shares the PL values).
- Tablet portrait keeps the default structure (header, pages, navigation
  widget, horizontal rail open from the start) and opens one page at a time
  (`defaultSpread="single"`); the spread toggle in the header switches to
  the double spread, and that choice holds across rotation.
- Phone and tablet landscape use `chromeLayout="side"`: `FlipbookSideChrome` is one
  slim bar (`--flipbook-side-bar-width`, 64 px) with the client pictogram
  on top (Site Settings `pictogramPositive` / `pictogramNegative`, square;
  without one the title initial is shown as a round badge in the scheme's
  primary colour), the viewer controls as icon buttons at the bottom (no PDF
  link in phone landscape) and below them the counter as a fraction
  (`navigation.range` over a rule over the page count). While the rail is
  closed, the end column shows the navigation widget in its vertical form
  (`FlipbookNavigationWidget` `orientation="vertical"`: previous arrow, page
  field with the chevron below the number, next arrow; double-page ranges in
  the taller field show the two numbers vertically with a short dividing
  rule; the field pads 15 px above the number and 7 px below the chevron,
  which reads as even spacing. Arrows and page field share one fixed width
  (`--flipbook-nav-column-width`, 48 px, room for three digits). The page list retains horizontal ranges and opens
  towards the pages; the rail toggle stays in the icon bar).
- The page field of the horizontal navigation widget has a fixed width
  independent of the number shown: room for `XXX` in the single-page layout
  and for `XXX–XXX` in the double layout (value slot 2.3em / 5em). The title and
  client marks reach the header and the side bar on the deep link too. There is no logo panel, so the double spread keeps its width. The
  pages take the full height, the vertical rail (`orientation: 'vertical'`,
  `fitWidth` 128 px tiles, 148 px column: 8 px before the tiles, 12 px of rail colour after them, plus the right safe-area inset) sits at the end; side bar and rail bleed to the screen edges and pad themselves clear of notch, status bar and home indicator.
- Toolbar icons are 24 px (`--w1-icon-size-m` inside the toolbar,
  `--flipbook-toolbar-icon-size`) in 40 px buttons.
- Reader, start page host and listing wrap their content in
  `<ClientLayout renderBeforeDeviceReady>`: the viewer's SSR placeholder
  (current page as real `<img>`) is in the server HTML instead of waiting for
  device detection. Other pages keep the device-gated `ClientLayout`. Pages are only rasterised as single pages; there are no
  pre-rendered pair images.
- `next.config.mjs` `headers()`: `Cache-Control: public, max-age=43200` for
  generated page images, chunks and manifest (`/api/media/file/fb-*`); the
  cache time stays below the 24 h retention of superseded revisions, which
  counts from their replacement.
- Reader and section lookups (`loadPublishedFlipbook`) exclude the
  server-only `textModel`/`imageModel` from the read and match the slug
  lowercase; the reader route shares one lookup between metadata and page
  (`react` `cache`). The search route reads only the index cache key fields
  and loads the text model on a cache miss.
- Page `srcSet` adds the original image when it is wider than every
  generated size (Payload omits sizes wider than the original).
- `labels.pdfLinkPage` names internal PDF links (de "Zu Seite n", en
  "Go to page n").
- Viewer switches per flipbook in `defaultConfig` (checkboxes, from
  `FLIPBOOK_BOOLEAN_CONFIG_KEYS`; default on, page sections cannot override
  them): `allowSearch` — the search including selecting and copying the text
  of a found block; `allowTextSelect` — the text-select mode (any page text
  from the PDF text layer of the manifest). The PDF download stays either way.
  Admins keep both: the reader route, the start page and page sections pass
  `withAdminFeatures(input, isAdminRequest(…))`
  (`src/lib/blocks/flipbook/viewerAccess.ts`). The search route enforces
  `allowSearch` on the server (404 for everyone but admins, so the reader's
  probe shows no search); admin answers are `Cache-Control: private, no-store`.

## Generated App Wiring

- Module `flipbook` in the App Creator copies the files above byte-identical
  from `w1-system-core-v2` (without its vitest tests) and gates
  `Pages.ts`, block/collection indexes, `payload.config.ts` (collection +
  `onInit` reset), page types/model/resolver/components and
  `next.config.mjs` on `hasFlipbook`.
- Runtime tools (`poppler-utils`, `fontconfig`, `font-dejavu`,
  `font-liberation`) are installed in `Dockerfile`, `docker/dev/Dockerfile`
  and — through `w1RuntimeApk` in `package.json` — in the autodeploy image
  (`autodeploy/multi/Dockerfile_Multi`).
- `src/payload/collections/Media.ts` stores files under `MEDIA_STORAGE_ROOT`;
  the conversion reads and writes through the `media` collection, never a
  fixed `public/media` path.
- Operation: one app instance per deployment, 500 MB / 300 pages per PDF,
  reverse proxy upload limit ≥ 500 MB, `W1_FLIPBOOK_RETENTION_HOURS` (24).

## Package-Owned Surface

- Page-flip rendering with the package's own engines: WebGL mesh-curl
  (three.js, lazily loaded) or DOM "Strip-Curl" fallback — selected via
  `config.engine` (`'auto'` default) with automatic strip fallback without
  WebGL 2; GSAP animation, `w1-system-gsap-gesture` drag, no external flip
  library, no `extraNpm`. Spread/cover/direction handling, controls, thumbnails, zoom,
  fullscreen, keyboard/swipe navigation.
- The `W1FlipbookInput`/`W1FlipbookConfig` contracts — app code passes prepared
  page-image data; the package never queries Payload or app routes.

## Usage

```tsx
import { W1FlipbookBlock, type W1FlipbookInput, type W1FlipbookLabels } from '@werk1/w1-system-flipbook'

<W1FlipbookBlock
  input={input}
  labels={labels}
  deviceInfo={deviceInfo}
  renderThumbnails={renderFlipbookThumbnailRail} // app adapter, optional
/>
```

Without `renderThumbnails` the package's built-in strip is used.

Register GSAP plugins centrally in the app before rendering. Map app theme
tokens to the `--w1-flipbook-*` variables (see the public API contract) or pick
`theme: 'light' | 'dark'`.

## Working Rule

Viewer bugs and rendering behavior belong in this package. Upload,
conversion, collection schema, routes and admin UI belong in the app host.
Do not import app internals (`@/payload-types`, `@/stores`, route files) from
the package.
