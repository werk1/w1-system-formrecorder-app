import type { ArrayFieldValidation, GlobalConfig, TextFieldValidation } from 'payload'
import { isAppFontRoleKey } from '@werk1/w1-system-font-manager'

import { appFontAdminAccess, denyAppFontFieldAccess } from '../access'

const SYSTEM_ROLE_OPTIONS = [
  { label: 'Primary – Hauptschrift', value: 'primary' },
  { label: 'Secondary – Zweitschrift', value: 'secondary' },
  { label: 'Display – Auszeichnungsschrift', value: 'display' },
  { label: 'Mono – Monospace-Schrift', value: 'mono' },
  { label: 'Benutzerdefinierte Rolle', value: 'custom' },
]

const SYSTEM_ROLE_KEYS = new Set(['primary', 'secondary', 'display', 'mono'])

const validateCustomRoleKey: TextFieldValidation = (value, { siblingData }) => {
  const row = asRecord(siblingData)
  if (row.roleSelection !== 'custom') return true
  if (typeof value !== 'string' || !isAppFontRoleKey(value)) {
    return 'Der eigene Rollen-Key muss mit einem Kleinbuchstaben beginnen, höchstens 48 Zeichen lang sein und darf nur a–z, 0–9 und _ enthalten.'
  }
  if (SYSTEM_ROLE_KEYS.has(value)) {
    return 'Primary, Secondary, Display und Mono müssen direkt im Rollen-Dropdown gewählt werden.'
  }
  return true
}

const validateRoleRows: ArrayFieldValidation = (value) => {
  if (!Array.isArray(value)) return true
  const rows = value.map((entry) => asRecord(entry))
  const resolvedKeys = rows
    .map((entry) => resolveRoleKey(entry))
    .filter((entry): entry is string => Boolean(entry))
  if (new Set(resolvedKeys).size !== resolvedKeys.length) {
    return 'Jede semantische Fontrolle darf nur einmal zugewiesen werden.'
  }
  if (rows.some((row) => {
    const selection = asRecord(row.faceSelection)
    return selection.all === false
      && (!Array.isArray(selection.faceIds) || selection.faceIds.length === 0)
  })) {
    return 'Mindestens ein erkannter Font-Schnitt muss ausgewählt sein.'
  }
  return true
}

