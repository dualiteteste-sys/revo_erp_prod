import { describe, expect, it } from 'vitest';
import { parseTermsSections } from '@/lib/termsDocument';

describe('parseTermsSections', () => {
  it('splits top-level numbered sections and keeps intro', () => {
    const body = `TERMOS E CONDIÇÕES\n\n1. PRIMEIRA\nlinha 1\n\n2. SEGUNDA\nlinha 2`;
    const sections = parseTermsSections(body);

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Introdução');
    expect(sections[1].title).toBe('1. PRIMEIRA');
    expect(sections[2].title).toBe('2. SEGUNDA');
  });
});
