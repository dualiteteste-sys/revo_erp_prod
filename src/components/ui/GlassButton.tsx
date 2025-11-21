import React from 'react';
import { motion } from 'framer-motion';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const GlassButton: React.FC<GlassButtonProps> = ({ className, children, ...props }) => {
  return (
    <motion.button
      className={`bg-glass-100/80 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center transition-colors hover:bg-white/30 ${className}`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export default GlassButton;
