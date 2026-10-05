import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Payload } from 'payload'

/** Admin check shared by the pdfedit endpoints: a logged-in user with the `admin` role. */
export async function authenticateAdmin(payload: Payload, request: NextRequest): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    return Boolean(user) && Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

export const unauthorized = () =>
  NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } }, { status: 401 })
