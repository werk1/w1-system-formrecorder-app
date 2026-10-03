/**
 * W1 Flipbook — public API of the unit.
 *
 * - pdfConverter: pure poppler logic (no Payload imports)
 * - payloadFlipbookConversion: Payload glue (serial queue, publication, restart)
 * - cleanup: retention cleanup and sweep of generated page images
 *
 * See README.md in this folder.
 */

export {
  FLIPBOOK_MAX_PAGES,
  FLIPBOOK_MAX_PDF_BYTES,
  FLIPBOOK_TARGET_LONG_EDGE,
  FlipbookConversionError,
  clearTempRoot,
  createJobDir,
  extractTextLayout,
  isPdfToolingAvailable,
  probePdf,
  readPdfSignature,
  readPngSize,
  removeJobDir,
  renderPage,
  resolveFlipbookTempRoot,
  sha256File,
  toUserMessage,
} from './pdfConverter'
export type { FlipbookConversionErrorCode, PdfProbe, RenderedPage } from './pdfConverter'

export {
  FLIPBOOK_INTERRUPTED_MESSAGE,
  W1_SKIP_FLIPBOOK_CONVERSION,
  buildPageAlt,
  defaultFlipbookConverter,
  deleteFlipbookGeneratedPages,
  enqueueFlipbookConversion,
  isFlipbookJobActive,
  maybeScheduleFlipbookConversion,
  relationId,
  resetInterruptedFlipbookJobs,
  runFlipbookConversion,
  stampOfMedia,
} from './payloadFlipbookConversion'
export type { EnqueueResult, FlipbookConversionOutcome, FlipbookConverter } from './payloadFlipbookConversion'
export { resolveCoverImageId } from './cover'
export type { FlipbookCoverSettings, FlipbookCoverSource } from './cover'
export {
  FLIPBOOK_GENERATOR,
  cancelScheduledCleanups,
  deleteGeneratedPages,
  markRevisionReleased,
  resolveFlipbookRetentionMs,
  scheduleSupersededCleanup,
  sweepGeneratedMedia,
} from './cleanup'
