import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Responsive } from 'react-grid-layout';
import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import useLocalStorageState from 'use-local-storage-state';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, RotateCcw, Plus, X, GripHorizontal, Check } from 'lucide-react';
import { getMainDashboardData } from '@/services/mainDashboard';
import { logger } from '@/lib/logger';
import { useHasPermission } from '@/hooks/useHasPermission';
import { DEFAULT_LAYOUT, WIDGETS, DashboardData } from '@/components/dashboard/registry';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/useIsMobile';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

// IDs de widgets KPI para tratamento especial - renderizados com CSS Grid
const KPI_WIDGET_IDS = ['kpi-faturamento', 'kpi-clientes', 'kpi-pedidos', 'kpi-ticket'];

// Layout para widgets que NÃO são KPIs (usados no react-grid-layout)
const NON_KPI_LAYOUT = DEFAULT_LAYOUT.filter(item => !KPI_WIDGET_IDS.includes(item.i)).map(item => ({
  ...item,
  y: item.y - 5, // Ajusta Y pois KPIs são renderizados separadamente
}));

function generateResponsiveLayouts(baseLayout: Layout): ResponsiveLayouts {
  const layouts: ResponsiveLayouts = {};

  Object.keys(COLS).forEach(breakpoint => {
    const cols = COLS[breakpoint as keyof typeof COLS];

    // lg: layout original sem modificação
    if (breakpoint === 'lg') {
      layouts[breakpoint] = baseLayout.map(item => ({ ...item }));
      return;
    }

    // md: escalar proporcionalmente
    if (breakpoint === 'md') {
      const scale = cols / 12;
      layouts[breakpoint] = baseLayout.map(item => ({
        ...item,
        x: Math.round(item.x * scale),
        w: Math.max(Math.round(item.w * scale), 2),
      }));
      return;
    }

    // sm/xs/xxs: layout empilhado vertical
    let currentY = 0;
    layouts[breakpoint] = baseLayout.map(item => {
      const newItem = {
        ...item,
        w: cols,
        x: 0,
        y: currentY,
      };
      currentY += item.h;
      return newItem;
    });
  });

  return layouts;
}

function useWidth() {
  const [width, setWidth] = useState(1200);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { width, ref };
}

