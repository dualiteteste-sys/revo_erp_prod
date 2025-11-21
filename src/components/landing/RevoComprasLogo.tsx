import React from 'react';

const RevoComprasLogo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 230 40"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="REVO Compras Logo"
    {...props}
  >
    <text
      x="0"
      y="30"
      fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
      fontSize="32"
      fontWeight="800"
      fill="currentColor"
      letterSpacing="0.5"
    >
      REVO
    </text>
    <text
      x="95"
      y="30"
      fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
      fontSize="32"
      fontWeight="300"
      fill="currentColor"
    >
      Compras
    </text>
  </svg>
);

export default RevoComprasLogo;
