import { AppFontContractError } from '@werk1/w1-system-font-manager'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'
import { publishCurrentAppFonts } from '@/payload/app-fonts/server/publish'

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin App Font publication is forbidden.' }, { status: 403 })
  }

  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  try {
    const result = await publishCurrentAppFonts(payload, auth.user)
    return Response.json({
      snapshotId: result.snapshot.snapshotId,
      revision: result.snapshot.revision,
      integritySha256: result.snapshot.integritySha256,
    }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof AppFontContractError) {
      return Response.json({ error: error.message, code: error.code, issues: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'App Font publication failed.'
    const status = /duplicate|E11000|write conflict/i.test(message) ? 409 : 500
    payload.logger.error({ err: error }, 'App Font publication failed')
    return Response.json({
      error: status === 409
        ? 'A concurrent App Font publish won. Reload and publish again.'
        : 'App Font publication failed its server-side integrity checks.',
    }, { status })
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

