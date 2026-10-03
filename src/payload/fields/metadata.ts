import { Field } from 'payload'

export const metadata: Field = {
    name: 'metadata',
    type: 'group',
    localized: true,
    fields: [
        { name: 'metaTitle', type: 'text' },
        { name: 'metaDescription', type: 'textarea' },
        {
            name: 'keywords',
            type: 'array',
            fields: [{ name: 'keyword', type: 'text' }],
        },
    ],
}


