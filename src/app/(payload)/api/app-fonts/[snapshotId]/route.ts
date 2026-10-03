import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { readAppFontSnapshotByPublicId } from '@/payload/app-fonts/server/readPublished'

export async function GET(_request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId: rawSnapshotId } = await params
  if (!rawSnapshotId.endsWith('.css')) return new Response('Not found.', { status: 404 })
  const snapshotId = rawSnapshotId.slice(0, -4)
  if (!/^appfont_[a-f0-9]{24}$/.test(snapshotId)) return new Response('Not found.', { status: 404 })

  const payload = await getPayloadClient()
  const document = await readAppFontSnapshotByPublicId(payload, snapshotId)
  if (!document || typeof document.css !== 'string') return new Response('Not found.', { status: 404 })

  return new Response(document.css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

