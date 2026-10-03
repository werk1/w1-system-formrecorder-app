import type { Access, FieldAccess, PayloadRequest } from 'payload'

type RoleUser = {
  roles?: string[] | null
}

export function hasAppFontAdminRole(user: unknown): boolean {
  return Boolean(
    user &&
      typeof user === 'object' &&
      Array.isArray((user as RoleUser).roles) &&
      (user as RoleUser).roles?.includes('admin'),
  )
}

export const appFontAdminAccess: Access = ({ req }) => hasAppFontAdminRole(req.user)
export const appFontAdminPanelAccess = ({ req }: { req: PayloadRequest }): boolean => hasAppFontAdminRole(req.user)
export const appFontAdminFieldAccess: FieldAccess = ({ req }) => hasAppFontAdminRole(req.user)
export const denyAppFontAccess: Access = () => false
export const denyAppFontFieldAccess: FieldAccess = () => false

