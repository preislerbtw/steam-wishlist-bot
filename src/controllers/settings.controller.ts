import { SettingsModel, getSettings, type ISettings } from '../models/settings.model';
import { reaisToCents } from '../utils/money';
import { ValidationError } from './game.controller';

export { getSettings };

export async function setMinimumDiscount(value: unknown): Promise<ISettings> {
  const n = Number(String(value ?? '').replace('%', '').trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError('Desconto mínimo deve ser um número entre 0 e 100.');
  }
  await getSettings(); // garante que o documento exista
  const doc = await SettingsModel.findOneAndUpdate({}, { minimumDiscount: Math.round(n) }, { new: true }).lean<ISettings>();
  return doc as ISettings;
}

/** Recebe o valor em REAIS (ex.: 100 ou 99,90) e grava em centavos. 0 = sem limite. */
export async function setMaximumPrice(value: unknown): Promise<ISettings> {
  const n = Number(String(value ?? '').replace(/^R\$\s*/i, '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError('Preço máximo deve ser um número >= 0 (em reais). Use 0 para remover o limite.');
  }
  await getSettings();
  const doc = await SettingsModel.findOneAndUpdate({}, { maximumPrice: reaisToCents(n) }, { new: true }).lean<ISettings>();
  return doc as ISettings;
}
