/** Formato (parcial) da resposta de https://store.steampowered.com/api/appdetails */
export interface SteamPriceOverview {
  currency: string;
  initial: number; // centavos
  final: number; // centavos
  discount_percent: number;
  initial_formatted?: string;
  final_formatted?: string;
}

export interface SteamAppData {
  name: string;
  is_free?: boolean;
  price_overview?: SteamPriceOverview;
}

/** Para apps indisponíveis, a Steam retorna { success: false } (ou data vazio). */
export type SteamAppDetailsEntry =
  | { success: false }
  | { success: true; data: SteamAppData | [] };

export type SteamAppDetailsResponse = Record<string, SteamAppDetailsEntry | undefined>;

/** Modelo interno, já validado e normalizado. Valores em centavos. */
export interface GamePrice {
  originalPrice: number;
  finalPrice: number;
  discountPercent: number;
  currency: string;
}

export interface SteamGameInfo {
  appId: number;
  name: string;
  isFree: boolean;
  /** null quando a Steam não informa preço (não lançado, gratuito, sem venda na região...). */
  price: GamePrice | null;
}

/** Item da busca por nome (/api/storesearch). */
export interface SteamSearchResult {
  appId: number;
  name: string;
}