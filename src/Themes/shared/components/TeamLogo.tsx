// Team logo that fades to the team's flag and back every 3 s (global, synced
// clock — see hooks/logoFlagSwitch.ts). Drop-in for the plain team-logo
// <img>/<image> every theme used to render: all other props pass straight
// through to the single element, so sizing/classes are unchanged. Teams
// without a real flag render exactly the logo, as before.

import React, { useEffect, useState } from 'react';
import { useLogoFlagSwitch } from '../hooks/logoFlagSwitch';

type Src = string | null | undefined;

interface LogoFlagProps {
  /** The team logo URL (`team.teamLogo`). */
  logo?: Src;
  /** The team flag URL (`team.teamFlag`); empty/default = no switching. */
  flag?: Src;
  /** Shown when the logo is empty or fails to load. */
  fallback?: string;
}

/** Logo with fallback: the fallback on an empty logo, and after a load error. */
function useLogoSrc(logo: Src, fallback?: string) {
  const primary = logo || fallback || '';
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { setFailed(null); }, [primary]);
  const src = failed === primary && fallback ? fallback : primary;
  const onLogoError = () => { if (fallback && src !== fallback) setFailed(primary); };
  return { src, onLogoError };
}

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & LogoFlagProps;

export const TeamLogo: React.FC<ImgProps> = ({ logo, flag, fallback, onError, alt = '', ...rest }) => {
  const { ref, flagSrc, dropFlag } = useLogoFlagSwitch<HTMLImageElement>(flag);
  const { src, onLogoError } = useLogoSrc(logo, fallback);
  return (
    <img
      {...rest}
      ref={ref}
      alt={alt}
      src={flagSrc || src || undefined}
      onError={(e) => {
        if (flagSrc) { dropFlag(); return; }
        onLogoError();
        onError?.(e);
      }}
    />
  );
};

type SvgImageProps = Omit<React.SVGProps<SVGImageElement>, 'href' | 'ref'> & LogoFlagProps & {
  /** Element to render — e.g. `motion.image` for an animated logo. Default `<image>`. */
  as?: React.ElementType;
  [key: string]: unknown;
};

export const TeamLogoSvg: React.FC<SvgImageProps> = ({ logo, flag, fallback, onError, as: As = 'image', ...rest }) => {
  const { ref, flagSrc, dropFlag } = useLogoFlagSwitch<SVGImageElement>(flag);
  const { src, onLogoError } = useLogoSrc(logo, fallback);
  return (
    <As
      {...rest}
      ref={ref}
      href={flagSrc || src || undefined}
      onError={(e: React.SyntheticEvent<SVGImageElement, Event>) => {
        if (flagSrc) { dropFlag(); return; }
        onLogoError();
        (onError as ((ev: React.SyntheticEvent<SVGImageElement, Event>) => void) | undefined)?.(e);
      }}
    />
  );
};
