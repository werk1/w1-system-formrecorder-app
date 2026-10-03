import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { Field } from 'payload'

export const RichText: Field = {
    name: 'richText',
    type: 'group',
    label: 'Rich Text',
    localized: true,
    fields: [
        { name: 'content', type: 'richText', required: false, editor: lexicalEditor({}) },
    ],
}


