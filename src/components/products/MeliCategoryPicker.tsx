import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, ChevronRight, Check, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  searchMeliCategories,
  predictMeliCategory,
  type MeliCategorySearchResult,
  type MeliCategoryPrediction,
} from '@/services/meliAdmin';

type Props = {
  empresaId: string;
  ecommerceId: string;
  productTitle?: string;
  selectedCategoryId: string | null;
  selectedCategoryPath?: string | null;
  onSelect: (category: { id: string; name: string; path: string }) => void;
  className?: string;
};

export default function MeliCategoryPicker({
  empresaId,
  ecommerceId,
  productTitle,
  selectedCategoryId,
  selectedCategoryPath,
  onSelect,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MeliCategorySearchResult[]>([]);
  const [predictions, setPredictions] = useState<MeliCategoryPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Search categories with debounce
  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim() || q.trim().length < 2) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const data = await searchMeliCategories(empresaId, ecommerceId, q.trim());
          setResults(data.results ?? []);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [empresaId, ecommerceId],
  );

  // Predict category from product title
  const handlePredict = useCallback(async () => {
    if (!productTitle?.trim()) return;
    setPredicting(true);
    try {
      const data = await predictMeliCategory(empresaId, ecommerceId, productTitle.trim());
      setPredictions(data.predictions ?? []);
    } catch {
      setPredictions([]);
    } finally {
      setPredicting(false);
    }
  }, [empresaId, ecommerceId, productTitle]);

  // Auto-predict on mount if title is available
  useEffect(() => {
    if (productTitle?.trim() && !selectedCategoryId) {
      handlePredict();
    }
  }, []);

  const buildPath = (pathFromRoot: { id: string; name: string }[]) =>
    pathFromRoot.map((p) => p.name).join(' > ');

  const handleSelectCategory = (cat: { id: string; name: string; path_from_root: { id: string; name: string }[] }) => {
    const path = buildPath(cat.path_from_root);
    onSelect({ id: cat.id, name: cat.name, path });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Selected category badge */}
      {selectedCategoryId && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50/80 border border-green-200/60 px-4 py-3">
          <Check size={16} className="text-green-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-green-800 truncate">
              Categoria selecionada
            </p>
            <p className="text-xs text-green-600 truncate">
              {selectedCategoryPath || selectedCategoryId}
            </p>
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="w-full rounded-xl border border-gray-200/80 bg-white/70 backdrop-blur-sm pl-10 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
          placeholder="Buscar categoria no Mercado Livre..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {loading && (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
        )}
      </div>

      {/* AI Predict button */}
      {productTitle && !query && predictions.length === 0 && (
        <button
          type="button"
          onClick={handlePredict}
          disabled={predicting}
          className="flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-100/60 transition-colors w-full"
        >
          {predicting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          <span>Sugerir categoria pelo título do produto</span>
        </button>
      )}

      {/* Predictions */}
      {predictions.length > 0 && !query && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
            <Sparkles size={12} />
            Sugestões baseadas no título
          </p>
          {predictions.map((pred) => {
            const path = buildPath(pred.path_from_root);
            const isSelected = pred.id === selectedCategoryId;
            return (
              <button
                key={pred.id}
                type="button"
                onClick={() => handleSelectCategory(pred)}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3 transition-all',
                  isSelected
                    ? 'border-blue-300 bg-blue-50/80 shadow-sm'
                    : 'border-gray-200/60 bg-white/60 hover:border-blue-200 hover:bg-blue-50/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{pred.name}</span>
                  {isSelected && <Check size={16} className="text-blue-600 shrink-0" />}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
                  {pred.path_from_root.map((node, i) => (
                    <span key={node.id} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={10} className="text-gray-300" />}
                      <span>{node.name}</span>
                    </span>
                  ))}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {results.map((cat) => {
            const isSelected = cat.id === selectedCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat)}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3 transition-all',
                  isSelected
                    ? 'border-blue-300 bg-blue-50/80 shadow-sm'
                    : 'border-gray-200/60 bg-white/60 hover:border-blue-200 hover:bg-blue-50/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                  {isSelected && <Check size={16} className="text-blue-600 shrink-0" />}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
                  {cat.path_from_root.map((node, i) => (
                    <span key={node.id} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={10} className="text-gray-300" />}
                      <span>{node.name}</span>
                    </span>
                  ))}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state for search */}
      {query.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-4">
          Nenhuma categoria encontrada para "{query}".
        </p>
      )}
    </div>
  );
}
