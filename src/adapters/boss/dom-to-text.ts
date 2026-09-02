const blockElementNames = new Set([
  'ARTICLE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'LI',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

function appendNodeText(node: Node, chunks: string[]): void {
  if (node.nodeType === 3) {
    chunks.push(node.textContent?.replace(/\s+/g, ' ') ?? '');
    return;
  }

  if (node.nodeType !== 1) {
    for (const child of node.childNodes) {
      appendNodeText(child, chunks);
    }
    return;
  }

  const element = node as Element;
  if (element.tagName === 'BR') {
    chunks.push('\n');
    return;
  }

  const isBlock = blockElementNames.has(element.tagName);
  if (isBlock) {
    chunks.push('\n');
  }

  for (const child of element.childNodes) {
    appendNodeText(child, chunks);
  }

  if (isBlock) {
    chunks.push('\n');
  }
}

export function domElementToStructuredText(element: Element): string | null {
  const chunks: string[] = [];
  for (const child of element.childNodes) {
    appendNodeText(child, chunks);
  }

  const normalized = chunks
    .join('')
    .replace(/[\t\f\v\u00a0 ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim();

  return normalized === '' ? null : normalized;
}
