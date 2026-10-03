import { APIError, type CollectionConfig } from 'payload'

import { appFontAdminAccess, appFontAdminPanelAccess, denyAppFontAccess, denyAppFontFieldAccess } from '../access'
import { APP_FONT_PUBLISH_CONTEXT_KEY } from '../constants'

export const AppFontSnapshots: CollectionConfig = {
  slug: 'app-font-snapshots',
  labels: {
    singular: 'Veröffentlichtes Font-Set',
    plural: 'Veröffentlichte Font-Sets',
  },
  admin: {
    group: 'App Fonts',
    useAsTitle: 'snapshotId',
    defaultColumns: ['revision', 'snapshotId', 'publishedAt', 'publishedBy'],
    components: {
      Description: './payload/app-fonts/components/AppFontPageDescriptions#AppFontSnapshotsDescription',
    },
  },
  access: {
    admin: appFontAdminPanelAccess,
    create: denyAppFontAccess,
    read: appFontAdminAccess,
    update: denyAppFontAccess,
    delete: denyAppFontAccess,
  },
  hooks: {
    beforeChange: [({ context, operation }) => {
      if (operation !== 'create' || context[APP_FONT_PUBLISH_CONTEXT_KEY] !== true) {
        throw new APIError('App Font snapshots are immutable and can only be created by the publisher.', 403)
      }
    }],
    beforeDelete: [() => {
      throw new APIError('Published App Font snapshots cannot be deleted.', 403)
    }],
  },
  fields: [
    { name: 'snapshotId', type: 'text', required: true, unique: true, index: true },
    { name: 'revision', type: 'number', required: true, unique: true, index: true },
    { name: 'integritySha256', type: 'text', required: true, unique: true, index: true },
    { name: 'publishedAt', type: 'date', required: true },
    { name: 'publishedBy', type: 'relationship', relationTo: 'users', required: true },
    { name: 'css', type: 'textarea', required: true, admin: { readOnly: true } },
    { name: 'manifest', type: 'json', required: true, admin: { readOnly: true } },
    {
      name: 'assetHashes',
      type: 'array',
      required: true,
      access: { update: denyAppFontFieldAccess },
      admin: { readOnly: true },
      fields: [{ name: 'hash', type: 'text', required: true, index: true }],
    },
    {
      name: 'serverAssetHashes',
      type: 'array',
      required: true,
      access: { update: denyAppFontFieldAccess },
      admin: {
        readOnly: true,
        description: 'Private Original-Asset-Hashes für serverseitige Renderer-Resolver. Diese Liste wird nie öffentlich ausgeliefert.',
      },
      fields: [{ name: 'hash', type: 'text', required: true, index: true }],
    },
  ],
}

