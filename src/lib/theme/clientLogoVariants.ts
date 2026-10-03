/**
 * Client name and marks from Site Settings (group "Kunde"): the wide logo for the
 * header and the square pictogram for the slim phone-landscape bar. Positive
 * variants are for light, negative ones for dark surfaces. Pure types and
 * helpers, safe for client components (the loader is in clientLogo.ts).
 */

export interface ClientLogoImage {
  url: string
  width?: number
  height?: number
}

export interface ClientLogo {
  /** Client name: shown on top while no logo is set, alt text of the logo, text in the status bar. */
  name?: string
  /**
   * Word before the page number in the status bar: undefined uses the
   * language default ("Seite" / "Page"), an empty string shows numbers only.
   */
  pageWord?: string
  /** Size of the header logo as a factor of its standard height (see LOGO_SCALE). */
  logoScale?: number
  positive?: ClientLogoImage
  negative?: ClientLogoImage
  pictogramPositive?: ClientLogoImage
  pictogramNegative?: ClientLogoImage
}

/**
 * Limits of the header logo size in percent of its standard height (28 px).
 * The upper limit keeps the logo inside the 56 px bar, which never grows.
 */
export const LOGO_SCALE = { min: 60, max: 170, default: 100 } as const

/** Logo size from Site Settings (percent) as a factor inside the limits. */
export function logoScaleFactor(percent: unknown): number {
  const value = typeof percent === 'number' && Number.isFinite(percent) ? percent : LOGO_SCALE.default
  return Math.min(Math.max(value, LOGO_SCALE.min), LOGO_SCALE.max) / 100
}

/**
 * One variant alone serves both modes; with both, dark surfaces get the
 * negative one (`prefers-color-scheme: dark`).
 */
export function pickLogoVariants(
  positive: ClientLogoImage | undefined,
  negative: ClientLogoImage | undefined,
): { main?: ClientLogoImage; dark?: ClientLogoImage } {
  return { main: positive ?? negative, dark: positive && negative ? negative : undefined }
}
