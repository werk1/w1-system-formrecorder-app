import Link from 'next/link'

export default function FrontendNotFound() {
	return (
		<main style={{ maxWidth: 760, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
			<h1 style={{ marginBottom: 10 }}>Seite nicht gefunden</h1>
			<p style={{ color: '#666', marginBottom: 24 }}>
				Die angeforderte Route existiert nicht oder ist nicht veröffentlicht.
			</p>
			<Link
				href="/"
				style={{
					display: 'inline-block',
					padding: '10px 16px',
					borderRadius: 6,
					border: '1px solid #111',
					background: '#111',
					color: '#fff',
					textDecoration: 'none',
				}}
			>
				Zur Startseite
			</Link>
		</main>
	)
}
