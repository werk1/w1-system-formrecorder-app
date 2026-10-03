import { analyzeAppFontBinary } from '@werk1/w1-system-font-manager/analysis'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
} from 'payload'

import { appFontAdminAccess, appFontAdminPanelAccess, denyAppFontAccess, denyAppFontFieldAccess } from '../access'
import { APP_FONT_DERIVATIVE_CONTEXT_KEY, APP_FONT_IMPORT_CONTEXT_KEY } from '../constants'
import { createStoredAppFontWebDerivative } from '../server/createWebDerivative'

const APP_FONT_STORAGE_ROOT = path.resolve(process.cwd(), 'app-font-assets')

const analyzeUploadedFont: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  const file = req.file

  if (operation === 'create' && !file) {
    throw new APIError('A font binary is required.', 400)
  }
  if (operation === 'update' && file) {
    throw new APIError('App Font binaries are immutable. Upload a new asset instead of replacing this file.', 400)
  }

  const actorId = req.user?.id == null ? undefined : String(req.user.id)
  const now = new Date().toISOString()
  const nextData = { ...(data ?? {}) }

  if (file?.data) {
    try {
      const analysis = analyzeAppFontBinary({
        bytes: file.data,
        originalFilename: file.name,
        declaredMediaType: file.mimetype,
      })

      if (analysis.format !== 'ttf' && analysis.format !== 'otf') {
        throw new APIError('Upload an original TTF or OTF font. WOFF2 is generated automatically.', 400)
      }

      const trustedImport = asRecord(req.context[APP_FONT_IMPORT_CONTEXT_KEY])
      const trustedSource = asRecord(trustedImport.source)
      nextData.source = {
        ...(Object.keys(trustedSource).length > 0 ? trustedSource : { type: 'payload-upload' }),
        importedAt: now,
        ...(actorId ? { importedBy: actorId } : {}),
      }
      nextData.status = 'analyzing'
      nextData.sha256 = analysis.sha256
      nextData.format = analysis.format
      nextData.verifiedMediaType = analysis.mediaType
      nextData.byteLength = analysis.byteLength
      nextData.analysisVersion = analysis.analysisVersion
      nextData.analysis = analysis
      // Optional Payload groups must be absent until they contain data. Passing
      // `null` reaches Payload's nested field traversal as an object and causes
      // child validation (for example `webDerivative.format`) to dereference
      // `null` during create.
      delete nextData.webDerivative
      delete nextData.rejection
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Font analysis failed.'
      throw new APIError(message, 400)
    }
  }

  if (nextData.license && typeof nextData.license === 'object') {
    const trustedImport = asRecord(req.context[APP_FONT_IMPORT_CONTEXT_KEY])
    const trustedDecisionSource = trustedImport.licenseDecisionSource === 'license-record'
      ? 'license-record'
      : 'manual-review'
    nextData.license = {
      ...(nextData.license as Record<string, unknown>),
      decisionSource: trustedDecisionSource,
      reviewedAt: now,
      ...(actorId ? { reviewedBy: actorId } : {}),
    }
  }

  return nextData
}

