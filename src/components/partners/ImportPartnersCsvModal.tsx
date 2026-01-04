import React, { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import type { PartnerPayload } from '@/services/partners';

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

function getFirst(row: ImportRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function normalizeTipo(raw: string): 'cliente' | 'fornecedor' | 'ambos' {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'cliente';
  if (v.includes('ambos') || v.includes('cliente_fornecedor')) return 'ambos';
  if (v.includes('forn')) return 'fornecedor';
  if (v.includes('clie')) return 'cliente';
  return 'cliente';
}

function inferTipoPessoa(docDigits: string): 'fisica' | 'juridica' {
  if (docDigits.length === 11) return 'fisica';
  return 'juridica';
}

export default function ImportPartnersCsvModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: { ok: number; failed: number }) => void;
  importFn: (payload: PartnerPayload) => Promise<any>;
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
        const nome = getFirst(row, ['nome', 'razao_social', 'fantasia', 'name']);
        const tipo = normalizeTipo(getFirst(row, ['tipo', 'perfil', 'categoria']));
        const doc = digitsOnly(getFirst(row, ['doc_unico', 'documento', 'cpf', 'cnpj']));
        const email = getFirst(row, ['email', 'e_mail']);
        const telefone = digitsOnly(getFirst(row, ['telefone', 'fone', 'celular', 'whatsapp']));

        if (!nome) {
          failed += 1;
          continue;
        }

        const tipo_pessoa = inferTipoPessoa(doc);

        const payload: PartnerPayload = {
          pessoa: {
            nome,
            fantasia: getFirst(row, ['fantasia', 'nome_fantasia']) || null,
            tipo,
            tipo_pessoa,
            doc_unico: doc || null,
            email: email || null,
            telefone: telefone || null,
            isento_ie: false,
            contribuinte_icms: '9',
          },
          enderecos: [],
          contatos: [],
        };

        // Endereço principal (opcional)
        const cep = digitsOnly(getFirst(row, ['cep']));
        const uf = getFirst(row, ['uf', 'estado']);
        const cidade = getFirst(row, ['cidade', 'municipio']);
        const logradouro = getFirst(row, ['logradouro', 'endereco', 'rua']);
        const numero = getFirst(row, ['numero', 'num']);
        const bairro = getFirst(row, ['bairro']);
        if (cep || uf || cidade || logradouro) {
          payload.enderecos = [
            {
              tipo_endereco: 'principal',
              cep: cep || null,
              uf: uf || null,
              cidade: cidade || null,
              logradouro: logradouro || null,
              numero: numero || null,
              bairro: bairro || null,
              complemento: getFirst(row, ['complemento']) || null,
              pais: 'Brasil',
              pais_codigo: '1058',
            },
          ];
        }

        try {
          await importFn(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Clientes/Fornecedores (CSV)" size="4xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Campos comuns: <code>nome</code>, <code>tipo</code> (cliente/fornecedor/ambos), <code>documento</code>,{' '}
            <code>email</code>, <code>telefone</code>, <code>cep</code>, <code>logradouro</code>, <code>numero</code>, <code>cidade</code>, <code>uf</code>.
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
          placeholder={'nome;tipo;documento;email;telefone;cep;logradouro;numero;cidade;uf\nCliente A;cliente;12345678901;cliente@email.com;11999999999;01001000;Rua X;100;São Paulo;SP'}
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

