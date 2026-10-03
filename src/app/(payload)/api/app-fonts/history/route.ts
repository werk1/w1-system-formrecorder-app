import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'

export async function GET(request: NextRequest) {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  const [settings, history] = await Promise.all([
    payload.findGlobal({ slug: 'app-font-settings', depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'app-font-snapshots',
      depth: 0,
      limit: 100,
      pagination: false,
      sort: '-revision',
      overrideAccess: true,
    }),
  ])
  const currentId = relationId((settings as unknown as { currentSnapshot?: unknown }).currentSnapshot)
  return Response.json({
    snapshots: history.docs.map((document) => ({
      snapshotId: document.snapshotId,
      revision: document.revision,
      publishedAt: document.publishedAt,
      current: String(document.id) === currentId,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

function relationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return undefined
}

