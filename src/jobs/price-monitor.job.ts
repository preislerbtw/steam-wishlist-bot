import { GameModel, type IGame } from '../models/game.model';
import { PriceHistoryModel } from '../models/price-history.model';
import { getSettings, type ISettings } from '../models/settings.model';
import { getSteamService, type SteamService } from '../services/steam.service';
import { getTelegramService, type TelegramService } from '../services/telegram.service';
import { decideNotification, isRelevantDeal } from '../services/deal-evaluator';
import { logger, errorMessage } from '../utils/logger';
import { formatBRL } from '../utils/money';

export interface MonitorSummary {
  total: number;
  checked: number;
  notified: number;
  skipped: number;
  failed: number;
}

type CheckOutcome = 'notified' | 'checked' | 'skipped';

async function checkGame(
  game: IGame,
  settings: ISettings,
  steam: SteamService,
  telegram: TelegramService,
): Promise<CheckOutcome> {
  const info = await steam.getGameInfo(game.appId);

  if (info.name !== game.name) {
    await GameModel.updateOne({ appId: game.appId }, { name: info.name });
  }

  if (info.isFree || info.price === null) {
    logger.info(`${info.name} (${game.appId}): sem preço disponível (${info.isFree ? 'gratuito' : 'não informado'}). Ignorado.`);
    return 'skipped';
  }
  const price = info.price;

  // 1) Histórico: só grava quando algo mudou (economiza espaço no plano gratuito do Atlas).
  const last = await PriceHistoryModel.findOne({ appId: game.appId }).sort({ checkedAt: -1 }).lean();
  const changed =
    !last ||
    last.originalPrice !== price.originalPrice ||
    last.finalPrice !== price.finalPrice ||
    last.discountPercent !== price.discountPercent;

  if (changed) {
    await PriceHistoryModel.create({
      appId: game.appId,
      gameName: info.name,
      originalPrice: price.originalPrice,
      finalPrice: price.finalPrice,
      discountPercent: price.discountPercent,
      currency: price.currency,
      checkedAt: new Date(),
    });
  }

  // 2) Filtros + anti-duplicidade
  const relevant = isRelevantDeal(price, settings);
  const decision = decideNotification(relevant, price.finalPrice, game.lastNotifiedPrice);

  if (decision === 'notify') {
    // Se o envio falhar, lança erro ANTES de atualizar o estado -> tenta de novo na próxima execução.
    await telegram.sendDealNotification({ appId: game.appId, name: info.name, price });
    await GameModel.updateOne({ appId: game.appId }, { lastNotifiedPrice: price.finalPrice });
    logger.info(`${info.name}: notificação enviada (-${price.discountPercent}%, ${formatBRL(price.finalPrice)}).`);
    return 'notified';
  }

  if (decision === 'reset') {
    await GameModel.updateOne({ appId: game.appId }, { lastNotifiedPrice: null });
    logger.info(`${info.name}: promoção terminou/saiu dos filtros. Estado reiniciado.`);
  } else {
    logger.info(
      `${info.name}: ${formatBRL(price.finalPrice)} (-${price.discountPercent}%)${changed ? ' [preço alterado]' : ''} - sem notificação.`,
    );
  }
  return 'checked';
}

/** Verifica todos os jogos ativos. A falha de um jogo não interrompe os demais. */
export async function runPriceMonitor(): Promise<MonitorSummary> {
  const settings = await getSettings();
  const games = await GameModel.find({ active: true }).lean<IGame[]>();
  const summary: MonitorSummary = { total: games.length, checked: 0, notified: 0, skipped: 0, failed: 0 };

  logger.info(
    `Iniciando verificação de ${games.length} jogo(s). Filtros: desconto >= ${settings.minimumDiscount}%, ` +
      `preço <= ${settings.maximumPrice > 0 ? formatBRL(settings.maximumPrice) : 'sem limite'}.`,
  );
  if (games.length === 0) {
    logger.warn('Nenhum jogo ativo cadastrado. Use: npm run cli -- add APP_ID');
    return summary;
  }

  const steam = getSteamService();
  const telegram = getTelegramService();

  for (const game of games) {
    try {
      const outcome = await checkGame(game, settings, steam, telegram);
      if (outcome === 'notified') summary.notified++;
      if (outcome === 'skipped') summary.skipped++;
      else summary.checked++;
    } catch (err) {
      summary.failed++;
      logger.error(`${game.name} (${game.appId}): ${errorMessage(err)}`);
    }
  }

  logger.info(
    `Verificação concluída: ${summary.checked} verificado(s), ${summary.notified} notificação(ões), ` +
      `${summary.skipped} ignorado(s), ${summary.failed} erro(s).`,
  );
  return summary;
}
