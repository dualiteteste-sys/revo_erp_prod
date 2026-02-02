import React from 'react';

type RevoLogoVariant = 'full' | 'icon';

type RevoLogoProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  variant?: RevoLogoVariant;
};

const RevoLogo: React.FC<RevoLogoProps> = ({ variant = 'full', className, ...rest }) => {
  const src = variant === 'icon' ? '/ultria-logo.png' : '/ultria-logo-full.png';

  return <img src={src} alt="Ultria" {...rest} className={className || 'h-8 w-auto'} />;
};

export default RevoLogo;
