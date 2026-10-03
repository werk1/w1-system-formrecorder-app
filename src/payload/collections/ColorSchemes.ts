import type { CollectionConfig, Field } from 'payload'
import { COLOR_SCHEME_TOKENS, isSafeCssValue } from '../../lib/theme/colorSchemeTokens'

function modeFields(): Field[] {
  return COLOR_SCHEME_TOKENS.map(({ key, label, hint }) => ({
    name: key,
    label,
    type: 'text',
    required: true,
    admin: hint ? { description: hint } : undefined,
    validate: (value: unknown) =>
      isSafeCssValue(value) || 'Nur Farb- oder Verlaufswerte (z. B. #3e4c59, rgba(0, 0, 0, 0.1), linear-gradient(…)).',
  }))
}

/**
 * App colour schemes. One is chosen in Site Settings (Farbschema); light and
 * dark follow the visitor's system. Edited here or live in the dev colour
 * editor of the reader (`next dev`), which saves through the REST API.
 */
export const ColorSchemes: CollectionConfig = {
  slug: 'color-schemes',
  labels: {
    singular: { de: 'Farbschema', en: 'Colour scheme' },
    plural: { de: 'Farbschemata', en: 'Colour schemes' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'updatedAt'],
    description: {
      de: 'Farben der Reader-Oberfläche. Auswahl in den Seiteneinstellungen; hell oder dunkel folgt dem System der Besucher.',
      en: 'Colours of the reader UI. Chosen in Site Settings; light or dark follows the visitor’s system.',
    },
  },
  access: {
    // Colours are public anyway (they are rendered into every page).
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'name',
      label: { de: 'Name', en: 'Name' },
      type: 'text',
      required: true,
    },
    {
      name: 'key',
      label: { de: 'Schlüssel', en: 'Key' },
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: {
          de: 'Kennung der mitgelieferten Schemata (graphite, advantage, sage, bordeaux, aubergine, terracotta); für eigene optional.',
          en: 'Identifier of the built-in schemes (graphite, advantage, sage, bordeaux, aubergine, terracotta); optional for custom ones.',
        },
      },
    },
    {
      name: 'light',
      label: { de: 'Hell', en: 'Light' },
      type: 'group',
      fields: modeFields(),
    },
    {
      name: 'dark',
      label: { de: 'Dunkel', en: 'Dark' },
      type: 'group',
      fields: modeFields(),
    },
  ],
}
