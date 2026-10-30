const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como moeda brasileira. Ex.: 9995 -> "R$ 99,95". */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\u00a0/g, ' ');
}

/** Converte reais (ex.: 99.95) em centavos inteiros (9995). */
export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}
