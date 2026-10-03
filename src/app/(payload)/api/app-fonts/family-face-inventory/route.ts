import type { AppFontFace } from '@werk1/w1-system-font-manager'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'
import { readAppFontFamilyDraft } from '@/payload/app-fonts/server/draft'

export async function GET(request: NextRequest) {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  const familyId = request.nextUrl.searchParams.get('familyId')?.trim()
  if (!familyId) return Response.json({ error: 'familyId is required.' }, { status: 400 })

  try {
    const graph = await readAppFontFamilyDraft(payload, familyId)
    const assets = new Map(graph.assets.map((asset) => [asset.assetId, asset]))
    return Response.json({
      familyId: graph.family.familyId,
      familyName: graph.family.displayName,
      faces: graph.family.faceIds.map((faceId) => {
        const face = graph.faces.find((candidate) => candidate.faceId === faceId)
        if (!face) throw new Error(`App Font face ${faceId} is missing.`)
        const asset = face.delivery.kind === 'managed-binary' ? assets.get(face.delivery.assetId) : undefined
        return toInventoryFace(face, asset ? {
          filename: asset.originalFilename,
          format: asset.format,
        } : undefined)
      }),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    payload.logger.warn({ err: error, familyId }, 'App Font family face inventory failed')
    return Response.json({ error: 'Das erkannte Face-Inventar dieser Familie konnte nicht geladen werden.' }, { status: 400 })
  }
}

function toInventoryFace(
  face: AppFontFace,
  asset?: { filename: string; format: string },
) {
  return {
    faceId: face.faceId,
    label: face.names.fullName ?? face.names.typographicSubfamily ?? face.names.subfamily,
    familyName: face.names.typographicFamily ?? face.names.family,
    weight: face.css.weight,
    style: face.css.style,
    stretch: face.css.stretch,
    variableAxes: face.metadataTrust === 'font-table' ? face.openType.variableAxes : [],
    sourceLabel: asset ? `${asset.filename} · ${asset.format.toUpperCase()}` : 'Adobe Fonts Web Project',
    metadataTrust: face.metadataTrust,
  }
}

