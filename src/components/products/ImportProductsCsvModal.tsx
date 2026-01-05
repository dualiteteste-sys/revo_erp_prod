import React, { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';

type ImportRow = Record<string, string>;

function detectDelimiter(headerLine: string): ',' | ';' {
  const comma = (headerLine.match(/,/g) || []).length;
  const semicolon = (headerLine.match(/;/g) || []).length;
  return semicolon > comma ? ';' : ',';
}

function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '');
}

function parseCsv(text: string): ImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(normalizeHeader);

  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter).map((c) => c.trim());
    const row: ImportRow = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function digitsOnly(s: string) {
  return (s || '').replace(/\D/g, '');
}

function parseMoney(raw: string): number | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  // suporta "1.234,56" e "1234.56"
  const normalized = v.includes(',')
    ? v.replace(/\./g, '').replace(',', '.')
    : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string): boolean | null {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (['1', 'true', 'sim', 's', 'yes', 'y'].includes(v)) return true;
  if (['0', 'false', 'nao', 'não', 'n', 'no'].includes(v)) return false;
  return null;
}

function getFirst(row: ImportRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export default function ImportProductsCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  importFn: (payload: any) => Promise<any>;
}) {
  const { isOpen, onClose, onImported, importFn } = props;
  const { addToast } = useToast();

  const [text, setText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ ok: number; failed: number } | null>(null);

  const preview = useMemo(() => parseCsv(text), [text]);

  const handlePickFile = async (file: File) => {
    const content = await file.text();
    setText(content);
  };

  const handleImport = async () => {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      addToast('Cole um CSV válido (com cabeçalho + linhas).', 'warning');
      return;
    }

    setIsImporting(true);
    setLastSummary(null);
    let ok = 0;
    let failed = 0;

    try {
      for (const row of rows) {
        const nome = getFirst(row, ['nome', 'descricao', 'produto', 'name']);
        const sku = getFirst(row, ['sku', 'codigo', 'codigo_interno', 'code']);
        const unidade = getFirst(row, ['unidade', 'un', 'unidade_sigla', 'unit']) || 'un';
        const statusRaw = getFirst(row, ['status', 'ativo', 'active']);
        const precoRaw = getFirst(row, ['preco_venda', 'preco', 'valor', 'price']);
        const ncm = digitsOnly(getFirst(row, ['ncm']));

        if (!nome) {
          failed += 1;
          continue;
        }
        if (!sku) {
          failed += 1;
          continue;
        }

        const preco_venda = parseMoney(precoRaw);
        const controla_estoque = parseBool(getFirst(row, ['controla_estoque', 'estoque', 'stock']));
        const pode_comprar = parseBool(getFirst(row, ['pode_comprar', 'compravel']));
        const pode_vender = parseBool(getFirst(row, ['pode_vender', 'vendavel']));

        const status =
          statusRaw.toLowerCase() === 'inativo' || statusRaw.toLowerCase() === 'false' || statusRaw === '0'
            ? 'inativo'
            : 'ativo';

        try {
          await importFn({
            tipo: 'simples',
            nome,
            sku,
            unidade,
            status,
            preco_venda: preco_venda ?? 0,
            moeda: 'BRL',
            ncm: ncm || null,
            controla_estoque: controla_estoque ?? true,
            permitir_inclusao_vendas: true,
            pode_comprar: pode_comprar ?? true,
            pode_vender: pode_vender ?? true,
          });
          ok += 1;
        } catch {
          failed += 1;
        }
      }

      setLastSummary({ ok, failed });
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar Produtos (CSV)"
      size="4xl"
      bodyClassName="p-6 md:p-8"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Formato esperado (cabeçalho + linhas). Campos comuns: `nome`, `sku`, `unidade`, `preco_venda`, `status`, `ncm`.
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer text-sm font-medium">
            <FileUp size={16} />
            Selecionar arquivo
            <input
              type="file"
              accept=".csv,text/csv"
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
          label="CSV"
          name="csv"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'nome;sku;unidade;preco_venda;status;ncm\nProduto A;SKU-001;un;10,50;ativo;12345678'}
          rows={12}
        />

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Prévia: {preview.length} linha(s){lastSummary ? ` · Última: ${lastSummary.ok} ok, ${lastSummary.failed} falharam` : ''}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleImport()} disabled={isImporting || preview.length === 0}>
              {isImporting ? <Loader2 className="animate-spin" size={18} /> : null}
              <span className="ml-2">Importar</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
