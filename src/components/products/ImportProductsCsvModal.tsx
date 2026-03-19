import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import { digitsOnly, getFirst, parseBoolPt, parseCsv, parseMoneyBr, type ParsedCsvRow } from '@/lib/csvImport';
import { readTabularImportFile, TABULAR_IMPORT_ACCEPT } from '@/lib/tabularImport';
import {
  deriveDefaultMapping,
  loadSavedMapping,
  resolveMappedField,
  sanitizeMapping,
  saveMapping,
  upperPtBr,
  type ImportFieldMapping,
} from '@/lib/importMapping';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { callRpc } from '@/lib/api';

// ---------------------------------------------------------------------------
// Extra data that lives outside the main product payload (resolved post-create)
// ---------------------------------------------------------------------------
type ExtraData = {
  marca_nome?: string;
  grupo_nome?: string;
  codigo_pai?: string;
  fornecedor_nome?: string;
  codigo_fornecedor?: string;
  imagem_urls?: string[];
};

type PreviewRow = {
  line: number;
  nome: string;
  sku: string;
  unidade: string;
  status: 'ativo' | 'inativo';
  preco: number | null;
  ncm: string | null;
  errors: string[];
  payload: any | null;
  extra: ExtraData;
};

type WizardStep = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// All target fields the import supports
// ---------------------------------------------------------------------------
type TargetFieldKey =
  // Core
  | 'nome' | 'sku' | 'unidade' | 'status' | 'preco_venda' | 'preco_custo' | 'markup'
  | 'descricao' | 'descricao_complementar' | 'observacoes_internas' | 'tipo'
  // Fiscal
  | 'ncm' | 'cest' | 'icms_origem' | 'valor_ipi_fixo'
  | 'codigo_enquadramento_ipi' | 'ex_tipi'
  // GTIN
  | 'gtin' | 'gtin_tributavel'
  // Physical
  | 'peso_liquido_kg' | 'peso_bruto_kg'
  | 'tipo_embalagem' | 'largura_cm' | 'altura_cm' | 'comprimento_cm' | 'diametro_cm'
  // Stock
  | 'controla_estoque' | 'estoque_min' | 'estoque_max' | 'localizacao'
  | 'controlar_lotes' | 'itens_por_caixa'
  // Flags
  | 'pode_comprar' | 'pode_vender'
  // SEO & Web
  | 'slug' | 'seo_titulo' | 'seo_descricao' | 'keywords' | 'video_url'
  // Ops
  | 'garantia_meses' | 'dias_preparacao'
  // Relations (resolved via RPC)
  | 'marca_nome' | 'grupo_nome' | 'codigo_pai'
  | 'fornecedor_nome' | 'codigo_fornecedor'
  // Images (up to 10 URLs)
  | 'imagem_url_1' | 'imagem_url_2' | 'imagem_url_3' | 'imagem_url_4' | 'imagem_url_5'
  | 'imagem_url_6' | 'imagem_url_7' | 'imagem_url_8' | 'imagem_url_9' | 'imagem_url_10';

type FieldMapping = ImportFieldMapping<TargetFieldKey>;
type FieldGroup = 'produto' | 'fiscal' | 'fisico' | 'estoque' | 'flags' | 'seo' | 'relacoes' | 'imagens';

type DedupeKey = 'sku' | 'nome';
type DedupeStrategy = 'none' | 'first' | 'last';

const MAPPING_STORAGE_KEY = 'revo:import_mapping:products:v2';

