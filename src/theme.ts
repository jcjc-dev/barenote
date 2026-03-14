import { setWindowTheme } from './ipc';

export type ThemeMode = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-mode', mode);
  setWindowTheme(resolved).catch(console.error);
}

export function initThemeSystem(mode: ThemeMode): void {
  applyTheme(mode);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentMode = document.documentElement.getAttribute('data-theme-mode');
    if (currentMode === 'system') {
      applyTheme('system');
    }
  });
}
