import React from 'react';

import type { TableColumnWidthDef } from './useTableColumnWidths';

export default function TableColGroup(props: {
  columns: TableColumnWidthDef[];
  widths: Record<string, number | undefined>;
}) {
  return (
    <colgroup>
      {props.columns.map((c) => (
        <col
          key={c.id}
          style={{
            width: props.widths[c.id] ?? c.defaultWidth,
            minWidth: c.minWidth,
            maxWidth: c.maxWidth,
          }}
        />
      ))}
    </colgroup>
  );
}

