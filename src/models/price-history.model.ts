import { Schema, model } from 'mongoose';

/** Valores monetários em centavos. */
export interface IPriceHistory {
  appId: number;
  gameName: string;
  originalPrice: number;
  finalPrice: number;
  discountPercent: number;
  currency: string;
  checkedAt: Date;
}

const priceHistorySchema = new Schema<IPriceHistory>({
  appId: { type: Number, required: true },
  gameName: { type: String, required: true },
  originalPrice: { type: Number, required: true },
  finalPrice: { type: Number, required: true },
  discountPercent: { type: Number, required: true },
  currency: { type: String, required: true },
  checkedAt: { type: Date, required: true, default: Date.now },
});

// Consulta mais comum: último preço / histórico de um jogo.
priceHistorySchema.index({ appId: 1, checkedAt: -1 });
priceHistorySchema.index({ checkedAt: -1 });

export const PriceHistoryModel = model<IPriceHistory>('PriceHistory', priceHistorySchema);
