import React, { useCallback, useEffect, useState } from 'react';

interface OverflowEntry {
    selector: string;
    overflowPx: number;
}

/**
 * Dev-only overlay that detects horizontal overflow.
 * Activate via `?debug_layout=1` in the URL.
 *
 * Shows a floating panel listing elements whose bounding box
 * exceeds the viewport width, and outlines them in red.
 */
export default function LayoutDebugOverlay() {
    const [active, setActive] = useState(false);
    const [overflows, setOverflows] = useState<OverflowEntry[]>([]);
    const [pageOverflow, setPageOverflow] = useState(0);

    // Activate via querystring
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('debug_layout') === '1') setActive(true);
        } catch {
            // ignore
        }
    }, []);

    const scan = useCallback(() => {
        const vw = document.documentElement.clientWidth;
        const scrollW = document.documentElement.scrollWidth;
        setPageOverflow(scrollW - vw);

        const hits: OverflowEntry[] = [];
        // Remove previous outlines
        document.querySelectorAll('[data-dbg-overflow]').forEach((el) => {
            (el as HTMLElement).style.outline = '';
            el.removeAttribute('data-dbg-overflow');
        });

        const all = document.body.querySelectorAll('*');
        all.forEach((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width === 0) return;
            const overflow = Math.round(rect.right - vw);
            if (overflow > 2) {
                // Build a human-readable selector
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const cls = el.className && typeof el.className === 'string'
                    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
                    : '';
                const selector = `${tag}${id}${cls}`;

                hits.push({ selector, overflowPx: overflow });
                (el as HTMLElement).style.outline = '2px solid red';
                el.setAttribute('data-dbg-overflow', 'true');
            }
        });

        // Deduplicate and keep top offenders
        const unique = hits.reduce<Record<string, OverflowEntry>>((acc, h) => {
            if (!acc[h.selector] || acc[h.selector].overflowPx < h.overflowPx) {
                acc[h.selector] = h;
            }
            return acc;
        }, {});

        setOverflows(
            Object.values(unique)
                .sort((a, b) => b.overflowPx - a.overflowPx)
                .slice(0, 15),
        );
    }, []);

    useEffect(() => {
        if (!active) return;
        // Initial scan after render
        const t = setTimeout(scan, 500);
        // Re-scan on resize
        window.addEventListener('resize', scan);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', scan);
        };
    }, [active, scan]);

    if (!active) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 80,
                right: 8,
                zIndex: 99999,
                background: 'rgba(0,0,0,0.85)',
                color: '#fff',
                borderRadius: 10,
                padding: 12,
                fontSize: 11,
                maxWidth: 320,
                maxHeight: 300,
                overflowY: 'auto',
                fontFamily: 'monospace',
                pointerEvents: 'auto',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong>🔍 Layout Debug</strong>
                <button onClick={scan} style={{ background: '#444', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
                    Re-scan
                </button>
            </div>

            <div style={{ marginBottom: 6 }}>
                Page overflow:{' '}
                <span style={{ color: pageOverflow > 0 ? '#ff4444' : '#44ff44' }}>
                    {pageOverflow}px {pageOverflow > 0 ? '❌' : '✅'}
                </span>
            </div>

            {overflows.length === 0 ? (
                <div style={{ color: '#44ff44' }}>No overflowing elements found ✅</div>
            ) : (
                <div>
                    <div style={{ color: '#ff8844', marginBottom: 4 }}>
                        {overflows.length} element(s) overflowing:
                    </div>
                    {overflows.map((o, i) => (
                        <div key={i} style={{ borderTop: '1px solid #444', paddingTop: 3, marginTop: 3 }}>
                            <div style={{ wordBreak: 'break-all' }}>{o.selector}</div>
                            <div style={{ color: '#ff4444' }}>+{o.overflowPx}px</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
