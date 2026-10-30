import cron from 'node-cron';
import { connectDatabase, disconnectDatabase, ensureIndexes } from './config/database';
import { getEnv } from './config/env';
import { getSettings } from './models/settings.model';
import { runPriceMonitor } from './jobs/price-monitor.job';
import { logger, errorMessage } from './utils/logger';

/**
 * Modo LOCAL: mantém o processo aberto e agenda verificações com node-cron.
 * Na nuvem (GitHub Actions) use src/jobs/run-monitor.ts, que executa uma vez e termina.
 */
function toCronExpression(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes % 60 === 0 && minutes <= 24 * 60) return `0 */${minutes / 60} * * *`;
  logger.warn(`checkInterval=${minutes} não é suportado como cron simples; usando 60 minutos.`);
  return '0 * * * *';
}

async function main(): Promise<void> {
  getEnv();
  await connectDatabase();
  await ensureIndexes();

  const settings = await getSettings();
  const expression = toCronExpression(settings.checkInterval);
  let running = false;

  const execute = async (): Promise<void> => {
    if (running) return logger.warn('Verificação anterior ainda em andamento; pulando.');
    running = true;
    try {
      await runPriceMonitor();
    } catch (err) {
      logger.error(`Erro na verificação: ${errorMessage(err)}`);
    } finally {
      running = false;
    }
  };

  logger.info(`Agendador iniciado (cron "${expression}"). Pressione Ctrl+C para sair.`);
  cron.schedule(expression, () => void execute());
  await execute(); // primeira verificação imediata

  const shutdown = async (): Promise<void> => {
    logger.info('Encerrando...');
    await disconnectDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.error(`Erro fatal: ${errorMessage(err)}`);
  process.exit(1);
});
