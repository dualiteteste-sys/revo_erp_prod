import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

type GlassButtonProps = Omit<HTMLMotionProps<'button'>, 'ref'> & { children: React.ReactNode };

const GlassButton: React.FC<GlassButtonProps> = ({ className, children, ...props }) => {
  return (
    <motion.button
      className={`bg-glass-100/80 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center transition-[transform,colors,box-shadow] duration-150 ease-out hover:bg-white/30 active:scale-[0.98] ${className ?? ''}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export default GlassButton;
