import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { getCurrentTermsDocument } from '@/services/termsAcceptance';
import { parseTermsSections } from '@/lib/termsDocument';

const DisclosureSection = ({
  title,
  content,
  isOpen,
  onToggle,
}: {
  title: string;
  content: string;
  isOpen: boolean;
  onToggle: () => void;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white">
    <button
      type="button"
      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      onClick={onToggle}
    >
      <span className="font-semibold text-slate-900">{title}</span>
      <ChevronDown
        size={18}
        className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
    {isOpen ? (
      <div className="px-4 pb-4 pt-1">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
          {content}
        </pre>
      </div>
    ) : null}
  </div>
);

export default function TermsOfUsePage() {
  const [openSectionId, setOpenSectionId] = useState<string>('introducao');

  const docQuery = useQuery({
    queryKey: ['terms_document_current', 'ultria_erp_terms'],
    queryFn: getCurrentTermsDocument,
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });

  const sections = useMemo(() => parseTermsSections(docQuery.data?.body ?? ''), [docQuery.data?.body]);

  if (docQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="text-sm text-slate-600">Carregando termo de uso…</div>
      </div>
    );
  }

  if (docQuery.error || !docQuery.data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Termo indisponível</h1>
        <p className="mt-2 text-sm text-slate-600">
          Não foi possível carregar o termo no momento. Recarregue a página e tente novamente.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Termos e Condições de Uso</h1>
            <p className="mt-1 text-sm text-slate-600">
              Leia as cláusulas completas do Ultria ERP antes de aceitar.
            </p>
          </div>
          <div className="text-xs text-slate-500">Versão: {docQuery.data.version}</div>
        </div>

        <div className="mt-6 grid gap-3">
          {sections.map((section) => (
            <DisclosureSection
              key={section.id}
              title={section.title}
              content={section.content}
              isOpen={openSectionId === section.id}
              onToggle={() => setOpenSectionId((prev) => (prev === section.id ? '' : section.id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
