import { cn } from '@/lib/utils';
import { ImageIcon, Tag, Package, Star } from 'lucide-react';

type AttributeValue = {
  attribute_id: string;
  attribute_name: string;
  value_name: string;
};

type Props = {
  title: string;
  price: number;
  originalPrice?: number | null;
  condition: string;
  quantity: number;
  categoryPath?: string | null;
  listingType: string;
  imageUrl?: string | null;
  imageCount: number;
  attributes: AttributeValue[];
  blockers: string[];
  warnings: string[];
  className?: string;
};

const LISTING_TYPE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  free: { label: 'Grátis', color: 'bg-gray-100 text-gray-700', desc: 'Sem custo, menor visibilidade' },
  gold_special: { label: 'Clássico', color: 'bg-blue-100 text-blue-800', desc: 'Boa visibilidade, comissão padrão' },
  gold_pro: { label: 'Premium', color: 'bg-amber-100 text-amber-800', desc: 'Alta visibilidade, parcela s/ juros' },
  gold_premium: { label: 'Premium Plus', color: 'bg-purple-100 text-purple-800', desc: 'Máxima visibilidade' },
};

const CONDITION_LABELS: Record<string, string> = {
  new: 'Novo',
  used: 'Usado',
  not_specified: 'Não especificado',
  novo: 'Novo',
  usado: 'Usado',
};

export default function MeliListingPreview({
  title,
  price,
  originalPrice,
  condition,
  quantity,
  categoryPath,
  listingType,
  imageUrl,
  imageCount,
  attributes,
  blockers,
  warnings,
  className,
}: Props) {
  const titleLen = title?.length || 0;
  const titleColor =
    titleLen === 0 ? 'text-red-500' : titleLen > 55 ? 'text-red-500' : titleLen > 50 ? 'text-amber-500' : 'text-green-600';

  const listingInfo = LISTING_TYPE_LABELS[listingType] || LISTING_TYPE_LABELS.gold_special;
  const conditionLabel = CONDITION_LABELS[condition] || condition;
  const hasDiscount = originalPrice && originalPrice > price;

  return (
    <div className={cn('space-y-4', className)}>
      {/* ML-style preview card */}
      <div className="rounded-2xl border border-gray-200/60 bg-white/80 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row">
          {/* Image preview */}
          <div className="sm:w-48 h-48 bg-gray-100/60 flex items-center justify-center shrink-0 border-b sm:border-b-0 sm:border-r border-gray-200/40">
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="w-full h-full object-contain p-2" />
            ) : (
              <div className="text-center">
                <ImageIcon size={32} className="mx-auto text-gray-300" />
                <p className="text-xs text-gray-400 mt-1">{imageCount} imagem(ns)</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-4 space-y-3">
            {/* Title with char counter */}
            <div>
              <h3 className="text-base font-medium text-gray-900 leading-snug">
                {title || <span className="italic text-gray-400">Sem título</span>}
              </h3>
              <span className={cn('text-xs font-mono', titleColor)}>
                {titleLen}/60 caracteres
              </span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              {hasDiscount && (
                <span className="text-sm text-gray-400 line-through">
                  R$ {originalPrice!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800">
                <Package size={12} />
                {conditionLabel}
              </span>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', listingInfo.color)}>
                <Star size={12} />
                {listingInfo.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">
                Estoque: {quantity}
              </span>
            </div>

            {/* Category */}
            {categoryPath && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Tag size={12} className="text-gray-400" />
                {categoryPath}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Listing type info */}
      <div className="rounded-xl border border-gray-200/60 bg-white/60 backdrop-blur-sm p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Tipo de listagem: <span className="font-semibold">{listingInfo.label}</span>
            </p>
            <p className="text-xs text-gray-500">{listingInfo.desc}</p>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', listingInfo.color)}>
            {listingType}
          </span>
        </div>
      </div>

      {/* Attributes summary */}
      {attributes.length > 0 && (
        <div className="rounded-xl border border-gray-200/60 bg-white/60 backdrop-blur-sm p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">
            Atributos ({attributes.length})
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {attributes.slice(0, 10).map((attr) => (
              <div key={attr.attribute_id} className="flex justify-between text-xs py-0.5">
                <span className="text-gray-500 truncate">{attr.attribute_name}</span>
                <span className="text-gray-800 font-medium truncate ml-2">{attr.value_name}</span>
              </div>
            ))}
            {attributes.length > 10 && (
              <p className="text-xs text-gray-400 col-span-2">
                +{attributes.length - 10} atributos adicionais
              </p>
            )}
          </div>
        </div>
      )}

      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="rounded-xl border border-red-200/60 bg-red-50/60 p-3 space-y-1">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
            Bloqueadores ({blockers.length})
          </p>
          {blockers.map((b, i) => (
            <p key={i} className="text-sm text-red-700">{b}</p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
            Avisos ({warnings.length})
          </p>
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
