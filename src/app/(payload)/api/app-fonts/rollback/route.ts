import { AppFontContractError } from '@werk1/w1-system-font-manager'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'
import { rollbackCurrentAppFonts } from '@/payload/app-fonts/server/rollback'

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return Response.json({ error: 'Cross-origin App Font rollback is forbidden.' }, { status: 403 })
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  try {
    const body = await request.json() as { snapshotId?: unknown }
    const snapshotId = typeof body.snapshotId === 'string' ? body.snapshotId : ''
    const snapshot = await rollbackCurrentAppFonts(payload, auth.user, snapshotId)
    return Response.json({
      snapshotId: snapshot.snapshotId,
      revision: snapshot.revision,
      integritySha256: snapshot.integritySha256,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppFontContractError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 })
    }
    payload.logger.error({ err: error }, 'App Font rollback failed')
    return Response.json({ error: 'App Font rollback failed its server-side integrity checks.' }, { status: 500 })
  }
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const expectedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
    return new URL(origin).host === expectedHost
  } catch {
    return false
  }
}

