import { defaultLanguage, isSupportedLanguage, type LanguageCode } from '@/config/languages'

/** Flipbook routes read `?locale=`; unknown values fall back to the app default. */
export const resolveFlipbookLocale = (raw: unknown): LanguageCode =>
  isSupportedLanguage(raw) ? raw : defaultLanguage

/** Query suffix for links: empty for the default language. */
export const flipbookLocaleQuery = (locale: string, separator: '?' | '&' = '?'): string =>
  locale === defaultLanguage ? '' : `${separator}locale=${encodeURIComponent(locale)}`
