import { Schema, model } from 'mongoose';

export interface ISettings {
  /** Desconto mínimo em % (0-100). */
  minimumDiscount: number;
  /** Preço máximo em centavos. 0 = sem limite. */
  maximumPrice: number;
  /** Intervalo de verificação em minutos (usado no modo local com node-cron). */
  checkInterval: number;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_SETTINGS = {
  minimumDiscount: 50,
  maximumPrice: 10_000, // R$ 100,00
  checkInterval: 60,
} as const;

const settingsSchema = new Schema<ISettings>(
  {
    minimumDiscount: { type: Number, default: DEFAULT_SETTINGS.minimumDiscount, min: 0, max: 100 },
    maximumPrice: { type: Number, default: DEFAULT_SETTINGS.maximumPrice, min: 0 },
    checkInterval: { type: Number, default: DEFAULT_SETTINGS.checkInterval, min: 1 },
  },
  { timestamps: true },
);

export const SettingsModel = model<ISettings>('Settings', settingsSchema);

/** Configurações são um documento único (singleton): cria com os padrões se não existir. */
export async function getSettings(): Promise<ISettings> {
  const doc = await SettingsModel.findOneAndUpdate(
    {},
    { $setOnInsert: { ...DEFAULT_SETTINGS } },
    { upsert: true, new: true, lean: true },
  );
  return doc as unknown as ISettings;
}
