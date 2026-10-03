import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'
import { readVerifiedStoredAppFont } from '@/payload/app-fonts/server/storage'

export async function GET(request: NextRequest, { params }: { params: Promise<{ asset: string }> }) {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return new Response('Authentication is required.', { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return new Response('Administrator role is required.', { status: 403 })

  const { asset } = await params
  const match = /^(?<hash>[a-f0-9]{64})\.woff2$/.exec(asset)
  if (!match?.groups) return new Response('Not found.', { status: 404 })
  const result = await payload.find({
    collection: 'app-font-assets',
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    where: { 'webDerivative.sha256': { equals: match.groups.hash } },
  })
  const document = result.docs[0] as unknown as {
    webDerivative?: { storageKey?: unknown; sha256?: unknown; byteLength?: unknown; format?: unknown } | null
  } | undefined
  const derivative = document?.webDerivative
  if (
    !derivative
    || typeof derivative.storageKey !== 'string'
    || derivative.sha256 !== match.groups.hash
    || typeof derivative.byteLength !== 'number'
    || derivative.format !== 'woff2'
  ) {
    return new Response('Not found.', { status: 404 })
  }

  try {
    const bytes = await readVerifiedStoredAppFont({
      storageKey: derivative.storageKey,
      sha256: match.groups.hash,
      byteLength: derivative.byteLength,
      format: 'woff2',
    })
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'font/woff2',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    payload.logger.error({ err: error, expectedHash: match.groups.hash }, 'Draft App Font asset verification failed')
    return new Response('Draft font asset failed integrity verification.', { status: 500 })
  }
}

