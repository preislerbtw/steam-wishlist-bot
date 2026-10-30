import { connectDatabase, disconnectDatabase, ensureIndexes } from '../config/database';
import { getEnv } from '../config/env';
import { runPriceMonitor } from './price-monitor.job';
import { logger, errorMessage } from '../utils/logger';

/** Executa UMA verificação e finaliza (usado pelo GitHub Actions). */
async function main(): Promise<number> {
  getEnv(); // valida as variáveis antes de qualquer coisa
  try {
    await connectDatabase();
    await ensureIndexes();
    const summary = await runPriceMonitor();
    // Falha o workflow apenas se TODOS os jogos deram erro (ex.: Steam fora do ar, token inválido).
    return summary.total > 0 && summary.failed === summary.total ? 1 : 0;
  } catch (err) {
    logger.error(`Erro fatal: ${errorMessage(err)}`);
    return 1;
  } finally {
    await disconnectDatabase().catch(() => undefined);
  }
}

main().then((code) => process.exit(code));
