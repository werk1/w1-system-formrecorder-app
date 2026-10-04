import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { editTextModel, TextModelEditError } from '@/lib/pdfedit/textModelEdit'
import type { TextModelOp } from '@/lib/pdfedit/textModelEdit'

export const runtime = 'nodejs'

/**
 * Text block merging for the pdfedit editor. Admin-only.
 *
 * POST { pdfeditId, op: 'merge', blockIds } | { pdfeditId, op: 'split', blockId }
 *    | { pdfeditId, op: 'auto', pageIndex }
 *    → { changed } — the number of merged or split groups.
 */
async function authenticateAdmin(payload: Payload, request: NextRequest): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    return Boolean(user) && Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as ({ pdfeditId?: string | number } & Partial<TextModelOp>) | null
  const valid =
    body?.pdfeditId !== undefined &&
    ((body.op === 'merge' && Array.isArray(body.blockIds) && body.blockIds.every((id) => typeof id === 'string')) ||
      (body.op === 'split' && typeof body.blockId === 'string') ||
      (body.op === 'auto' && typeof body.pageIndex === 'number'))
  if (!body || !valid) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'pdfeditId and a valid op are required.' } }, { status: 400 })
  }
  try {
    const { pdfeditId, ...op } = body
    return NextResponse.json(await editTextModel(payload, pdfeditId as string | number, op as TextModelOp))
  } catch (error) {
    if (error instanceof TextModelEditError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 409
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status })
    }
    return NextResponse.json({ error: { code: 'FAILED', message: String(error instanceof Error ? error.message : error) } }, { status: 500 })
  }
}
