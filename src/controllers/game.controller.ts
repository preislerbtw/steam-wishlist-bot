import { GameModel, type IGame } from '../models/game.model';
import { PriceHistoryModel } from '../models/price-history.model';
import { getSteamService } from '../services/steam.service';
import type { SteamGameInfo, SteamSearchResult } from '../types/steam.types';

/**
 * Regras de negócio de gerenciamento de jogos.
 * Usado hoje pela CLI (src/cli.ts) e, no futuro, pelos comandos do Telegram
 * (/adicionar, /remover, /listar, /preco) sem precisar refatorar nada.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function parseAppId(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`App ID inválido: "${String(value)}". Use o número da URL da Steam (ex.: 1245620).`);
  }
  return n;
}

export async function addGame(appIdInput: unknown): Promise<{ game: IGame; created: boolean }> {
  const appId = parseAppId(appIdInput);

  const existing = await GameModel.findOne({ appId }).lean<IGame>();
  if (existing) {
    if (!existing.active) {
      const reactivated = await GameModel.findOneAndUpdate({ appId }, { active: true }, { new: true }).lean<IGame>();
      return { game: reactivated ?? existing, created: false };
    }
    return { game: existing, created: false };
  }

  // Busca o nome na Steam (também valida que o App ID existe).
  const info = await getSteamService().getGameInfo(appId);
  const created = await GameModel.create({ appId, name: info.name });
  return { game: created.toObject(), created: true };
}

export async function removeGame(appIdInput: unknown): Promise<boolean> {
  const appId = parseAppId(appIdInput);
  const result = await GameModel.deleteOne({ appId });
  return result.deletedCount > 0; // o histórico de preços é mantido
}

export async function setGameActive(appIdInput: unknown, active: boolean): Promise<IGame | null> {
  const appId = parseAppId(appIdInput);
  return GameModel.findOneAndUpdate({ appId }, { active }, { new: true }).lean<IGame>();
}

export async function listGames(): Promise<IGame[]> {
  return GameModel.find().sort({ name: 1 }).lean<IGame[]>();
}

export async function getCurrentPrice(appIdInput: unknown): Promise<SteamGameInfo> {
  return getSteamService().getGameInfo(parseAppId(appIdInput));
}

export async function getLastPrice(appId: number) {
  return PriceHistoryModel.findOne({ appId }).sort({ checkedAt: -1 }).lean();
}

/** Busca jogos na Steam pelo nome (até 10 resultados). */
export async function searchGames(term: string): Promise<SteamSearchResult[]> {
  const clean = term.trim();
  if (clean.length < 2) throw new ValidationError('Digite pelo menos 2 letras para buscar um jogo.');
  return getSteamService().searchGames(clean);
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Procura entre os jogos JÁ cadastrados por parte do nome (sem diferenciar maiúsculas). */
export async function findRegisteredByName(term: string): Promise<IGame[]> {
  const clean = term.trim();
  if (!clean) return [];
  return GameModel.find({ name: new RegExp(escapeRegex(clean), 'i') }).sort({ name: 1 }).lean<IGame[]>();
}