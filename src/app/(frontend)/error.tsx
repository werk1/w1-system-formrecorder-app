'use client'

import React, { useEffect } from 'react'

const h = React.createElement

type FrontendErrorProps = {
	error: Error & { digest?: string }
	reset: () => void
}

export default function FrontendError({ error, reset }: FrontendErrorProps) {
	useEffect(() => {
		console.error('Frontend route error:', error)
	}, [error])

	return h('main', {
		style: { maxWidth: 760, margin: '80px auto', padding: '0 20px', textAlign: 'center' },
		children: [
			h('h1', { key: 'title', style: { marginBottom: 10 }, children: 'Etwas ist schiefgelaufen' }),
			h('p', {
				key: 'message',
				style: { color: '#666', marginBottom: 24 },
				children: 'Beim Laden der Seite ist ein Fehler aufgetreten.',
			}),
			h('button', {
				key: 'action',
				type: 'button',
				onClick: reset,
				style: {
					padding: '10px 16px',
					borderRadius: 6,
					border: '1px solid #111',
					background: '#111',
					color: '#fff',
					cursor: 'pointer',
				},
				children: 'Neu laden',
			}),
		],
	})
}
