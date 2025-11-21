import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(({ className, children, ...props }, ref) => {
  return (
    <motion.div
      ref={ref}
      className={`bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
});

GlassCard.displayName = 'GlassCard';

export default GlassCard;
