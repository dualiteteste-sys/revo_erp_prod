import React, { useEffect, useRef, useState } from 'react';
import { searchClients, ClientHit } from '@/services/clients';
import { searchSuppliers, type SupplierHit } from '@/services/compras';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PartnerFormPanel from '@/components/partners/PartnerFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthProvider';

type Entity = 'client' | 'supplier';
type Hit = ClientHit | SupplierHit;

type Props = {
  value: string | null;
  onChange: (id: string | null, name?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
  entity?: Entity;
};

export default function ClientAutocomplete({ value, onChange, placeholder, disabled, className, initialName, entity = 'client' }: Props) {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { addToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const searchSeqRef = useRef(0);
  const isSupplier = entity === 'supplier';

  const debouncedQuery = useDebounce(query, 300);

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
      // Se já existe um valor selecionado, não deve continuar pesquisando;
      // o valor será limpo quando o usuário digitar novamente (handleInputChange).
      if (value) {
        return;
      }

      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const res = entity === 'supplier' ? await searchSuppliers(debouncedQuery) : await searchClients(debouncedQuery, 20);
        if (seq !== searchSeqRef.current) return;
        setHits(res);
        setOpen(true);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[RPC][ERROR] ${entity === 'supplier' ? 'search_suppliers_for_current_user' : 'search_clients_for_current_user'}`, { error: msg });
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    };
    search();
  }, [debouncedQuery, value, initialName, authLoading, activeEmpresaId, entity]);

  const handleSelect = (hit: Hit) => {
    setQuery(hit.label);
    onChange(hit.id, hit.label);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading || !activeEmpresaId) return;
    const newQuery = e.target.value;
    setQuery(newQuery);
    if (value) {
      onChange(null);
    }
  };

  const handleCreateSuccess = (savedPartner: any) => {
    const label = savedPartner?.nome || 'Novo Cliente';
    const newHit: Hit = {
      id: savedPartner.id,
      label,
      nome: label,
      doc_unico: savedPartner.doc_unico || '',
    };

    handleSelect(newHit);
    setIsCreateModalOpen(false);
    addToast('Cliente criado e selecionado!', 'success');
  };

  return (
    <div className={`relative flex gap-2 ${className || ''}`} ref={ref}>
      <div className="relative flex-grow">
        <input
          className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
          placeholder={placeholder ?? 'Nome/CPF/CNPJ...'}
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (!authLoading && !!activeEmpresaId && query.length >= 2 && hits.length) setOpen(true); }}
          disabled={disabled || authLoading || !activeEmpresaId}
        />
        {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500"><Loader2 className="animate-spin" size={16} /></div>}

        {open && hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
            {hits.map(h => (
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
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
            {isSupplier ? 'Nenhum fornecedor encontrado.' : 'Nenhum cliente encontrado.'}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsCreateModalOpen(true)}
        className="flex-shrink-0 px-4 py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-semibold whitespace-nowrap"
        title="Criar um novo cadastro. Para cliente já cadastrado, digite no campo de busca ao lado."
        disabled={disabled || authLoading || !activeEmpresaId}
      >
        Criar Novo
      </button>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={isSupplier ? 'Novo Fornecedor' : 'Novo Cliente'}
        size="4xl"
      >
        <PartnerFormPanel
          partner={null}
          onSaveSuccess={handleCreateSuccess}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
