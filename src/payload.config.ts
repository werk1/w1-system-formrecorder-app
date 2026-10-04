import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { FixedToolbarFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import { it } from '@payloadcms/translations/languages/it'
import { sl } from '@payloadcms/translations/languages/sl'
import os from 'os'
import path from 'path'
import { buildConfig, type CollectionConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { Users, Media, TextContent, Pages, Carousels, Flipbooks, ColorSchemes, Pdfedits, Pdfeditrecords } from './payload/collections'
import { SiteSettings } from './payload/globals'
import { TextWrapFeature } from '@/payload/lexical/text-wrap/feature.server'
import { resetInterruptedFlipbookJobs } from '@/lib/flipbook'
import { DEFAULT_COLOR_SCHEMES } from './lib/theme/colorSchemeTokens'
import { AppFontAssets, AppFontFamilies, AppFontSnapshots } from './payload/app-fonts/collections'
import { AppFontSettings } from './payload/app-fonts/globals'



export const PROJECT_LOCALES = ['de', 'en', 'si', 'it'] as const
export const DEFAULT_LOCALE = 'de' as const

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const DEFAULT_HOME_IDENTIFIER = 'w1-system-pdfedit-app-home'

function createLexicalParagraph(text: string): any {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              version: 1,
            },
          ],
          direction: null,
          textFormat: 0,
          textStyle: '',
        },
      ],
      direction: null,
    },
  }
}

async function ensureDefaultHomepage(payload: Parameters<NonNullable<Parameters<typeof buildConfig>[0]['onInit']>>[0]): Promise<void> {
  const existingHome = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      route: {
        equals: '/',
      },
    },
  })

  if ((existingHome.docs?.length ?? 0) > 0) {
    return
  }

  const existingText = await payload.find({
    collection: 'text-content',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      identifier: {
        equals: DEFAULT_HOME_IDENTIFIER,
      },
    },
  })

  if ((existingText.docs?.length ?? 0) === 0) {
    await payload.create({
      collection: 'text-content',
      data: {
        identifier: DEFAULT_HOME_IDENTIFIER,
        richTextArrayWithStyle: [
          {
            content: createLexicalParagraph('Hier entsteht w1-system-pdfedit-app ...'),
            style: 'hero1',
          },
        ],
      },
      overrideAccess: true,
    })
  }

  await payload.create({
    collection: 'pages',
    data: {
      route: '/',
      title: 'w1-system-pdfedit-app',
      sections: [
        {
          blockType: 'w1-content-section',
          key: 'section-default-home',
          sectionVariant: 'hero',
          sectionSlug: DEFAULT_HOME_IDENTIFIER,
        },
      ],
      isPublished: true,
    },
    overrideAccess: true,
  })
}

/** Creates the built-in colour schemes once, matched by their `key`. */
async function ensureDefaultColorSchemes(payload: Parameters<NonNullable<Parameters<typeof buildConfig>[0]['onInit']>>[0]): Promise<void> {
  for (const [key, scheme] of Object.entries(DEFAULT_COLOR_SCHEMES)) {
    const existing = await payload.find({
      collection: 'color-schemes',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: { key: { equals: key } },
    })
    if ((existing.docs?.length ?? 0) > 0) continue
    await payload.create({
      collection: 'color-schemes',
      data: { key, name: scheme.name, light: scheme.light, dark: scheme.dark },
      overrideAccess: true,
    })
  }
}

function readOriginList(value: string | undefined): string[] {
  return value
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : []
}

function uniqueOrigins(origins: string[]): string[] {
  return Array.from(new Set(origins))
}

const isDev = process.env.NODE_ENV !== 'production'
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || ''
const corsOrigins = uniqueOrigins([
  ...(serverURL ? [serverURL] : []),
  ...readOriginList(process.env.TICKETING_CORS_ORIGINS),
])

// Dev: jede Origin/IP akzeptieren. Wildcard CORS und CSRF aus (leere
// serverURL + leeres csrf-Array => Payload überspringt die CSRF-Prüfung,
// sodass localhost, 127.0.0.1 und jede LAN-IP funktionieren).
// Prod: strikt auf konfigurierte Origins begrenzen.
const payloadServerURL = isDev ? '' : serverURL
const payloadCors = isDev ? '*' : corsOrigins
const payloadCsrf = isDev ? [] : corsOrigins

export default buildConfig({
  serverURL: payloadServerURL,
  cors: payloadCors,
  csrf: payloadCsrf,
  graphQL: {
    disable: true,
  },
  upload: {
    // Flipbook PDFs up to 500 MB must stream to a temp file instead of RAM.
    useTempFiles: true,
    tempFileDir: path.join(os.tmpdir(), 'w1-uploads'),
  },
  onInit: async (payload) => {
    await ensureDefaultHomepage(payload)
    await resetInterruptedFlipbookJobs(payload)
    await ensureDefaultColorSchemes(payload)
  },
  i18n: {
    supportedLanguages: { de, en, sl, it },
    fallbackLanguage: 'de',
  },
  localization: {
    locales: [...PROJECT_LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    fallback: true,
  },
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      graphics: {
        Logo: './payload/components/W1Logo#W1Logo',
        Icon: './payload/components/W1Logo#W1Icon',
      },
      views: {
        pdfedit: {
          Component: './payload/components/PdfeditEditor#PdfeditEditor',
          path: '/pdfedit' as `/${string}`,
        },
      },
    },
    meta: {
      titleSuffix: ' - w1-system-pdfedit-app',
      description: 'w1-system-pdfedit-app',
    },
  },

  collections: [Users, Media, TextContent, Pages, Carousels, Flipbooks, ColorSchemes, Pdfedits, Pdfeditrecords, AppFontAssets, AppFontFamilies, AppFontSnapshots],
  globals: [SiteSettings, AppFontSettings],
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      FixedToolbarFeature(),
      TextWrapFeature(),
    ],
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || '',
  }),
  sharp,
  plugins: [],
})
