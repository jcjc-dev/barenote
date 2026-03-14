import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  tableSchema,
  tableHeaderRowSchema,
  tableRowSchema,
  tableCellSchema,
  tableHeaderSchema,
} from '@milkdown/kit/preset/gfm';
import type { Node as ProsemirrorNode } from '@milkdown/kit/prose/model';

/**
 * Parse a markdown table header line.
 * Matches: | text | text | ... |
 * Returns array of trimmed cell contents, or null if not a valid header line.
 */
export function parseTableHeaderLine(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed.split('|').slice(1, -1);
  if (cells.length === 0) return null;
  const result = cells.map((c) => c.trim());
  if (result.every((c) => c === '')) return null;
  return result;
}

/**
 * Parse a markdown table separator line.
 * Matches: | ---+ | ---+ | ... | with optional : for alignment
 * Returns alignment array, or null if not a valid separator.
 */
export function parseTableSeparatorLine(text: string): ('left' | 'center' | 'right')[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed.split('|').slice(1, -1);
  if (cells.length === 0) return null;

  const alignments: ('left' | 'center' | 'right')[] = [];
  for (const cell of cells) {
    const t = cell.trim();
    if (!/^:?-+:?$/.test(t)) return null;
    if (t.startsWith(':') && t.endsWith(':')) {
      alignments.push('center');
    } else if (t.endsWith(':')) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }
  return alignments;
}

export function isTableSeparatorLine(text: string): boolean {
  return parseTableSeparatorLine(text) !== null;
}

export const markdownTableDetectPlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey('markdown-table-detect'),
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const doc = newState.doc;
      const replacements: Array<{
        from: number;
        to: number;
        headers: string[];
        alignments: ('left' | 'center' | 'right')[];
      }> = [];

      let prevNode: ProsemirrorNode | null = null;
      let prevPos = 0;

      doc.forEach((node, offset, index) => {
        if (
          index > 0 &&
          prevNode &&
          node.type.name === 'paragraph' &&
          prevNode.type.name === 'paragraph'
        ) {
          const sepText = node.textContent;
          const alignments = parseTableSeparatorLine(sepText);
          if (alignments) {
            const headers = parseTableHeaderLine(prevNode.textContent);
            if (headers && headers.length === alignments.length) {
              replacements.push({
                from: prevPos,
                to: offset + node.nodeSize,
                headers,
                alignments,
              });
            }
          }
        }
        prevNode = node;
        prevPos = offset;
      });

      if (replacements.length === 0) return null;

      let tr = newState.tr;

      for (let i = replacements.length - 1; i >= 0; i--) {
        const { from, to, headers, alignments } = replacements[i];
        const schema = newState.schema;

        const headerCells = headers.map((text, colIdx) => {
          const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
          return tableHeaderSchema
            .type(ctx)
            .create({ alignment: alignments[colIdx] || 'left' }, para);
        });

        const dataCells = headers.map((_text, colIdx) => {
          const para = schema.nodes.paragraph.create();
          return tableCellSchema
            .type(ctx)
            .create({ alignment: alignments[colIdx] || 'left' }, para);
        });

        const headerRow = tableHeaderRowSchema.type(ctx).create(null, headerCells);
        const dataRow = tableRowSchema.type(ctx).create(null, dataCells);
        const table = tableSchema.type(ctx).create(null, [headerRow, dataRow]);

        tr = tr.replaceWith(from, to, table);
      }

      try {
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(replacements[0].from + 1)));
      } catch {
        // Leave selection as-is
      }

      return tr;
    },
  });
});
