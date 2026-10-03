import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { Field } from 'payload'
import { RICHTEXT_STYLE_OPTIONS } from './richTextStyleClasses'

export const RichTextWithStyle: Field = {
  name: 'richTextWithStyle',
  type: 'group',
  label: 'Rich Text With Style',
  localized: true,
  fields: [
    { name: 'content', type: 'richText', editor: lexicalEditor({}) },
    {
      name: 'style',
      type: 'select',
      required: true,
      options: RICHTEXT_STYLE_OPTIONS,
    },
  ],
}
