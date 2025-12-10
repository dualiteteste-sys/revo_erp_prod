import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tipo_embalagem } from '../../types/database.types';

const BoxIcon = () => (
  <svg viewBox="0 0 150 120" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(5.5, -11) scale(0.9)">
      <g>
        {/* Box body */}
        <g stroke="#94a3b8" strokeWidth="1" strokeLinejoin="round">
          <path d="M75 20L125 45L75 70L25 45L75 20Z" fill="#f8fafc" />
          <path d="M25 45V95L75 120V70L25 45Z" fill="#e2e8f0" />
          <path d="M125 45V95L75 120V70L125 45Z" fill="#cbd5e1" />
        </g>

        {/* Dimension lines and labels */}
        <g fill="#9ca3af" fontSize="12" fontWeight="400" fontFamily="sans-serif">
          {/* Altura (A) */}
          <g>
            <g stroke="#9ca3af" strokeWidth="1" fill="none">
              <path d="M15 45V95" />
              <path d="M12 45H18" />
              <path d="M12 95H18" />
            </g>
            <text x="5" y="70" dominantBaseline="middle" textAnchor="middle">A</text>
          </g>

          {/* Largura (L) - Moved */}
          <g transform="translate(-8, 8)">
            <g stroke="#9ca3af" strokeWidth="1" fill="none">
              <path d="M25 100L75 125" />
              <path d="M22 98L28 102" />
              <path d="M72 123L78 127" />
            </g>
            <text x="43" y="120" dominantBaseline="middle" textAnchor="middle">L</text>
          </g>

          {/* Comprimento (C) - Moved */}
          <g transform="translate(14, 12)">
            <g stroke="#9ca3af" strokeWidth="1" fill="none">
              <path d="M75 125L125 100" />
              <path d="M122 98L128 102" />
            </g>
            <text x="107" y="120" dominantBaseline="middle" textAnchor="middle">C</text>
          </g>
        </g>
      </g>
    </g>
  </svg>
);

