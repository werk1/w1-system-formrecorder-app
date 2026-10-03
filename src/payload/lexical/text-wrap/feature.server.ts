import { createServerFeature } from '@payloadcms/richtext-lexical'

export const TextWrapFeature = createServerFeature({
  key: 'textWrapBalance',
  feature: {
    ClientFeature:
      '@/payload/lexical/text-wrap/feature.client#TextWrapFeatureClient',
  },
})
