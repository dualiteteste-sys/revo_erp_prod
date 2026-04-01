import React from 'react';
import { cpfMask, cnpjMask, cepMask } from '@/lib/masks';

/* ── Formatting helpers ─────────────────────────────────── */

function fmtMoney(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));
}

function fmtNumber(n: number | null | undefined, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n ?? 0));
}

function fmtDoc(doc: string | null | undefined): string {
  if (!doc) return '---';
  const digits = doc.replace(/\D/g, '');
  if (digits.length <= 11) return cpfMask(digits);
  return cnpjMask(digits);
}

function fmtCep(cep: string | null | undefined): string {
  if (!cep) return '---';
  return cepMask(cep.replace(/\D/g, ''));
}

function fmtChave(chave: string): string {
  return chave.replace(/(.{4})/g, '$1 ').trim();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '---';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtHour(iso: string | null | undefined): string {
  if (!iso) return '---';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ── Label maps ─────────────────────────────────────────── */

const FRETE_LABELS: Record<string, string> = {
  '0': '0 - Emitente (CIF)',
  '1': '1 - Destinatário (FOB)',
  '2': '2 - Terceiros',
  '3': '3 - Próprio remetente',
  '4': '4 - Próprio destinatário',
  '9': '9 - Sem frete',
};

const FORMA_PGTO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cheque: 'Cheque',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  pix: 'PIX',
  deposito: 'Depósito',
  transferencia: 'Transferência',
  sem_pagamento: 'Sem Pagamento',
  outros: 'Outros',
};

/* ── Types ──────────────────────────────────────────────── */

type EnderecoInfo = {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

export type DanfePreviewProps = {
  emitente: {
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string;
    ie: string | null;
    endereco_logradouro: string | null;
    endereco_numero: string | null;
    endereco_complemento: string | null;
    endereco_bairro: string | null;
    endereco_municipio: string | null;
    endereco_uf: string | null;
    endereco_cep: string | null;
    telefone: string | null;
  } | null;
  destinatario: {
    nome: string;
    doc_unico: string | null;
    ie?: string | null;
    endereco: EnderecoInfo | null;
    telefone: string | null;
  } | null;
  emissao: {
    numero: number | null;
    serie: number | null;
    chave_acesso: string | null;
    natureza_operacao: string | null;
    ambiente: 'homologacao' | 'producao';
    status: string;
    forma_pagamento: string | null;
    modalidade_frete: string | null;
    transportadora_nome: string | null;
    duplicatas: Array<{ numero?: string; vencimento?: string; valor?: number }> | null;
    peso_bruto: number | null;
    peso_liquido: number | null;
    quantidade_volumes: number | null;
    especie_volumes: string | null;
    created_at: string;
  };
  totals: {
    total_produtos: number;
    total_descontos: number;
    total_frete: number;
    total_impostos: number;
    total_nfe: number;
    icms_base_calculo: number;
    icms_valor: number;
    pis_valor: number;
    cofins_valor: number;
    ipi_valor: number;
  };
  items: Array<{
    index: number;
    produto_nome: string;
    ncm: string;
    cst: string;
    csosn: string;
    cfop: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
    valor_desconto: number;
    icms_base: number;
    icms_valor: number;
    icms_aliquota: number;
  }>;
};

/* ── Reusable sub-components ────────────────────────────── */

function Cell({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`px-2 py-1.5 ${className}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold leading-tight">{label}</div>
      <div className="text-xs text-slate-800 font-medium mt-0.5 leading-tight">{value || '---'}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50/80 px-2 py-1 text-[9px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
      {children}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */

export default function DanfePreview({ emitente, destinatario, emissao, totals, items }: DanfePreviewProps) {
  const showWatermark = emissao.status !== 'autorizada' || emissao.ambiente === 'homologacao';
  const enderecoDest = destinatario?.endereco;

  const emitenteEndereco = emitente
    ? [
        [emitente.endereco_logradouro, emitente.endereco_numero].filter(Boolean).join(', '),
        emitente.endereco_complemento,
        emitente.endereco_bairro,
        [emitente.endereco_municipio, emitente.endereco_uf].filter(Boolean).join(' - '),
        emitente.endereco_cep ? `CEP ${fmtCep(emitente.endereco_cep)}` : null,
      ].filter(Boolean).join(' | ')
    : '---';

  const destEndereco = enderecoDest
    ? [
        [enderecoDest.logradouro, enderecoDest.numero].filter(Boolean).join(', '),
        enderecoDest.complemento,
        enderecoDest.bairro,
      ].filter(Boolean).join(' | ')
    : '---';

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #danfe-preview-print, #danfe-preview-print * { visibility: visible; }
          #danfe-preview-print {
            position: absolute;
            inset: 0;
            margin: 0;
            padding: 8mm;
            width: 100%;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="danfe-preview-print" className="bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden max-w-[210mm] mx-auto">
        {/* Watermark */}
        {showWatermark && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
            <span className="text-4xl sm:text-5xl font-black text-slate-200/60 -rotate-[30deg] whitespace-nowrap">
              SEM VALOR FISCAL
            </span>
          </div>
        )}

        <div className="relative z-0 divide-y divide-slate-200">
          {/* ── Section 1: Header ──────────────────────── */}
          <div className="grid grid-cols-[1fr_auto_1fr]">
            {/* Emitente */}
            <div className="p-3 border-r border-slate-200">
              {emitente ? (
                <>
                  <div className="text-sm font-bold text-slate-900 leading-tight">{emitente.razao_social}</div>
                  {emitente.nome_fantasia && emitente.nome_fantasia !== emitente.razao_social && (
                    <div className="text-[11px] text-slate-500 italic">{emitente.nome_fantasia}</div>
                  )}
                  <div className="mt-1.5 text-[10px] text-slate-600 space-y-0.5">
                    <div><span className="text-slate-400">CNPJ:</span> {fmtDoc(emitente.cnpj)}</div>
                    <div><span className="text-slate-400">IE:</span> {emitente.ie || '---'}</div>
                    <div className="leading-snug">{emitenteEndereco}</div>
                    {emitente.telefone && <div><span className="text-slate-400">Tel:</span> {emitente.telefone}</div>}
                  </div>
                </>
              ) : (
                <div className="text-xs text-amber-600 italic">Emitente não configurado</div>
              )}
            </div>

            {/* DANFE label */}
            <div className="px-5 py-3 flex flex-col items-center justify-center border-r border-slate-200 min-w-[120px]">
              <div className="text-2xl font-bold tracking-widest text-slate-800">DANFE</div>
              <div className="text-[8px] text-slate-400 text-center leading-tight mt-1 max-w-[100px]">
                Documento Auxiliar da Nota Fiscal Eletrônica
              </div>
              <div className="mt-2 text-[9px] text-slate-500">
                <span className="font-semibold">1</span> - SAÍDA
              </div>
            </div>

            {/* NF-e number */}
            <div className="p-3 flex flex-col items-center justify-center">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">NF-e</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                Nº {emissao.numero ?? '---'}
              </div>
              <div className="text-xs text-slate-500">
                Série {emissao.serie ?? '---'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Folha 1/1</div>
            </div>
          </div>

          {/* ── Section 2: Chave de Acesso ─────────────── */}
          <div className="px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Chave de Acesso</div>
            <div className="text-xs font-mono text-slate-700 mt-0.5">
              {emissao.chave_acesso
                ? fmtChave(emissao.chave_acesso)
                : <span className="italic text-slate-400">Será gerada após autorização</span>
              }
            </div>
          </div>

          {/* ── Section 3: Natureza da Operação ────────── */}
          <div className="px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Natureza da Operação</div>
            <div className="text-xs text-slate-800 font-medium mt-0.5">{emissao.natureza_operacao || '---'}</div>
          </div>

          {/* ── Section 4: Destinatário ────────────────── */}
          <div>
            <SectionTitle>Destinatário / Remetente</SectionTitle>
            <div className="grid grid-cols-12 divide-x divide-slate-100">
              <Cell label="Nome / Razão Social" value={destinatario?.nome} className="col-span-6" />
              <Cell label="CNPJ / CPF" value={fmtDoc(destinatario?.doc_unico)} className="col-span-3" />
              <Cell label="Data Emissão" value={fmtDate(emissao.created_at)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-12 divide-x divide-slate-100 border-t border-slate-100">
              <Cell label="Endereço" value={destEndereco} className="col-span-5" />
              <Cell label="Município" value={enderecoDest?.cidade} className="col-span-3" />
              <Cell label="UF" value={enderecoDest?.uf} className="col-span-1" />
              <Cell label="CEP" value={fmtCep(enderecoDest?.cep)} className="col-span-2" />
              <Cell label="Hora Saída" value={fmtHour(emissao.created_at)} className="col-span-1" />
            </div>
            <div className="grid grid-cols-12 divide-x divide-slate-100 border-t border-slate-100">
              <Cell label="Telefone" value={destinatario?.telefone} className="col-span-3" />
              <Cell label="IE" value={destinatario?.ie} className="col-span-3" />
              <div className="col-span-6" />
            </div>
          </div>

          {/* ── Section 5: Items ───────────────────────── */}
          <div>
            <SectionTitle>Produtos / Serviços</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-slate-50/60 text-slate-500 uppercase tracking-wider">
                    <th className="px-1.5 py-1 text-center w-8">#</th>
                    <th className="px-1.5 py-1 text-left">Descrição</th>
                    <th className="px-1.5 py-1 text-center w-[70px]">NCM</th>
                    <th className="px-1.5 py-1 text-center w-[50px]">CST</th>
                    <th className="px-1.5 py-1 text-center w-[45px]">CFOP</th>
                    <th className="px-1.5 py-1 text-center w-[35px]">Un.</th>
                    <th className="px-1.5 py-1 text-right w-[55px]">Qtd.</th>
                    <th className="px-1.5 py-1 text-right w-[70px]">Vlr. Unit.</th>
                    <th className="px-1.5 py-1 text-right w-[70px]">Vlr. Total</th>
                    <th className="px-1.5 py-1 text-right w-[70px]">BC ICMS</th>
                    <th className="px-1.5 py-1 text-right w-[60px]">Vlr. ICMS</th>
                    <th className="px-1.5 py-1 text-right w-[40px]">Alíq.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-6 text-center text-slate-400 italic">
                        Nenhum item adicionado
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.index} className="even:bg-slate-50/40 hover:bg-blue-50/30">
                        <td className="px-1.5 py-1 text-center text-slate-400">{it.index}</td>
                        <td className="px-1.5 py-1 text-slate-800 truncate max-w-[200px]" title={it.produto_nome}>
                          {it.produto_nome || '---'}
                        </td>
                        <td className="px-1.5 py-1 text-center font-mono">{it.ncm || '---'}</td>
                        <td className="px-1.5 py-1 text-center font-mono">{it.cst || it.csosn || '---'}</td>
                        <td className="px-1.5 py-1 text-center font-mono">{it.cfop || '---'}</td>
                        <td className="px-1.5 py-1 text-center">{it.unidade}</td>
                        <td className="px-1.5 py-1 text-right">{fmtNumber(it.quantidade, 4)}</td>
                        <td className="px-1.5 py-1 text-right">{fmtMoney(it.valor_unitario)}</td>
                        <td className="px-1.5 py-1 text-right font-medium">{fmtMoney(it.valor_total)}</td>
                        <td className="px-1.5 py-1 text-right">{fmtMoney(it.icms_base)}</td>
                        <td className="px-1.5 py-1 text-right">{fmtMoney(it.icms_valor)}</td>
                        <td className="px-1.5 py-1 text-right">{it.icms_aliquota > 0 ? `${fmtNumber(it.icms_aliquota)}%` : '---'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 6: Totals ──────────────────────── */}
          <div>
            <SectionTitle>Cálculo do Imposto</SectionTitle>
            <div className="grid grid-cols-7 divide-x divide-slate-100">
              <Cell label="Base Cálc. ICMS" value={fmtMoney(totals.icms_base_calculo)} />
              <Cell label="Valor ICMS" value={fmtMoney(totals.icms_valor)} />
              <Cell label="Valor PIS" value={fmtMoney(totals.pis_valor)} />
              <Cell label="Valor COFINS" value={fmtMoney(totals.cofins_valor)} />
              <Cell label="Valor IPI" value={fmtMoney(totals.ipi_valor)} />
              <Cell label="Valor Desconto" value={fmtMoney(totals.total_descontos)} />
              <Cell label="Valor Frete" value={fmtMoney(totals.total_frete)} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
              <Cell label="Valor Total dos Produtos" value={fmtMoney(totals.total_produtos)} />
              <Cell label="Valor Total do Imposto" value={fmtMoney(totals.total_impostos)} />
              <Cell
                label="Valor Total da NF-e"
                value={<span className="text-sm font-bold text-slate-900">{fmtMoney(totals.total_nfe)}</span>}
                className="bg-blue-50/60"
              />
            </div>
          </div>

          {/* ── Section 7: Transporte ──────────────────── */}
          <div>
            <SectionTitle>Transportador / Volumes</SectionTitle>
            <div className="grid grid-cols-6 divide-x divide-slate-100">
              <Cell label="Modalidade Frete" value={FRETE_LABELS[emissao.modalidade_frete ?? '9'] ?? emissao.modalidade_frete} className="col-span-2" />
              <Cell label="Transportadora" value={emissao.transportadora_nome} className="col-span-2" />
              <Cell label="Quantidade" value={emissao.quantidade_volumes} />
              <Cell label="Espécie" value={emissao.especie_volumes} />
            </div>
            <div className="grid grid-cols-6 divide-x divide-slate-100 border-t border-slate-100">
              <Cell label="Peso Bruto (kg)" value={emissao.peso_bruto != null ? fmtNumber(emissao.peso_bruto, 3) : null} className="col-span-3" />
              <Cell label="Peso Líquido (kg)" value={emissao.peso_liquido != null ? fmtNumber(emissao.peso_liquido, 3) : null} className="col-span-3" />
            </div>
          </div>

          {/* ── Section 8: Pagamento / Duplicatas ──────── */}
          <div>
            <SectionTitle>Dados de Pagamento</SectionTitle>
            <div className="grid grid-cols-2 divide-x divide-slate-100">
              <Cell label="Forma de Pagamento" value={FORMA_PGTO_LABELS[emissao.forma_pagamento ?? ''] ?? emissao.forma_pagamento} />
              <Cell label="Valor Total" value={fmtMoney(totals.total_nfe)} />
            </div>
            {emissao.duplicatas && emissao.duplicatas.length > 0 && (
              <div className="border-t border-slate-100">
                <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Duplicatas</div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-slate-400 uppercase tracking-wider">
                      <th className="px-2 py-0.5 text-left">Parcela</th>
                      <th className="px-2 py-0.5 text-center">Vencimento</th>
                      <th className="px-2 py-0.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {emissao.duplicatas.map((dup, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-0.5 text-slate-700">{dup.numero ?? `${idx + 1}`}</td>
                        <td className="px-2 py-0.5 text-center text-slate-700">{fmtDate(dup.vencimento)}</td>
                        <td className="px-2 py-0.5 text-right text-slate-700 font-medium">{fmtMoney(dup.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Section 9: Footer ──────────────────────── */}
          <div className="px-3 py-2 bg-slate-50/40">
            {emissao.ambiente === 'homologacao' && (
              <div className="text-xs font-bold text-amber-600 mb-1">
                EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL
              </div>
            )}
            <div className="text-[9px] text-slate-400">
              Preview gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
