import { Api } from 'node-telegram-bot-api';
import { getEnv } from '../config/env';
import { formatBRL } from '../utils/money';
import type { GamePrice } from '../types/steam.types';

export interface DealNotification {
  appId: number;
  name: string;
  price: GamePrice;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const steamStoreUrl = (appId: number): string => `https://store.steampowered.com/app/${appId}`;

/** Monta o texto (HTML do Telegram) da notificação de promoção. Pura, testável. */
export function buildDealMessage({ appId, name, price }: DealNotification): string {
  return [
    `🎮 <b>${escapeHtml(name)}</b>`,
    '',
    `🔥 <b>-${price.discountPercent}%</b>`,
    `💰 De: <s>${formatBRL(price.originalPrice)}</s>`,
    `✅ Por: <b>${formatBRL(price.finalPrice)}</b>`,
    '',
    `🔗 <a href="${steamStoreUrl(appId)}">Abrir na Steam</a>`,
  ].join('\n');
}

/**
 * Serviço de envio. Por enquanto só envia mensagens (v1).
 * Os comandos (/start, /adicionar...) entrarão em src/telegram/ reutilizando os controllers.
 */
export class TelegramService {
  private readonly api: Api;
  private readonly chatId: string;

  constructor() {
    const { botToken, telegramChatId } = getEnv();
    this.api = new Api(botToken);
    this.chatId = telegramChatId;
  }

  async sendMessage(text: string): Promise<void> {
    await this.api.sendMessage({
      chat_id: this.chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }

  async sendDealNotification(deal: DealNotification): Promise<void> {
    await this.sendMessage(buildDealMessage(deal));
  }
}

let instance: TelegramService | undefined;
export function getTelegramService(): TelegramService {
  instance ??= new TelegramService();
  return instance;
}
