export type TermsSection = {
  id: string;
  title: string;
  content: string;
};

const normalizeId = (input: string) =>
  input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function parseTermsSections(body: string): TermsSection[] {
  const lines = body.split('\n');
  const sections: TermsSection[] = [];

  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let index = 0;

  const pushCurrent = () => {
    if (!currentTitle) return;
    const content = currentLines.join('\n').trim();
    sections.push({
      id: normalizeId(currentTitle) || `secao-${index + 1}`,
      title: currentTitle,
      content,
    });
    index += 1;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)*)\.\s+(.+)$/);
    if (!match) {
      currentLines.push(line);
      continue;
    }

    if (!currentTitle) {
      const preamble = currentLines.join('\n').trim();
      if (preamble) {
        sections.push({
          id: 'introducao',
          title: 'Introdução',
          content: preamble,
        });
        index += 1;
      }
    } else {
      pushCurrent();
    }

    currentTitle = `${match[1]}. ${match[2]}`.trim();
    currentLines = [];
  }

  if (currentTitle) {
    pushCurrent();
  } else {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({
        id: 'termo-completo',
        title: 'Termo Completo',
        content,
      });
    }
  }

  return sections;
}
