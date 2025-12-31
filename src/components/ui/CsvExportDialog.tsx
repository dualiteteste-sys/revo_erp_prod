import React, { useMemo, useState } from 'react';
import { Download, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { downloadCsv } from '@/utils/csv';

type CsvCell = string | number | boolean | null | undefined;

export type CsvExportColumn<T> = {
  key: string;
  label: string;
  getValue: (row: T) => CsvCell;
};

export default function CsvExportDialog<T>(props: {
  filename: string;
  title?: string;
  description?: string;
  rows: T[];
  columns: CsvExportColumn<T>[];
  disabled?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'link';
  buttonLabel?: string;
  buttonIcon?: 'download' | 'file-down' | 'none';
  separator?: ',' | ';';
}): React.ReactElement {
  const {
    filename,
    title = 'Exportar CSV',
    description = 'Selecione as colunas que deseja exportar.',
    rows,
    columns,
    disabled,
    variant = 'secondary',
    buttonLabel = 'Exportar CSV',
    buttonIcon = 'file-down',
    separator,
  } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, true]))
  );

  const filteredColumns = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return columns;
    return columns.filter((c) => c.label.toLowerCase().includes(needle));
  }, [columns, q]);

  const selectedColumns = useMemo(() => columns.filter((c) => selected[c.key]), [columns, selected]);

  const canExport = !disabled && rows.length > 0 && selectedColumns.length > 0;

  const exportNow = () => {
    if (!canExport) return;
    downloadCsv({
      filename,
      headers: selectedColumns.map((c) => c.label),
      rows: rows.map((r) => selectedColumns.map((c) => c.getValue(r))),
      separator,
    });
    setOpen(false);
  };

  const Icon = buttonIcon === 'download' ? Download : buttonIcon === 'file-down' ? FileDown : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled || rows.length === 0} variant={variant} className="gap-2">
          {Icon ? <Icon size={18} /> : null}
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar colunas…"
              className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(Object.fromEntries(columns.map((c) => [c.key, true])))}
              disabled={disabled}
            >
              Tudo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(Object.fromEntries(columns.map((c) => [c.key, false])))}
              disabled={disabled}
            >
              Nada
            </Button>
          </div>

          <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-200 bg-white/60 p-2">
            {filteredColumns.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Nenhuma coluna encontrada.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredColumns.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-gray-50 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[c.key]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                      disabled={disabled}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {rows.length} linhas • {selectedColumns.length}/{columns.length} colunas selecionadas
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={exportNow} disabled={!canExport}>
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

