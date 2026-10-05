import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { recordsToCsv } from '@werk1/w1-system-pdfedit/export'
import type { W1PdfEditRecord } from '@werk1/w1-system-pdfedit/types'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'

export const runtime = 'nodejs'

/**
 * Ordered record export of a pdfedit document. Admin-only.
 *
 * GET ?id=<pdfeditId>&format=csv|json&delimiter=;|,&bom=0
 * csv (default): RFC 4180 via `recordsToCsv` from the package — same
 * serializer the editor preview uses. json: records in export order.
 */

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'id is required.' } }, { status: 400 })
  }

  const doc = (await payload
    .findByID({ collection: 'pdfedits' as never, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: string | number; slug?: unknown; title?: unknown; schema?: Array<Record<string, unknown>> | null } | null
  if (!doc) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Pdfedit not found.' } }, { status: 404 })
  }

  const { docs } = await payload.find({
    collection: 'pdfeditrecords' as never,
    where: { pdfedit: { equals: doc.id } } as never,
    sort: 'order',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const records = (docs as unknown as Array<Record<string, unknown>>).map(
    (r): W1PdfEditRecord => ({
      id: String(r.id),
      order: typeof r.order === 'number' ? r.order : 0,
      ...(typeof r.name === 'string' && r.name ? { name: r.name } : {}),
      pageIndex: typeof r.pageIndex === 'number' ? r.pageIndex : undefined,
      blocks: Array.isArray(r.blocks) ? (r.blocks as W1PdfEditRecord['blocks']) : [],
    }),
  )

  const format = request.nextUrl.searchParams.get('format') ?? 'csv'
  const base = typeof doc.slug === 'string' && doc.slug ? doc.slug : `pdfedit-${doc.id}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify(records, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${base}.json"`,
      },
    })
  }

  const delimiter = request.nextUrl.searchParams.get('delimiter')
  const csv = recordsToCsv(records, {
    delimiter: delimiter === ',' || delimiter === '\t' ? delimiter : ';',
    bom: request.nextUrl.searchParams.get('bom') !== '0',
  })
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${base}.csv"`,
    },
  })
}
