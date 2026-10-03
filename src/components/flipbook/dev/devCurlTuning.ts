import { DEFAULT_CURL_TUNING, type W1FlipbookCurlTuning } from '@werk1/w1-system-flipbook'

/**
 * Dev-only live tuning of the WebGL page turn (`next dev`). Compiled out of
 * production builds: every use is guarded by `IS_DEV`, which Next.js inlines
 * as a constant.
 */
export const IS_DEV = process.env.NODE_ENV === 'development'

const STORAGE_KEY = 'flipbook-dev-curl-tuning'

/**
 * One shared, mutable tuning object. The viewer reads it on every frame of a
 * turn, so the panel changes values in place without re-rendering the book.
 */
export const devCurlTuning: W1FlipbookCurlTuning = { ...DEFAULT_CURL_TUNING }

export function loadDevCurlTuning(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(devCurlTuning, JSON.parse(raw))
  } catch {
    // Storage blocked or invalid JSON: keep the defaults.
  }
}

export function saveDevCurlTuning(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devCurlTuning))
  } catch {
    // Storage blocked: the values still apply for this session.
  }
}

export function resetDevCurlTuning(): void {
  Object.assign(devCurlTuning, DEFAULT_CURL_TUNING)
  saveDevCurlTuning()
}
