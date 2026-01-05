import React, { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { Service } from '@/services/services';

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

function parseMoney(raw: string): number | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
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

function digitsOnly(s: string) {
  return (s || '').replace(/\D/g, '');
}

export default function ImportServicesCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: { ok: number; failed: number }) => void;
  importFn: (payload: Partial<Service>) => Promise<any>;
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
        const descricao = getFirst(row, ['descricao', 'descrição', 'servico', 'serviço', 'name', 'nome']);
        const codigo = getFirst(row, ['codigo', 'código']);
        const unidade = getFirst(row, ['unidade', 'un']);
        const statusRaw = getFirst(row, ['status', 'situacao', 'situação', 'ativo', 'active']);
        const precoRaw = getFirst(row, ['preco_venda', 'preco', 'valor', 'price']);
        const codigo_servico = getFirst(row, ['codigo_servico', 'codigo_do_servico']);
        const nbs = digitsOnly(getFirst(row, ['nbs']));
        const nbsReq = parseBool(getFirst(row, ['nbs_ibpt_required', 'nbs_obrigatorio', 'ibpt_required']));

        if (!descricao) {
          failed += 1;
          continue;
        }

        const preco = parseMoney(precoRaw);
        const status: Service['status'] =
          statusRaw.toLowerCase() === 'inativo' || statusRaw.toLowerCase() === 'false' || statusRaw === '0' ? 'inativo' : 'ativo';

        try {
          await importFn({
            descricao: descricao.trim(),
            codigo: codigo || null,
            status,
            preco_venda: preco ?? 0,
            unidade: unidade || null,
            codigo_servico: codigo_servico || null,
            nbs: nbs || null,
            nbs_ibpt_required: nbsReq ?? false,
          });
          ok += 1;
        } catch {
          failed += 1;
        }
      }

      const summary = { ok, failed };
      setLastSummary(summary);
      if (ok > 0) {
        addToast(`Importação concluída: ${ok} sucesso(s), ${failed} falha(s).`, 'success');
        onImported(summary);
      } else {
        addToast(`Nenhum item importado. ${failed} falha(s).`, 'warning');
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Serviços (CSV)" size="4xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Campos comuns: <code>descricao</code>, <code>codigo</code>, <code>preco_venda</code>, <code>unidade</code>, <code>status</code>,{' '}
            <code>nbs</code>.
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
          placeholder={'descricao;codigo;preco_venda;unidade;status;nbs\nMão de obra;SV-001;120,00;H;ativo;101010101'}
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

