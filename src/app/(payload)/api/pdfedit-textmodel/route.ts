import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { editTextModel, TextModelEditError } from '@/lib/pdfedit/textModelEdit'
import type { TextModelOp } from '@/lib/pdfedit/textModelEdit'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { errorJson } from '@/lib/pdfedit/context'

export const runtime = 'nodejs'

/**
 * Text block merging for the pdfedit editor. Admin-only.
 *
 * POST { pdfeditId, op: 'merge', blockIds } | { pdfeditId, op: 'split', blockId }
 *    → { changed } — the number of merged or split groups.
 */
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) {
    return unauthorized()
  }
  const body = (await request.json().catch(() => null)) as ({ pdfeditId?: string | number } & Partial<TextModelOp>) | null
  const valid =
    body?.pdfeditId !== undefined &&
    ((body.op === 'merge' && Array.isArray(body.blockIds) && body.blockIds.every((id) => typeof id === 'string')) ||
      (body.op === 'split' && typeof body.blockId === 'string'))
  if (!body || !valid) {
    return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and a valid op are required.')
  }
  try {
    const { pdfeditId, ...op } = body
    return NextResponse.json(await editTextModel(payload, pdfeditId as string | number, op as TextModelOp))
  } catch (error) {
    if (error instanceof TextModelEditError) return errorJson(error.code === 'NOT_FOUND' ? 404 : 409, error.code, error.message)
    return errorJson(500, 'FAILED', String(error instanceof Error ? error.message : error))
  }
}