const EnvelopeIcon = () => (
  <svg viewBox="0 0 150 120" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(-15, -8)">
      <g>
        <rect x="20" y="35" width="110" height="50" fill="url(#envelopeBody)" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M20 35 L 75 60 L 130 35" fill="url(#envelopeFlap)" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
      </g>

      {/* Linhas de dimensão e legendas (mais finas) */}
      <g stroke="#9ca3af" strokeWidth="1">
        {/* Largura (L) */}
        <path d="M20 95 H 130" />
        <path d="M20 92 V 98" />
        <path d="M130 92 V 98" />

        {/* Comprimento (A) */}
        <path d="M140 35 V 85" />
        <path d="M137 35 H 143" />
        <path d="M137 85 H 143" />
      </g>
      <g fill="#9ca3af" fontSize="12" fontWeight="400" fontFamily="sans-serif">
        <text x="75" y="107" dominantBaseline="middle" textAnchor="middle">L</text>
        <text x="150" y="60" dominantBaseline="middle" textAnchor="middle">C</text>
      </g>
    </g>
    <defs>
      <linearGradient id="envelopeBody" x1="75" y1="35" x2="75" y2="85" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f1f5f9" />
        <stop offset="1" stopColor="#e2e8f0" />
      </linearGradient>
      <linearGradient id="envelopeFlap" x1="75" y1="35" x2="75" y2="60" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f8fafc" />
        <stop offset="1" stopColor="#f1f5f9" />
      </linearGradient>
    </defs>
  </svg>
);

const CylinderIcon = () => (
  <svg viewBox="0 0 150 120" xmlns="http://www.w3.org/2000/svg">
    {/* Scale down and re-center, preserving the downward shift */}
    <g transform="translate(15, 17) scale(0.8)">
      <defs>
        <linearGradient id="cylinderGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <g>
        <rect x="35" y="25" width="80" height="70" fill="url(#cylinderGradient)" />
        <path d="M35 25 V 95" stroke="#94a3b8" strokeWidth="1.5" />
        <path d="M115 25 V 95" stroke="#94a3b8" strokeWidth="1.5" />
        <ellipse cx="75" cy="25" rx="40" ry="10" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
        <ellipse cx="75" cy="95" rx="40" ry="10" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
      </g>

      {/* Linhas de dimensão e legendas (mais finas) */}
      <g stroke="#9ca3af" strokeWidth="1">
        {/* Altura (C) */}
        <path d="M125 25 V 95" />
        <path d="M122 25 H 128" />
        <path d="M122 95 H 128" />

        {/* Diâmetro (D) - Linha movida para cima */}
        <path d="M35 9 H 115" />
        <path d="M35 6 V 12" />
        <path d="M115 6 V 12" />
      </g>
      <g fill="#9ca3af" fontSize="12" fontWeight="400" fontFamily="sans-serif">
        <text x="137" y="60" dominantBaseline="middle" textAnchor="middle">C</text>
        {/* Legenda D movida para cima */}
        <text x="75" y="-6" dominantBaseline="hanging" textAnchor="middle">D</text>
      </g>
    </g>
  </svg>
);

const OtherIcon = () => (
  <svg viewBox="0 0 150 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <g className="text-gray-400">
      <path d="M45 30 L105 30 L120 60 L105 90 L45 90 L30 60 L45 30Z" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />
      <text x="75" y="65" dominantBaseline="middle" textAnchor="middle" fontSize="32" fill="currentColor" className="font-bold text-gray-600">?</text>
    </g>
  </svg>
);

interface PackagingIllustrationProps {
  type: tipo_embalagem;
}

const PackagingIllustration: React.FC<PackagingIllustrationProps> = ({ type }) => {
  const PacketIcon = () => (
    <svg viewBox="0 0 150 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="packetGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      {/* Scale dimensions to fit 150x120 viewbox */}
      <g transform="translate(25, 10) scale(0.75)">
        {/* Packet Body with Gradient */}
        <path d="M35 25 Q35 15 45 15 H105 Q115 15 115 25 V105 Q115 115 105 115 H45 Q35 115 35 105 Z"
          fill="url(#packetGradient)" stroke="#94a3b8" strokeWidth="1.5" />

        {/* Top Seal - crimped effect */}
        <path d="M35 25 H115" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M38 18 V25 M43 18 V25 M48 18 V25 M53 18 V25 M58 18 V25 M63 18 V25 M68 18 V25 M73 18 V25 M78 18 V25 M83 18 V25 M88 18 V25 M93 18 V25 M98 18 V25 M103 18 V25 M108 18 V25 M112 18 V25" stroke="#cbd5e1" strokeWidth="1" />

        {/* Bottom Seal - crimped effect */}
        <path d="M35 105 H115" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M38 105 V112 M43 105 V112 M48 105 V112 M53 105 V112 M58 105 V112 M63 105 V112 M68 105 V112 M73 105 V112 M78 105 V112 M83 105 V112 M88 105 V112 M93 105 V112 M98 105 V112 M103 105 V112 M108 105 V112 M112 105 V112" stroke="#cbd5e1" strokeWidth="1" />

        {/* Center sheen/fold */}
        <path d="M75 35 V95" stroke="#e2e8f0" strokeWidth="3" opacity="0.5" />

        {/* Dimensions */}
        <g stroke="#9ca3af" strokeWidth="1">
          {/* Height (A) */}
          <path d="M125 15 V 115" />
          <path d="M122 15 H 128" />
          <path d="M122 115 H 128" />

          {/* Width (L) */}
          <path d="M35 125 H 115" />
          <path d="M35 122 V 128" />
          <path d="M115 122 V 128" />

          {/* Depth/Thickness (C) - removed as per request */}
          {/* <path d="M115 25 L 135 35" strokeDasharray="2 2" opacity="0.5"/> */}
          {/* <path d="M115 105 L 135 115" strokeDasharray="2 2" opacity="0.5"/> */}
          {/* <path d="M135 35 V 115" strokeDasharray="2 2" opacity="0.5"/> */}
        </g>

        <g fill="#9ca3af" fontSize="14" fontWeight="400" fontFamily="sans-serif">
          <text x="140" y="65" dominantBaseline="middle" textAnchor="start">A</text>
          <text x="75" y="140" dominantBaseline="middle" textAnchor="middle">L</text>
        </g>
      </g>
    </svg>
  );

  const renderIcon = () => {
    switch (type) {
      case 'pacote_caixa':
        return <BoxIcon />;
      case 'envelope':
        return <EnvelopeIcon />;
      case 'rolo_cilindro':
        return <CylinderIcon />;
      case 'pacote':
        return <PacketIcon />;
      default:
        return <OtherIcon />;
    }
  };

  return (
    <div className="flex justify-center items-center p-4 rounded-lg text-gray-500 w-[300px] h-[240px] mx-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={type}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full"
        >
          {renderIcon()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PackagingIllustration;
