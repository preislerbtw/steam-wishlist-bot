import { Schema, model } from 'mongoose';

export interface IGame {
  appId: number;
  name: string;
  store: string;
  active: boolean;
  /**
   * Preço final (centavos) da última promoção notificada.
   * null = nenhuma promoção "em aberto". Base da prevenção de notificações duplicadas.
   */
  lastNotifiedPrice: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema = new Schema<IGame>(
  {
    appId: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    store: { type: String, default: 'Steam' },
    active: { type: Boolean, default: true },
    lastNotifiedPrice: { type: Number, default: null },
  },
  { timestamps: true },
);

gameSchema.index({ active: 1 });

export const GameModel = model<IGame>('Game', gameSchema);
