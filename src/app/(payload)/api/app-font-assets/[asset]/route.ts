import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'

const APP_FONT_STORAGE_ROOT = path.resolve(process.cwd(), 'app-font-assets')

const FORMAT_MEDIA_TYPES: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params
  const match = /^(?<hash>[a-f0-9]{64})\.(?<format>ttf|otf|woff|woff2)$/.exec(asset)
  if (!match?.groups) return new Response('Not found.', { status: 404 })

  const { hash, format } = match.groups
  const payload = await getPayloadClient()
  const [fontResult, snapshotResult] = await Promise.all([
    payload.find({
      collection: 'app-font-assets',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
      where: {
        or: [
          { and: [{ sha256: { equals: hash } }, { format: { equals: format } }] },
          {
            and: [
              { 'webDerivative.sha256': { equals: hash } },
              { 'webDerivative.format': { equals: format } },
            ],
          },
        ],
      },
    }),
    payload.find({
      collection: 'app-font-snapshots',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
      where: { 'assetHashes.hash': { equals: hash } },
    }),
  ])

  if (fontResult.docs.length !== 1 || snapshotResult.docs.length !== 1) {
    return new Response('Not found.', { status: 404 })
  }

  const document = fontResult.docs[0] as unknown as {
    filename?: unknown
    verifiedMediaType?: unknown
    sha256?: unknown
    format?: unknown
    webDerivative?: {
      sha256?: unknown
      format?: unknown
      storageKey?: unknown
      mediaType?: unknown
    } | null
  }
  const storedAsset = document.webDerivative?.sha256 === hash && document.webDerivative.format === format
    ? { filename: document.webDerivative.storageKey, mediaType: document.webDerivative.mediaType }
    : document.sha256 === hash && document.format === format
      ? { filename: document.filename, mediaType: document.verifiedMediaType }
      : null
  if (!storedAsset || typeof storedAsset.filename !== 'string' || path.basename(storedAsset.filename) !== storedAsset.filename) {
    return new Response('Not found.', { status: 404 })
  }

  const storageRoot = APP_FONT_STORAGE_ROOT
  const filePath = path.resolve(storageRoot, storedAsset.filename)
  if (!filePath.startsWith(`${storageRoot}${path.sep}`)) return new Response('Not found.', { status: 404 })

  try {
    const bytes = await readFile(filePath)
    const actualHash = createHash('sha256').update(bytes).digest('hex')
    if (actualHash !== hash) {
      payload.logger.error({ expectedHash: hash, actualHash }, 'Published App Font asset hash mismatch')
      return new Response('Published font asset failed integrity verification.', { status: 500 })
    }
    return new Response(bytes, {
      headers: {
        'Content-Type': typeof storedAsset.mediaType === 'string' ? storedAsset.mediaType : FORMAT_MEDIA_TYPES[format],
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found.', { status: 404 })
  }
}

