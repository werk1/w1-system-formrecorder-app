import { headers } from 'next/headers'
import type { Payload } from 'payload'
import type { W1FlipbookInput } from '@werk1/w1-system-flipbook/types'

/**
 * Viewer features a flipbook can switch off for its readers
 * (`defaultConfig.allowSearch` / `allowTextSelect`). Admins keep both: the
 * switches only take the functions away from the public frontend.
 */

/** Whether the request comes from a logged-in user with the `admin` role. */
export async function isAdminRequest(payload: Payload, requestHeaders?: Headers): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: requestHeaders ?? (await headers()) })
    return Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

/** For admins: search and text selection on, whatever the flipbook says. */
export function withAdminFeatures(input: W1FlipbookInput | null, admin: boolean): W1FlipbookInput | null {
  if (!input || !admin) return input
  return { ...input, config: { ...input.config, allowSearch: true, allowTextSelect: true } }
}
