import {
  generateInterBuiltinCss,
  getInterBuiltinSnapshotEntry,
} from '@werk1/w1-system-font-manager/builtins/inter'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { readCurrentAppFontSnapshot } from '@/payload/app-fonts/server/readPublished'

export async function GET() {
  const payload = await getPayloadClient()
  const document = await readCurrentAppFontSnapshot(payload)
  const css = typeof document?.css === 'string'
    ? document.css
    : generateInterBuiltinCss({ includeDefaultRoles: true })
  const manifest = document?.manifest && typeof document.manifest === 'object'
    ? document.manifest as { integritySha256?: unknown }
    : null
  const integritySha256 = typeof manifest?.integritySha256 === 'string'
    ? manifest.integritySha256
    : getInterBuiltinSnapshotEntry().integritySha256
  const etag = `"${integritySha256}"`

  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      ...(etag ? { ETag: etag } : {}),
    },
  })
}

