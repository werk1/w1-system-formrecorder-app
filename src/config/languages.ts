export const supportedLanguages = ['de', 'en'] as const

export type LanguageCode = (typeof supportedLanguages)[number]

export const defaultLanguage: LanguageCode = 'de'

export const languageLabels: Record<string, string> = {
  de: 'German',
  en: 'English',
}

export const languageOptions = supportedLanguages.map((code) => ({
  label: languageLabels[code] ?? code,
  value: code,
}))

export const isSupportedLanguage = (value: unknown): value is LanguageCode => {
  return typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)
}

export const slugForLanguage = (baseSlug: string, language: string): string => {
  return `${baseSlug.trim().toLowerCase()}_${language.trim().toLowerCase()}`
}
