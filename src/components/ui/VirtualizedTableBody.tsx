import React, { useEffect, useMemo, useState } from 'react';

export default function VirtualizedTableBody(props: {
  scrollParentRef: React.RefObject<HTMLElement>;
  rowCount: number;
  rowHeight: number;
  overscan?: number;
  renderRow: (index: number) => React.ReactNode;
  className?: string;
}) {
  const overscan = props.overscan ?? 8;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = props.scrollParentRef.current;
    if (!el) return;

    const handleScroll = () => setScrollTop(el.scrollTop);
    const handleResize = () => setViewportHeight(el.clientHeight);

    handleResize();
    handleScroll();

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [props.scrollParentRef]);

  const { startIndex, endIndex } = useMemo(() => {
    const total = props.rowCount;
    const rowHeight = props.rowHeight;
    const viewportRows = Math.ceil((viewportHeight || 1) / rowHeight);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(total - 1, start + viewportRows + overscan * 2);
    return { startIndex: start, endIndex: end };
  }, [props.rowCount, props.rowHeight, viewportHeight, scrollTop, overscan]);

  const items = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let i = startIndex; i <= endIndex; i++) out.push(props.renderRow(i));
    return out;
  }, [startIndex, endIndex, props]);

  return (
    <tbody
      className={props.className}
      style={{
        position: 'relative',
        display: 'block',
        height: props.rowCount * props.rowHeight,
      }}
    >
      {items}
    </tbody>
  );
}

