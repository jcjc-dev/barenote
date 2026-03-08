import { describe, it, expect } from 'vitest';
import {
  parseTableHeaderLine,
  parseTableSeparatorLine,
  isTableSeparatorLine,
} from './markdown-table-input';

describe('parseTableHeaderLine', () => {
  it('parses a simple two-column header', () => {
    expect(parseTableHeaderLine('| A | B |')).toEqual(['A', 'B']);
  });

  it('parses a three-column header', () => {
    expect(parseTableHeaderLine('| Hello | World | Test |')).toEqual(['Hello', 'World', 'Test']);
  });

  it('parses without spaces around content', () => {
    expect(parseTableHeaderLine('|A|B|')).toEqual(['A', 'B']);
  });

  it('parses a single column', () => {
    expect(parseTableHeaderLine('| A |')).toEqual(['A']);
  });

  it('parses four columns', () => {
    expect(parseTableHeaderLine('| A | B | C | D |')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns null without trailing pipe', () => {
    expect(parseTableHeaderLine('| A | B ')).toBeNull();
  });

  it('returns null without leading pipe', () => {
    expect(parseTableHeaderLine('A | B |')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parseTableHeaderLine('just some text')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTableHeaderLine('')).toBeNull();
  });

  it('returns null for empty cells (||)', () => {
    expect(parseTableHeaderLine('||')).toBeNull();
  });

  it('returns null for whitespace-only cell', () => {
    expect(parseTableHeaderLine('| |')).toBeNull();
  });

  it('returns null when all cells are empty', () => {
    expect(parseTableHeaderLine('| | |')).toBeNull();
  });
});

describe('parseTableSeparatorLine', () => {
  it('parses basic separator', () => {
    expect(parseTableSeparatorLine('| --- | --- |')).toEqual(['left', 'left']);
  });

  it('parses left and right alignment', () => {
    expect(parseTableSeparatorLine('| :--- | ---: |')).toEqual(['left', 'right']);
  });

  it('parses center alignment', () => {
    expect(parseTableSeparatorLine('| :---: | :---: |')).toEqual(['center', 'center']);
  });

  it('parses without spaces', () => {
    expect(parseTableSeparatorLine('|---|---|')).toEqual(['left', 'left']);
  });

  it('parses single dash cells', () => {
    expect(parseTableSeparatorLine('| - | - |')).toEqual(['left', 'left']);
  });

  it('parses varying dash counts', () => {
    expect(parseTableSeparatorLine('| ---- | - | -- |')).toEqual(['left', 'left', 'left']);
  });

  it('parses minimal dashes with alignment', () => {
    expect(parseTableSeparatorLine('| :- | -: | :-: |')).toEqual(['left', 'right', 'center']);
  });

  it('parses single column separator', () => {
    expect(parseTableSeparatorLine('| --- |')).toEqual(['left']);
  });

  it('returns null for plain text', () => {
    expect(parseTableSeparatorLine('not a separator')).toBeNull();
  });

  it('returns null when first cell is not dashes', () => {
    expect(parseTableSeparatorLine('| abc | --- |')).toBeNull();
  });

  it('returns null when second cell is not dashes', () => {
    expect(parseTableSeparatorLine('| --- | abc |')).toBeNull();
  });

  it('returns null for empty cells', () => {
    expect(parseTableSeparatorLine('| |')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTableSeparatorLine('')).toBeNull();
  });
});

describe('isTableSeparatorLine', () => {
  it('returns true for valid separator', () => {
    expect(isTableSeparatorLine('| --- | --- |')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isTableSeparatorLine('hello world')).toBe(false);
  });
});

describe('header + separator integration', () => {
  it('matching column counts produce valid table pair', () => {
    const headers = parseTableHeaderLine('| A | B | C |');
    const separators = parseTableSeparatorLine('| --- | --- | --- |');
    expect(headers).not.toBeNull();
    expect(separators).not.toBeNull();
    expect(headers!.length).toBe(separators!.length);
  });

  it('mismatched column counts should not form a valid table', () => {
    const headers = parseTableHeaderLine('| A | B | C |');
    const separators = parseTableSeparatorLine('| --- | --- |');
    expect(headers).not.toBeNull();
    expect(separators).not.toBeNull();
    expect(headers!.length).not.toBe(separators!.length);
  });
});
