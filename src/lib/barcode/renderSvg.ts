import { BarcodeFormat, EncodeHintType, MultiFormatWriter } from '@zxing/library';

export type RenderBarcodeSvgParams = {
  value: string;
  type: 'CODE128' | 'EAN13';
  width?: number;
  height?: number;
  margin?: number;
};

function escapeXml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toBarcodeFormat(type: RenderBarcodeSvgParams['type']): BarcodeFormat {
  if (type === 'EAN13') return BarcodeFormat.EAN_13;
  return BarcodeFormat.CODE_128;
}

export function renderBarcodeSvg(params: RenderBarcodeSvgParams): string {
  const writer = new MultiFormatWriter();
  const width = Math.max(120, params.width ?? 360);
  const height = Math.max(50, params.height ?? 96);
  const margin = Math.max(0, params.margin ?? 10);

  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.MARGIN, margin);

  const matrix = writer.encode(params.value, toBarcodeFormat(params.type), width, height, hints);
  const w = matrix.getWidth();
  const h = matrix.getHeight();

  let rects = '';
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!matrix.get(x, y)) continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" />`;
    }
  }

  const label = escapeXml(params.value);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">`,
    '<rect width="100%" height="100%" fill="white" />',
    `<g fill="black">${rects}</g>`,
    '</svg>',
  ].join('');
}

