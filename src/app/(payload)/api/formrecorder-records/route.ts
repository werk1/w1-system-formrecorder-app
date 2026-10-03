import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

export const runtime = 'nodejs'

/**
 * Record persistence for the formrecorder editor. Admin-only.
 *
 * POST   { formrecorderId, record: { id?, order?, pageIndex?, name?, blocks? } }
 *        → upsert one record; returns the stored record.
 * PATCH  { formrecorderId, ids: string[] } → sets `order` to the list index.
 * DELETE { recordId } → removes a record.
 */

const unauthorized = () =>
  NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } }, { status: 401 })

async function authenticateAdmin(payload: Payload, request: NextRequest): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    return Boolean(user) && Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

type BlockEntry = { blockId: string; name?: string; text: string; edited?: boolean }

/** Coerces the incoming blocks payload into the contracted record-block shape. */
function sanitizeBlocks(raw: unknown): BlockEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: BlockEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const blockId = typeof entry.blockId === 'string' ? entry.blockId : ''
    if (!blockId || seen.has(blockId)) continue
    seen.add(blockId)
    out.push({
      blockId,
      ...(typeof entry.name === 'string' && entry.name.trim() ? { name: entry.name.trim() } : {}),
      text: typeof entry.text === 'string' ? entry.text : String(entry.text ?? ''),
      ...(entry.edited ? { edited: true } : {}),
    })
  }
  return out
}

type RecordBody = {
  formrecorderId?: string | number
  record?: { id?: string | number; order?: number; name?: string; pageIndex?: number; blocks?: unknown }
  ids?: Array<string | number>
  recordId?: string | number
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  const formrecorderId = body?.formrecorderId
  const record = body?.record
  if (formrecorderId === undefined || !record) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'formrecorderId and record are required.' } },
      { status: 400 },
    )
  }

  const data = {
    formrecorder: formrecorderId,
    order: typeof record.order === 'number' ? record.order : 0,
    name: typeof record.name === 'string' ? record.name.trim() : '',
    pageIndex: typeof record.pageIndex === 'number' ? record.pageIndex : undefined,
    blocks: sanitizeBlocks(record.blocks),
  }

  try {
    const stored = record.id
      ? await payload.update({
          collection: 'formrecords' as never,
          id: record.id,
          data: data as never,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'formrecords' as never,
          data: data as never,
          overrideAccess: true,
        })
    const doc = stored as unknown as { id: string | number }
    return NextResponse.json({ record: { ...data, id: String(doc.id) } })
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'STORE_FAILED', message: String(error instanceof Error ? error.message : error) } },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  if (body?.formrecorderId === undefined || !Array.isArray(body.ids)) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'formrecorderId and ids are required.' } },
      { status: 400 },
    )
  }

  for (const [index, id] of body.ids.entries()) {
    await payload.update({
      collection: 'formrecords' as never,
      id,
      data: { order: index } as never,
      overrideAccess: true,
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  if (body?.recordId === undefined || body.recordId === null) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'recordId is required.' } }, { status: 400 })
  }
  await payload.delete({ collection: 'formrecords' as never, id: body.recordId, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
