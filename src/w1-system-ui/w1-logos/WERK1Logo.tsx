// WERK1Logo.tsx - Clean WERK1 logo component
import React from 'react';
import WERK1LogoSvg from './assets/WERK1Logo.svg';

interface WERK1LogoProps {
    width?: number;
}

const WERK1Logo: React.FC<WERK1LogoProps> = ({ width = 32 }) => {
    const SvgComponent =
        typeof WERK1LogoSvg === 'function'
            ? (WERK1LogoSvg as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>)
            : null;

    const svgSrc =
        typeof WERK1LogoSvg === 'string'
            ? WERK1LogoSvg
            : WERK1LogoSvg &&
                  typeof WERK1LogoSvg === 'object' &&
                  'src' in WERK1LogoSvg &&
                  typeof (WERK1LogoSvg as { src?: unknown }).src === 'string'
                ? (WERK1LogoSvg as { src: string }).src
                : null;

    if (SvgComponent) {
        return (
            <SvgComponent
                style={{ width: `${width}px`, height: 'auto' }}
                className="w1-logo"
            />
        );
    }

    if (!svgSrc) return null;

    return (
        <img
            src={svgSrc}
            alt="WERK1 Logo"
            style={{ width: `${width}px`, height: 'auto' }}
            className="w1-logo"
        />
    );
};

export default WERK1Logo
