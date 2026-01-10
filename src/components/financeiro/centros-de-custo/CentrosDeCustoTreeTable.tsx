import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Edit, Folder, FolderOpen, Trash2 } from 'lucide-react';
import type { CentroDeCustoListItem, TipoCentroCusto } from '@/services/centrosDeCusto';

interface CentrosDeCustoTreeTableProps {
  centros: CentroDeCustoListItem[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onEdit: (centro: CentroDeCustoListItem) => void;
  onDelete: (centro: CentroDeCustoListItem) => void;
}

const TIPO_LABEL: Record<TipoCentroCusto, string> = {
  receita: 'Receitas',
  custo_fixo: 'Custo Fixo',
  custo_variavel: 'Custo Variável',
  investimento: 'Investimentos',
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

export default function CentrosDeCustoTreeTable(props: CentrosDeCustoTreeTableProps) {
  const { centros, expandedIds, onToggleExpand, onExpandAll, onCollapseAll, onEdit, onDelete } = props;

  const { ordered, hasChildren } = useMemo(() => {
    const byId = new Map<string, CentroDeCustoListItem>();
    const children = new Map<string, CentroDeCustoListItem[]>();
    for (const c of centros) {
      byId.set(c.id, c);
    }
    for (const c of centros) {
      if (!c.parent_id) continue;
      const arr = children.get(c.parent_id) ?? [];
      arr.push(c);
      children.set(c.parent_id, arr);
    }

    for (const arr of children.values()) {
      arr.sort((a, b) => {
        const cc = compareCodigo(a.codigo, b.codigo);
        if (cc !== 0) return cc;
        return String(a.nome ?? '').localeCompare(String(b.nome ?? ''));
      });
    }

    const roots = centros
      .filter((c) => !c.parent_id)
      .sort((a, b) => {
        const cc = compareCodigo(a.codigo, b.codigo);
        if (cc !== 0) return cc;
        return String(a.nome ?? '').localeCompare(String(b.nome ?? ''));
      });

    const out: CentroDeCustoListItem[] = [];
    const hasKids = (id: string) => (children.get(id)?.length ?? 0) > 0;

    const walk = (node: CentroDeCustoListItem) => {
      out.push(node);
      if (!hasKids(node.id)) return;
      if (!expandedIds.has(node.id)) return;
      for (const child of children.get(node.id) ?? []) walk(child);
    };

    for (const r of roots) walk(r);

    return { ordered: out, hasChildren: hasKids };
  }, [centros, expandedIds]);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
        <div className="text-sm text-gray-600">Clique na seta para expandir/recolher.</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExpandAll}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Expandir tudo
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Recolher tudo
          </button>
        </div>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Código / Nome
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Categoria
            </th>
            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="relative px-6 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {ordered.map((centro) => {
              const kids = hasChildren(centro.id);
              const open = expandedIds.has(centro.id);
              const isRoot = isSystemRootLike(centro);
              const indent = Math.max(0, (centro.nivel ?? 1) - 1) * 18;

              return (
                <motion.tr
                  key={centro.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={isRoot ? 'bg-blue-50/40' : 'hover:bg-gray-50'}
                >
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
                      {kids ? (
                        <button
                          type="button"
                          onClick={() => onToggleExpand(centro.id)}
                          className="rounded p-1 text-gray-600 hover:bg-gray-100"
                          aria-label={open ? 'Recolher' : 'Expandir'}
                        >
                          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      ) : (
                        <span className="inline-block w-[26px]" />
                      )}

                      {kids ? (open ? <FolderOpen size={16} className="text-gray-600" /> : <Folder size={16} className="text-gray-600" />) : null}

                      <span className={isRoot ? 'font-semibold text-blue-900' : ''}>
                        {centro.codigo ? <span className="font-mono">{centro.codigo}</span> : <span className="font-mono text-gray-400">—</span>}
                        <span className="mx-2 text-gray-300">/</span>
                        {centro.nome}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">{TIPO_LABEL[centro.tipo]}</td>

                  <td className="px-6 py-3 whitespace-nowrap text-center">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        centro.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {centro.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => onEdit(centro)}
                        className="text-indigo-600 hover:text-indigo-900"
                        title={isRoot ? 'Somente leitura' : 'Editar'}
                        disabled={isRoot}
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(centro)}
                        className="text-red-600 hover:text-red-900"
                        title={isRoot ? 'Não pode excluir' : 'Excluir'}
                        disabled={isRoot}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
}

