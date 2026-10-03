import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import {
  backfillVideoOptimization,
  isVideoOptimizationBackfillRunning,
} from '@/lib/video-optimization'

export const runtime = 'nodejs'

/**
 * Admin-only trigger for the video optimization backfill — the deployment
 * counterpart to `npm run backfill:videos`. The standalone production image
 * does not ship the scripts/ folder or the payload CLI, so on a published
 * site the backfill runs inside the app process via this route.
 *
 * GET  → status overview (counts per optimization status, running flag)
 * POST → starts the backfill fire-and-forget (?force=true re-encodes
 *        already-optimized documents); progress lands in the app logs and
 *        on the media documents themselves.
 */

async function authenticateAdmin(
  payload: Payload,
  request: NextRequest,
): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    const roles = (user as { roles?: string[] } | null)?.roles
    return Boolean(user) && Boolean(roles?.includes('admin'))
  } catch {
    return false
  }
}

type StatusCounts = {
  total: number
  ready: number
  processing: number
  failed: number
  skipped: number
  unprocessed: number
}

async function collectStatusCounts(payload: Payload): Promise<StatusCounts> {
  const { docs } = await payload.find({
    collection: 'media',
    where: { mediaType: { equals: 'video' } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const counts: StatusCounts = {
    total: docs.length,
    ready: 0,
    processing: 0,
    failed: 0,
    skipped: 0,
    unprocessed: 0,
  }

  for (const doc of docs) {
    const status = (doc as { videoOptimization?: { status?: unknown } | null })
      .videoOptimization?.status

    if (status === 'ready') counts.ready += 1
    else if (status === 'processing') counts.processing += 1
    else if (status === 'failed') counts.failed += 1
    else if (status === 'skipped') counts.skipped += 1
    else counts.unprocessed += 1
  }

  return counts
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })

  if (!(await authenticateAdmin(payload, request))) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } },
      { status: 401 },
    )
  }

  return NextResponse.json(
    {
      backfillRunning: isVideoOptimizationBackfillRunning(),
      counts: await collectStatusCounts(payload),
    },
    { status: 200 },
  )
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })

  if (!(await authenticateAdmin(payload, request))) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } },
      { status: 401 },
    )
  }

  if (isVideoOptimizationBackfillRunning()) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_RUNNING',
          message: 'A video optimization backfill is already running.',
        },
      },
      { status: 409 },
    )
  }

  const force = request.nextUrl.searchParams.get('force') === 'true'
  const counts = await collectStatusCounts(payload)

  // Fire-and-forget like the upload hook and the IDML import jobs: encodes
  // can outlast any request timeout. Progress is visible in the app logs and
  // per document in the admin; GET on this route shows the running flag.
  void backfillVideoOptimization(payload, { force }).catch((error) => {
    payload.logger.error(
      `videoOptimization: backfill via API failed: ${String(error)}`,
    )
  })

  return NextResponse.json(
    {
      status: 'started',
      force,
      counts,
    },
    { status: 202 },
  )
}