const TARGET_FIELDS: Array<{ key: TargetFieldKey; label: string; required?: boolean; group: FieldGroup }> = [
  // Core
  { key: 'nome', label: 'Nome', required: true, group: 'produto' },
  { key: 'sku', label: 'SKU', required: true, group: 'produto' },
  { key: 'unidade', label: 'Unidade', group: 'produto' },
  { key: 'status', label: 'Status (ativo/inativo)', group: 'produto' },
  { key: 'tipo', label: 'Tipo do produto', group: 'produto' },
  { key: 'preco_venda', label: 'Preço de venda', group: 'produto' },
  { key: 'preco_custo', label: 'Preço de custo', group: 'produto' },
  { key: 'markup', label: 'Markup', group: 'produto' },
  { key: 'descricao', label: 'Descrição', group: 'produto' },
  { key: 'descricao_complementar', label: 'Descrição complementar', group: 'produto' },
  { key: 'observacoes_internas', label: 'Observações', group: 'produto' },
  { key: 'garantia_meses', label: 'Garantia (meses)', group: 'produto' },
  { key: 'dias_preparacao', label: 'Dias para preparação', group: 'produto' },
  // Fiscal
  { key: 'ncm', label: 'NCM (Classificação fiscal)', group: 'fiscal' },
  { key: 'cest', label: 'CEST', group: 'fiscal' },
  { key: 'icms_origem', label: 'Origem fiscal (0-8)', group: 'fiscal' },
  { key: 'valor_ipi_fixo', label: 'Valor IPI fixo', group: 'fiscal' },
  { key: 'codigo_enquadramento_ipi', label: 'Cód. Enquadramento IPI', group: 'fiscal' },
  { key: 'ex_tipi', label: 'EX TIPI', group: 'fiscal' },
  { key: 'gtin', label: 'GTIN/EAN', group: 'fiscal' },
  { key: 'gtin_tributavel', label: 'GTIN/EAN tributável', group: 'fiscal' },
  // Physical
  { key: 'peso_liquido_kg', label: 'Peso líquido (Kg)', group: 'fisico' },
  { key: 'peso_bruto_kg', label: 'Peso bruto (Kg)', group: 'fisico' },
  { key: 'tipo_embalagem', label: 'Formato embalagem', group: 'fisico' },
  { key: 'largura_cm', label: 'Largura embalagem (cm)', group: 'fisico' },
  { key: 'altura_cm', label: 'Altura embalagem (cm)', group: 'fisico' },
  { key: 'comprimento_cm', label: 'Comprimento embalagem (cm)', group: 'fisico' },
  { key: 'diametro_cm', label: 'Diâmetro embalagem (cm)', group: 'fisico' },
  { key: 'itens_por_caixa', label: 'Unidade por caixa', group: 'fisico' },
  // Stock
  { key: 'controla_estoque', label: 'Controla estoque (sim/não)', group: 'estoque' },
  { key: 'estoque_min', label: 'Estoque mínimo', group: 'estoque' },
  { key: 'estoque_max', label: 'Estoque máximo', group: 'estoque' },
  { key: 'localizacao', label: 'Localização', group: 'estoque' },
  { key: 'controlar_lotes', label: 'Controlar lotes (sim/não)', group: 'estoque' },
  // Flags
  { key: 'pode_comprar', label: 'Pode comprar (sim/não)', group: 'flags' },
  { key: 'pode_vender', label: 'Pode vender (sim/não)', group: 'flags' },
  // SEO
  { key: 'slug', label: 'Slug', group: 'seo' },
  { key: 'seo_titulo', label: 'Título SEO', group: 'seo' },
  { key: 'seo_descricao', label: 'Descrição SEO', group: 'seo' },
  { key: 'keywords', label: 'Palavras chave SEO', group: 'seo' },
  { key: 'video_url', label: 'Link do vídeo', group: 'seo' },
  // Relations
  { key: 'marca_nome', label: 'Marca', group: 'relacoes' },
  { key: 'grupo_nome', label: 'Categoria', group: 'relacoes' },
  { key: 'codigo_pai', label: 'Código do pai (SKU)', group: 'relacoes' },
  { key: 'fornecedor_nome', label: 'Fornecedor', group: 'relacoes' },
  { key: 'codigo_fornecedor', label: 'Cód. do Fornecedor', group: 'relacoes' },
  // Images
  { key: 'imagem_url_1', label: 'URL imagem 1', group: 'imagens' },
  { key: 'imagem_url_2', label: 'URL imagem 2', group: 'imagens' },
  { key: 'imagem_url_3', label: 'URL imagem 3', group: 'imagens' },
  { key: 'imagem_url_4', label: 'URL imagem 4', group: 'imagens' },
  { key: 'imagem_url_5', label: 'URL imagem 5', group: 'imagens' },
  { key: 'imagem_url_6', label: 'URL imagem 6', group: 'imagens' },
  { key: 'imagem_url_7', label: 'URL imagem 7', group: 'imagens' },
  { key: 'imagem_url_8', label: 'URL imagem 8', group: 'imagens' },
  { key: 'imagem_url_9', label: 'URL imagem 9', group: 'imagens' },
  { key: 'imagem_url_10', label: 'URL imagem 10', group: 'imagens' },
];

const TARGET_KEYS: TargetFieldKey[] = TARGET_FIELDS.map((f) => f.key);

const GROUP_LABELS: Record<FieldGroup, string> = {
  produto: 'Produto',
  fiscal: 'Fiscal',
  fisico: 'Físico / Embalagem',
  estoque: 'Estoque',
  flags: 'Permissões',
  seo: 'SEO / Web',
  relacoes: 'Relações',
  imagens: 'Imagens',
};

