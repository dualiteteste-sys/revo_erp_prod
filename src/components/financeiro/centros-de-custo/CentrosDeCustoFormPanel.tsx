import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CentroDeCusto, CentroDeCustoPayload, listAllCentrosDeCusto, saveCentroDeCusto, type CentroDeCustoListItem, type TipoCentroCusto } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import TextArea from '@/components/ui/forms/TextArea';

interface CentrosDeCustoFormPanelProps {
  centro: Partial<CentroDeCusto> | null;
  onSaveSuccess: (savedCentro: CentroDeCusto) => void;
  onClose: () => void;
}

type ParentOption = {
  id: string;
  label: string;
  nivel: number;
  tipo: TipoCentroCusto;
  isSystemRoot: boolean;
};

const TIPO_LABEL: Record<TipoCentroCusto, string> = {
  receita: 'Receitas',
  custo_fixo: 'Custo Fixo',
  custo_variavel: 'Custo Variável',
  investimento: 'Investimentos',
};

const ROOT_CODE_BY_TIPO: Record<TipoCentroCusto, '1' | '2' | '3' | '4'> = {
  receita: '1',
  custo_variavel: '2',
  custo_fixo: '3',
  investimento: '4',
};

function isSystemRootLike(row: { parent_id: string | null; codigo: string | null; nivel: number; is_system_root?: boolean }): boolean {
  if (row.is_system_root) return true;
  return row.parent_id === null && row.nivel === 1 && ['1', '2', '3', '4'].includes(String(row.codigo ?? ''));
}

function compareCodigo(a: string | null, b: string | null): number {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  const pa = sa.split('.').filter(Boolean).map((x) => Number(x));
  const pb = sb.split('.').filter(Boolean).map((x) => Number(x));
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i += 1) {
    const va = pa[i];
    const vb = pb[i];
    if (va === undefined) return -1;
    if (vb === undefined) return 1;
    if (Number.isFinite(va) && Number.isFinite(vb) && va !== vb) return va - vb;
  }
  return sa.localeCompare(sb);
}

function computeDescendants(rootId: string, childrenByParent: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = childrenByParent.get(cur) ?? [];
    for (const k of kids) {
      if (out.has(k)) continue;
      out.add(k);
      stack.push(k);
    }
  }
  return out;
}

