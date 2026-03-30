import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import Modal from '@/components/ui/Modal';
import WizardStepper from '@/components/ui/WizardStepper';
import MeliCategoryPicker from './MeliCategoryPicker';
import MeliAttributeForm from './MeliAttributeForm';
import MeliListingPreview from './MeliListingPreview';
import { Button } from '@/components/ui/button';
import {
  validateMeliListing,
  createMeliListing,
  type MeliListingValidation,
} from '@/services/meliAdmin';
import {
  upsertMeliCategoryMapping,
  upsertMeliListingAttributes,
} from '@/services/meliCategories';
import type { ProdutoAnuncio } from '@/services/produtoAnuncios';
import type { ProductFormData } from '@/components/products/ProductFormPanel';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Rocket,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  product: ProductFormData;
  anuncio: ProdutoAnuncio;
  ecommerceId: string;
  onPublished?: () => void;
};

type AttributeValue = {
  attribute_id: string;
  attribute_name: string;
  value_id?: string;
  value_name: string;
};

const STEPS = [
  { label: 'Validação' },
  { label: 'Categoria' },
  { label: 'Atributos' },
  { label: 'Preview' },
];

const LISTING_TYPES = [
  { id: 'free', label: 'Grátis', desc: 'Sem custo, menor visibilidade' },
  { id: 'gold_special', label: 'Clássico', desc: 'Boa visibilidade, comissão padrão' },
  { id: 'gold_pro', label: 'Premium', desc: 'Alta visibilidade, parcela sem juros' },
  { id: 'gold_premium', label: 'Premium Plus', desc: 'Máxima visibilidade' },
];

