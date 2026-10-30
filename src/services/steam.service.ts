import axios, { AxiosError, type AxiosInstance } from 'axios';
import { getEnv } from '../config/env';
import { logger } from '../utils/logger';
import { sleep } from '../utils/sleep';
import type {
  GamePrice,
  SteamAppData,
  SteamAppDetailsResponse,
  SteamGameInfo,
  SteamSearchResult,
} from '../types/steam.types';

const APPDETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const STORESEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

export type SteamErrorKind = 'unavailable' | 'invalid_response' | 'rate_limited' | 'network';

export class SteamError extends Error {
  constructor(
    message: string,
    public readonly kind: SteamErrorKind,
  ) {
    super(message);
    this.name = 'SteamError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Valida e normaliza a resposta bruta da Steam.
 * Exportada para ser testável sem rede.
 */
export function parseAppDetails(appId: number, body: unknown): SteamGameInfo {
  if (!isRecord(body)) {
    throw new SteamError('Resposta da Steam não é um objeto JSON', 'invalid_response');
  }
  const entry = (body as SteamAppDetailsResponse)[String(appId)];
  if (!entry) {
    throw new SteamError(`Resposta da Steam sem dados para o App ID ${appId}`, 'invalid_response');
  }
  if (!entry.success) {
    throw new SteamError(`App ID ${appId} indisponível na Steam (inexistente, removido ou restrito na região)`, 'unavailable');
  }
  const data = entry.data;
  if (!isRecord(data) || typeof data.name !== 'string' || data.name.trim() === '') {
    throw new SteamError(`Dados do App ID ${appId} incompletos`, 'invalid_response');
  }

  const appData = data as unknown as SteamAppData;
  const isFree = appData.is_free === true;
  const po = appData.price_overview;

  let price: GamePrice | null = null;
  if (po !== undefined) {
    if (
      !isRecord(po) ||
      !isFiniteNumber(po.initial) ||
      !isFiniteNumber(po.final) ||
      !isFiniteNumber(po.discount_percent) ||
      typeof po.currency !== 'string'
    ) {
      throw new SteamError(`price_overview do App ID ${appId} em formato inesperado`, 'invalid_response');
    }
    price = {
      originalPrice: po.initial,
      finalPrice: po.final,
      discountPercent: po.discount_percent,
      currency: po.currency,
    };
  }

  return { appId, name: appData.name.trim(), isFree, price };
}

/**
 * Valida a resposta de /api/storesearch (busca por nome) e mantém apenas "apps".
 * Exportada para ser testável sem rede.
 */
export function parseStoreSearch(body: unknown): SteamSearchResult[] {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new SteamError('Resposta da busca da Steam em formato inesperado', 'invalid_response');
  }
  const results: SteamSearchResult[] = [];
  for (const item of body.items as unknown[]) {
    if (!isRecord(item)) continue;
    if (!isFiniteNumber(item.id) || typeof item.name !== 'string') continue;
    if (item.type !== undefined && item.type !== 'app') continue; // ignora pacotes/bundles
    results.push({ appId: item.id, name: item.name.trim() });
  }
  return results;
}

export class SteamService {
  private readonly http: AxiosInstance;
  private readonly minIntervalMs: number;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(minIntervalMs?: number) {
    this.minIntervalMs = minIntervalMs ?? getEnv().steamRequestDelayMs;
    this.http = axios.create({
      baseURL: APPDETAILS_URL,
      timeout: 15_000,
      headers: { 'User-Agent': 'GameDealsBot/1.0 (+personal price monitor)' },
    });
  }

  /**
   * Fila serial: no máximo 1 requisição por vez e com intervalo mínimo entre elas,
   * independentemente de quem chama. Protege contra bloqueio por excesso de requisições.
   */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request(appId: number): Promise<unknown> {
    const response = await this.http.get('', {
      params: {
        appids: appId,
        cc: 'br', // país/moeda: BRL
        l: 'brazilian', // idioma: português do Brasil
        filters: 'basic,price_overview',
      },
    });
    return response.data;
  }

  private async requestSearch(term: string): Promise<unknown> {
    const response = await this.http.get(STORESEARCH_URL, {
      params: { term, cc: 'br', l: 'brazilian' },
    });
    return response.data;
  }

  /** Executa uma requisição enfileirada, com retentativas para falhas transitórias. */
  private async withRetries<T>(
    request: () => Promise<unknown>,
    parse: (body: unknown) => T,
    label: string,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const body = await this.schedule(request);
        return parse(body);
      } catch (err) {
        lastError = err;
        if (err instanceof SteamError) throw err; // resposta inválida/indisponível: não adianta repetir

        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const retryable = status === undefined || RETRYABLE_STATUS.has(status);
        if (!retryable || attempt === MAX_ATTEMPTS) break;

        const backoff = attempt * 5000;
        logger.warn(`Steam: falha ao consultar ${label} (${status ?? 'rede'}). Nova tentativa em ${backoff / 1000}s...`);
        await sleep(backoff);
      }
    }

    const status = axios.isAxiosError(lastError) ? (lastError as AxiosError).response?.status : undefined;
    if (status === 429 || status === 403) {
      throw new SteamError(`Steam recusou a requisição (HTTP ${status}) - possível limite de requisições`, 'rate_limited');
    }
    throw new SteamError(
      `Falha de comunicação com a Steam: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      'network',
    );
  }

  /** Consulta nome e preço de um jogo pelo App ID. */
  getGameInfo(appId: number): Promise<SteamGameInfo> {
    return this.withRetries(() => this.request(appId), (body) => parseAppDetails(appId, body), `App ${appId}`);
  }

  /** Busca jogos pelo nome (a Steam retorna no máximo 10 resultados). */
  searchGames(term: string): Promise<SteamSearchResult[]> {
    return this.withRetries(() => this.requestSearch(term), parseStoreSearch, `busca "${term}"`);
  }
}

let instance: SteamService | undefined;
export function getSteamService(): SteamService {
  instance ??= new SteamService();
  return instance;
}