import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { logoScaleFactor, type ClientLogo, type ClientLogoImage } from './clientLogoVariants'

type MediaDoc = { url?: string | null; width?: number | null; height?: number | null }

function toImage(value: unknown): ClientLogoImage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const media = value as MediaDoc
  if (!media.url) return undefined
  return { url: media.url, width: media.width ?? undefined, height: media.height ?? undefined }
}

/**
 * Client name, logo and pictogram from Site Settings (group "Kunde"), or
 * undefined when none is set or the database is unavailable; the reader then
 * shows the flipbook title and its initial instead. Server only.
 */
export async function getClientLogo(): Promise<ClientLogo | undefined> {
  try {
    const payload = await getPayloadClient()
    const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 1 })) as {
      clientLogo?: Record<keyof ClientLogo, unknown> | null
    }
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    const name = text(settings.clientLogo?.name)
    const mode = (settings.clientLogo as { pageWordMode?: unknown } | null | undefined)?.pageWordMode
    // "custom" with an empty word counts as "none".
    const pageWord = mode === 'none' ? '' : mode === 'custom' ? text(settings.clientLogo?.pageWord) : undefined
    const logo: ClientLogo = {
      name: name || undefined,
      pageWord,
      logoScale: logoScaleFactor(settings.clientLogo?.logoScale),
      positive: toImage(settings.clientLogo?.positive),
      negative: toImage(settings.clientLogo?.negative),
      pictogramPositive: toImage(settings.clientLogo?.pictogramPositive),
      pictogramNegative: toImage(settings.clientLogo?.pictogramNegative),
    }
    return Object.values(logo).some((value) => value !== undefined) ? logo : undefined
  } catch {
    return undefined
  }
}
