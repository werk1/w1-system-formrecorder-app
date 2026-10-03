import { getInterBuiltinAsset } from '@werk1/w1-system-font-manager/builtins/inter'
import { readInterBuiltinAsset } from '@werk1/w1-system-font-manager/builtins/inter/server'

const FORMAT_MEDIA_TYPES: Record<string, string> = {
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset: assetFileName } = await params
  const match = /^(?<assetId>inter-(?:web|original)-[a-z0-9-]+)\.(?<format>ttf|otf|woff|woff2)$/.exec(assetFileName)
  if (!match?.groups) return new Response('Not found.', { status: 404 })

  const asset = getInterBuiltinAsset(match.groups.assetId)
  if (!asset || asset.format !== match.groups.format) return new Response('Not found.', { status: 404 })

  try {
    const loaded = await readInterBuiltinAsset(asset.assetId)
    return new Response(Buffer.from(loaded.bytes), {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(loaded.bytes.byteLength),
        'Content-Type': FORMAT_MEDIA_TYPES[asset.format] ?? asset.mediaType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found.', { status: 404 })
  }
}
