import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import {
  DEFAULT_COLOR_SCHEME_KEY,
  DEFAULT_COLOR_SCHEMES,
  schemeToCss,
  type ColorSchemeMode,
} from './colorSchemeTokens'

type SchemeDoc = { id?: string | number; light?: Partial<ColorSchemeMode>; dark?: Partial<ColorSchemeMode> }

export interface ActiveColorScheme {
  /** Payload id of the scheme; undefined for the built-in fallback. */
  id?: string
  /** CSS custom properties for light and (prefers-color-scheme) dark. */
  css: string
}

/**
 * The colour scheme chosen in Site Settings, else the built-in "graphite"
 * scheme from the collection, else the built-in values (no database).
 */
export async function getActiveColorScheme(): Promise<ActiveColorScheme> {
  try {
    const payload = await getPayloadClient()
    const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 1 })) as { colorScheme?: SchemeDoc | string | null }
    let scheme: SchemeDoc | null = typeof settings.colorScheme === 'object' && settings.colorScheme ? settings.colorScheme : null
    if (!scheme) {
      const found = await payload.find({
        collection: 'color-schemes',
        depth: 0,
        limit: 1,
        pagination: false,
        where: { key: { equals: DEFAULT_COLOR_SCHEME_KEY } },
      })
      scheme = (found.docs?.[0] as SchemeDoc | undefined) ?? null
    }
    if (scheme?.light && scheme.dark) {
      return { id: scheme.id === undefined ? undefined : String(scheme.id), css: schemeToCss({ light: scheme.light, dark: scheme.dark }) }
    }
  } catch {
    // Database unavailable: fall through to the built-in scheme.
  }
  return { css: schemeToCss(DEFAULT_COLOR_SCHEMES[DEFAULT_COLOR_SCHEME_KEY]) }
}
