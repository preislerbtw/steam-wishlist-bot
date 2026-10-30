import type { GamePrice } from '../types/steam.types';
import type { ISettings } from '../models/settings.model';

export type NotificationDecision = 'notify' | 'reset' | 'none';

type Filters = Pick<ISettings, 'minimumDiscount' | 'maximumPrice'>;

/** A promoção atende aos filtros do usuário? (maximumPrice = 0 significa sem limite) */
export function isRelevantDeal(price: GamePrice, filters: Filters): boolean {
  if (price.discountPercent <= 0) return false;
  if (price.discountPercent < filters.minimumDiscount) return false;
  if (filters.maximumPrice > 0 && price.finalPrice > filters.maximumPrice) return false;
  return true;
}

/**
 * Decide o que fazer, evitando notificações repetidas.
 *
 * - notify: promoção relevante e (nunca notificada OU preço caiu ainda mais desde a última notificação)
 * - reset:  promoção deixou de ser relevante/terminou -> limpa o estado, para que
 *           um retorno futuro da promoção seja notificado novamente
 * - none:   nada a fazer (mesma promoção já notificada ou sem promoção)
 */
export function decideNotification(
  relevant: boolean,
  finalPrice: number,
  lastNotifiedPrice: number | null | undefined,
): NotificationDecision {
  const last = lastNotifiedPrice ?? null;
  if (!relevant) return last !== null ? 'reset' : 'none';
  if (last === null || finalPrice < last) return 'notify';
  return 'none';
}
