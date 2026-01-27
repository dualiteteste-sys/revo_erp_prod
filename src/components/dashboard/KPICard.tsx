import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  trend: string;
  isPositive: boolean;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  index: number;
  loading?: boolean;
  sparklineData?: number[];
}

function AnimatedNumber({ value, duration = 1000 }: { value: string; duration?: number }) {
  const [displayValue, setDisplayValue] = useState('0');
  
  useEffect(() => {
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
    const prefix = value.match(/^[^\d-]*/)?.[0] || '';
    const suffix = value.match(/[^\d]*$/)?.[0] || '';
    
    if (isNaN(numericValue)) {
      setDisplayValue(value);
      return;
    }

    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = numericValue * easeOut;
      
      if (value.includes(',') || value.includes('.')) {
        setDisplayValue(`${prefix}${current.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`);
      } else {
        setDisplayValue(`${prefix}${Math.round(current).toLocaleString('pt-BR')}${suffix}`);
      }
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{displayValue}</span>;
}

function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 32;
  const width = 80;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const gradientId = `spark-${positive ? 'pos' : 'neg'}-${Math.random().toString(36).substr(2, 9)}`;
  const color = positive ? '#10b981' : '#ef4444';
  const colorLight = positive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polygon
        points={areaPoints}
        fill={`url(#${gradientId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      />
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
      />
      <motion.circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="3"
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 1.2 }}
      />
    </svg>
  );
}

const KPICard: React.FC<KPICardProps> = ({ 
  title, 
  value, 
  trend, 
  isPositive, 
  icon: Icon, 
  iconBg, 
  iconColor, 
  index, 
  loading,
  sparklineData 
}) => {
  // A11y: ensure sufficient contrast for badge text on light backgrounds.
  const trendColor = isPositive ? "text-emerald-700" : "text-rose-700";
  const trendBg = isPositive ? "bg-emerald-50" : "bg-rose-50";
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  const demoSparkline = sparklineData || [30, 45, 35, 50, 40, 60, 55, 70, 65, 80, 75, 90];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <div className="h-full p-5 flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500" style={{ background: `linear-gradient(135deg, ${iconColor.includes('blue') ? '#3b82f6' : iconColor.includes('green') ? '#10b981' : iconColor.includes('orange') ? '#f97316' : '#8b5cf6'} 0%, transparent 70%)` }} />
        
        <div className="flex items-start justify-between relative z-10">
          <div className="flex-1">
            <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
            {loading ? (
              <div className="space-y-2">
                <div className="h-9 w-36 rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 animate-pulse" />
                <div className="h-5 w-20 rounded-md bg-gradient-to-r from-slate-100 to-slate-200 animate-pulse" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">
                  <AnimatedNumber value={value} />
                </p>
                <div className={`inline-flex items-center gap-1.5 text-sm mt-2 px-2.5 py-1 rounded-full ${trendBg} ${trendColor}`}>
                  <TrendIcon size={14} strokeWidth={2.5} />
                  <span className="font-semibold">{trend}</span>
                </div>
              </>
            )}
          </div>
          
          <motion.div 
            className={`p-3 rounded-2xl bg-gradient-to-br ${iconBg} shadow-lg`}
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Icon size={24} className={iconColor} strokeWidth={2} />
          </motion.div>
        </div>

        {!loading && (
          <motion.div 
            className="mt-auto pt-3 flex justify-end"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 + 0.3 }}
          >
            <MiniSparkline data={demoSparkline} positive={isPositive} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default KPICard;
