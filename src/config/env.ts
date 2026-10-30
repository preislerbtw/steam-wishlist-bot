import 'dotenv/config';

export interface Env {
  botToken: string;
  telegramChatId: string;
  mongodbUri: string;
  mongodbDbName: string;
  steamRequestDelayMs: number;
}

let cached: Env | undefined;

function readNonNegativeInt(name: string, fallback: number, errors: string[]): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${name} deve ser um número inteiro >= 0 (recebido: "${raw}")`);
    return fallback;
  }
  return value;
}

/**
 * Lê e valida as variáveis de ambiente uma única vez.
 * Se algo estiver errado, lista TODOS os problemas e encerra o processo.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const errors: string[] = [];
  const botToken = process.env.BOT_TOKEN?.trim() ?? '';
  const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? '';
  const mongodbUri = process.env.MONGODB_URI?.trim() ?? '';

  if (!botToken) errors.push('BOT_TOKEN não definido');
  else if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
    errors.push('BOT_TOKEN com formato inválido (esperado algo como 123456789:AAH...)');
  }

  if (!telegramChatId) errors.push('TELEGRAM_CHAT_ID não definido');
  else if (!/^-?\d+$/.test(telegramChatId)) {
    errors.push('TELEGRAM_CHAT_ID deve ser numérico (ex.: 123456789)');
  }

  if (!mongodbUri) errors.push('MONGODB_URI não definido');
  else if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    errors.push('MONGODB_URI deve começar com mongodb:// ou mongodb+srv://');
  }

  const steamRequestDelayMs = readNonNegativeInt('STEAM_REQUEST_DELAY_MS', 1500, errors);

  if (errors.length > 0) {
    console.error('Configuração inválida:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    console.error('\nConfira seu arquivo .env (ou os Secrets do GitHub). Veja .env.example.');
    process.exit(1);
  }

  cached = {
    botToken,
    telegramChatId,
    mongodbUri,
    mongodbDbName: process.env.MONGODB_DB_NAME?.trim() || 'gamedeals',
    steamRequestDelayMs,
  };
  return cached;
}
