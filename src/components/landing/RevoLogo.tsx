import React from 'react';

const RevoLogo: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => (
  <img
    src="/ultria-logo.png"
    alt="Ultria"
    {...props}
    className={props.className || "h-8 w-auto"}
  />
);

export default RevoLogo;
