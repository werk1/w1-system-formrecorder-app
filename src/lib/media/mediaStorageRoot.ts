import path from 'node:path'

const configuredMediaStorageRoot = process.env.MEDIA_STORAGE_ROOT?.trim()

/**
 * Canonical app-owned binary Media root.
 *
 * Original files and derivatives live outside Next.js `public/`, on the
 * `./media` volume (`/app/media` in the container). `public/media` is never
 * a storage location: the production images delete it, and Next.js would
 * otherwise serve every file under `public/` directly and bypass Payload.
 */
export const MEDIA_STORAGE_ROOT = configuredMediaStorageRoot
  ? path.resolve(configuredMediaStorageRoot)
  : path.resolve(process.cwd(), 'media')
