// W1_SystemLogo.tsx - Simple W1 System logo component like WERK1Logo
import React from 'react';
import W1SystemSvg from './assets/W1System.svg';

interface W1SystemLogoProps {
    width?: number;
}

const W1SystemLogo: React.FC<W1SystemLogoProps> = ({ width = 60 }) => {
    const SvgComponent =
        typeof W1SystemSvg === 'function'
            ? (W1SystemSvg as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>)
            : null;

    const svgSrc =
        typeof W1SystemSvg === 'string'
            ? W1SystemSvg
            : W1SystemSvg &&
                  typeof W1SystemSvg === 'object' &&
                  'src' in W1SystemSvg &&
                  typeof (W1SystemSvg as { src?: unknown }).src === 'string'
                ? (W1SystemSvg as { src: string }).src
                : null;

    if (SvgComponent) {
        return (
            <SvgComponent
                style={{ width: `${width}px`, height: 'auto' }}
                className="w1-system-logo"
            />
        );
    }

    if (!svgSrc) return null;

    return (
        <img
            src={svgSrc}
            alt="W1 System Logo"
            style={{ width: `${width}px`, height: 'auto' }}
            className="w1-system-logo"
        />
    )
};

export default W1SystemLogo;
