import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { searchPublishedFlipbook } from '@/lib/flipbook/search'
import { isAdminRequest } from '@/lib/blocks/flipbook/viewerAccess'

export const runtime = 'nodejs'

/**
 * Public full-text search of a published flipbook (reader search).
 *
 * GET ?slug=<flipbook slug>&q=<query> → { hits: [{ pageIndex, snippet, rect? }] }
 * An empty `q` answers 200 `{ hits: [] }` for a searchable flipbook and 404
 * otherwise: the reader probes with it to decide whether to show its search.
 *
 * Only published flipbooks are searchable and only hits (page, snippet, block
 * rect) leave the server — never the text model. A flipbook with
 * `defaultConfig.allowSearch` off answers 404 (as not searchable) to everyone
 * but admins.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')?.trim() ?? ''
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'slug is required.' } }, { status: 400 })
  }
  // A one-character query finds nothing useful; an empty one is the reader's availability probe.
  const effective = query.length < 2 ? '' : query
  const payload = await getPayload({ config: configPromise })
  try {
    const admin = await isAdminRequest(payload, request.headers)
    const hits = await searchPublishedFlipbook(payload, slug, effective, { admin })
    if (hits === null) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Flipbook not found.' } }, { status: 404 })
    // An admin answer may carry what the public one must not: never in a shared cache.
    return NextResponse.json({ hits }, { headers: { 'Cache-Control': admin ? 'private, no-store' : 'public, max-age=60' } })
  } catch (error) {
    payload.logger.error(`flipbook-search failed: ${String(error)}`)
    return NextResponse.json({ error: { code: 'FAILED', message: 'Search failed.' } }, { status: 500 })
  }
}
