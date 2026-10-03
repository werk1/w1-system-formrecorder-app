import { languageLabels, supportedLanguages, type LanguageCode } from '@/config/languages'

type LanguageHeaderProps = {
  path: string
  locale: LanguageCode
}

export function LanguageHeader({ path, locale }: LanguageHeaderProps) {
  const normalizedPath = path.length > 0 ? path : '/'

  const hrefForLocale = (target: LanguageCode): string => {
    const [pathname, hash = ''] = normalizedPath.split('#')
    const [basePath, rawQuery = ''] = pathname.split('?')
    const params = new URLSearchParams(rawQuery)
    params.set('locale', target)
    const query = params.toString()
    const hashSuffix = hash ? `#${hash}` : ''

    return query.length > 0 ? `${basePath}?${query}${hashSuffix}` : `${basePath}${hashSuffix}`
  }

  return (
    <header style={{ position: 'fixed', top: 12, right: 12, zIndex: 2000 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(0,0,0,0.08)',
          fontSize: 13,
        }}
      >
        {supportedLanguages.map((code) => {
          const isActive = code === locale
          const label = languageLabels[code] ?? code

          return (
            <a
              key={code}
              href={hrefForLocale(code)}
              style={{
                textDecoration: 'none',
                color: isActive ? '#111' : '#555',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label}
            </a>
          )
        })}
      </div>
    </header>
  )
}
