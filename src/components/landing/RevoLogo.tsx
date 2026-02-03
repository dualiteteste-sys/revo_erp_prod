import React from 'react';

type RevoLogoVariant = 'full' | 'icon';

type RevoLogoProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  variant?: RevoLogoVariant;
};

const RevoLogo: React.FC<RevoLogoProps> = ({ variant = 'full', className, ...rest }) => {
  const src = variant === 'icon' ? '/ultria-logo.png' : '/ultria-logo-full.png';

  // Default size tuned for app
  return <img src={src} alt="Ultria" {...rest} className={className || 'h-10 w-auto scale-95'} />;
};

export default RevoLogo;
