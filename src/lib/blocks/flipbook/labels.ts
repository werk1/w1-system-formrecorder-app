import type { W1FlipbookLabels } from '@werk1/w1-system-flipbook/types'

const LABELS: Record<'de' | 'en', W1FlipbookLabels> = {
  de: {
    previous: 'Vorherige Seite',
    next: 'Nächste Seite',
    pageStatus: (page, count) => `Seite ${page} von ${count}`,
    jumpTo: 'Zu Seite springen',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    zoomReset: 'Zoom schließen',
    fullscreen: 'Vollbild',
    exitFullscreen: 'Vollbild beenden',
    thumbnails: 'Seitenübersicht',
    close: 'Schließen',
    openPdf: 'PDF öffnen',
    imageError: 'Eine Seite konnte nicht geladen werden.',
    retry: 'Erneut versuchen',
    spreadSingle: 'Einzelseitenansicht',
    spreadDouble: 'Doppelseitenansicht',
    thumbnailSpread: (first, last) => `Seiten ${first}–${last}`,
    counter: (range, count) => `Seite ${range} | ${count}`,
  },
  en: {
    previous: 'Previous page',
    next: 'Next page',
    pageStatus: (page, count) => `Page ${page} of ${count}`,
    jumpTo: 'Jump to page',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Close zoom',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    thumbnails: 'Page overview',
    close: 'Close',
    openPdf: 'Open PDF',
    imageError: 'A page could not be loaded.',
    retry: 'Retry',
    spreadSingle: 'Single page view',
    spreadDouble: 'Two page view',
    thumbnailSpread: (first, last) => `Pages ${first}–${last}`,
    counter: (range, count) => `Page ${range} | ${count}`,
  },
}

/** Counter with a custom word before the pages; an empty word leaves the numbers: "58–59 | 78". */
const counterWith =
  (word: string): W1FlipbookLabels['counter'] =>
  (range, count) =>
    `${word ? `${word} ` : ''}${range} | ${count}`

export interface FlipbookLabelOptions {
  /** Numbers only, for narrow status bars (phone portrait). */
  compactCounter?: boolean
  /**
   * Word before the pages (Site Settings): undefined keeps the language
   * default ("Seite" / "Page"), an empty string shows numbers only.
   */
  pageWord?: string
}

export function createFlipbookLabels(locale: string, options: FlipbookLabelOptions = {}): W1FlipbookLabels {
  const labels = locale === 'de' ? LABELS.de : LABELS.en
  if (options.compactCounter) return { ...labels, counter: counterWith('') }
  return options.pageWord === undefined ? labels : { ...labels, counter: counterWith(options.pageWord) }
}