const FIELD_SYNONYMS: Record<TargetFieldKey, string[]> = {
  nome: ['nome', 'produto', 'name', 'description'],
  sku: ['sku', 'codigo', 'codigo_interno', 'code', 'cod'],
  unidade: ['unidade', 'un', 'unidade_sigla', 'unit'],
  status: ['status', 'ativo', 'active'],
  tipo: ['tipo', 'tipo_produto', 'type'],
  preco_venda: ['preco_venda', 'preco', 'valor', 'price', 'preco de venda'],
  preco_custo: ['preco_custo', 'custo', 'preco de custo', 'cost'],
  markup: ['markup', 'margem'],
  descricao: ['descricao', 'desc'],
  descricao_complementar: ['descricao_complementar', 'complementar', 'descricao complementar'],
  observacoes_internas: ['observacoes_internas', 'observacoes', 'observacao', 'obs', 'notas'],
  garantia_meses: ['garantia_meses', 'garantia'],
  dias_preparacao: ['dias_preparacao', 'dias para preparacao', 'preparacao', 'lead_time'],
  ncm: ['ncm', 'classificacao_fiscal', 'classificacao fiscal'],
  cest: ['cest'],
  icms_origem: ['icms_origem', 'origem', 'origem_fiscal', 'origem fiscal'],
  valor_ipi_fixo: ['valor_ipi_fixo', 'ipi_fixo', 'valor ipi fixo'],
  codigo_enquadramento_ipi: ['codigo_enquadramento_ipi', 'enquadramento_ipi', 'codigo de enquadramento ipi', 'codigo enquadramento ipi'],
  ex_tipi: ['ex_tipi', 'extipi'],
  gtin: ['gtin', 'ean', 'gtin_ean', 'codigo_barras', 'gtin/ean'],
  gtin_tributavel: ['gtin_tributavel', 'ean_tributavel', 'gtin/ean tributavel'],
  peso_liquido_kg: ['peso_liquido_kg', 'peso_liquido', 'peso liquido', 'peso liq'],
  peso_bruto_kg: ['peso_bruto_kg', 'peso_bruto', 'peso bruto'],
  tipo_embalagem: ['tipo_embalagem', 'formato_embalagem', 'formato embalagem', 'embalagem'],
  largura_cm: ['largura_cm', 'largura', 'largura embalagem'],
  altura_cm: ['altura_cm', 'altura', 'altura embalagem'],
  comprimento_cm: ['comprimento_cm', 'comprimento', 'comprimento embalagem', 'profundidade'],
  diametro_cm: ['diametro_cm', 'diametro', 'diametro embalagem'],
  itens_por_caixa: ['itens_por_caixa', 'unidade_por_caixa', 'unidade por caixa', 'qtd_caixa'],
  controla_estoque: ['controla_estoque', 'estoque', 'stock'],
  estoque_min: ['estoque_min', 'estoque_minimo', 'estoque minimo', 'min_stock'],
  estoque_max: ['estoque_max', 'estoque_maximo', 'estoque maximo', 'max_stock'],
  localizacao: ['localizacao', 'local', 'location'],
  controlar_lotes: ['controlar_lotes', 'lotes', 'lot_control'],
  pode_comprar: ['pode_comprar', 'compravel'],
  pode_vender: ['pode_vender', 'vendavel'],
  slug: ['slug'],
  seo_titulo: ['seo_titulo', 'titulo_seo', 'titulo seo'],
  seo_descricao: ['seo_descricao', 'descricao_seo', 'descricao seo'],
  keywords: ['keywords', 'palavras_chave', 'palavras chave', 'palavras chave seo', 'tags'],
  video_url: ['video_url', 'link_video', 'link do video', 'video'],
  marca_nome: ['marca_nome', 'marca', 'brand'],
  grupo_nome: ['grupo_nome', 'grupo', 'categoria', 'category'],
  codigo_pai: ['codigo_pai', 'codigo_do_pai', 'codigo do pai', 'parent_sku', 'sku_pai'],
  fornecedor_nome: ['fornecedor_nome', 'fornecedor', 'supplier'],
  codigo_fornecedor: ['codigo_fornecedor', 'cod_fornecedor', 'codigo do fornecedor', 'cod do fornecedor'],
  imagem_url_1: ['imagem_url_1', 'url_imagem_1', 'url imagem 1', 'imagem_1', 'imagem 1', 'url imagem externa 1'],
  imagem_url_2: ['imagem_url_2', 'url_imagem_2', 'url imagem 2', 'imagem_2', 'imagem 2', 'url imagem externa 2'],
  imagem_url_3: ['imagem_url_3', 'url_imagem_3', 'url imagem 3', 'imagem_3', 'imagem 3', 'url imagem externa 3'],
  imagem_url_4: ['imagem_url_4', 'url_imagem_4', 'url imagem 4', 'imagem_4', 'imagem 4', 'url imagem externa 4'],
  imagem_url_5: ['imagem_url_5', 'url_imagem_5', 'url imagem 5', 'imagem_5', 'imagem 5', 'url imagem externa 5'],
  imagem_url_6: ['imagem_url_6', 'url_imagem_6', 'url imagem 6', 'imagem_6', 'imagem 6', 'url imagem externa 6'],
  imagem_url_7: ['imagem_url_7', 'url_imagem_7', 'url imagem 7', 'imagem_7', 'imagem 7', 'url imagem externa 7'],
  imagem_url_8: ['imagem_url_8', 'url_imagem_8', 'url imagem 8', 'imagem_8', 'imagem 8', 'url imagem externa 8'],
  imagem_url_9: ['imagem_url_9', 'url_imagem_9', 'url imagem 9', 'imagem_9', 'imagem 9', 'url imagem externa 9'],
  imagem_url_10: ['imagem_url_10', 'url_imagem_10', 'url imagem 10', 'imagem_10', 'imagem 10', 'url imagem externa 10'],
};

// ---------------------------------------------------------------------------
// Helpers for enum normalization
// ---------------------------------------------------------------------------
const TIPO_EMBALAGEM_MAP: Record<string, string> = {
  'pacote': 'pacote', 'caixa': 'pacote_caixa', 'pacote_caixa': 'pacote_caixa',
  'envelope': 'envelope', 'rolo': 'rolo_cilindro', 'cilindro': 'rolo_cilindro',
  'rolo_cilindro': 'rolo_cilindro', 'outro': 'outro',
};

const TIPO_PRODUTO_MAP: Record<string, string> = {
  'simples': 'simples', 's': 'simples', 'kit': 'kit', 'k': 'kit',
  'variacoes': 'variacoes', 'v': 'variacoes',
  'fabricado': 'fabricado', 'materia_prima': 'materia_prima', 'materia prima': 'materia_prima',
  'semiacabado': 'semiacabado', 'consumivel': 'consumivel', 'fantasma': 'fantasma',
};