// Componente para renderizar os KPIs com CSS Grid fluido
const FluidKPIGrid: React.FC<{
  activeKpis: string[];
  data: DashboardData;
  loading: boolean;
  isMobile: boolean;
}> = ({ activeKpis, data, loading, isMobile }) => {
  return (
    <div
      className="w-full"
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile
          ? 'repeat(auto-fit, minmax(150px, 1fr))'
          : 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: isMobile ? '8px' : '16px',
      }}
    >
      {activeKpis.map((key) => {
        const widget = WIDGETS[key];
        if (!widget) return null;
        const Component = widget.component;

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            <div className={`h-full w-full rounded-2xl overflow-hidden flex flex-col transition-all duration-300 
              bg-white/70 backdrop-blur-xl border border-white/60 
              shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(99,102,241,0.08)]
              hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.12),0_8px_24px_-8px_rgba(99,102,241,0.15)]
              hover:bg-white/90 hover:border-indigo-100/60`}
              style={{ minHeight: isMobile ? '140px' : '160px' }}
            >
              <div className="flex-1 h-full w-full overflow-hidden">
                <Component data={data} loading={loading} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const defaultLayouts = useMemo(() => generateResponsiveLayouts(NON_KPI_LAYOUT as Layout), []);

  const [layouts, setLayouts] = useLocalStorageState<ResponsiveLayouts>('revo_dashboard_layout_v6', {
    defaultValue: defaultLayouts
  });
  const [isEditing, setIsEditing] = useState(false);
  const [activeWidgets, setActiveWidgets] = useLocalStorageState<string[]>('revo_dashboard_active_widgets_v6', {
    defaultValue: DEFAULT_LAYOUT.map(l => l.i)
  });

  const { width, ref: containerRef } = useWidth();

  // Separar KPIs ativos dos outros widgets
  const activeKpis = useMemo(() =>
    activeWidgets.filter(id => KPI_WIDGET_IDS.includes(id)),
    [activeWidgets]
  );
  const activeNonKpiWidgets = useMemo(() =>
    activeWidgets.filter(id => !KPI_WIDGET_IDS.includes(id)),
    [activeWidgets]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getMainDashboardData({ activitiesLimit: 12 });
        if (mounted) setData(res);
      } catch (e: any) {
        logger.warn('[Dashboard] erro ao carregar dados', { message: e?.message });
        if (mounted) setError(e?.message || 'Não foi possível carregar o dashboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleLayoutChange = useCallback((_currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
    setLayouts(allLayouts);
  }, [setLayouts]);

  const handleResetLayout = () => {
    if (confirm('Restaurar layout padrão?')) {
      setLayouts(defaultLayouts);
      setActiveWidgets(DEFAULT_LAYOUT.map(l => l.i));
    }
  };

  const toggleWidget = (widgetId: string) => {
    setActiveWidgets(prev => {
      if (prev.includes(widgetId)) {
        return prev.filter(id => id !== widgetId);
      }
      return [...prev, widgetId];
    });
  };

  const gridProps = useMemo(() => ({
    className: "layout",
    breakpoints: BREAKPOINTS,
    cols: COLS,
    rowHeight: isMobile ? 28 : 32,
    layouts: layouts,
    onLayoutChange: handleLayoutChange,
    isDraggable: isEditing && !isMobile,
    isResizable: isEditing && !isMobile,
    margin: (isMobile ? [8, 8] : [16, 16]) as [number, number],
    containerPadding: [0, 0] as [number, number],
    draggableHandle: ".drag-handle",
    compactType: "vertical" as const,
    preventCollision: false,
    width: width,
    useCSSTransforms: true,
  }), [layouts, isEditing, width, handleLayoutChange, isMobile]);

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 ${isMobile ? 'p-3 space-y-4' : 'p-6 space-y-6'}`}>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM2MzY2ZjEiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60 pointer-events-none" />

      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`flex items-center justify-between ${isMobile ? 'mb-4' : 'mb-8'}`}
        >
          <div>
            <h1 className={`font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-indigo-800 bg-clip-text text-transparent tracking-tight ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              Visao Geral
            </h1>
            {!isMobile && (
              <p className="text-gray-500 mt-1 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Dados atualizados em tempo real
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isEditing && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <Button variant="outline" size="sm" onClick={handleResetLayout} className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                  <RotateCcw size={16} />
                  Resetar
                </Button>
              </motion.div>
            )}

            {!isMobile && (
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className={`gap-2 transition-all duration-300 ${isEditing ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 border-0' : 'bg-white/80 backdrop-blur hover:bg-white hover:shadow-md border-slate-200'}`}
              >
                {isEditing ? <Check size={16} /> : <Settings2 size={16} />}
                {isEditing ? 'Concluir' : 'Personalizar'}
              </Button>
            )}

            {isEditing && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="secondary" size="sm" className="gap-2 bg-white/80 backdrop-blur hover:bg-white">
                      <Plus size={16} />
                      Widgets
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="bg-gradient-to-b from-white to-slate-50">
                    <SheetHeader>
                      <SheetTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-indigo-900 bg-clip-text text-transparent">
                        Biblioteca de Widgets
                      </SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-100px)] mt-6 pr-4">
                      <div className="space-y-3">
                        {Object.values(WIDGETS).map((widget, idx) => {
                          const isActive = activeWidgets.includes(widget.id);
                          const Icon = widget.icon;
                          return (
                            <motion.div
                              key={widget.id}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex items-center justify-between group
                                ${isActive
                                  ? 'bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-300 shadow-md shadow-indigo-100'
                                  : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-lg hover:scale-[1.02]'}
                              `}
                              onClick={() => toggleWidget(widget.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl transition-all ${isActive ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                                  <Icon size={20} />
                                </div>
                                <span className={`font-semibold ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{widget.title}</span>
                              </div>
                              {isActive && (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                                  <Check size={14} className="text-white" />
                                </motion.div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </motion.div>
            )}
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-6"
            >
              <div className="p-4 rounded-2xl bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-700 text-sm flex items-center gap-3 shadow-lg shadow-red-100/50">
                <div className="p-2 rounded-xl bg-red-100">
                  <X size={16} />
                </div>
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* KPIs com CSS Grid fluido - adaptação perfeita */}
        {activeKpis.length > 0 && (
          <div className={isMobile ? 'mb-4' : 'mb-6'}>
            <FluidKPIGrid
              activeKpis={activeKpis}
              data={data}
              loading={loading}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* Outros widgets com react-grid-layout */}
        {activeNonKpiWidgets.length > 0 && (
          <div ref={containerRef} className="w-full">
            <Responsive {...gridProps}>
              {activeNonKpiWidgets.map((key) => {
                const widget = WIDGETS[key];
                if (!widget) return null;
                const Component = widget.component;

                return (
                  <div key={key} className="relative group h-full">
                    <div className={`h-full w-full rounded-2xl overflow-hidden flex flex-col transition-all duration-300 
                      bg-white/70 backdrop-blur-xl border border-white/60 
                      shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(99,102,241,0.08)]
                      hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.12),0_8px_24px_-8px_rgba(99,102,241,0.15)]
                      hover:bg-white/90 hover:border-indigo-100/60`}>

                      {isEditing && (
                        <div className="drag-handle absolute top-3 right-3 z-50 p-2 rounded-xl bg-white/90 text-slate-400 hover:text-indigo-600 cursor-move opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg border border-slate-100 hover:border-indigo-200">
                          <GripHorizontal size={16} />
                        </div>
                      )}

                      <div className="flex-1 h-full w-full overflow-hidden">
                        <Component data={data} loading={loading} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </Responsive>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
