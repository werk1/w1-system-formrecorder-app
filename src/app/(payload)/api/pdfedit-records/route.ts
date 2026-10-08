import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { errorJson, loadPdfedit } from '@/lib/pdfedit/context'
import type { IdLike } from '@/lib/pdfedit/context'
import { relationId } from '@/lib/flipbook'
import { sanitizeRecordBlocks } from '@werk1/w1-system-pdfedit/host'

export const runtime = 'nodejs'

/**
 * Record persistence for the pdfedit editor. Admin-only. Every call names its
 * pdfedit, and only records of that pdfedit are read or changed.
 *
 * POST   { pdfeditId, record: { id?, order?, pageIndex?, name?, blocks? } }
 *        → upsert one record; returns the stored record.
 * PATCH  { pdfeditId, ids: string[] } → sets `order` to the list index (only where it changes).
 * DELETE { pdfeditId, recordId } → removes a record.
 */

type RecordBody = {
  pdfeditId?: string | number
  record?: { id?: string | number; order?: number; name?: string; pageIndex?: number; blocks?: unknown }
  ids?: Array<string | number>
  recordId?: string | number
}

/** The record when it exists and belongs to the pdfedit, else `null`. */
async function ownRecord(payload: Payload, pdfeditId: IdLike, recordId: IdLike): Promise<{ id: IdLike } | null> {
  const record = (await payload
    .findByID({ collection: 'pdfeditrecords' as never, id: recordId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: IdLike; pdfedit?: unknown } | null
  return record && String(relationId(record.pdfedit)) === String(pdfeditId) ? record : null
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  const pdfeditId = body?.pdfeditId
  const record = body?.record
  if (pdfeditId === undefined || pdfeditId === null || pdfeditId === '' || !record) {
    return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and record are required.')
  }

  const data = {
    order: typeof record.order === 'number' ? record.order : 0,
    name: typeof record.name === 'string' ? record.name.trim() : '',
    pageIndex: typeof record.pageIndex === 'number' ? record.pageIndex : undefined,
    blocks: sanitizeRecordBlocks(record.blocks),
  }

  try {
    let stored: unknown
    if (record.id) {
      // An update never moves a record to another pdfedit.
      if (!(await ownRecord(payload, pdfeditId, record.id))) return errorJson(404, 'NOT_FOUND', 'Record not found in this pdfedit.')
      stored = await payload.update({ collection: 'pdfeditrecords' as never, id: record.id, data: data as never, overrideAccess: true })
    } else {
      if (!(await loadPdfedit(payload, pdfeditId))) return errorJson(404, 'NOT_FOUND', 'Pdfedit not found.')
      stored = await payload.create({ collection: 'pdfeditrecords' as never, data: { ...data, pdfedit: pdfeditId } as never, overrideAccess: true })
    }
    const doc = stored as { id: string | number }
    return NextResponse.json({ record: { ...data, pdfedit: pdfeditId, id: String(doc.id) } })
  } catch (error) {
    return errorJson(500, 'STORE_FAILED', String(error instanceof Error ? error.message : error))
  }
}

export async function PATCH(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  if (body?.pdfeditId === undefined || !Array.isArray(body.ids)) {
    return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and ids are required.')
  }

  // Only records of this pdfedit, and only those whose position changes.
  const { docs } = await payload.find({
    collection: 'pdfeditrecords' as never,
    where: { and: [{ pdfedit: { equals: body.pdfeditId } }, { id: { in: body.ids } }] } as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const current = new Map((docs as unknown as Array<{ id: IdLike; order?: unknown }>).map((d) => [String(d.id), d.order]))
  for (const [index, id] of body.ids.entries()) {
    if (!current.has(String(id)) || current.get(String(id)) === index) continue
    await payload.update({ collection: 'pdfeditrecords' as never, id, data: { order: index } as never, overrideAccess: true })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as RecordBody | null
  if (body?.pdfeditId === undefined || body.recordId === undefined || body.recordId === null) {
    return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and recordId are required.')
  }
  if (!(await ownRecord(payload, body.pdfeditId, body.recordId))) return errorJson(404, 'NOT_FOUND', 'Record not found in this pdfedit.')
  await payload.delete({ collection: 'pdfeditrecords' as never, id: body.recordId, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