function parseIntSafe(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseNumSafe(v: string | undefined | null): number | null {
  if (!v) return null;
  return parseMoneyBr(v);
}

function trimOrNull(v: string | undefined | null): string | null {
  if (!v) return null;
  const t = v.trim();
  return t || null;
}

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

// ---------------------------------------------------------------------------
// Caches for batch entity resolution (populated before import loop)
// ---------------------------------------------------------------------------
type EntityCache = {
  marcaMap: Map<string, string>;     // lowercase name → uuid
  grupoMap: Map<string, string>;     // lowercase name → uuid
  skuMap: Map<string, string>;       // lowercase sku → uuid (for parent resolution)
};

async function resolveEntities(rows: PreviewRow[]): Promise<EntityCache> {
  const marcaMap = new Map<string, string>();
  const grupoMap = new Map<string, string>();
  const skuMap = new Map<string, string>();

  // Collect unique names
  const marcaNomes = new Set<string>();
  const grupoNomes = new Set<string>();
  const parentSkus = new Set<string>();

  for (const r of rows) {
    if (r.extra.marca_nome) marcaNomes.add(r.extra.marca_nome.trim());
    if (r.extra.grupo_nome) grupoNomes.add(r.extra.grupo_nome.trim());
    if (r.extra.codigo_pai) parentSkus.add(r.extra.codigo_pai.trim());
  }

  // Resolve marcas (find or create)
  for (const nome of marcaNomes) {
    try {
      const id = await callRpc<string>('marcas_find_or_create', { p_nome: nome });
      if (id) marcaMap.set(nome.toLowerCase(), id);
    } catch {
      // skip — marca won't be linked
    }
  }

  // Resolve grupos (find or create via upsert)
  for (const nome of grupoNomes) {
    try {
      const result = await callRpc<{ id: string }>('upsert_produto_grupo', { p_payload: { nome } });
      if (result?.id) grupoMap.set(nome.toLowerCase(), result.id);
    } catch {
      // skip
    }
  }

  // Resolve parent SKUs
  for (const sku of parentSkus) {
    try {
      const id = await callRpc<string | null>('produtos_find_by_sku', { p_sku: sku });
      if (id) skuMap.set(sku.toLowerCase(), id);
    } catch {
      // skip
    }
  }

  return { marcaMap, grupoMap, skuMap };
}

async function insertImagesForProduct(produtoId: string, urls: string[]): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    try {
      await callRpc('produto_imagens_insert_for_current_user', {
        p_produto_id: produtoId,
        p_url: urls[i],
        p_ordem: i,
        p_principal: i === 0,
      });
    } catch {
      // image insert failure is non-fatal
    }
  }
}

