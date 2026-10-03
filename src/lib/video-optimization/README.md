# W1 Video Optimization (Unit)

Geschlossene Einheit für die Video-Optimierungs-Pipeline: Jedes incoming
Video (Admin-Upload oder programmatischer Import) wird in die
Auslieferungs-Varianten normalisiert, die der W1-Video-Stack (Videoplayer,
Video-Carousel) für native-artige Startlatenz voraussetzt.

System-Doku: `doc/w1-video-optimization.md` — dort stehen Datenfluss,
Betrieb (Backfill, Runtime-Voraussetzungen) und die Encoding-Profile.
Erprobt und produktiv gehärtet in `cc-eflyer-2026`.

## Dateien der Einheit

| Datei | Schicht | Inhalt |
|---|---|---|
| `videoOptimizer.ts` | **Pure Core** | ffmpeg/ffprobe-Wrapper: 1080/720-Encode (faststart, ~1s GOP, Bitrate-Caps, nie hochskalierend), First-Frame-Poster, Probe, Varianten-Naming, Cleanup. **Keine Payload- oder App-Imports** — nur Node-Builtins. |
| `payloadVideoOptimization.ts` | **Payload-Glue** | Hook-Orchestrierung nach dem IdmlImportJobs-Haus-Pattern: fire-and-forget aus `afterChange`, Status-Writes per `payload.update` mit `W1_SKIP_VIDEO_OPTIMIZATION`-Context-Flag gegen Hook-Loops, serielle In-Process-Queue, Backfill mit Re-Entry-Schutz. |
| `index.ts` | API | Öffentliche Exporte der Einheit. |

## Integrationspunkte (außerhalb der Einheit)

| Ort | Aufgabe |
|---|---|
| `src/payload/collections/Media.ts` | `videoOptimization`-Group-Feld (read-only Status/Metadaten) + `afterChange`/`afterDelete`-Hooks |
| `src/lib/media/payloadMedia.ts` | URL-Auflösung: `resolveVideoUrl`/`resolveVideoPosterUrl` bevorzugen Varianten/Poster; `resolveVideoSources` liefert `src`, `src720`, `poster`, `posterIsFirstFrame`, `durationMs` |
| `src/lib/blocks/video-carousel/*` | Carousel-Items tragen `src720` + `posterIsFirstFrame` |
| `src/components/page/W1VideoCarouselSectionRenderer.tsx` | Client-seitige DPR-/Data-Saver-Auswahl der 720er-Variante |
| `src/app/(payload)/api/backfill-videos/route.ts` | Admin-only Backfill-Trigger für publishte Instanzen (Standalone-Image hat keine CLI) |
| `scripts/backfill-video-optimization.ts` | CLI-Backfill (`npm run backfill:videos`) für Dev/Container |
| `Dockerfile` / `scripts/docker-dev-app.sh` | ffmpeg im Runtime (Prod-Image bzw. Dev-Startup) |

## Extraktion in ein `@werk1/*`-Package

`videoOptimizer.ts` ist bewusst self-contained und kann unverändert in das
owning Package (Kandidat: media-manager) übernommen werden. Die Glue-Schicht
und die Integrationspunkte bleiben App-Code und werden vom `app-creator` in
generierte Apps übernommen.

## Verhalten ohne ffmpeg

Fehlt ffmpeg/ffprobe im Runtime, degradiert die Pipeline zu
`status: 'skipped'` + Warn-Log; Uploads funktionieren unverändert und die
Konsumenten fallen auf die Originaldatei zurück. `skipped`-Dokumente werden
beim nächsten Backfill-Lauf automatisch wieder aufgegriffen.
