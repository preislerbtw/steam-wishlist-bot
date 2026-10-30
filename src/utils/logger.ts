type Level = 'INFO' | 'WARN' | 'ERROR';

function write(level: Level, message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string): void => write('INFO', message),
  warn: (message: string): void => write('WARN', message),
  error: (message: string): void => write('ERROR', message),
};

/** Extrai uma mensagem legível de qualquer valor lançado. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
