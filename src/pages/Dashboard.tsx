import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Responsive, Layout } from 'react-grid-layout';
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

// IDs de widgets KPI para tratamento especial
const KPI_WIDGET_IDS = ['kpi-faturamento', 'kpi-clientes', 'kpi-pedidos', 'kpi-ticket'];

function generateResponsiveLayouts(baseLayout: Layout[]): Record<string, Layout[]> {
  const layouts: Record<string, Layout[]> = {};

  Object.keys(COLS).forEach(breakpoint => {
    const cols = COLS[breakpoint as keyof typeof COLS];
    let currentY = 0;
    let currentX = 0;

    // Em mobile (xxs/xs), KPIs ficam em grid 2x2 com altura menor
    const isMobileBreakpoint = breakpoint === 'xxs' || breakpoint === 'xs';

    layouts[breakpoint] = baseLayout.map(item => {
      const isKpi = KPI_WIDGET_IDS.includes(item.i);

      if (isMobileBreakpoint && isKpi) {
        // KPIs: 2 colunas, altura reduzida
        const w = Math.max(1, Math.floor(cols / 2));
        const h = 4; // Altura menor para mobile
        const newItem = {
          ...item,
          w,
          h,
          x: currentX,
          y: currentY,
        };
        currentX += w;
        if (currentX >= cols) {
          currentX = 0;
          currentY += h;
        }
        return newItem;
      }

      // Widgets normais: coluna única
      const w = Math.min(item.w, cols);
      if (currentX !== 0) {
        currentX = 0;
        currentY += 4; // Reset row after KPIs
      }
      const newItem = {
        ...item,
        w,
        x: 0,
        y: currentY,
      };
      currentY += item.h;
      return newItem;
    });
  });

  layouts.lg = baseLayout;

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

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opsView = useHasPermission('ops', 'view');
  const isMobile = useIsMobile();

  const defaultLayouts = useMemo(() => generateResponsiveLayouts(DEFAULT_LAYOUT as Layout[]), []);

  const [layouts, setLayouts] = useLocalStorageState<Record<string, Layout[]>>('revo_dashboard_layout_v5', {
    defaultValue: defaultLayouts
  });
  const [isEditing, setIsEditing] = useState(false);
  const [activeWidgets, setActiveWidgets] = useLocalStorageState<string[]>('revo_dashboard_active_widgets_v5', {
    defaultValue: DEFAULT_LAYOUT.map(l => l.i)
  });

  const { width, ref: containerRef } = useWidth();

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

  const handleLayoutChange = useCallback((currentLayout: Layout[], allLayouts: Record<string, Layout[]>) => {
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
    isDraggable: isEditing && !isMobile, // Desativar drag em mobile
    isResizable: isEditing && !isMobile, // Desativar resize em mobile
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

            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className={`gap-2 transition-all duration-300 ${isEditing ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 border-0' : 'bg-white/80 backdrop-blur hover:bg-white hover:shadow-md border-slate-200'}`}
            >
              {isEditing ? <Check size={16} /> : <Settings2 size={16} />}
              {isEditing ? 'Concluir' : 'Personalizar'}
            </Button>

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

        <div ref={containerRef} className="w-full">
          <Responsive {...gridProps}>
            {activeWidgets.map((key) => {
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
      </div>
    </div>
  );
};

export default Dashboard;
