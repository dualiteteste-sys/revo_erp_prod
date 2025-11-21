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
          <stop stopColor="#f1f5f9"/>
          <stop offset="1" stopColor="#e2e8f0"/>
        </linearGradient>
        <linearGradient id="envelopeFlap" x1="75" y1="35" x2="75" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fafc"/>
          <stop offset="1" stopColor="#f1f5f9"/>
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
  const renderIcon = () => {
    switch (type) {
      case 'pacote_caixa':
        return <BoxIcon />;
      case 'envelope':
        return <EnvelopeIcon />;
      case 'rolo_cilindro':
        return <CylinderIcon />;
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
