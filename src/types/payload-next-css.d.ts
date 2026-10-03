declare module '@payloadcms/next/css' {
  const css: string
  export default css
}

declare module '*.png' {
  const src: import('next/image').StaticImageData
  export default src
}

declare module '*.jpg' {
  const src: import('next/image').StaticImageData
  export default src
}

declare module '*.jpeg' {
  const src: import('next/image').StaticImageData
  export default src
}

declare module '*.webp' {
  const src: import('next/image').StaticImageData
  export default src
}

declare module '*.gif' {
  const src: import('next/image').StaticImageData
  export default src
}

declare module '*.avif' {
  const src: import('next/image').StaticImageData
  export default src
}

declare module '*.svg' {
  import type * as React from 'react'
  const Component: React.FC<React.SVGProps<SVGSVGElement>>
  export default Component
}