async function linkFornecedor(produtoId: string, nome: string, codigo?: string): Promise<void> {
  try {
    await callRpc('produto_fornecedor_link', {
      p_produto_id: produtoId,
      p_fornecedor_nome: nome,
      p_codigo_no_fornecedor: codigo || null,
    });
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ImportProductsCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  importFn: (payload: any) => Promise<any>;
  deleteFn?: (id: string) => Promise<void>;
}) {
  const { isOpen, onClose, onImported, importFn, deleteFn } = props;
  const { addToast } = useToast();

  const [step, setStep] = useState<WizardStep>(0);
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<ParsedCsvRow[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [rollingBack, setRollingBack] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<FieldGroup>>(
    new Set(['fisico', 'seo', 'imagens']),
  );

  const parsed = useMemo(() => fileRows ?? parseCsv(text), [fileRows, text]);
  const sourceKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of parsed) Object.keys(r.raw).forEach((k) => s.add(k));
    return [...s].sort();
  }, [parsed]);

  const [mapping, setMapping] = useState<FieldMapping>(() =>
    deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys: [], synonyms: FIELD_SYNONYMS }),
  );
  const [hasCustomMapping, setHasCustomMapping] = useState(false);
  const [dedupeKey, setDedupeKey] = useState<DedupeKey>('sku');
  const [dedupeStrategy, setDedupeStrategy] = useState<DedupeStrategy>('first');
  const [forceUppercase, setForceUppercase] = useState(false);
  const [previewSort, setPreviewSort] = useState<SortState<'line' | 'nome' | 'sku' | 'preco' | 'status' | 'errors'>>({
    column: 'line',
    direction: 'asc',
  });

  const mappingColumns: TableColumnWidthDef[] = [
    { id: 'campo', defaultWidth: 260, minWidth: 180 },
    { id: 'coluna', defaultWidth: 340, minWidth: 220 },
    { id: 'obrigatorio', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths: mappingWidths, startResize: startMappingResize } = useTableColumnWidths({
    tableId: 'import:products:mapping',
    columns: mappingColumns,
  });

  const previewColumns: TableColumnWidthDef[] = [
    { id: 'line', defaultWidth: 90, minWidth: 80 },
    { id: 'nome', defaultWidth: 320, minWidth: 200 },
    { id: 'sku', defaultWidth: 160, minWidth: 120 },
    { id: 'preco', defaultWidth: 140, minWidth: 120 },
    { id: 'status', defaultWidth: 120, minWidth: 110 },
    { id: 'errors', defaultWidth: 520, minWidth: 260 },
  ];
  const { widths: previewWidths, startResize: startPreviewResize } = useTableColumnWidths({
    tableId: 'import:products:preview',
    columns: previewColumns,
  });

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setLastSummary(null);
    setCreatedIds([]);
    setRollingBack(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setMapping((current) => {
      if (hasCustomMapping) return sanitizeMapping(current, sourceKeys);
      const saved = loadSavedMapping<TargetFieldKey>(MAPPING_STORAGE_KEY, TARGET_KEYS);
      const derived = deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys, synonyms: FIELD_SYNONYMS });
      return sanitizeMapping({ ...derived, ...(saved ?? {}) } as FieldMapping, sourceKeys);
    });
  }, [isOpen, sourceKeys, hasCustomMapping]);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasCustomMapping) return;
    saveMapping(MAPPING_STORAGE_KEY, mapping);
  }, [isOpen, hasCustomMapping, mapping]);

  const resolveField = (row: Record<string, string>, key: TargetFieldKey) =>
    resolveMappedField({ row, key, mapping, synonyms: FIELD_SYNONYMS, getFirst });

  // ---------------------------------------------------------------------------
  // Build preview row with ALL fields
  // ---------------------------------------------------------------------------
  function buildPreviewRow(r: ParsedCsvRow): PreviewRow {
    const row = r.raw;
    const errors: string[] = [];

    const maybeUpper = (v: string, k: TargetFieldKey) => {
      if (!forceUppercase) return v;
      if (['preco_venda', 'preco_custo', 'markup', 'status', 'gtin', 'gtin_tributavel', 'ncm', 'cest'].includes(k)) return v;
      return upperPtBr(v);
    };

    // Core
    const nome = maybeUpper(resolveField(row, 'nome'), 'nome');
    const sku = maybeUpper(String(resolveField(row, 'sku') || '').trim(), 'sku');
    const unidade = maybeUpper(String(resolveField(row, 'unidade') || 'un').trim() || 'un', 'unidade');
    const statusRaw = resolveField(row, 'status');
    const precoRaw = resolveField(row, 'preco_venda');
    const ncm = digitsOnly(resolveField(row, 'ncm')) || null;
    const descricao = trimOrNull(resolveField(row, 'descricao'));
    const descricao_complementar = trimOrNull(resolveField(row, 'descricao_complementar'));
    const observacoes_internas = trimOrNull(resolveField(row, 'observacoes_internas'));

    if (!nome) errors.push('nome é obrigatório');
    if (!sku) errors.push('sku é obrigatório');

    const preco = parseMoneyBr(precoRaw);
    if (precoRaw && preco === null) errors.push('preço inválido');

    if (ncm && ncm.length !== 8) errors.push('ncm deve ter 8 dígitos');

    const statusStr = String(statusRaw || '').toLowerCase();
    const status = statusStr === 'inativo' || statusStr === 'false' || statusStr === '0' ? 'inativo' : 'ativo';

    // Tipo
    const tipoRaw = resolveField(row, 'tipo')?.toLowerCase().trim() || '';
    const tipo = TIPO_PRODUTO_MAP[tipoRaw] || 'simples';

    // Pricing
    const preco_custo = parseNumSafe(resolveField(row, 'preco_custo'));
    const markup_val = parseNumSafe(resolveField(row, 'markup'));
    const garantia_meses = parseIntSafe(resolveField(row, 'garantia_meses'));
    const dias_preparacao = parseIntSafe(resolveField(row, 'dias_preparacao'));

    // Fiscal
    const cest = trimOrNull(resolveField(row, 'cest'));
    const icms_origem_raw = resolveField(row, 'icms_origem');
    const icms_origem_val = icms_origem_raw ? parseIntSafe(icms_origem_raw) : null;
    if (icms_origem_val !== null && (icms_origem_val < 0 || icms_origem_val > 8)) {
      errors.push('icms_origem deve ser 0-8');
    }
    const valor_ipi_fixo = parseNumSafe(resolveField(row, 'valor_ipi_fixo'));
    const codigo_enquadramento_ipi = trimOrNull(resolveField(row, 'codigo_enquadramento_ipi'));
    const ex_tipi = trimOrNull(resolveField(row, 'ex_tipi'));
    const gtin = trimOrNull(resolveField(row, 'gtin'));
    const gtin_tributavel = trimOrNull(resolveField(row, 'gtin_tributavel'));

    // Physical
    const peso_liquido_kg = parseNumSafe(resolveField(row, 'peso_liquido_kg'));
    const peso_bruto_kg = parseNumSafe(resolveField(row, 'peso_bruto_kg'));
    const tipo_embalagem_raw = resolveField(row, 'tipo_embalagem')?.toLowerCase().trim() || '';
    const tipo_embalagem = TIPO_EMBALAGEM_MAP[tipo_embalagem_raw] || null;
    const largura_cm = parseNumSafe(resolveField(row, 'largura_cm'));
    const altura_cm = parseNumSafe(resolveField(row, 'altura_cm'));
    const comprimento_cm = parseNumSafe(resolveField(row, 'comprimento_cm'));
    const diametro_cm = parseNumSafe(resolveField(row, 'diametro_cm'));
    const itens_por_caixa = parseIntSafe(resolveField(row, 'itens_por_caixa'));

    // Stock
    const controla_estoque = parseBoolPt(resolveField(row, 'controla_estoque'));
    const estoque_min = parseNumSafe(resolveField(row, 'estoque_min'));
    const estoque_max = parseNumSafe(resolveField(row, 'estoque_max'));
    const localizacao = trimOrNull(resolveField(row, 'localizacao'));
    const controlar_lotes = parseBoolPt(resolveField(row, 'controlar_lotes'));

    // Flags
    const pode_comprar = parseBoolPt(resolveField(row, 'pode_comprar'));
    const pode_vender = parseBoolPt(resolveField(row, 'pode_vender'));

    // SEO
    const slug = trimOrNull(resolveField(row, 'slug'));
    const seo_titulo = trimOrNull(resolveField(row, 'seo_titulo'));
    const seo_descricao = trimOrNull(resolveField(row, 'seo_descricao'));
    const keywords_val = trimOrNull(resolveField(row, 'keywords'));
    const video_url = trimOrNull(resolveField(row, 'video_url'));

    // Relations (resolved later in batch)
    const marca_nome = trimOrNull(maybeUpper(resolveField(row, 'marca_nome') || '', 'marca_nome'));
    const grupo_nome = trimOrNull(maybeUpper(resolveField(row, 'grupo_nome') || '', 'grupo_nome'));
    const codigo_pai = trimOrNull(resolveField(row, 'codigo_pai'));
    const fornecedor_nome = trimOrNull(resolveField(row, 'fornecedor_nome'));
    const codigo_fornecedor = trimOrNull(resolveField(row, 'codigo_fornecedor'));

    // Images
    const imagem_urls: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const url = trimOrNull(resolveField(row, `imagem_url_${i}` as TargetFieldKey));
      if (url && isUrl(url)) imagem_urls.push(url);
    }

    const extra: ExtraData = {
      marca_nome: marca_nome || undefined,
      grupo_nome: grupo_nome || undefined,
      codigo_pai: codigo_pai || undefined,
      fornecedor_nome: fornecedor_nome || undefined,
      codigo_fornecedor: codigo_fornecedor || undefined,
      imagem_urls: imagem_urls.length > 0 ? imagem_urls : undefined,
    };

    const payload =
      errors.length > 0
        ? null
        : {
            tipo,
            nome,
            sku,
            unidade,
            status,
            preco_venda: preco ?? 0,
            moeda: 'BRL',
            icms_origem: icms_origem_val ?? 0,
            ncm,
            cest,
            gtin,
            gtin_tributavel,
            descricao,
            descricao_complementar,
            observacoes_internas,
            preco_custo,
            markup: markup_val,
            garantia_meses,
            dias_preparacao,
            valor_ipi_fixo,
            codigo_enquadramento_ipi,
            ex_tipi,
            peso_liquido_kg,
            peso_bruto_kg,
            tipo_embalagem,
            largura_cm,
            altura_cm,
            comprimento_cm,
            diametro_cm,
            itens_por_caixa,
            controla_estoque: controla_estoque ?? true,
            estoque_min,
            estoque_max,
            localizacao,
            controlar_lotes,
            permitir_inclusao_vendas: true,
            pode_comprar: pode_comprar ?? true,
            pode_vender: pode_vender ?? true,
            slug,
            seo_titulo,
            seo_descricao,
            keywords: keywords_val,
            video_url,
          };

    return { line: r.line, nome, sku, unidade, status, preco, ncm, errors, payload, extra };
  }

  const { preview, duplicateKeys } = useMemo(() => {
    const base = parsed.map(buildPreviewRow);
    const keyFn = (r: PreviewRow) => {
      if (dedupeKey === 'sku') return r.sku ? `sku:${String(r.sku).toLowerCase()}` : '';
      return r.nome ? `nome:${String(r.nome).toLowerCase()}` : '';
    };

    const groups = new Map<string, PreviewRow[]>();
    for (const r of base) {
      const k = keyFn(r);
      if (!k) continue;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const duplicates = [...groups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([k, rows]) => ({ key: k, count: rows.length, lines: rows.map((r) => r.line) }));

    if (dedupeStrategy === 'none' || duplicates.length === 0) {
      return { preview: base, duplicateKeys: duplicates };
    }

    const pickIndex = dedupeStrategy === 'last' ? -1 : 0;
    const keepLine = new Map<number, boolean>();
    for (const r of base) keepLine.set(r.line, true);
    for (const [, rows] of groups) {
      if (rows.length <= 1) continue;
      const picked = pickIndex === -1 ? rows[rows.length - 1] : rows[0];
      for (const rr of rows) keepLine.set(rr.line, rr.line === picked.line);
    }
    return { preview: base.filter((r) => keepLine.get(r.line)), duplicateKeys: duplicates };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapping, dedupeKey, dedupeStrategy, forceUppercase]);

  const totals = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((p) => p.errors.length === 0).length;
    return { total, valid, invalid: total - valid };
  }, [preview]);

  // Count how many rows use relations/images
  const extraCounts = useMemo(() => {
    let marcas = 0, grupos = 0, pais = 0, fornecedores = 0, imagens = 0;
    for (const r of preview) {
      if (r.extra.marca_nome) marcas++;
      if (r.extra.grupo_nome) grupos++;
      if (r.extra.codigo_pai) pais++;
      if (r.extra.fornecedor_nome) fornecedores++;
      if (r.extra.imagem_urls?.length) imagens += r.extra.imagem_urls.length;
    }
    return { marcas, grupos, pais, fornecedores, imagens };
  }, [preview]);

  const previewSorted = useMemo(() => {
    return sortRows(
      preview,
      previewSort as any,
      [
        { id: 'line', type: 'number', getValue: (r: PreviewRow) => r.line ?? 0 },
        { id: 'nome', type: 'string', getValue: (r: PreviewRow) => r.nome ?? '' },
        { id: 'sku', type: 'string', getValue: (r: PreviewRow) => r.sku ?? '' },
        { id: 'preco', type: 'number', getValue: (r: PreviewRow) => r.preco ?? NaN },
        { id: 'status', type: 'string', getValue: (r: PreviewRow) => r.status ?? '' },
        { id: 'errors', type: 'string', getValue: (r: PreviewRow) => r.errors.join('; ') ?? '' },
      ] as const
    );
  }, [preview, previewSort]);

  const handlePickFile = async (file: File) => {
    const { text: t, rows } = await readTabularImportFile(file);
    setText(t);
    setFileRows(rows);
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      addToast('Selecione um arquivo CSV/XLSX válido ou cole um CSV (com cabeçalho + linhas).', 'warning');
      return;
    }

    setIsImporting(true);
    setLastSummary(null);
    setCreatedIds([]);
    let ok = 0;
    let failed = 0;
    const localCreated: string[] = [];

    try {
      // Pre-resolve entities (marcas, grupos, parent SKUs) in batch
      const validRows = preview.filter((r) => r.payload);
      const hasRelations = validRows.some(
        (r) => r.extra.marca_nome || r.extra.grupo_nome || r.extra.codigo_pai,
      );
      const cache: EntityCache = hasRelations
        ? await resolveEntities(validRows)
        : { marcaMap: new Map(), grupoMap: new Map(), skuMap: new Map() };

      for (const row of preview) {
        if (!row.payload) {
          failed += 1;
          continue;
        }
        try {
          // Enrich payload with resolved relation IDs
          const enriched = { ...row.payload };
          if (row.extra.marca_nome) {
            const marcaId = cache.marcaMap.get(row.extra.marca_nome.toLowerCase());
            if (marcaId) enriched.marca_id = marcaId;
          }
          if (row.extra.grupo_nome) {
            const grupoId = cache.grupoMap.get(row.extra.grupo_nome.toLowerCase());
            if (grupoId) enriched.grupo_id = grupoId;
          }
          if (row.extra.codigo_pai) {
            const paiId = cache.skuMap.get(row.extra.codigo_pai.toLowerCase());
            if (paiId) enriched.produto_pai_id = paiId;
          }

          const created = await importFn(enriched);
          const id = created?.id ? String(created.id) : null;
          if (id) {
            localCreated.push(id);

            // Post-creation: images
            if (row.extra.imagem_urls?.length) {
              await insertImagesForProduct(id, row.extra.imagem_urls);
            }

            // Post-creation: fornecedor
            if (row.extra.fornecedor_nome) {
              await linkFornecedor(id, row.extra.fornecedor_nome, row.extra.codigo_fornecedor);
            }
          }
          ok += 1;
        } catch (e: any) {
          failed += 1;
          console.warn('[CSV_IMPORT][PRODUCTS] row failed', { line: row.line, error: e?.message || e });
        }
      }

      setLastSummary({ ok, failed });
      setCreatedIds(localCreated);
      if (ok > 0) {
        addToast(`Importação concluída: ${ok} sucesso(s), ${failed} falha(s).`, 'success');
        onImported();
      } else {
        addToast(`Nenhum item importado. ${failed} falha(s).`, 'warning');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleRollback = async () => {
    if (!deleteFn) return;
    if (createdIds.length === 0) return;
    setRollingBack(true);
    try {
      let okCount = 0;
      let failCount = 0;
      for (const id of [...createdIds].reverse()) {
        try {
          await deleteFn(id);
          okCount += 1;
        } catch {
          failCount += 1;
        }
      }
      setCreatedIds([]);
      if (okCount > 0) addToast(`Rollback concluído: ${okCount} removido(s).`, 'success');
      if (failCount > 0) addToast(`${failCount} falha(s) no rollback (pode haver vínculos).`, 'warning');
      onImported();
    } finally {
      setRollingBack(false);
    }
  };

  const canGoNextFromStep0 = parsed.length > 0;
  const canGoNextFromStep1 = !!mapping.nome && !!mapping.sku;

  const toggleGroup = (g: FieldGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  // Group fields for display
  const fieldsByGroup = useMemo(() => {
    const groups = new Map<FieldGroup, typeof TARGET_FIELDS>();
    for (const f of TARGET_FIELDS) {
      const arr = groups.get(f.group) ?? [];
      arr.push(f);
      groups.set(f.group, arr);
    }
    return groups;
  }, []);

  // Count mapped fields per group
  const mappedCountByGroup = useMemo(() => {
    const counts = new Map<FieldGroup, number>();
    for (const f of TARGET_FIELDS) {
      if (mapping[f.key]) {
        counts.set(f.group, (counts.get(f.group) ?? 0) + 1);
      }
    }
    return counts;
  }, [mapping]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Produtos (CSV/XLSX)" size="4xl" bodyClassName="p-6 md:p-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className={`rounded-full px-2 py-1 ${step === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>1</span>
            <span className={step === 0 ? 'font-semibold text-gray-900' : ''}>Arquivo/CSV</span>
            <span className="text-gray-300">&rsaquo;</span>
            <span className={`rounded-full px-2 py-1 ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>2</span>
            <span className={step === 1 ? 'font-semibold text-gray-900' : ''}>Mapeamento</span>
            <span className="text-gray-300">&rsaquo;</span>
            <span className={`rounded-full px-2 py-1 ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>3</span>
            <span className={step === 2 ? 'font-semibold text-gray-900' : ''}>Prévia</span>
          </div>

          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => (s - 1) as WizardStep)} disabled={isImporting}>
                Voltar
              </Button>
            ) : null}
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 0) {
                    if (!canGoNextFromStep0) {
                      addToast('Selecione um arquivo CSV/XLSX válido ou cole um CSV (com cabeçalho + linhas).', 'warning');
                      return;
                    }
                    setStep(1);
                    return;
                  }
                  if (!canGoNextFromStep1) {
                    addToast('Mapeie os campos obrigatórios "Nome" e "SKU".', 'warning');
                    return;
                  }
                  setStep(2);
                }}
                disabled={isImporting}
              >
                Próximo
              </Button>
            ) : null}
          </div>
        </div>

        {step === 0 ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                Formato esperado (cabeçalho + linhas). Suportamos <strong>50+ campos</strong> incluindo fiscal, estoque, SEO, imagens e relações.
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer text-sm font-medium">
                <FileUp size={16} />
                Selecionar arquivo
                <input
                  type="file"
                  accept={TABULAR_IMPORT_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePickFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <TextArea
              label="CSV (ou XLS/XLSX via upload)"
              name="csv"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileRows(null);
              }}
              placeholder={'nome;sku;unidade;preco_venda;status;ncm;marca;categoria\nProduto A;SKU-001;un;10,50;ativo;12345678;MinhaMarca;Categoria1'}
              rows={12}
            />
          </>
        ) : null}

        {step === 1 ? (
          <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-800">Mapeamento de campos</div>
                <div className="text-xs text-gray-600">Escolha quais colunas da planilha vão para cada campo do sistema. Seções opcionais podem ser expandidas.</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={forceUppercase}
                  onChange={(e) => setForceUppercase(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
                Maiúsculo
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm text-gray-700">
                Dedupe
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                  value={dedupeKey}
                  onChange={(e) => setDedupeKey(e.target.value as DedupeKey)}
                >
                  <option value="sku">SKU</option>
                  <option value="nome">Nome</option>
                </select>
              </label>
              <label className="text-sm text-gray-700">
                Estratégia
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                  value={dedupeStrategy}
                  onChange={(e) => setDedupeStrategy(e.target.value as DedupeStrategy)}
                >
                  <option value="first">Manter primeiro</option>
                  <option value="last">Manter último</option>
                  <option value="none">Não deduplicar</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setHasCustomMapping(false);
                    const saved = loadSavedMapping<TargetFieldKey>(MAPPING_STORAGE_KEY, TARGET_KEYS);
                    const derived = deriveDefaultMapping({ targetKeys: TARGET_KEYS, sourceKeys, synonyms: FIELD_SYNONYMS });
                    setMapping(sanitizeMapping({ ...derived, ...(saved ?? {}) } as FieldMapping, sourceKeys));
                  }}
                >
                  Recalcular automático
                </Button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto space-y-2">
              {[...fieldsByGroup.entries()].map(([groupKey, fields]) => {
                const isCollapsed = collapsedGroups.has(groupKey);
                const mapped = mappedCountByGroup.get(groupKey) ?? 0;
                return (
                  <div key={groupKey} className="rounded-lg border border-gray-200 bg-white">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 uppercase hover:bg-gray-50"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <span>{GROUP_LABELS[groupKey]} ({fields.length} campos)</span>
                      <span className="flex items-center gap-2">
                        {mapped > 0 ? (
                          <span className="text-green-600 normal-case font-normal">{mapped} mapeado(s)</span>
                        ) : null}
                        <span className="text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
                      </span>
                    </button>
                    {!isCollapsed ? (
                      <table className="min-w-full text-sm table-fixed border-t border-gray-100">
                        <TableColGroup columns={mappingColumns} widths={mappingWidths} />
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                          <tr>
                            <ResizableSortableTh columnId="campo" label="Campo" sortable={false} onResizeStart={startMappingResize} className="px-3 py-1.5" />
                            <ResizableSortableTh columnId="coluna" label="Coluna da planilha" sortable={false} onResizeStart={startMappingResize} className="px-3 py-1.5" />
                            <ResizableSortableTh columnId="obrigatorio" label="Obrigatório" sortable={false} onResizeStart={startMappingResize} className="px-3 py-1.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {fields.map((f) => (
                            <tr key={f.key}>
                              <td className="px-3 py-1.5 text-gray-800">{f.label}</td>
                              <td className="px-3 py-1.5">
                                <select
                                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm"
                                  value={mapping[f.key] ?? ''}
                                  onChange={(e) => {
                                    setHasCustomMapping(true);
                                    setMapping((prev) => ({ ...prev, [f.key]: e.target.value || null }));
                                  }}
                                >
                                  <option value="">—</option>
                                  {sourceKeys.map((k) => (
                                    <option key={k} value={k}>{k}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-1.5 text-gray-600">{f.required ? 'Sim' : 'Não'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {duplicateKeys.length > 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Detectamos {duplicateKeys.length} chave(s) repetida(s) no arquivo.
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-800">Pré-visualização</div>
                <div className="text-xs text-gray-600">
                  {totals.total} linha(s) · {totals.valid} válida(s) · {totals.invalid} com erro
                  {lastSummary ? ` · Última: ${lastSummary.ok} ok, ${lastSummary.failed} falharam` : ''}
                </div>
              </div>

              {(extraCounts.marcas > 0 || extraCounts.grupos > 0 || extraCounts.fornecedores > 0 || extraCounts.imagens > 0) ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {extraCounts.marcas > 0 ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{extraCounts.marcas} marca(s)</span> : null}
                  {extraCounts.grupos > 0 ? <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">{extraCounts.grupos} categoria(s)</span> : null}
                  {extraCounts.pais > 0 ? <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{extraCounts.pais} c/ pai</span> : null}
                  {extraCounts.fornecedores > 0 ? <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded">{extraCounts.fornecedores} c/ fornecedor</span> : null}
                  {extraCounts.imagens > 0 ? <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{extraCounts.imagens} imagem(ns)</span> : null}
                </div>
              ) : null}

              {preview.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">Volte e cole um CSV (ou envie um XLS/XLSX).</div>
              ) : (
                <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-gray-200 bg-white">
                  <table className="min-w-full text-sm table-fixed">
                    <TableColGroup columns={previewColumns} widths={previewWidths} />
                    <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <ResizableSortableTh
                          columnId="line" label="Linha" sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize} className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="nome" label="Nome" sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize} className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="sku" label="SKU" sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize} className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="preco" label="Preço" sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize} className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="status" label="Status" sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize} className="px-3 py-2"
                        />
                        <ResizableSortableTh
                          columnId="errors" label="Erros" sort={previewSort}
                          onSort={(col) => setPreviewSort((prev) => toggleSort(prev as any, col))}
                          onResizeStart={startPreviewResize} className="px-3 py-2"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewSorted.slice(0, 120).map((r) => (
                        <tr key={r.line} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.line}</td>
                          <td className="px-3 py-2">{r.nome || '—'}</td>
                          <td className="px-3 py-2">{r.sku || '—'}</td>
                          <td className="px-3 py-2">{typeof r.preco === 'number' ? `R$ ${r.preco.toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2">{r.status}</td>
                          <td className="px-3 py-2 text-rose-700">{r.errors.join('; ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">Dica: corrija as linhas destacadas em vermelho antes de importar.</div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>
                  Cancelar
                </Button>
                {deleteFn && createdIds.length > 0 ? (
                  <Button type="button" variant="outline" onClick={() => void handleRollback()} disabled={isImporting || rollingBack}>
                    {rollingBack ? <Loader2 className="animate-spin" size={18} /> : null}
                    <span className="ml-2">Desfazer importação</span>
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void handleImport()} disabled={isImporting || totals.valid === 0}>
                  {isImporting ? <Loader2 className="animate-spin" size={18} /> : null}
                  <span className="ml-2">Importar</span>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
