import { AppFontContractError } from '@werk1/w1-system-font-manager'
import { searchGoogleFontFamilies } from '@werk1/w1-system-font-manager/google-fonts'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'

export async function GET(request: NextRequest) {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  try {
    const apiKey = process.env.APP_FONTS_GOOGLE_API_KEY ?? ''
    const families = await searchGoogleFontFamilies({
      apiKey,
      query: request.nextUrl.searchParams.get('q') ?? '',
      limit: 30,
    })
    return Response.json({ families }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AppFontContractError) {
      const status = error.code === 'google_fonts_api_key' ? 503 : 400
      const message = error.code === 'google_fonts_api_key'
        ? 'Google Fonts ist noch nicht konfiguriert. Setze serverseitig APP_FONTS_GOOGLE_API_KEY und starte die App neu.'
        : error.message
      return Response.json({ error: message, code: error.code }, { status })
    }
    payload.logger.error({ err: error }, 'Google Fonts catalog request failed')
    return Response.json({ error: 'Google Fonts catalog request failed.' }, { status: 502 })
  }
}

