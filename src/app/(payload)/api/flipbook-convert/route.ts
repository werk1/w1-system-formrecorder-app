import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import {
  enqueueFlipbookConversion,
  isFlipbookJobActive,
  relationId,
  stampOfMedia,
} from '@/lib/flipbook'

export const runtime = 'nodejs'

/**
 * Admin-only entry for restarting a flipbook conversion.
 *
 * GET  ?flipbookId=… → status snapshot (status, progress, error, sourceChanged)
 * POST { flipbookId } → enqueues a (re)conversion of the current sourcePdf.
 *      Idempotent: an already published revision produces no new pages.
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

type FlipbookLike = {
  id: string | number
  sourcePdf?: unknown
  sourceStamp?: unknown
  status?: unknown
  progress?: unknown
  errorMessage?: unknown
  pageCount?: unknown
  publishedRevision?: unknown
}

async function loadFlipbook(payload: Payload, id: string): Promise<FlipbookLike | null> {
  return (await payload
    .findByID({ collection: 'flipbooks' as never, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as FlipbookLike | null
}

async function sourceChanged(payload: Payload, flipbook: FlipbookLike): Promise<boolean> {
  const sourceId = relationId(flipbook.sourcePdf)
  if (!sourceId || typeof flipbook.sourceStamp !== 'string' || !flipbook.sourceStamp) return false
  const media = (await payload
    .findByID({ collection: 'media', id: sourceId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Parameters<typeof stampOfMedia>[0] | null
  return media ? stampOfMedia(media) !== flipbook.sourceStamp : false
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const id = request.nextUrl.searchParams.get('flipbookId')
  const flipbook = id ? await loadFlipbook(payload, id) : null
  if (!flipbook) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Flipbook not found.' } }, { status: 404 })
  }

  return NextResponse.json({
    status: flipbook.status ?? 'idle',
    progress: flipbook.progress ?? null,
    errorMessage: flipbook.errorMessage ?? null,
    pageCount: flipbook.pageCount ?? null,
    hasPublishedRevision: Boolean(flipbook.publishedRevision),
    jobActive: isFlipbookJobActive(flipbook.id),
    sourceChanged: await sourceChanged(payload, flipbook),
  })
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as { flipbookId?: string | number } | null
  const id = body?.flipbookId
  if (id === undefined || id === null || id === '') {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'flipbookId is required.' } }, { status: 400 })
  }

  const flipbook = await loadFlipbook(payload, String(id))
  if (!flipbook) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Flipbook not found.' } }, { status: 404 })
  }
  if (!relationId(flipbook.sourcePdf)) {
    return NextResponse.json({ error: { code: 'NO_SOURCE', message: 'Flipbook has no PDF source.' } }, { status: 422 })
  }

  const { result } = enqueueFlipbookConversion(payload, flipbook.id, { rejectIfRunning: true })
  if (result === 'already-running') {
    return NextResponse.json(
      { error: { code: 'ALREADY_RUNNING', message: 'A conversion is already running for this flipbook.' } },
      { status: 409 },
    )
  }
  return NextResponse.json({ status: result }, { status: 202 })
}