export const AppFontSettings: GlobalConfig = {
  slug: 'app-font-settings',
  label: 'App-Font-Einstellungen',
  admin: {
    group: 'App Fonts',
    components: {
      elements: {
        Description: './payload/app-fonts/components/AppFontPageDescriptions#AppFontSettingsDescription',
      },
    },
  },
  access: {
    read: appFontAdminAccess,
    update: appFontAdminAccess,
  },
  fields: [
    {
      name: 'importAction',
      type: 'ui',
      admin: {
        components: {
          Field: './payload/app-fonts/components/AppFontImportAction#AppFontImportAction',
        },
      },
    },
    {
      name: 'roles',
      type: 'array',
      label: 'Semantische Fontrollen',
      labels: { singular: 'Fontrolle', plural: 'Fontrollen' },
      admin: {
        description: 'Nur Primary ist erforderlich. Jede Rolle erhält eine Familie, einen Standardschnitt und eine klare Auswahl der veröffentlichten Font-Schnitte. Ohne Secondary übernimmt Secondary automatisch Primary. Familien-Fallbacks ergänzen fehlende Glyphen; die Weight-Ersetzungen behandeln ausschließlich fehlende Schriftsärken.',
      },
      validate: validateRoleRows,
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'roleSelection',
              type: 'select',
              label: 'Rolle',
              required: true,
              options: SYSTEM_ROLE_OPTIONS,
              admin: {
                width: '40%',
                description: 'Systemrollen werden ausgewählt und nicht eingetippt.',
              },
            },
            {
              name: 'family',
              type: 'relationship',
              label: 'Fontfamilie',
              relationTo: 'app-font-families',
              required: true,
              filterOptions: { status: { equals: 'ready' } },
              admin: {
                width: '60%',
                description: 'Dieser Rolle kann jede bereite Upload- oder Adobe-Fontfamilie zugewiesen werden.',
              },
            },
          ],
        },
        {
          name: 'customRoleKey',
          type: 'text',
          label: 'Eigener Rollen-Key',
          validate: validateCustomRoleKey,
          admin: {
            condition: (_, siblingData) => siblingData?.roleSelection === 'custom',
            description: 'Nur für eigene Rollen, zum Beispiel editorial oder navigation. Der CSS-Vertrag lautet dann --fontfamily_<key>.',
          },
        },
        {
          name: 'fallbackFamilies',
          type: 'relationship',
          label: 'Fallback-Familien',
          relationTo: 'app-font-families',
          hasMany: true,
          filterOptions: { status: { equals: 'ready' } },
          admin: {
            description: 'Optionale geordnete Fallback-Kette vor dem automatischen System-Fallback Inter.',
          },
        },
        {
          name: 'systemFallbackPreview',
          type: 'ui',
          admin: {
            components: {
              Field: './payload/app-fonts/components/AppFontSystemFallbackHint#AppFontSystemFallbackHint',
            },
          },
        },
        {
          name: 'genericFallback',
          type: 'select',
          label: 'Generischer Fallback',
          hasMany: true,
          required: true,
          defaultValue: ['system-ui', 'sans-serif'],
          options: ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'defaultWeight',
              type: 'number',
              label: 'Standard-Weight',
              required: true,
              defaultValue: 400,
              min: 1,
              max: 1000,
              admin: { description: 'Weight, das Komponenten ohne eigene Angabe verwenden. Es muss vorhanden oder durch die Weight-Ersetzung auflösbar sein.' },
            },
            {
              name: 'defaultStyle',
              type: 'select',
              label: 'Standard-Stil',
              required: true,
              defaultValue: 'normal',
              options: [
                { label: 'Normal', value: 'normal' },
                { label: 'Kursiv', value: 'italic' },
                { label: 'Schräg', value: 'oblique' },
              ],
            },
            {
              name: 'defaultStretch',
              type: 'number',
              label: 'Standard-Stretch',
              required: true,
              defaultValue: 100,
              min: 1,
              max: 1000,
              admin: { description: '100 entspricht der normalen Laufweite.' },
            },
          ],
        },
        {
          type: 'collapsible',
          label: 'Font-Schnitte',
          admin: {
            initCollapsed: true,
            description: 'Enthält alle analysierten statischen und variablen Schnitte dieser Familie. Bei großen Fontfamilien bleibt die lange Liste zunächst eingeklappt.',
          },
          fields: [
            {
              name: 'faceSelection',
              type: 'json',
              label: 'Auswahl der Font-Schnitte',
              defaultValue: { all: true, faceIds: [] },
              admin: {
                description: '„Alle“ wählt das vollständige analysierte Font-Set. Alternativ können die tatsächlich benötigten statischen oder variablen Schnitte direkt abgewählt werden.',
                components: {
                  Field: './payload/app-fonts/components/AppFontRoleFaceFields#AppFontRolePublishedFacesField',
                },
              },
            },
          ],
        },
        {
          name: 'weightSubstitutions',
          type: 'json',
          label: 'Ersetzungen für fehlende Weights',
          defaultValue: [],
          admin: {
            description: 'Nur fehlende Standard-Weights 100–900 werden angezeigt. Die nächstgelegenen vorhandenen Weights sind vorausgefüllt und können geändert werden. Style, Stretch und Variable-Font-Achsen werden niemals ersetzt.',
            components: {
              Field: './payload/app-fonts/components/AppFontRoleFaceFields#AppFontRoleWeightSubstitutionsField',
            },
          },
        },
        {
          name: 'targets',
          type: 'select',
          label: 'Einsatzbereiche',
          hasMany: true,
          required: true,
          defaultValue: ['web', 'admin-preview', 'renderer', 'pdf'],
          admin: {
            description: 'Allgemeine Einsatzbereiche dieser Rolle. Für serverseitige Artefakte müssen die benötigten Server-/Renderer-/PDF-Bereiche ausdrücklich veröffentlicht und durch die Fontlizenz erlaubt sein.',
          },
          options: [
            { label: 'Web', value: 'web' },
            { label: 'Admin-Vorschau', value: 'admin-preview' },
            { label: 'Server', value: 'server' },
            { label: 'Renderer', value: 'renderer' },
            { label: 'PDF', value: 'pdf' },
          ],
        },
        {
          name: 'fontSynthesis',
          type: 'select',
          label: 'Browser-Synthese',
          required: true,
          defaultValue: 'forbid',
          options: [
            { label: 'Verbieten – nur veröffentlichte oder zugewiesene Weights', value: 'forbid' },
            { label: 'Nur im Web erlauben – Browser darf einen Schnitt simulieren', value: 'allow-web-only' },
          ],
          admin: {
            description: 'Für reproduzierbare Typografie wird „Verbieten“ empfohlen. Renderer und PDF verwenden niemals Browser-Synthese.',
          },
        },
      ],
    },
    {
      name: 'publishAction',
      type: 'ui',
      admin: {
        components: {
          Field: './payload/app-fonts/components/AppFontPublishAction#AppFontPublishAction',
        },
      },
    },
    {
      name: 'currentSnapshot',
      type: 'relationship',
      relationTo: 'app-font-snapshots',
      label: 'Aktives Font-Set',
      access: { update: denyAppFontFieldAccess },
      admin: {
        readOnly: true,
        description: 'Unveränderliche veröffentlichte Revision, welche die Anwendung derzeit ausliefert.',
      },
    },
  ],
}

function resolveRoleKey(row: Record<string, unknown>): string | undefined {
  if (typeof row.roleSelection !== 'string') return undefined
  if (row.roleSelection !== 'custom') return SYSTEM_ROLE_KEYS.has(row.roleSelection) ? row.roleSelection : undefined
  return typeof row.customRoleKey === 'string' && isAppFontRoleKey(row.customRoleKey)
    ? row.customRoleKey
    : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
