import { AppFontContractError, getPublishedAppFontRoleFaceIds } from '@werk1/w1-system-font-manager'
import { publishAppFontSnapshot } from '@werk1/w1-system-font-manager/publisher'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'
import { APP_FONT_ENGINE_VERSION, APP_FONT_PROJECT_ID } from '@/payload/app-fonts/constants'
import { readAppFontDraft } from '@/payload/app-fonts/server/draft'
import { verifyAppFontDraftGraph } from '@/payload/app-fonts/server/storage'

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return Response.json({ error: 'Cross-origin App Font preview is forbidden.' }, { status: 403 })
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  try {
    const graph = await verifyAppFontDraftGraph(await readAppFontDraft(payload))
    const now = new Date().toISOString()
    const { snapshot, css } = publishAppFontSnapshot({
      projectId: APP_FONT_PROJECT_ID,
      revision: 1,
      createdAt: now,
      publishedAt: now,
      engineVersion: APP_FONT_ENGINE_VERSION,
      ...graph,
    }, {
      assetBasePath: '/api/app-font-draft-assets',
    })
    return Response.json({
      snapshotId: snapshot.snapshotId,
      css: scopePreviewCss(css),
      roles: snapshot.roles.map((role) => role.roleKey),
      fontSetRoles: snapshot.roles.map((role) => {
        const family = snapshot.families.find((candidate) => candidate.familyId === role.familyId)
        if (!family) throw new Error(`App Font family ${role.familyId} is missing from the preview snapshot.`)
        const publishedFaceIds = new Set(getPublishedAppFontRoleFaceIds(role, family))
        return {
          roleKey: role.roleKey,
          roleLabel: role.label,
          familyName: family.displayName,
          publishesAllFaces: role.publishedFaces.mode === 'all-family-faces',
          faces: family.faceIds.map((faceId) => {
            const face = snapshot.faces.find((candidate) => candidate.faceId === faceId)
            if (!face) throw new Error(`App Font face ${faceId} is missing from the preview snapshot.`)
            return {
              faceId,
              label: face.names.fullName ?? face.names.typographicSubfamily ?? face.names.subfamily,
              weight: face.css.weight,
              style: face.css.style,
              stretch: face.css.stretch,
              variableAxes: face.metadataTrust === 'font-table' ? face.openType.variableAxes : [],
              published: publishedFaceIds.has(faceId),
            }
          }),
          weightSubstitutions: role.weightSubstitutions,
        }
      }),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AppFontContractError) {
      return Response.json({ error: error.message, code: error.code, issues: error.issues }, { status: 400 })
    }
    payload.logger.error({ err: error }, 'App Font Draft preview failed')
    return Response.json({ error: 'App Font preview failed its server-side integrity checks.' }, { status: 500 })
  }
}

function scopePreviewCss(css: string): string {
  return css.replaceAll('html:root', '#w1-app-font-draft-preview')
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

