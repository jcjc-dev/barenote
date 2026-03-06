const invokeHandlers = new Map<string, (...args: any[]) => any>();

export function mockInvoke(command: string, handler: (...args: any[]) => any): void {
  invokeHandlers.set(command, handler);
}

export function clearMocks(): void {
  invokeHandlers.clear();
}

export async function invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const handler = invokeHandlers.get(cmd);
  if (handler) return handler(args);
  throw new Error(`No mock for command: ${cmd}`);
}
