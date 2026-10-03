import type { Field } from 'payload'

/**
 * Reusable spacing fields (margin + padding) for layout blocks.
 * Values are CSS strings (e.g. '16px', '1rem', '0').
 * Returns a collapsible group that can be spread into any block's fields array.
 */
export const spacingFields: Field = {
  name: 'spacing',
  type: 'group',
  admin: {
    description: 'Abstände (Margin und Padding) für diesen Block',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'marginTop',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Margin oben', width: '25%' },
        },
        {
          name: 'marginBottom',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Margin unten', width: '25%' },
        },
        {
          name: 'marginLeft',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Margin links', width: '25%' },
        },
        {
          name: 'marginRight',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Margin rechts', width: '25%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'paddingTop',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Padding oben', width: '25%' },
        },
        {
          name: 'paddingBottom',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Padding unten', width: '25%' },
        },
        {
          name: 'paddingLeft',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Padding links', width: '25%' },
        },
        {
          name: 'paddingRight',
          type: 'text',
          admin: { placeholder: 'z.B. 16px, 1rem', description: 'Padding rechts', width: '25%' },
        },
      ],
    },
  ],
}

/**
 * Extract spacing values from a block and return a CSS style object.
 * Safe to call with any block — returns empty object if no spacing is set.
 */
export interface SpacingValues {
  marginTop?: string | null
  marginBottom?: string | null
  marginLeft?: string | null
  marginRight?: string | null
  paddingTop?: string | null
  paddingBottom?: string | null
  paddingLeft?: string | null
  paddingRight?: string | null
}

export function spacingToStyle(spacing?: SpacingValues | null): React.CSSProperties {
  if (!spacing) return {}
  const style: Record<string, string> = {}
  if (spacing.marginTop) style.marginTop = spacing.marginTop
  if (spacing.marginBottom) style.marginBottom = spacing.marginBottom
  if (spacing.marginLeft) style.marginLeft = spacing.marginLeft
  if (spacing.marginRight) style.marginRight = spacing.marginRight
  if (spacing.paddingTop) style.paddingTop = spacing.paddingTop
  if (spacing.paddingBottom) style.paddingBottom = spacing.paddingBottom
  if (spacing.paddingLeft) style.paddingLeft = spacing.paddingLeft
  if (spacing.paddingRight) style.paddingRight = spacing.paddingRight
  return style
}
