import React, { useEffect, useMemo, useRef, useState } from 'react';
import { searchClients, type ClientHit } from '@/services/clients';
import { searchSuppliers, type SupplierHit } from '@/services/compras';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, Plus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PartnerFormPanel from '@/components/partners/PartnerFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthProvider';
import type { PartnerDetails } from '@/services/partners';

type PartnerHit = { id: string; label: string; nome: string; doc_unico: string | null };

type Props = {
  value: string | null;
  onChange: (id: string | null, name?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
  limit?: number;
};

function uniqueById(hits: PartnerHit[]): PartnerHit[] {
  const seen = new Set<string>();
  const out: PartnerHit[] = [];
  for (const h of hits) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}

function sortByNome(a: PartnerHit, b: PartnerHit) {
  return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' });
}

export default function ClienteFornecedorAutocomplete({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  initialName,
  limit = 20,
}: Props) {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<PartnerHit[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { addToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const searchSeqRef = useRef(0);

  const debouncedQuery = useDebounce(query, 300);

  const createCtaLabel = useMemo(() => '+ Criar novo parceiro', []);

  useEffect(() => {
    if (value && initialName) {
      setQuery(initialName);
    } else if (!value) {
      setQuery('');
    }
  }, [value, initialName]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  useEffect(() => {
    const search = async () => {
      if (authLoading || !activeEmpresaId) return;
      if (debouncedQuery.length < 2) {
        searchSeqRef.current += 1;
        setHits([]);
        return;
      }
      if (value) return;

      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const [clients, suppliers] = await Promise.all([
          searchClients(debouncedQuery, limit),
          searchSuppliers(debouncedQuery),
        ]);
        if (seq !== searchSeqRef.current) return;

        const merged = uniqueById([
          ...(clients as ClientHit[]).map((h) => ({ id: h.id, label: h.label, nome: h.nome, doc_unico: h.doc_unico })),
          ...(suppliers as SupplierHit[]).map((h) => ({ id: h.id, label: h.label, nome: h.nome, doc_unico: h.doc_unico })),
        ]).sort(sortByNome);

        setHits(merged.slice(0, Math.max(1, limit)));
        setOpen(true);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('[RPC][ERROR] cliente_fornecedor_autocomplete', { error: msg });
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    };
    search();
  }, [debouncedQuery, value, limit, authLoading, activeEmpresaId]);

  const handleSelect = (hit: PartnerHit) => {
    setQuery(hit.label);
    onChange(hit.id, hit.label);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading || !activeEmpresaId) return;
    const newQuery = e.target.value;
    setQuery(newQuery);
    if (value) onChange(null);
  };

  const handleCreateSuccess = (savedPartner: PartnerDetails) => {
    const newHit: PartnerHit = {
      id: savedPartner.id,
      label: savedPartner.nome || 'Novo cadastro',
      nome: savedPartner.nome || 'Novo cadastro',
      doc_unico: savedPartner.doc_unico || '',
    };
    handleSelect(newHit);
    setIsCreateModalOpen(false);
    addToast('Cadastro criado e selecionado!', 'success');
  };

  return (
    <div className={`relative flex ${className || ''}`} ref={ref}>
      <div className="relative flex-grow">
        <input
          className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
          placeholder={placeholder ?? 'Nome/CPF/CNPJ...'}
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (!authLoading && !!activeEmpresaId && query.length >= 2 && hits.length) setOpen(true);
          }}
          disabled={disabled || authLoading || !activeEmpresaId}
        />

        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            <Loader2 className="animate-spin" size={16} />
          </div>
        )}

        {open && hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
            {hits.map((h) => (
              <div
                key={h.id}
                className="px-4 py-3 cursor-pointer hover:bg-blue-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(h);
                }}
              >
                <p className="font-medium text-gray-800">{h.nome}</p>
                <p className="text-sm text-gray-500">{h.doc_unico}</p>
              </div>
            ))}
          </div>
        )}

        {open && !loading && hits.length === 0 && query.length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden">
            <div className="px-4 py-3 text-sm text-gray-500">Nenhum cliente/fornecedor encontrado.</div>
            <button
              type="button"
              className="w-full px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50 flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsCreateModalOpen(true);
                setOpen(false);
              }}
              disabled={disabled || authLoading || !activeEmpresaId}
            >
              <Plus size={16} />
              {createCtaLabel}
            </button>
          </div>
        )}
      </div>

      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Novo Cliente/Fornecedor" size="4xl">
        <PartnerFormPanel
          partner={null}
          initialValues={{ tipo: 'ambos' }}
          onSaveSuccess={handleCreateSuccess}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
