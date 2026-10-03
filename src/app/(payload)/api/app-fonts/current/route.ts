import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { publishedManifest, readCurrentAppFontSnapshot } from '@/payload/app-fonts/server/readPublished'

export async function GET() {
  const payload = await getPayloadClient()
  const document = await readCurrentAppFontSnapshot(payload)
  const manifest = document ? publishedManifest(document) : null

  if (!manifest) {
    return Response.json({ snapshot: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  return Response.json({ snapshot: manifest }, {
    headers: {
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
      ETag: `"${manifest.integritySha256}"`,
    },
  })
}

