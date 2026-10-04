# W1 Flipbook (Unit)

Geschlossene Einheit für die PDF-Konvertierung des Flipbook-Moduls: Ein Admin
weist einem `flipbooks`-Dokument eine PDF-Quelle zu, der Server rendert die
Seiten als Bilder in die `media`-Collection und veröffentlicht die Revision
atomar. Der Viewer liegt im Package `@werk1/w1-system-flipbook`.

System-Doku: `doc/w1-flipbook.md` (Datenfluss, Betrieb, Grenzen).

## Dateien der Einheit

| Datei | Schicht | Inhalt |
|---|---|---|
| `pdfConverter.ts` | **Pure Core** | `pdfinfo`/`pdftoppm`/`pdftotext`-Wrapper: Probe (Seitenzahl, verschlüsselt), Seitenrendering (`-scale-to 2400`, lange Kante), Textebenen-Extraktion (`extractTextLayout`, `pdftotext -bbox-layout` → XHTML), Job-Tempverzeichnis, Fehlerabbildung (`FlipbookConversionError`). **Keine Payload- oder App-Imports.** `mupdf` (WASM) ist nur als Alternative dokumentiert, nicht implementiert. |
| `payloadFlipbookConversion.ts` | **Payload-Glue** | Serielle In-Process-Queue (`enqueueFlipbookConversion`), Job (`runFlipbookConversion`), Auslöser (`maybeScheduleFlipbookConversion`), `onInit`-Reset (`resetInterruptedFlipbookJobs`). Self-Updates tragen `W1_SKIP_FLIPBOOK_CONVERSION`. |
| `cleanup.ts` | **Payload-Glue** | Markiert ersetzte Revisionen (`generatedReleasedAt`), Aufbewahrungsfrist-Timer, Sweep abgelaufener `generatedBy: 'flipbook'`-Medien, Löschen der Seiten eines Flipbooks. |
| `cover.ts` | **Pure** | `resolveCoverImageId`: Cover aus Seite 1, gewählter Seite oder eigenem Bild. |
| `index.ts` | API | Öffentliche Exporte der Einheit. |

## Integrationspunkte (außerhalb der Einheit)

| Ort | Aufgabe |
|---|---|
| `src/payload/collections/Flipbooks.ts` | Collection, Quellen-Validierung, Cover-Gruppe + `beforeChange` (`coverImage`), `afterChange`-Auslöser, `afterDelete`-Cleanup, `textModel` (JSON-Textebene der publizierten Revision) |
| `src/payload/collections/Pdfedits.ts`, `Pdfeditrecords.ts` | Pdfedit-Dokument (Flipbook + Feld-Schema) und geordnete Datensätze |
| `src/app/(payload)/api/pdfedit-*/route.ts`, `src/payload/components/PdfeditEditor*.tsx` | Pdfedit-Editor: Daten-Input, Record-Persistenz, CSV/JSON-Export (`/admin/pdfedit`) |
| `src/payload/collections/Media.ts` | PDF-MIME, `generatedBy/For/Revision/ReleasedAt`, `baseListFilter`, modulneutraler `beforeDelete`-Guard |
| `next.config.mjs` | `Cache-Control: public, max-age=3600` nur für `/api/media/file/fb-*` (erzeugte Seitenbilder) |
| `src/payload/components/FlipbookConvertButton.tsx` | Status, Fortschritt, Neustart, Hinweis „Quelle geändert" |
| `src/app/(payload)/api/flipbook-convert/route.ts` | Admin-Endpoint (GET Status, POST Neustart) |
| `src/payload.config.ts` | Collection, `onInit`: Interrupted-Reset, Temp-Cleanup, Sweep |
| `src/payload/blocks/FlipbookSection.ts`, `src/lib/blocks/flipbook/*`, `src/components/page/W1FlipbookSectionRenderer.tsx` | Page-Section |
| `src/app/(frontend)/flipbooks/`, `src/app/sitemap.ts` | Listing, Reader, Sitemap |
| `Dockerfile`, `docker/dev/Dockerfile` | `poppler-utils`, `fontconfig`, `font-dejavu`, `font-liberation` |

## Verhalten in Kürze

- Revision = Quell-Media-ID + SHA-256 der PDF. Bereits veröffentlichte Revision:
  kein neuer Job (idempotent).
- Der Auslöser übergibt die neue Quell-ID; der Job wartet (bis 5 s), bis das
  festgeschriebene Dokument diese Quelle zeigt (Transaktion im
  `afterChange`-Hook noch offen). Sonst endet er als `superseded`. Ein
  zusammengelegter Folgeauftrag übergibt dem wartenden Job die neueste Quelle.
- „Quelle geändert" vergleicht Dateiname und Dateigröße der PDF
  (`sourceStamp`), nicht `updatedAt`.
- Pro Flipbook wartet höchstens ein Job; läuft bereits einer, darf ein
  Folgejob (Quelle ersetzt) eingereiht werden.
- Veröffentlichung in **einem** Update (`pages`, `pageCount`, `coverImage` aus der Cover-Einstellung,
  `publishedSourcePdf`, `publishedRevision`, `status: ready`). Vorher wird die
  Revision erneut geprüft; bei Abweichung werden die eigenen Seiten gelöscht.
- Fehler/Timeout: `status: error`, `errorMessage`, eigene Teilseiten gelöscht,
  veröffentlichte Revision bleibt.
- Kein automatischer Retry, keine Persistenz, **eine App-Instanz** pro
  Deployment.
- Aufbewahrung ersetzter Revisionen: `W1_FLIPBOOK_RETENTION_HOURS` (Default 24)
  **ab dem Ersetzen** (`generatedReleasedAt`), nicht ab Erstellung. Nie
  veröffentlichte Seiten (fehlgeschlagene/abgebrochene Jobs) zählen ab
  Erstellung. Die Frist muss länger als die Cache-Zeit der Seitenbilder sein
  (1 h, `next.config.mjs`).
- Temp-Verzeichnis: `W1_FLIPBOOK_TMP_DIR` (Default `<tmpdir>/w1-flipbook`).
- Grenzen: 500 MB (Validierung am Feld), 300 Seiten (Job).
