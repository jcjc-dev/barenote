// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Toast } from './toast';

describe('Toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a toast container on the body', () => {
    new Toast();
    const container = document.querySelector('.toast-container');
    expect(container).not.toBeNull();
    expect(document.body.contains(container)).toBe(true);
  });

  it('adds a toast element with correct message', () => {
    const toast = new Toast();
    toast.show('Hello');
    const el = document.querySelector('.toast');
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe('Hello');
  });

  it('applies toast-error class for error type', () => {
    const toast = new Toast();
    toast.show('Oops', 'error');
    const el = document.querySelector('.toast');
    expect(el!.className).toContain('toast-error');
  });

  it('applies toast-success class for success type', () => {
    const toast = new Toast();
    toast.show('Done', 'success');
    const el = document.querySelector('.toast');
    expect(el!.className).toContain('toast-success');
  });

  it('applies toast-info class by default', () => {
    const toast = new Toast();
    toast.show('Info');
    const el = document.querySelector('.toast');
    expect(el!.className).toContain('toast-info');
  });

  it('appends toast to the container', () => {
    const toast = new Toast();
    toast.show('A');
    toast.show('B');
    const container = document.querySelector('.toast-container');
    expect(container!.children.length).toBe(2);
  });
});
