'use client';
import { RICHTEXT_STYLE_OPTIONS } from '@/payload/fields/richTextStyleClasses';
import { useRichText } from '@/payload/hooks/useRichText';
import { RICHTEXT_ELEMENT_CLASSES } from '@/payload/renderer/nodes/RichTextNode';
import { RICHTEXT_CONTAINER_CLASSES, RichTextRenderer } from '@/payload/renderer/RichTextRenderer';
import { ArraySection, RichTextArrayItem, RichTextContent, SerializedLexicalNode } from '@/payload/renderer/types/richTextTypes';
import { VirtualizedRichText } from '@/payload/renderer/VirtualizedRichTextRenderer';
import { useDeviceSpecificLayoutClasses } from '@/styles/hooks/device-specific-layout-classes/useDeviceSpecificLayoutClasses';
import { usePathname } from 'next/navigation';
import textLoaderStyles from './PayloadTextContentLoader.module.css';

type RouteMapping = Record<string, string>;

/**
 * All known CSS class names used by Payload rich text rendering
 * Automatically mapped to device-specific variants for responsive styling
 */
const KNOWN_RICHTEXT_CLASSES = [
  // Element classes (from RichTextNode)
  ...RICHTEXT_ELEMENT_CLASSES,
  // Container classes (from RichTextRenderer)
  ...RICHTEXT_CONTAINER_CLASSES,
  // Style wrapper classes (from Field definitions)
  ...RICHTEXT_STYLE_OPTIONS.map(opt => opt.value),
  // Outer container
  'PayloadTextContentLoaderOuterContainer',
];

interface PayloadTextContentLoaderProps {
  contentKey?: string;
  routeMapping?: RouteMapping;
  virtualized?: boolean;
  chunkSize?: number;
  overscan?: number;
  heightVariant?: 'small' | 'medium' | 'default' | 'large' | 'full';
  singleCSSContainerClass?: string;
  textLoaderClassName?: string;
  arrayIndex?: number;
  externalCSSModule?: Record<string, string>;
  outerContainerCSSModule?: Record<string, string>;
}

export function PayloadTextContentLoader({
  contentKey,
  routeMapping,
  virtualized = true,
  chunkSize = 5,
  overscan = 2,
  heightVariant = 'default',
  singleCSSContainerClass,
  textLoaderClassName,
  arrayIndex,
  externalCSSModule,
  outerContainerCSSModule,
}: PayloadTextContentLoaderProps) {
  const pathname = usePathname();
  const key = contentKey || (routeMapping ? routeMapping[pathname || '/'] || 'kueche' : (pathname?.slice(1) || 'kueche'));
  const { content, isLoading } = useRichText(key);
  const { getDeviceSpecificClasses } = useDeviceSpecificLayoutClasses();

  // Automatic device-specific class mapping for all external CSS modules
  const deviceAwareCSS = externalCSSModule
    ? getDeviceSpecificClasses<Record<string, string>>(externalCSSModule, KNOWN_RICHTEXT_CLASSES)
    : undefined;

  if (isLoading || !content?.arrayContent) {
    if (arrayIndex !== undefined) {
      return null;
    }
    return <div>No content available</div>;
  }

  let targetContent: RichTextContent = content.arrayContent;

  if (arrayIndex !== undefined) {
    if (!Array.isArray(content.arrayContent) || content.arrayContent.length === 0) {
      return null;
    }

    if (arrayIndex >= 0 && arrayIndex < content.arrayContent.length) {
      const selectedItem = content.arrayContent[arrayIndex];
      if (selectedItem && typeof selectedItem === 'object' && 'style' in selectedItem && 'content' in selectedItem) {
        targetContent = [selectedItem] as RichTextArrayItem[];
      } else if (Array.isArray(selectedItem)) {
        targetContent = [selectedItem] as ArraySection[];
      } else {
        targetContent = [selectedItem] as SerializedLexicalNode[];
      }
    } else {
      return null;
    }
  }

  const isLargeContent = Array.isArray(targetContent) && targetContent.length > 10;
  const shouldVirtualize = virtualized && isLargeContent;

  // Handle outer container class with device-specific support
  const outerContainerClass = deviceAwareCSS?.PayloadTextContentLoaderOuterContainer
    || outerContainerCSSModule?.PayloadTextContentLoaderOuterContainer
    || textLoaderStyles.PayloadTextContentLoaderOuterContainer;

  return (
    <div className={`${outerContainerClass} ${textLoaderClassName || ''}`}>
      {shouldVirtualize ? (
        <VirtualizedRichText
          content={targetContent}
          singleCSSContainerClass={singleCSSContainerClass}
          externalCSSModule={deviceAwareCSS}
          chunkSize={chunkSize}
          overscan={overscan}
          heightVariant={heightVariant}
        />
      ) : (
        <RichTextRenderer
          content={targetContent}
          singleCSSContainerClass={singleCSSContainerClass}
          externalCSSModule={deviceAwareCSS}
        />
      )}
    </div>
  );
}