const createWebDerivative: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || req.context[APP_FONT_DERIVATIVE_CONTEXT_KEY] === true) return doc

  const document = doc as Record<string, unknown>
  const storageRoot = APP_FONT_STORAGE_ROOT
  const filename = typeof document.filename === 'string' ? document.filename : ''
  const sourcePath = path.resolve(storageRoot, filename)

  try {
    if (!filename || path.basename(filename) !== filename || !sourcePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error('Stored App Font source filename is invalid.')
    }
    const sourceBytes = req.file?.data ?? await readFile(sourcePath)
    const createdAt = typeof document.createdAt === 'string' ? document.createdAt : new Date().toISOString()
    const { derivative, analysis } = await createStoredAppFontWebDerivative({ sourceBytes, storageRoot, createdAt })
    return await req.payload.update({
      collection: 'app-font-assets',
      id: doc.id,
      data: {
        status: 'ready',
        webDerivative: { ...derivative, analysis },
      },
      context: { [APP_FONT_DERIVATIVE_CONTEXT_KEY]: true },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WOFF2 derivative generation failed.'
    req.payload.logger.error({ err: error, appFontAssetId: doc.id }, 'App Font WOFF2 derivative generation failed')
    return await req.payload.update({
      collection: 'app-font-assets',
      id: doc.id,
      data: {
        status: 'rejected',
        rejection: { code: 'woff2_derivative_failed', message },
      },
      context: { [APP_FONT_DERIVATIVE_CONTEXT_KEY]: true },
      overrideAccess: true,
      req,
    })
  }
}

export const AppFontAssets: CollectionConfig = {
  slug: 'app-font-assets',
  labels: {
    singular: 'App-Font-Asset',
    plural: 'App-Font-Assets',
  },
  admin: {
    group: 'App Fonts',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'status', 'format', 'sha256', 'updatedAt'],
    components: {
      Description: './payload/app-fonts/components/AppFontPageDescriptions#AppFontAssetsDescription',
    },
  },
  access: {
    admin: appFontAdminPanelAccess,
    create: appFontAdminAccess,
    read: appFontAdminAccess,
    update: appFontAdminAccess,
    delete: denyAppFontAccess,
  },
  upload: {
    staticDir: APP_FONT_STORAGE_ROOT,
    pasteURL: false,
    bulkUpload: false,
    mimeTypes: [
      'font/ttf',
      'font/otf',
      'application/font-sfnt',
      'application/octet-stream',
    ],
  },
  hooks: {
    beforeValidate: [analyzeUploadedFont],
    afterChange: [createWebDerivative],
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Geprüfte Fontdaten',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'uploaded',
          options: ['uploaded', 'analyzing', 'ready', 'rejected', 'retired'],
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true },
        },
        {
          name: 'sha256',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'format',
              type: 'select',
              required: true,
              options: ['ttf', 'otf', 'woff', 'woff2'],
              access: { update: denyAppFontFieldAccess },
              admin: { readOnly: true, width: '25%' },
            },
            {
              name: 'verifiedMediaType',
              type: 'text',
              required: true,
              access: { update: denyAppFontFieldAccess },
              admin: { readOnly: true, width: '35%' },
            },
            {
              name: 'byteLength',
              type: 'number',
              required: true,
              access: { update: denyAppFontFieldAccess },
              admin: { readOnly: true, width: '20%' },
            },
            {
              name: 'analysisVersion',
              type: 'text',
              required: true,
              access: { update: denyAppFontFieldAccess },
              admin: { readOnly: true, width: '20%' },
            },
          ],
        },
        {
          name: 'analysis',
          type: 'json',
          required: true,
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true },
        },
        {
          name: 'source',
          type: 'json',
          required: true,
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true },
        },
        {
          name: 'webDerivative',
          type: 'group',
          access: { update: denyAppFontFieldAccess },
          admin: {
            readOnly: true,
            description: 'Automatically generated, hash-addressed WOFF2 delivery. The uploaded source remains unchanged.',
          },
          fields: [
            { name: 'format', type: 'text' },
            { name: 'mediaType', type: 'text' },
            { name: 'byteLength', type: 'number' },
            { name: 'sha256', type: 'text', index: true },
            { name: 'storageKey', type: 'text' },
            { name: 'sourceSha256', type: 'text' },
            { name: 'analysisVersion', type: 'text' },
            {
              name: 'converter',
              type: 'group',
              fields: [
                { name: 'name', type: 'text' },
                { name: 'version', type: 'text' },
              ],
            },
            { name: 'createdAt', type: 'date' },
            { name: 'analysis', type: 'json' },
          ],
        },
        {
          name: 'rejection',
          type: 'group',
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true },
          fields: [
            { name: 'code', type: 'text' },
            { name: 'message', type: 'textarea' },
          ],
        },
      ],
    },
    {
      name: 'license',
      type: 'group',
      label: 'License decision',
      fields: [
        {
          name: 'licenseReference',
          type: 'text',
          label: 'License reference',
          admin: { description: 'Document, URL or contract reference reviewed for this exact font asset.' },
        },
        {
          type: 'row',
          fields: [
            { name: 'webUseAllowed', type: 'checkbox', defaultValue: false },
            { name: 'serverUseAllowed', type: 'checkbox', defaultValue: false },
            { name: 'pdfEmbeddingAllowed', type: 'checkbox', defaultValue: false },
            { name: 'redistributionAllowed', type: 'checkbox', defaultValue: false },
          ],
        },
        {
          name: 'decisionSource',
          type: 'text',
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true, hidden: true },
        },
        {
          name: 'reviewedAt',
          type: 'date',
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true, hidden: true },
        },
        {
          name: 'reviewedBy',
          type: 'text',
          access: { update: denyAppFontFieldAccess },
          admin: { readOnly: true, hidden: true },
        },
      ],
    },
  ],
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

