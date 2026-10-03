/**
 * @fileoverview VirtualizedRichText Component
 */

import React, { useEffect, useRef, useState } from 'react';
import { RichTextRenderer } from './RichTextRenderer';
import styles from './styles/VirtualizedRichTextRenderer.module.css';
import { RichTextContent } from './types/richTextTypes';

interface VirtualizedRichTextProps {
  content: RichTextContent;
  singleCSSContainerClass?: string;
  externalCSSModule?: typeof styles;
  onError?: (error: Error) => void;
  chunkSize?: number;
  overscan?: number;
  heightVariant?: 'small' | 'medium' | 'default' | 'large' | 'full';
}

export const VirtualizedRichText: React.FC<VirtualizedRichTextProps> = ({
  content,
  singleCSSContainerClass,
  externalCSSModule,
  onError,
  chunkSize = 5,
  overscan = 2,
  heightVariant = 'default',
}) => {
  // Use W1Block pattern: Complete CSS module replacement if externalCSSModule is provided
  const activeStyles = externalCSSModule || styles;

  const [visibleChunks, setVisibleChunks] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const contentChunks = React.useMemo(() => {
    if (!Array.isArray(content)) return [];
    const chunks: RichTextContent[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    return chunks;
  }, [content, chunkSize]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const newVisibleChunks = new Set(visibleChunks);
        entries.forEach((entry) => {
          const chunkIndex = parseInt(entry.target.getAttribute('data-chunk-index') || '0');
          if (entry.isIntersecting) {
            for (let i = Math.max(0, chunkIndex - overscan); i <= Math.min(contentChunks.length - 1, chunkIndex + overscan); i++) {
              newVisibleChunks.add(i);
            }
          }
        });
        setVisibleChunks(Array.from(newVisibleChunks));
      },
      {
        root: containerRef.current,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    chunkRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [contentChunks.length, overscan, visibleChunks]);

  const setChunkRef = (index: number) => (element: HTMLDivElement | null) => {
    if (element) {
      chunkRefs.current.set(index, element);
    } else {
      chunkRefs.current.delete(index);
    }
  };

  const getContainerClass = () => {
    switch (heightVariant) {
      case 'small': return activeStyles.virtualizedContainerSmall;
      case 'medium': return activeStyles.virtualizedContainerMedium;
      case 'large': return activeStyles.virtualizedContainerLarge;
      case 'full': return activeStyles.virtualizedContainerFull;
      default: return '';
    }
  };

  const getPlaceholderClass = (chunkIndex: number) => {
    const chunk = contentChunks[chunkIndex];
    if (!chunk || !Array.isArray(chunk) || chunk.length === 0) return activeStyles.placeholderDefault;
    const firstItem = chunk[0];
    if (typeof firstItem === 'object' && 'style' in firstItem) {
      const style = (firstItem as any).style as string | undefined;
      if (style?.includes('heading') || style?.includes('hero')) return activeStyles.placeholderLarge;
      else if (style?.includes('copy') || style?.includes('paragraph')) return activeStyles.placeholderMedium;
    }
    return activeStyles.placeholderDefault;
  };

  useEffect(() => {
    if (contentChunks.length > 0 && visibleChunks.length === 0) {
      const initialChunks = Array.from({ length: Math.min(3, contentChunks.length) }, (_, i) => i);
      setVisibleChunks(initialChunks);
    }
  }, [contentChunks.length, visibleChunks.length]);

  if (!content || !Array.isArray(content) || content.length === 0) {
    return <div>No content to display</div>;
  }

  return (
    <div className={`${activeStyles.virtualizedContainer} ${getContainerClass()} ${singleCSSContainerClass || ''}`} ref={containerRef}>
      {contentChunks.map((chunk, chunkIndex) => {
        const isVisible = visibleChunks.includes(chunkIndex);
        if (!isVisible) {
          return (
            <div
              key={`placeholder-${chunkIndex}`}
              ref={setChunkRef(chunkIndex)}
              className={`${activeStyles.placeholder} ${getPlaceholderClass(chunkIndex)}`}
              data-chunk-index={chunkIndex}
            />
          );
        }
        return (
          <div key={`chunk-${chunkIndex}`} ref={setChunkRef(chunkIndex)} className={activeStyles.contentChunk} data-chunk-index={chunkIndex}>
            <RichTextRenderer content={chunk} singleCSSContainerClass={singleCSSContainerClass} externalCSSModule={externalCSSModule} onError={onError} />
          </div>
        );
      })}
    </div>
  );
};


