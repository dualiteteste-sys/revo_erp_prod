import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Edit, Folder, FolderOpen, Trash2 } from 'lucide-react';
import type { CentroDeCustoListItem, TipoCentroCusto } from '@/services/centrosDeCusto';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

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
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'codigo_nome', defaultWidth: 620, minWidth: 280 },
    { id: 'categoria', defaultWidth: 220, minWidth: 170 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 120, minWidth: 90, maxWidth: 180 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:centros-de-custo', columns });

  const [sort, setSort] = useState<SortState<'codigo_nome' | 'categoria' | 'status'>>({
    column: 'codigo_nome',
    direction: 'asc',
  });

  const { ordered, hasChildren } = useMemo(() => {
    const sortState: SortState<'codigo_nome' | 'categoria' | 'status'> =
      sort ?? { column: 'codigo_nome', direction: 'asc' };
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

	    const compareRows = (a: CentroDeCustoListItem, b: CentroDeCustoListItem) => {
	      if (sortState.column === 'categoria') {
	        const ta = TIPO_LABEL[a.tipo] ?? String(a.tipo ?? '');
	        const tb = TIPO_LABEL[b.tipo] ?? String(b.tipo ?? '');
	        const base = ta.localeCompare(tb, 'pt-BR', { sensitivity: 'base' });
	        return sortState.direction === 'asc' ? base : -base;
	      }

	      if (sortState.column === 'status') {
	        const base = Number(Boolean(a.ativo)) - Number(Boolean(b.ativo));
	        return sortState.direction === 'asc' ? base : -base;
	      }

	      // codigo_nome (default)
	      const cc = compareCodigo(a.codigo, b.codigo);
	      if (cc !== 0) return sortState.direction === 'asc' ? cc : -cc;
	      const nn = String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
	      return sortState.direction === 'asc' ? nn : -nn;
	    };

    for (const arr of children.values()) {
      arr.sort(compareRows);
    }

    const roots = centros
      .filter((c) => !c.parent_id)
      .sort(compareRows);

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
  }, [centros, expandedIds, sort]);

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
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="codigo_nome"
              label="Código / Nome"
              sort={sort as any}
              onSort={(columnId) =>
                setSort((prev) => {
                  if (!prev || prev.column !== columnId) return { column: columnId, direction: 'asc' };
                  return { column: columnId, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                })
              }
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="categoria"
              label="Categoria"
              sort={sort as any}
              onSort={(columnId) =>
                setSort((prev) => {
                  if (!prev || prev.column !== columnId) return { column: columnId, direction: 'asc' };
                  return { column: columnId, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                })
              }
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="status"
              label="Status"
              align="center"
              sort={sort as any}
              onSort={(columnId) =>
                setSort((prev) => {
                  if (!prev || prev.column !== columnId) return { column: columnId, direction: 'asc' };
                  return { column: columnId, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                })
              }
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="acoes"
              label="Ações"
              align="right"
              sortable={false}
              resizable
              onResizeStart={startResize as any}
            />
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {ordered.map((centro) => {
              const kids = hasChildren(centro.id);
              const open = expandedIds.has(centro.id);
              const isRoot = isSystemRootLike(centro);
              const indent = Math.max(0, (centro.nivel ?? 1) - 1) * 18;
              const href = `/app/financeiro/centros-de-custo?open=${encodeURIComponent(centro.id)}`;

              return (
                <motion.tr
                  key={centro.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={isRoot ? 'bg-blue-50/40' : 'hover:bg-gray-50'}
                  onDoubleClick={(e) => {
                    if (isRoot) return;
                    if (shouldIgnoreRowDoubleClickEvent(e)) return;
                    openInNewTabBestEffort(href, () => onEdit(centro));
                  }}
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

                      {isRoot ? (
                        <span className="font-semibold text-blue-900">
                          {centro.codigo ? <span className="font-mono">{centro.codigo}</span> : <span className="font-mono text-gray-400">—</span>}
                          <span className="mx-2 text-gray-300">/</span>
                          {centro.nome}
                        </span>
                      ) : (
                        <a
                          href={href}
                          className="hover:underline underline-offset-2"
                          onClick={(e) => {
                            if (!isPlainLeftClick(e)) return;
                            e.preventDefault();
                            scheduleEdit(() => onEdit(centro));
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cancelScheduledEdit();
                            openInNewTabBestEffort(href, () => onEdit(centro));
                          }}
                        >
                          {centro.codigo ? <span className="font-mono">{centro.codigo}</span> : <span className="font-mono text-gray-400">—</span>}
                          <span className="mx-2 text-gray-300">/</span>
                          {centro.nome}
                        </a>
                      )}
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
