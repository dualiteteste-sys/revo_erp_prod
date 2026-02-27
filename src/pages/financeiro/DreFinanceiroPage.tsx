import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Printer, RefreshCw } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';
import { logger } from '@/lib/logger';
import { getLastRequestId } from '@/lib/requestId';
import { printDreReport } from '@/lib/financeiro/printDre';
import {
  deleteFinanceiroDreMapeamentoV1,
  getFinanceiroDreReportV1,
  listFinanceiroDreMapeamentosV1,
  listFinanceiroDreUnmappedCategoriasV1,
  setFinanceiroDreMapeamentoV1,
  type FinanceiroDreMapeamentoV1,
  type FinanceiroDreReportV1,
  type FinanceiroDreUnmappedCategoriaV1,
} from '@/services/financeiroRelatorios';

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function toDateOrNull(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type RegimeDre = 'competencia' | 'caixa';

const MAPPABLE_LINES: { key: string; label: string }[] = [
  { key: 'receita_bruta', label: 'Receita Bruta' },
  { key: 'deducoes_impostos', label: 'Deduções/Impostos sobre vendas' },
  { key: 'cmv_cpv_csp', label: 'CMV/CPV/CSP (custos diretos)' },
  { key: 'despesas_operacionais_adm', label: 'Despesas Operacionais — Administrativas' },
  { key: 'despesas_operacionais_comerciais', label: 'Despesas Operacionais — Comerciais/Vendas' },
  { key: 'despesas_operacionais_gerais', label: 'Despesas Operacionais — Gerais' },
  { key: 'depreciacao_amortizacao', label: 'Depreciação/Amortização' },
  { key: 'resultado_financeiro', label: 'Resultado Financeiro' },
  { key: 'outras_receitas_despesas', label: 'Outras Receitas/Despesas' },
  { key: 'irpj_csll', label: 'IRPJ/CSLL' },
];

// Linhas de despesa: o backend retorna valores negativos (convenção de sinal para cálculo),
// mas a exibição padrão de DRE mostra o valor absoluto e o label já tem "(-)" indicando subtração.
const EXPENSE_DISPLAY_LINES = new Set([
  'deducoes_impostos',
  'cmv_cpv_csp',
  'despesas_operacionais_adm',
  'despesas_operacionais_comerciais',
  'despesas_operacionais_gerais',
  'depreciacao_amortizacao',
  'irpj_csll',
]);

const DRE_VIEW_LINES: { key: string; label: string; kind?: 'subtotal' | 'info' }[] = [
  { key: 'receita_bruta', label: 'Receita Bruta' },
  { key: 'deducoes_impostos', label: '(-) Deduções/Impostos sobre vendas' },
  { key: 'receita_liquida', label: 'Receita Líquida', kind: 'subtotal' },
  { key: 'cmv_cpv_csp', label: '(-) CMV/CPV/CSP (custos diretos)' },
  { key: 'lucro_bruto', label: 'Lucro Bruto', kind: 'subtotal' },
  { key: 'despesas_operacionais_adm', label: '(-) Despesas Operacionais — Administrativas' },
  { key: 'despesas_operacionais_comerciais', label: '(-) Despesas Operacionais — Comerciais/Vendas' },
  { key: 'despesas_operacionais_gerais', label: '(-) Despesas Operacionais — Gerais' },
  { key: 'ebitda', label: 'EBITDA', kind: 'subtotal' },
  { key: 'depreciacao_amortizacao', label: '(-) Depreciação/Amortização' },
  { key: 'resultado_operacional', label: 'Resultado Operacional', kind: 'subtotal' },
  { key: 'resultado_financeiro', label: '+/- Resultado Financeiro' },
  { key: 'outras_receitas_despesas', label: '+/- Outras Receitas/Despesas' },
  { key: 'resultado_antes_irpj_csll', label: 'Resultado Antes de IRPJ/CSLL', kind: 'subtotal' },
  { key: 'irpj_csll', label: '(-) IRPJ/CSLL' },
  { key: 'lucro_liquido', label: 'Lucro Líquido', kind: 'subtotal' },
  { key: 'unmapped', label: 'Não mapeado (atenção)', kind: 'info' },
];

export default function DreFinanceiroPage() {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId, activeEmpresa } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [regime, setRegime] = useState<RegimeDre>('competencia');
  const [centroId, setCentroId] = useState<string | null>(null);
  const [centroName, setCentroName] = useState<string>('');

  const [report, setReport] = useState<FinanceiroDreReportV1 | null>(null);
  const [mappings, setMappings] = useState<FinanceiroDreMapeamentoV1[]>([]);
  const [unmapped, setUnmapped] = useState<FinanceiroDreUnmappedCategoriaV1[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const fetchTokenRef = useRef(0);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    setStartDate('');
    setEndDate('');
    setRegime('competencia');
    setCentroId(null);
    setCentroName('');
    setReport(null);
    setMappings([]);
    setUnmapped([]);
    setSavingKey(null);
    setLoadIssue(null);
    setLoading(true);
    fetchTokenRef.current += 1;

    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  const dreRows = useMemo(() => {
    const linhas = report?.linhas ?? {};
    return DRE_VIEW_LINES.map((line) => {
      const raw = typeof linhas?.[line.key] === 'number' ? Number(linhas[line.key]) : 0;
      // Linhas de despesa: negamos para exibir o valor absoluto (o label já carrega o "(-)")
      const value = EXPENSE_DISPLAY_LINES.has(line.key) ? -raw : raw;
      return { ...line, value };
    });
  }, [report]);

  const fetchAll = useCallback(async () => {
    if (authLoading || !activeEmpresaId) return;
    if (lastEmpresaIdRef.current !== activeEmpresaId) return;

    const token = ++fetchTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setLoading(true);
    setLoadIssue(null);
    try {
      const start = toDateOrNull(startDate);
      const end = toDateOrNull(endDate);
      const [reportRes, mappingsRes, unmappedRes] = await Promise.allSettled([
        getFinanceiroDreReportV1({ startDate: start, endDate: end, regime, centroDeCustoId: centroId }),
        listFinanceiroDreMapeamentosV1(),
        listFinanceiroDreUnmappedCategoriasV1({ startDate: start, endDate: end, regime, centroDeCustoId: centroId }),
      ]);

      if (token !== fetchTokenRef.current) return;
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;

      if (reportRes.status === 'fulfilled') {
        setReport(reportRes.value);
      } else {
        const requestId = getLastRequestId();
        logger.error('[DRE][LOAD][REPORT_FAILED]', reportRes.reason, { requestId });
        setReport(null);
        setLoadIssue('Não foi possível carregar o relatório agora. Tente “Atualizar”.');
      }

      if (mappingsRes.status === 'fulfilled') setMappings(mappingsRes.value ?? []);
      else {
        const requestId = getLastRequestId();
        logger.error('[DRE][LOAD][MAPPINGS_FAILED]', mappingsRes.reason, { requestId });
        setMappings([]);
        setLoadIssue((prev) => prev ?? 'Não foi possível carregar o DRE agora. Tente “Atualizar”.');
      }

      if (unmappedRes.status === 'fulfilled') setUnmapped(unmappedRes.value ?? []);
      else {
        const requestId = getLastRequestId();
        logger.error('[DRE][LOAD][UNMAPPED_FAILED]', unmappedRes.reason, { requestId });
        setUnmapped([]);
        setLoadIssue((prev) => prev ?? 'Não foi possível carregar o DRE agora. Tente “Atualizar”.');
      }
    } catch (e: any) {
      if (token !== fetchTokenRef.current) return;
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      const requestId = getLastRequestId();
      logger.error('[DRE][LOAD][FAILED]', e, { requestId });
      addToast('Não foi possível carregar o DRE agora. Tente novamente.', 'error', {
        title: 'Falha ao carregar',
      });
      setReport(null);
      setMappings([]);
      setUnmapped([]);
      setLoadIssue('Não foi possível carregar o DRE agora. Tente “Atualizar”.');
    } finally {
      if (token !== fetchTokenRef.current) return;
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      setLoading(false);
    }
  }, [activeEmpresaId, addToast, authLoading, centroId, endDate, regime, startDate]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleMapCategoria = useCallback(async (categoria: string, dreKey: string) => {
    if (!categoria || !dreKey) return;
    setSavingKey(categoria);
    try {
      await setFinanceiroDreMapeamentoV1({ origemValor: categoria, dreLinhaKey: dreKey });
      addToast('Mapeamento salvo e aplicado no relatório.', 'success');
      await fetchAll();
    } catch (e: any) {
      const requestId = getLastRequestId();
      logger.error('[DRE][MAP][SAVE_FAILED]', e, { requestId, categoria, dreKey });
      addToast('Não foi possível salvar o mapeamento. Tente novamente.', 'error', {
        title: 'Falha ao salvar',
      });
    } finally {
      setSavingKey(null);
    }
  }, [addToast, fetchAll]);

  const handlePrint = useCallback(() => {
    if (!report) return;
    printDreReport({
      rows: dreRows,
      startDate: report.meta.start_date ?? startDate || null,
      endDate: report.meta.end_date ?? endDate || null,
      regime: report.meta.regime,
      centroNome: centroName || null,
      empresaNome: activeEmpresa?.nome_fantasia ?? activeEmpresa?.nome_razao_social ?? 'Empresa',
      cnpj: activeEmpresa?.cnpj ?? null,
    });
  }, [activeEmpresa, dreRows, endDate, centroName, report, startDate]);

  const handleDeleteMap = useCallback(async (id: string) => {
    setSavingKey(id);
    try {
      await deleteFinanceiroDreMapeamentoV1(id);
      addToast('Mapeamento removido.', 'success');
      await fetchAll();
    } catch (e: any) {
      const requestId = getLastRequestId();
      logger.error('[DRE][MAP][DELETE_FAILED]', e, { requestId, id });
      addToast('Não foi possível remover o mapeamento. Tente novamente.', 'error', {
        title: 'Falha ao remover',
      });
    } finally {
      setSavingKey(null);
    }
  }, [addToast, fetchAll]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DRE"
        description="Demonstrativo de Resultados (Brasil) — com mapeamento por categoria e rastreabilidade."
        icon={<FileText className="h-6 w-6" />}
      />

      <GlassCard className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Input
            label="Data inicial"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="Data final"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <Select
            name="regime"
            label="Regime"
            value={regime}
            onChange={(e) => setRegime(e.target.value as RegimeDre)}
          >
            <option value="competencia">Competência</option>
            <option value="caixa">Caixa</option>
          </Select>
          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">Centro de custo (opcional)</div>
            <CentroDeCustoDropdown
              valueId={centroId}
              valueName={centroName}
              onChange={(id: string | null, name?: string) => {
                setCentroId(id);
                setCentroName(name ?? '');
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" onClick={() => void fetchAll()} disabled={loading || authLoading || !activeEmpresaId}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!report || loading}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / PDF
          </Button>
          <div className="text-sm text-muted-foreground">
            Comparativos, drill-down e export serão adicionados nos próximos lotes.
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Relatório</h3>
              <div className="text-sm text-muted-foreground">Subtotal conferível (v1). “Não mapeado” indica lançamentos sem classificação no DRE.</div>
            </div>
            {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
          </div>

          {loadIssue && !loading ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {loadIssue}
              <div className="mt-1 text-xs text-amber-900/70">
                Se persistir, abra <strong>Suporte → Diagnóstico guiado</strong> e envie o request-id do erro.
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">Linha</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {dreRows.map((row) => (
                  <tr key={row.key} className={row.kind === 'subtotal' ? 'font-semibold' : ''}>
                    <td className="py-2 pr-3">
                      <div className={row.kind === 'info' ? 'text-amber-700' : ''}>{row.label}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={row.key === 'unmapped' && Math.abs(row.value) > 0.0001 ? 'text-amber-700 font-semibold' : ''}>
                        {formatBRL(row.value)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!report && !loading ? (
                  <tr>
                    <td colSpan={2} className="py-3 text-muted-foreground">
                      Não foi possível carregar o DRE para os filtros atuais.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div>
            <h3 className="text-lg font-semibold">Mapeamento</h3>
            <div className="text-sm text-muted-foreground">
              Mapeie categorias das movimentações para linhas do DRE. Sem mapeamento completo, o DRE fica incompleto.
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Categorias não mapeadas no período</div>
            <div className="text-xs text-muted-foreground">
              Se a lista estiver grande, faça o mapeamento começando pelos maiores valores.
            </div>
          </div>

          <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border bg-white/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white/90 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3">Categoria</th>
                  <th className="py-2 px-3 text-right">Resultado</th>
                  <th className="py-2 px-3">Mapear para</th>
                </tr>
              </thead>
              <tbody>
                {unmapped.map((row, idx) => (
                  <tr key={row.categoria} className="border-t">
                    <td className="py-2 px-3">{row.categoria}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatBRL(row.resultado)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <Select
                          name={`map_${idx}`}
                          uiSize="sm"
                          value=""
                          disabled={savingKey === row.categoria || loading}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            void handleMapCategoria(row.categoria, value);
                          }}
                        >
                          <option value="" disabled>Selecione…</option>
                          {MAPPABLE_LINES.map((line) => (
                            <option key={line.key} value={line.key}>{line.label}</option>
                          ))}
                        </Select>
                        {savingKey === row.categoria ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                      </div>
                    </td>
                  </tr>
                ))}

                {unmapped.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={3} className="py-3 px-3 text-muted-foreground">
                      Nenhuma categoria pendente de mapeamento para os filtros atuais.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium">Mapeamentos atuais ({mappings.length})</div>
          </div>
          <div className="mt-2 max-h-[240px] overflow-auto rounded-lg border bg-white/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white/90 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3">Categoria</th>
                  <th className="py-2 px-3">Linha</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-2 px-3">{m.origem_valor}</td>
                    <td className="py-2 px-3">
                      {MAPPABLE_LINES.find((x) => x.key === m.dre_linha_key)?.label ?? m.dre_linha_key}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDeleteMap(m.id)}
                        disabled={savingKey === m.id || loading}
                      >
                        {savingKey === m.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={3} className="py-3 px-3 text-muted-foreground">
                      Nenhum mapeamento cadastrado ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {report?.linhas?.unmapped && Math.abs(report.linhas.unmapped) > 0.0001 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Atenção: há valores “Não mapeados” no DRE. Mapeie as categorias acima para obter um DRE completo e auditável.
            </div>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}
