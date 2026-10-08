import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { recordsToCsv } from '@werk1/w1-system-pdfedit/export'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { errorJson, loadPdfedit, loadRecords } from '@/lib/pdfedit/context'

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
  if (!id) return errorJson(400, 'INVALID_REQUEST', 'id is required.')

  const doc = await loadPdfedit(payload, id)
  if (!doc) return errorJson(404, 'NOT_FOUND', 'Pdfedit not found.')

  const records = await loadRecords(payload, doc.id)

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
