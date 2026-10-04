import { withPayload } from '@payloadcms/next/withPayload'
import path from 'path'

const parseAllowedOriginHost = (value) => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return new URL(trimmed).hostname
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '')
      || null
  }
}

const isDev = process.env.NODE_ENV !== 'production'

const allowedDevOrigins = Array.from(
  new Set(
    [
      // In development, accept ANY LAN address. Next.js matches dev origins by
      // dot-separated segments, so *.*.*.* matches every IPv4 address (one
      // * per octet). Without this, accessing the dev server via an IP blocks
      // the HMR websocket and the client-side React app never hydrates.
      ...(isDev ? ['*.*.*.*'] : []),
      parseAllowedOriginHost(process.env.NEXT_PUBLIC_SERVER_URL),
      ...(process.env.NEXT_ALLOWED_DEV_ORIGINS ?? '')
        .split(',')
        .map(parseAllowedOriginHost),
      ...(process.env.DEV_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(parseAllowedOriginHost),
    ].filter(Boolean),
  ),
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins,
  outputFileTracingExcludes: {
    '/*': [
      './.git/**/*',
      './.env*',
      './.codex-*.log',
      './.next/cache/**/*',
      './mongo-data/**/*',
      './node_modules/**/.cache/**/*',
    ],
  },
  // The standalone tracer (@vercel/nft) statically analyzes require()/import
  // calls to decide which node_modules files to copy into
  // .next/standalone/node_modules. It misses some real dependencies:
  // - @werk1/w1-system-font-manager is externalized (serverExternalPackages
  //   below), so its own dist/assets and its runtime deps (fflate, fontkit,
  //   woff2-encode-wasm) are never seen by webpack and must be traced
  //   explicitly.
  // - fontkit depends on @swc/helpers, whose ESM helpers (e.g.
  //   esm/_ts_decorate.js) re-export from tslib via `export ... from`. The
  //   tracer does not reliably follow that re-export syntax, so tslib and
  //   @swc/helpers must be included explicitly or the standalone server
  //   fails at runtime with "Cannot find package 'tslib'".
  // - fontkit's own runtime dependency closure (brotli, clone, dfa,
  //   fast-deep-equal, restructure, unicode-properties, unicode-trie,
  //   tiny-inflate, base64-js) lives in sibling node_modules packages, not
  //   inside node_modules/fontkit itself, so a glob on fontkit/**/* alone
  //   does not cover them. unicode-properties in particular ships an ESM
  //   build (dist/module.mjs) with plain `import ... from` statements the
  //   tracer still misses, causing "Cannot find package 'base64-js'" at
  //   runtime unless these are included explicitly too.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/@werk1/w1-system-font-manager/assets/inter/**/*',
      './node_modules/@werk1/w1-system-font-manager/dist/**/*',
      './node_modules/fflate/**/*',
      './node_modules/fontkit/**/*',
      './node_modules/woff2-encode-wasm/**/*',
      './node_modules/tslib/**/*',
      './node_modules/@swc/helpers/**/*',
      './node_modules/brotli/**/*',
      './node_modules/clone/**/*',
      './node_modules/dfa/**/*',
      './node_modules/fast-deep-equal/**/*',
      './node_modules/restructure/**/*',
      './node_modules/unicode-properties/**/*',
      './node_modules/unicode-trie/**/*',
      './node_modules/tiny-inflate/**/*',
      './node_modules/base64-js/**/*',
    ],
  },
  transpilePackages: [
    '@werk1/w1-system-calendar',
    '@werk1/w1-system-carouselblock',
    '@werk1/w1-system-device-info',
    '@werk1/w1-system-flipbook',
    '@werk1/w1-system-pdfedit',
    '@werk1/w1-system-gsap-gesture',
    '@werk1/w1-system-gsap-scroll',
    '@werk1/w1-system-imageblock',
    '@werk1/w1-system-media-manager',
    '@werk1/w1-system-timeline-engine',
    '@werk1/w1-system-ui',
    '@werk1/w1-system-widgets',
  ],
  turbopack: {
    root: path.resolve(process.cwd(), '..'),
  },
  reactStrictMode: true,
  devIndicators: false,
  images: {
    qualities: [75, 85, 90, 95],
  },
  async headers() {
    return [
      {
        source: '/api/media/file/:file(fb-.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ]
  },
  serverExternalPackages: ['@werk1/w1-system-font-manager', 'woff2-encode-wasm'],
  webpack(config) {
    config.experiments = {
      ...(config.experiments ?? {}),
      asyncWebAssembly: true,
    }
    config.snapshot = {
      ...(config.snapshot ?? {}),
      managedPaths: [
        ...(config.snapshot?.managedPaths ?? []),
        /^(.+?[\\/]mongo-data)([\\/].*)?$/,
      ],
    }
    config.watchOptions = {
      ...(config.watchOptions ?? {}),
      ignored: [
        path.resolve(process.cwd(), 'mongo-data'),
        `${path.resolve(process.cwd(), 'mongo-data')}/**`,
        '**/mongo-data/**',
        ...(Array.isArray(config.watchOptions?.ignored) ? config.watchOptions.ignored : []),
      ],
    }
    config.resolve = config.resolve ?? {}
    config.resolve.modules = [
      path.resolve(process.cwd(), 'node_modules'),
      ...(config.resolve.modules ?? ['node_modules']),
    ]
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })
    if (config.name === 'server') {
      config.externals = config.externals || []
      config.externals.push(({ request }, callback) => {
        if (request && request.startsWith('@werk1/w1-system-font-manager')) {
          return callback(null, `commonjs ${request}`)
        }
        callback()
      })
    }
    return config
  },
}

export default withPayload(nextConfig)
