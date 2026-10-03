import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { Field } from 'payload'
import { RICHTEXT_STYLE_OPTIONS } from './richTextStyleClasses'

export const RichTextArrayWithStyle: Field = {
  name: 'richTextArrayWithStyle',
  type: 'array',
  label: 'Rich Text Array With Style',
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
