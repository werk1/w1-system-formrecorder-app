// _eFlyerLogo.tsx - Simple eFlyer logo component like WERK1Logo
import React from 'react';
import EFlyerSvg from './assets/eFlyer.svg';

interface _eFlyerLogoProps {
    width?: number;
}

const eFlyerLogo: React.FC<_eFlyerLogoProps> = ({ width = 60 }) => {
    const SvgComponent =
        typeof EFlyerSvg === 'function'
            ? (EFlyerSvg as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>)
            : null;

    const svgSrc =
        typeof EFlyerSvg === 'string'
            ? EFlyerSvg
            : EFlyerSvg &&
                  typeof EFlyerSvg === 'object' &&
                  'src' in EFlyerSvg &&
                  typeof (EFlyerSvg as { src?: unknown }).src === 'string'
                ? (EFlyerSvg as { src: string }).src
                : null;

    if (SvgComponent) {
        return (
            <SvgComponent
                style={{ width: `${width}px`, height: 'auto' }}
                className="eflyer-logo"
            />
        );
    }

    if (!svgSrc) return null;

    return (
        <img
            src={svgSrc}
            alt="eFlyer Logo"
            style={{ width: `${width}px`, height: 'auto' }}
            className="eflyer-logo"
        />
    )
};

export default eFlyerLogo;