const CentrosDeCustoFormPanel: React.FC<CentrosDeCustoFormPanelProps> = ({ centro, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [allCentros, setAllCentros] = useState<CentroDeCustoListItem[]>([]);
  const [formData, setFormData] = useState<CentroDeCustoPayload>({});
  const [isSubCentro, setIsSubCentro] = useState(false);
  const [didAttemptRootSeed, setDidAttemptRootSeed] = useState(false);
  const [didInitDefaults, setDidInitDefaults] = useState(false);

  useEffect(() => {
    setFormData(centro ?? {});
    if (centro?.parent_id) {
      const isParentRoot = isSystemRootLike({
        parent_id: centro.parent_id ? 'x' : null,
        codigo: centro.parent_id ? null : null,
        nivel: Number(centro.nivel ?? 1),
        is_system_root: (centro as any).is_system_root,
      });
      void isParentRoot;
    }
  }, [centro]);

  useEffect(() => {
    void (async () => {
      setIsLoadingParents(true);
      try {
        const rows = await listAllCentrosDeCusto({ status: 'ativo' });
        setAllCentros(rows);
      } catch (e: any) {
        addToast(e?.message || 'Não foi possível carregar centros de custo.', 'error');
        setAllCentros([]);
      } finally {
        setIsLoadingParents(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEditingSystemRoot = useMemo(() => {
    if (!centro?.id) return false;
    return isSystemRootLike({
      parent_id: centro.parent_id ?? null,
      codigo: centro.codigo ?? null,
      nivel: Number(centro.nivel ?? 1),
      is_system_root: (centro as any).is_system_root,
    });
  }, [centro]);

  const parentOptions = useMemo<ParentOption[]>(() => {
    const rows = [...allCentros]
      .filter((r) => r.ativo !== false)
      .sort((a, b) => {
        const ca = compareCodigo(a.codigo, b.codigo);
        if (ca !== 0) return ca;
        return String(a.nome ?? '').localeCompare(String(b.nome ?? ''));
      });

    return rows.map((r) => ({
      id: r.id,
      label: `${r.codigo ? `${r.codigo} ` : ''}${r.nome}`,
      nivel: r.nivel ?? 1,
      tipo: r.tipo,
      isSystemRoot: isSystemRootLike(r),
    }));
  }, [allCentros]);

  const rootByTipo = useMemo(() => {
    const m = new Map<TipoCentroCusto, ParentOption>();
    for (const r of parentOptions) {
      if (!r.isSystemRoot) continue;
      m.set(r.tipo, r);
    }
    return m;
  }, [parentOptions]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of allCentros) {
      if (!r.parent_id) continue;
      const arr = map.get(r.parent_id) ?? [];
      arr.push(r.id);
      map.set(r.parent_id, arr);
    }
    return map;
  }, [allCentros]);

  const invalidParentIds = useMemo(() => {
    if (!formData.id) return new Set<string>();
    const desc = computeDescendants(formData.id, childrenByParent);
    desc.add(formData.id);
    return desc;
  }, [childrenByParent, formData.id]);

  const roots = useMemo(() => parentOptions.filter((p) => p.isSystemRoot), [parentOptions]);

  useEffect(() => {
    if (centro) return;
    if (didInitDefaults) return;
    if (!roots.length) return;
    if (formData.parent_id) return;

    const defaultTipo: TipoCentroCusto = 'receita';
    const defaultRoot = rootByTipo.get(defaultTipo) ?? roots.find((r) => r.label.startsWith('1 ')) ?? roots[0];
    setFormData((prev) => ({
      ...prev,
      parent_id: defaultRoot.id,
      tipo: defaultTipo,
      nivel: (defaultRoot.nivel ?? 1) + 1,
      ativo: prev.ativo !== false,
    }));
    setDidInitDefaults(true);
  }, [centro, didInitDefaults, roots, formData.parent_id, rootByTipo]);

  const selectedParent = useMemo(() => {
    if (!formData.parent_id) return null;
    return parentOptions.find((p) => p.id === formData.parent_id) ?? null;
  }, [formData.parent_id, parentOptions]);

  const hasSystemRoots = useMemo(() => roots.length >= 4, [roots.length]);

  useEffect(() => {
    if (centro?.id) return;
    if (isLoadingParents) return;
    if (hasSystemRoots) return;
    if (didAttemptRootSeed) return;

    void (async () => {
      setDidAttemptRootSeed(true);
      try {
        const existingCodes = new Set(allCentros.map((r) => String(r.codigo ?? '').trim()).filter(Boolean));
        const tasks: Promise<unknown>[] = [];
        if (!existingCodes.has('1')) tasks.push(saveCentroDeCusto({ parent_id: null, codigo: '1', nome: 'RECEITAS', tipo: 'receita', ordem: 1, ativo: true }));
        if (!existingCodes.has('2')) tasks.push(saveCentroDeCusto({ parent_id: null, codigo: '2', nome: 'CUSTOS VARIÁVEIS', tipo: 'custo_variavel', ordem: 2, ativo: true }));
        if (!existingCodes.has('3')) tasks.push(saveCentroDeCusto({ parent_id: null, codigo: '3', nome: 'CUSTOS FIXOS', tipo: 'custo_fixo', ordem: 3, ativo: true }));
        if (!existingCodes.has('4')) tasks.push(saveCentroDeCusto({ parent_id: null, codigo: '4', nome: 'INVESTIMENTOS', tipo: 'investimento', ordem: 4, ativo: true }));
        if (tasks.length > 0) await Promise.all(tasks);
        const rows = await listAllCentrosDeCusto({ status: 'ativo' });
        setAllCentros(rows);
      } catch {
        // Ignora: em ambientes com migração nova, as raízes já existem e o backend bloqueia inserts diretos de raiz.
      }
    })();
  }, [allCentros, centro?.id, didAttemptRootSeed, hasSystemRoots, isLoadingParents]);

  const selectedTipo: TipoCentroCusto = useMemo(() => {
    const raw = (formData.tipo as any) as TipoCentroCusto | undefined;
    if (raw && TIPO_LABEL[raw]) return raw;
    // fallback: tenta inferir pelo pai
    if (selectedParent?.tipo) return selectedParent.tipo;
    return 'custo_fixo';
  }, [formData.tipo, selectedParent?.tipo]);

  useEffect(() => {
    if (!centro) return;
    // edição: mantém a categoria atual e define se é sub-centro (pai != raiz)
    const parent = allCentros.find((r) => r.id === centro.parent_id);
    const isParentSystemRoot = parent ? isSystemRootLike(parent as any) : false;
    setIsSubCentro(!isParentSystemRoot);
    setFormData((prev) => ({ ...prev, tipo: (centro as any).tipo ?? prev.tipo }));
  }, [centro, allCentros]);

  useEffect(() => {
    // criação/edição: se não é sub-centro, pai = raiz da categoria escolhida
    const root = rootByTipo.get(selectedTipo);
    if (!root) return;
    if (isSubCentro) return;
    setFormData((prev) => ({
      ...prev,
      parent_id: root.id,
      nivel: (root.nivel ?? 1) + 1,
      tipo: selectedTipo,
    }));
  }, [isSubCentro, rootByTipo, selectedTipo]);

  useEffect(() => {
    // quando escolhe um pai específico, atualiza nível e herda categoria
    if (!selectedParent) return;
    if (!isSubCentro) return;
    setFormData((prev) => ({
      ...prev,
      tipo: selectedParent.tipo,
      nivel: (selectedParent.nivel ?? 1) + 1,
    }));
  }, [isSubCentro, selectedParent]);

  const handleFormChange = (field: keyof CentroDeCustoPayload, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (isEditingSystemRoot) {
      addToast('Centros raiz do sistema não podem ser editados.', 'error');
      return;
    }

    const nome = String(formData.nome ?? '').trim();
    if (!nome) {
      addToast('O nome é obrigatório.', 'error');
      return;
    }
    const codigo = String(formData.codigo ?? '').trim();
    if (!codigo) {
      addToast('O código é obrigatório.', 'error');
      return;
    }

    const root = rootByTipo.get(selectedTipo) ?? null;
    const parentId = isSubCentro ? (formData.parent_id ?? null) : (root?.id ?? null);
    const nivel = isSubCentro ? (Number(formData.nivel ?? 2) || 2) : (root ? (root.nivel ?? 1) + 1 : 1);

    if (isSubCentro && !parentId) {
      addToast('Selecione o pai (centro) para cadastrar como sub-centro.', 'error');
      return;
    }

    if (!isSubCentro && !parentId) {
      addToast(
        'Não foi possível identificar a raiz da categoria para cadastrar como centro pai. Verifique se as migrações do Supabase foram aplicadas (raízes 1/2/3/4).',
        'error',
      );
      return;
    }

    setIsSaving(true);
    try {
      const payload: CentroDeCustoPayload = {
        id: formData.id,
        parent_id: parentId,
        codigo,
        nome,
        tipo: selectedTipo,
        nivel,
        ordem: Number.isFinite(Number(formData.ordem)) ? Number(formData.ordem) : 0,
        ativo: formData.ativo !== false,
        observacoes: formData.observacoes ?? null,
      };
      const savedCentro = await saveCentroDeCusto(payload);
      addToast('Centro de Custo salvo com sucesso!', 'success');
      onSaveSuccess(savedCentro);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {isEditingSystemRoot ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Este é um centro de custo raiz do sistema (categoria). Ele é somente leitura para evitar confusão entre pai e filho.
          </div>
        ) : null}

        {!isEditingSystemRoot && !isLoadingParents && !hasSystemRoots ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Não encontrei as 4 raízes padrão (códigos 1/2/3/4). Para o fluxo “estado da arte”, aplique as migrações do Supabase para criar as categorias raiz automaticamente.
          </div>
        ) : null}

        <Section title="Hierarquia" description="Escolha a categoria. Se for sub-centro, você seleciona o pai em Dados.">
          <Select
            label="Categoria"
            name="tipo"
            value={selectedTipo}
            onChange={(e) => {
              const next = (e.target.value as TipoCentroCusto) || 'custo_fixo';
              handleFormChange('tipo', next);
              // troca de categoria força volta ao nível raiz (não sub-centro)
              setIsSubCentro(false);
            }}
            className="sm:col-span-3"
            required
            disabled={isSaving || isEditingSystemRoot || !!centro?.id}
          >
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>

          <div className="sm:col-span-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Centros “pai” ficam diretamente em <span className="font-semibold">{TIPO_LABEL[selectedTipo]}</span>.
          </div>

          <Input label="Nível" name="nivel" value={String(formData.nivel ?? 2)} disabled className="sm:col-span-3" />
          <Input
            label="Prefixo esperado"
            name="prefixo"
            value={ROOT_CODE_BY_TIPO[selectedTipo]}
            disabled
            className="sm:col-span-3"
          />
        </Section>

        <Section title="Dados" description="Código, nome e informações adicionais.">
          <div className="sm:col-span-6">
            <Toggle
              label="É sub-centro (fica dentro de outro centro)"
              name="is_sub"
              checked={isSubCentro}
              onChange={(checked) => {
                setIsSubCentro(checked);
                if (checked) {
                  setFormData((prev) => ({
                    ...prev,
                    parent_id: selectedParent?.isSystemRoot ? null : prev.parent_id ?? null,
                  }));
                }
              }}
            />
            <div className="mt-1 text-xs text-gray-500">
              Desligado = você está cadastrando um centro <span className="font-medium">pai</span> (top-level). Ligado = você está cadastrando um <span className="font-medium">filho</span> (sub-centro) e precisa escolher o pai.
            </div>
          </div>

          {isSubCentro ? (
            <Select
              label="Pai (centro de custo)"
              name="parent_id"
              value={formData.parent_id || ''}
              onChange={(e) => handleFormChange('parent_id', e.target.value || null)}
              className="sm:col-span-6"
              required
              disabled={isLoadingParents || isSaving || isEditingSystemRoot}
            >
              <option value="" disabled>
                {isLoadingParents ? 'Carregando...' : 'Selecione o pai'}
              </option>
              {parentOptions
                .filter((p) => !p.isSystemRoot && p.tipo === selectedTipo)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={invalidParentIds.has(p.id)}>
                    {`${p.label}`}
                  </option>
                ))}
            </Select>
          ) : (
            <div className="sm:col-span-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Você está cadastrando um centro <span className="font-semibold">pai</span> dentro de <span className="font-semibold">{TIPO_LABEL[selectedTipo]}</span>. Para cadastrar um filho, ligue “É sub-centro…”.
            </div>
          )}

          <Input
            label="Código"
            name="codigo"
            value={formData.codigo || ''}
            onChange={(e) => handleFormChange('codigo', e.target.value)}
            required
            className="sm:col-span-2"
            placeholder={`Ex: ${ROOT_CODE_BY_TIPO[selectedTipo]}.01.01`}
            disabled={isSaving || isEditingSystemRoot}
          />
          <Input
            label="Nome"
            name="nome"
            value={formData.nome || ''}
            onChange={(e) => handleFormChange('nome', e.target.value)}
            required
            className="sm:col-span-4"
            disabled={isSaving || isEditingSystemRoot}
          />

          <Input
            label="Ordem (opcional)"
            name="ordem"
            type="number"
            value={formData.ordem ?? 0}
            onChange={(e) => handleFormChange('ordem', Number(e.target.value))}
            className="sm:col-span-2"
            disabled={isSaving || isEditingSystemRoot}
          />

          <div className="sm:col-span-4 flex items-center pt-6">
            <Toggle label="Ativo" name="ativo" checked={formData.ativo !== false} onChange={(checked) => handleFormChange('ativo', checked)} />
          </div>

          <TextArea
            label="Observações"
            name="observacoes"
            value={formData.observacoes || ''}
            onChange={(e) => handleFormChange('observacoes', e.target.value)}
            rows={3}
            className="sm:col-span-6"
            disabled={isSaving || isEditingSystemRoot}
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoadingParents || isEditingSystemRoot}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
};

export default CentrosDeCustoFormPanel;
