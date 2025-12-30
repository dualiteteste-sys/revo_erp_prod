import React, { useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import TextArea from '@/components/ui/forms/TextArea';
import { FileUp, Loader2, UploadCloud, DatabaseBackup, FileText } from 'lucide-react';
import { ImportarExtratoPayload, seedExtratos } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import { isSeedEnabled } from '@/utils/seed';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImport: (itens: ImportarExtratoPayload[]) => Promise<void>;
  contaCorrenteId: string;
  onImported?: () => void;
}

export default function ImportarExtratoModal({ isOpen, onClose, onImport, contaCorrenteId, onImported }: Props) {
  const enableSeed = isSeedEnabled();
  const { addToast } = useToast();
  const [csvText, setCsvText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const exampleCsv = useMemo(() => {
    return [
      'Data;Descrição;Valor;Documento',
      '2025-01-10;Depósito;1500.00;DEP001',
      '2025-01-11;Pagamento fornecedor;-250.90;DOC123',
      '2025-01-12;Tarifa bancária;-12.50;',
    ].join('\n');
  }, []);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
        await seedExtratos(contaCorrenteId);
        addToast('Dados de exemplo importados com sucesso!', 'success');
        onImported?.();
        onClose();
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setIsSeeding(false);
    }
  };

  const parseDateToISO = (raw: string): string | null => {
    const value = raw.trim();
    if (!value) return null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    // YYYYMMDD (OFX)
    if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;

    // DD/MM/YYYY or DD-MM-YYYY
    const m = value.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;

    return null;
  };

  const parseMoney = (raw: string): number | null => {
    const value = raw.trim();
    if (!value) return null;
    // Handles: 1.234,56 | 1234,56 | 1234.56 | -123,45
    const normalized = value
      .replace(/\s/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '') // thousand separators
      .replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  };

  const hashString = (input: string): string => {
    // FNV-1a 32-bit (suficiente para hash de import)
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    // to unsigned hex
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  const parseCsvText = (text: string): ImportarExtratoPayload[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];

    const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';

    const itens: ImportarExtratoPayload[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(delimiter).map((p) => p.trim());

      // Skip header-like lines
      if (i === 0 && /data/i.test(parts[0] || '')) continue;
      if (parts.length < 3) continue;

      const dataISO = parseDateToISO(parts[0] || '');
      const descricao = (parts[1] || '').trim();
      const valorNum = parseMoney(parts[2] || '');
      const doc = (parts[3] || '').trim() || undefined;

      if (!dataISO || !descricao || valorNum === null) continue;

      const tipo = valorNum >= 0 ? 'credito' : 'debito';
      const valorAbs = Math.abs(valorNum);
      if (valorAbs <= 0) continue;

      const raw = `${dataISO}|${descricao}|${valorNum}|${doc ?? ''}`;
      itens.push({
        data_lancamento: dataISO,
        descricao,
        valor: valorAbs,
        tipo_lancamento: tipo,
        documento_ref: doc,
        identificador_banco: `CSV-${hashString(raw)}-${i + 1}`,
        hash_importacao: hashString(raw),
        linha_bruta: line,
      });
    }
    return itens;
  };

  const parseOfxText = (text: string): ImportarExtratoPayload[] => {
    // OFX é "SGML-like". Vamos extrair <STMTTRN> entries e tags principais.
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const itens: ImportarExtratoPayload[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const dt = b.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
      const trnamtRaw = b.match(/<TRNAMT>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
      const fitid = b.match(/<FITID>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
      const checknum = b.match(/<CHECKNUM>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
      const name = b.match(/<NAME>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
      const memo = b.match(/<MEMO>([^<\r\n]+)/i)?.[1]?.trim() ?? '';

      const dataISO = parseDateToISO(dt.slice(0, 8));
      const valorNum = parseMoney(trnamtRaw);
      const descricao = (memo || name || 'Lançamento').trim();
      const documento = (checknum || fitid || '').trim() || undefined;

      if (!dataISO || valorNum === null) continue;
      const tipo = valorNum >= 0 ? 'credito' : 'debito';
      const valorAbs = Math.abs(valorNum);
      if (valorAbs <= 0) continue;

      const raw = `${dataISO}|${descricao}|${valorNum}|${documento ?? ''}|${fitid}`;
      itens.push({
        data_lancamento: dataISO,
        descricao,
        valor: valorAbs,
        tipo_lancamento: tipo,
        documento_ref: documento,
        identificador_banco: fitid || `OFX-${hashString(raw)}-${i + 1}`,
        hash_importacao: hashString(raw),
        linha_bruta: raw,
      });
    }

    return itens;
  };

  const readFileAsText = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsText(f);
    });
  };

  const handleImport = async () => {
    if (!csvText.trim() && !file) {
      addToast('Envie um arquivo ou cole o conteúdo do extrato.', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
        let itens: ImportarExtratoPayload[] = [];
        if (file) {
          const content = await readFileAsText(file);
          const name = file.name.toLowerCase();
          if (name.endsWith('.ofx')) itens = parseOfxText(content);
          else itens = parseCsvText(content);
        } else {
          itens = parseCsvText(csvText);
        }

        if (itens.length === 0) {
          addToast('Nenhum item válido encontrado. Verifique o formato.', 'error');
          return;
        }

        await onImport(itens);
        addToast(`${itens.length} lançamentos importados.`, 'success');
        setCsvText('');
        setFile(null);
        onImported?.();
        onClose();
    } catch (e: any) {
        addToast('Erro ao importar: ' + e.message, 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Extrato Bancário" size="lg">
      <div className="p-6 space-y-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
            <p className="font-bold mb-1">Formato esperado (CSV - Ponto e vírgula):</p>
            <code className="block bg-white p-2 rounded border border-blue-200 mt-2">
                AAAA-MM-DD;Descrição do Lançamento;Valor (use - para saída);Documento
            </code>
            <p className="mt-2 text-xs">Exemplo: 2023-10-25;Pagamento Fornecedor;-150.00;DOC123</p>
            <p className="mt-2 text-xs">Suporta também arquivo <b>.ofx</b> (parcial) e CSV com “,” (detectado automaticamente).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCsvText(exampleCsv);
                  addToast('Exemplo colado no campo.', 'info');
                }}
                className="gap-2"
              >
                <FileText size={16} />
                Colar exemplo
              </Button>
            </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">Enviar arquivo</div>
              <div className="text-xs text-gray-500">CSV ou OFX. O conteúdo também pode ser colado abaixo.</div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <FileUp size={16} />
              Selecionar
              <input
                type="file"
                accept=".csv,.txt,.ofx,text/csv,text/plain"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {file ? (
            <div className="mt-3 text-sm text-gray-700">
              Arquivo selecionado: <span className="font-semibold">{file.name}</span>{' '}
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-2 text-xs text-red-600 hover:underline"
              >
                remover
              </button>
            </div>
          ) : null}
        </div>

        <TextArea 
            label="Conteúdo do Arquivo (Copie e Cole)" 
            name="csv" 
            value={csvText} 
            onChange={e => setCsvText(e.target.value)} 
            rows={10} 
            placeholder="Cole aqui as linhas do seu extrato..."
        />

        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
            {enableSeed ? (
              <Button
                variant="secondary"
                onClick={handleSeed}
                disabled={isSeeding || isProcessing}
                className="gap-2"
              >
                {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
                Gerar dados de teste
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={handleImport} disabled={isProcessing} className="gap-2">
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                  Importar
                </Button>
            </div>
        </div>
      </div>
    </Modal>
  );
}