export default function MeliPublishDialog({
  isOpen,
  onClose,
  product,
  anuncio,
  ecommerceId,
  onPublished,
}: Props) {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const empresaId = activeEmpresaId || '';

  const [step, setStep] = useState(0);
  const [maxCompleted, setMaxCompleted] = useState(-1);

  // Step 1: Validation state
  const [validation, setValidation] = useState<MeliListingValidation | null>(null);
  const [validating, setValidating] = useState(false);

  // Step 2: Category state
  const [selectedCategory, setSelectedCategory] = useState<{
    id: string;
    name: string;
    path: string;
  } | null>(null);

  // Step 3: Attributes state
  const [attributes, setAttributes] = useState<AttributeValue[]>([]);

  // Step 4: Listing type + publish
  const [listingType, setListingType] = useState('gold_special');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ meliItemId: string; permalink: string } | null>(null);

  // Image state
  const [images, setImages] = useState<{ url: string; principal: boolean }[]>([]);

  // Load product images
  useEffect(() => {
    if (!product.id || !isOpen) return;
    (supabase as any)
      .rpc('produto_imagens_list_for_current_user', { p_produto_id: product.id })
      .then(({ data }: any) => {
        if (!data) return;
        const imgs = (data as any[]).map((img) => ({
          url: img.url,
          principal: img.principal,
        }));
        setImages(imgs);
      })
      .catch(() => {});
  }, [product.id, isOpen]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setMaxCompleted(-1);
      setValidation(null);
      setPublished(null);
      setPublishing(false);
      // Pre-fill category from anuncio if available
      if (anuncio.categoria_marketplace) {
        setSelectedCategory({
          id: anuncio.categoria_marketplace,
          name: '',
          path: anuncio.categoria_marketplace,
        });
      }
    }
  }, [isOpen]);

  // Step 1: Run validation
  const runValidation = useCallback(async () => {
    setValidating(true);
    try {
      const result = await validateMeliListing(empresaId, ecommerceId, anuncio.id);
      setValidation(result);
      if (result.valid) {
        setMaxCompleted(Math.max(maxCompleted, 0));
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro na validação.', 'error');
    } finally {
      setValidating(false);
    }
  }, [empresaId, ecommerceId, anuncio.id, maxCompleted]);

  useEffect(() => {
    if (isOpen && step === 0 && !validation) {
      runValidation();
    }
  }, [isOpen, step]);

  // Navigation
  const canAdvance = (s: number) => {
    if (s === 0) return validation?.valid || (validation && validation.blockers.length === 0);
    if (s === 1) return !!selectedCategory;
    if (s === 2) return true; // attributes are optional
    return false;
  };

  const goNext = async () => {
    if (step === 1 && selectedCategory && product.grupo_id) {
      // Save category mapping
      try {
        await upsertMeliCategoryMapping({
          grupoId: product.grupo_id,
          meliCategoryId: selectedCategory.id,
          meliName: selectedCategory.name,
          meliPath: selectedCategory.path,
        });
      } catch {
        // non-blocking
      }
    }
    if (step === 2 && attributes.length > 0) {
      // Save attributes
      try {
        await upsertMeliListingAttributes(anuncio.id, attributes);
      } catch {
        // non-blocking
      }
    }
    setMaxCompleted(Math.max(maxCompleted, step));
    setStep(step + 1);
  };

  const goBack = () => setStep(Math.max(0, step - 1));

  // Publish
  const handlePublish = async () => {
    setPublishing(true);
    try {
      const result = await createMeliListing(empresaId, ecommerceId, anuncio.id, {
        listing_type_id: listingType,
      });
      setPublished({
        meliItemId: result.meli_item_id,
        permalink: result.permalink,
      });
      setMaxCompleted(3);
      addToast('Produto publicado no Mercado Livre com sucesso!', 'success');
      onPublished?.();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao publicar no Mercado Livre.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // Computed values for preview
  const previewTitle = anuncio.titulo || product.nome || '';
  const previewPrice =
    anuncio.preco_especifico ??
    (product as any).preco_promocional ??
    (product as any).preco_venda ??
    0;
  const previewOriginalPrice = (product as any).preco_venda;
  const previewCondition = (product as any).condicao || 'novo';
  const previewQuantity = Math.max(
    0,
    Math.trunc(Number((product as any).estoque_disponivel ?? (product as any).estoque_atual ?? 0)),
  );
  const principalImage = images.find((i) => i.principal) || images[0];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Publicar no Mercado Livre" size="4xl">
      <div className="space-y-6">
        {/* Wizard stepper */}
        <WizardStepper steps={STEPS} activeIndex={step} maxCompletedIndex={maxCompleted} />

        {/* Step content */}
        <div className="min-h-[340px]">
          {/* Step 0: Validation */}
          {step === 0 && (
            <div className="space-y-4">
              {validating ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Loader2 size={32} className="animate-spin mb-3" />
                  <p className="text-sm">Validando dados do produto...</p>
                </div>
              ) : validation ? (
                <>
                  <div className="grid gap-3">
                    <ValidationItem
                      label="Título (10-60 caracteres)"
                      ok={previewTitle.length >= 10 && previewTitle.length <= 60}
                      detail={`${previewTitle.length} caracteres`}
                    />
                    <ValidationItem
                      label="Pelo menos 1 imagem"
                      ok={images.length >= 1}
                      detail={`${images.length} imagem(ns)`}
                    />
                    <ValidationItem
                      label="Preço maior que zero"
                      ok={previewPrice > 0}
                      detail={`R$ ${Number(previewPrice).toFixed(2)}`}
                    />
                    <ValidationItem
                      label="Estoque disponível"
                      ok={previewQuantity >= 1}
                      detail={`${previewQuantity} unidade(s)`}
                    />
                    <ValidationItem
                      label="Condição definida"
                      ok={!!previewCondition && previewCondition !== 'not_specified'}
                      detail={previewCondition || 'Não definida'}
                    />
                  </div>

                  {validation.blockers.length > 0 && (
                    <div className="rounded-xl border border-red-200/60 bg-red-50/60 p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                        Bloqueadores
                      </p>
                      {validation.blockers.map((b, i) => (
                        <p key={i} className="text-sm text-red-700 flex items-start gap-2">
                          <XCircle size={14} className="shrink-0 mt-0.5" /> {b}
                        </p>
                      ))}
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                        Avisos
                      </p>
                      {validation.warnings.map((w, i) => (
                        <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {w}
                        </p>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runValidation}
                    disabled={validating}
                    className="mt-2"
                  >
                    Revalidar
                  </Button>
                </>
              ) : null}
            </div>
          )}

          {/* Step 1: Category */}
          {step === 1 && (
            <MeliCategoryPicker
              empresaId={empresaId}
              ecommerceId={ecommerceId}
              productTitle={previewTitle}
              selectedCategoryId={selectedCategory?.id || null}
              selectedCategoryPath={selectedCategory?.path || null}
              onSelect={setSelectedCategory}
            />
          )}

          {/* Step 2: Attributes */}
          {step === 2 && selectedCategory && (
            <MeliAttributeForm
              empresaId={empresaId}
              ecommerceId={ecommerceId}
              categoryId={selectedCategory.id}
              initialValues={attributes}
              autoFill={{
                brand: (product as any).marca_nome ?? null,
                model: (product as any).modelo ?? null,
                gtin: (product as any).gtin ?? null,
                condition: previewCondition,
              }}
              onChange={setAttributes}
            />
          )}

          {/* Step 3: Preview + Publish */}
          {step === 3 && (
            <div className="space-y-5">
              {published ? (
                <div className="rounded-2xl border border-green-200/60 bg-green-50/60 p-6 text-center space-y-3">
                  <CheckCircle2 size={48} className="mx-auto text-green-500" />
                  <h3 className="text-lg font-semibold text-green-800">
                    Publicado com sucesso!
                  </h3>
                  <p className="text-sm text-green-700">
                    ID: <span className="font-mono">{published.meliItemId}</span>
                  </p>
                  <a
                    href={published.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-green-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    Ver no Mercado Livre <ExternalLink size={14} />
                  </a>
                </div>
              ) : (
                <>
                  <MeliListingPreview
                    title={previewTitle}
                    price={Number(previewPrice)}
                    originalPrice={previewOriginalPrice ? Number(previewOriginalPrice) : null}
                    condition={previewCondition}
                    quantity={previewQuantity}
                    categoryPath={selectedCategory?.path}
                    listingType={listingType}
                    imageUrl={principalImage?.url}
                    imageCount={images.length}
                    attributes={attributes}
                    blockers={validation?.blockers ?? []}
                    warnings={validation?.warnings ?? []}
                  />

                  {/* Listing type selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Tipo de Listagem</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {LISTING_TYPES.map((lt) => (
                        <button
                          key={lt.id}
                          type="button"
                          onClick={() => setListingType(lt.id)}
                          className={cn(
                            'rounded-xl border p-3 text-left transition-all',
                            listingType === lt.id
                              ? 'border-blue-300 bg-blue-50/80 shadow-sm ring-1 ring-blue-200'
                              : 'border-gray-200/60 bg-white/60 hover:border-blue-200',
                          )}
                        >
                          <p className="text-sm font-medium text-gray-800">{lt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{lt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between border-t border-gray-200/40 pt-4">
          <div>
            {step > 0 && !published && (
              <Button variant="outline" size="sm" onClick={goBack}>
                <ArrowLeft size={14} className="mr-1.5" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {published ? 'Fechar' : 'Cancelar'}
            </Button>
            {step < 3 && !published && (
              <Button size="sm" onClick={goNext} disabled={!canAdvance(step)}>
                Avançar <ArrowRight size={14} className="ml-1.5" />
              </Button>
            )}
            {step === 3 && !published && (
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={publishing || (validation?.blockers?.length ?? 0) > 0}
                className="bg-yellow-500 hover:bg-yellow-600 text-white"
              >
                {publishing ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" /> Publicando...
                  </>
                ) : (
                  <>
                    <Rocket size={14} className="mr-1.5" /> Publicar no Mercado Livre
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Validation item component
// ---------------------------------------------------------------------------

function ValidationItem({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
        ok
          ? 'border-green-200/60 bg-green-50/40'
          : 'border-red-200/60 bg-red-50/40',
      )}
    >
      {ok ? (
        <CheckCircle2 size={18} className="text-green-500 shrink-0" />
      ) : (
        <XCircle size={18} className="text-red-500 shrink-0" />
      )}
      <span className={cn('text-sm font-medium', ok ? 'text-green-800' : 'text-red-800')}>
        {label}
      </span>
      {detail && (
        <span className="text-xs text-gray-500 ml-auto">{detail}</span>
      )}
    </div>
  );
}
