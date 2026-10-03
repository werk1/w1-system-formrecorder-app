import { toKebabCase } from 'payload/shared'
import { slugForLanguage, supportedLanguages } from '@/config/languages'

function isSupportedLanguageSuffix(value: string): boolean {
  return (supportedLanguages as readonly string[]).includes(value.toLowerCase())
}

export function normalizeLowercaseText(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export function stripLocalizedSlugSuffix(value: string): string {
  const normalized = value.trim().toLowerCase()
  const suffixMatch = normalized.match(/([_-])([a-z]{2})$/)
  if (!suffixMatch) return normalized

  return isSupportedLanguageSuffix(suffixMatch[2])
    ? normalized.slice(0, -suffixMatch[0].length)
    : normalized
}

export function normalizeLocalizedSlug(value: unknown, language: string): string | null {
  const normalized = normalizeLowercaseText(value)
  if (!normalized) return null

  return slugForLanguage(stripLocalizedSlugSuffix(normalized), language)
}

export function slugFromTitle(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null

  const kebab = toKebabCase(value) ?? value
  const normalized = kebab.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export function generateEditableKey(...parts: Array<string | null | undefined>): string {
  const source = parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('-')

  const kebab = toKebabCase(source) ?? source
  const normalized = kebab.trim().toLowerCase()
  return normalized.length > 0 ? normalized : 'item'
}

export function generateRandomEditableKey(prefix?: string | null): string {
  const normalizedPrefix = generateEditableKey(prefix ?? 'item')
  const uuidPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : null

  const highResPart =
    typeof process !== 'undefined' && typeof process.hrtime?.bigint === 'function'
      ? process.hrtime.bigint().toString(36)
      : Date.now().toString(36)

  const fallbackRandomPart = Math.random().toString(36).slice(2, 12)
  const entropy = uuidPart ?? `${highResPart}${fallbackRandomPart}`

  return generateEditableKey(normalizedPrefix, entropy)
}
