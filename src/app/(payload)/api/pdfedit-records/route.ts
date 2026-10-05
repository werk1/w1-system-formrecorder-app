import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { sanitizeRecordBlocks } from '@werk1/w1-system-pdfedit/host'

export const runtime = 'nodejs'

/**
 * Record persistence for the pdfedit editor. Admin-only.
 *
 * POST   { pdfeditId, record: { id?, order?, pageIndex?, name?, blocks? } }
 *        → upsert one record; returns the stored record.
 * PATCH  { pdfeditId, ids: string[] } → sets `order` to the list index.
 * DELETE { recordId } → removes a record.
 */

type RecordBody = {
  pdfeditId?: string | number
  record?: { id?: string | number; order?: number; name?: string; pageIndex?: number; blocks?: unknown }
  ids?: Array<string | number>
  recordId?: string | number
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  const pdfeditId = body?.pdfeditId
  const record = body?.record
  if (pdfeditId === undefined || !record) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'pdfeditId and record are required.' } },
      { status: 400 },
    )
  }

  const data = {
    pdfedit: pdfeditId,
    order: typeof record.order === 'number' ? record.order : 0,
    name: typeof record.name === 'string' ? record.name.trim() : '',
    pageIndex: typeof record.pageIndex === 'number' ? record.pageIndex : undefined,
    blocks: sanitizeRecordBlocks(record.blocks),
  }

  try {
    const stored = record.id
      ? await payload.update({
          collection: 'pdfeditrecords' as never,
          id: record.id,
          data: data as never,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'pdfeditrecords' as never,
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
  if (body?.pdfeditId === undefined || !Array.isArray(body.ids)) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'pdfeditId and ids are required.' } },
      { status: 400 },
    )
  }

  for (const [index, id] of body.ids.entries()) {
    await payload.update({
      collection: 'pdfeditrecords' as never,
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
  await payload.delete({ collection: 'pdfeditrecords' as never, id: body.recordId, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
