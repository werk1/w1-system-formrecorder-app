import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { W1PdfFontProvider, W1PdfFontRequest } from '@werk1/w1-system-pdfedit/pdf'

const API = 'https://www.googleapis.com/webfonts/v1/webfonts'

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>

export type GoogleFontProviderOptions = {
  /** Google Fonts Developer API key (`APP_FONTS_GOOGLE_API_KEY`). */
  apiKey: string | undefined
  /** Directory for the downloaded font files. */
  cacheDir?: string
  fetchImpl?: FetchLike
}

export const defaultFontCacheDir = (): string =>
  process.env.PDFEDIT_FONT_CACHE_DIR || path.join(os.tmpdir(), 'w1-pdfedit-fonts')

/** Google variant key for a face (`regular`, `700`, `italic`, `300italic`). */
export const variantKey = (weight: number, italic: boolean): string =>
  weight === 400 ? (italic ? 'italic' : 'regular') : `${weight}${italic ? 'italic' : ''}`

/**
 * Picks the file URL for a face: the exact variant, else the nearest weight in
 * the same slant, else the nearest weight of the other slant.
 */
export function pickVariantUrl(files: Record<string, string>, weight: number, italic: boolean): string | null {
  const parse = (key: string) => {
    const isItalic = key.endsWith('italic')
    const w = key.replace('italic', '')
    return { italic: isItalic, weight: w === 'regular' || w === '' ? 400 : Number(w) }
  }
  const entries = Object.entries(files)
    .map(([key, url]) => ({ ...parse(key), url }))
    .filter((e) => Number.isFinite(e.weight))
  if (entries.length === 0) return null
  const rank = (e: { italic: boolean; weight: number }) => (e.italic === italic ? 0 : 10000) + Math.abs(e.weight - weight)
  return [...entries].sort((a, b) => rank(a) - rank(b))[0].url
}

/**
 * Font provider for `applyTextEdits`: resolves a face through the Google Fonts
 * Developer API and caches the TTF on disk. Without an API key, offline, or
 * for families Google does not know it returns `null` (the writer then falls
 * back to a standard font and reports a warning).
 */
export function createGoogleFontProvider(options: GoogleFontProviderOptions): W1PdfFontProvider {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url) => fetch(url) as never)
  const cacheDir = options.cacheDir ?? defaultFontCacheDir()
  const catalog = new Map<string, Promise<Record<string, string> | null>>()

  const filesFor = (family: string): Promise<Record<string, string> | null> => {
    const cached = catalog.get(family)
    if (cached) return cached
    const request = (async () => {
      if (!options.apiKey) return null
      const res = await fetchImpl(`${API}?key=${encodeURIComponent(options.apiKey)}&family=${encodeURIComponent(family)}`)
      if (!res.ok) return null
      const body = (await res.json()) as { items?: Array<{ family?: string; files?: Record<string, string> }> }
      const item = body.items?.find((i) => i.family?.toLowerCase() === family.toLowerCase()) ?? body.items?.[0]
      return item?.files ?? null
    })().catch(() => null)
    catalog.set(family, request)
    return request
  }

  return async ({ family, weight, italic }: W1PdfFontRequest) => {
    const files = await filesFor(family)
    if (!files) return null
    const url = pickVariantUrl(files, weight, italic)
    if (!url) return null
    const file = path.join(cacheDir, `${family.replace(/[^A-Za-z0-9]+/g, '')}-${path.basename(new URL(url).pathname)}`)
    const cached = await fs.readFile(file).catch(() => null)
    if (cached) return new Uint8Array(cached)
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(file, bytes)
    return bytes
  }
}
