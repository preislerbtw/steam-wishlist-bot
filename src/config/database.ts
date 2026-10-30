import mongoose from 'mongoose';
import { getEnv } from './env';
import { logger, errorMessage } from '../utils/logger';
import { sleep } from '../utils/sleep';

const MAX_ATTEMPTS = 3;

/** Conecta ao MongoDB Atlas com algumas tentativas. A URI nunca é logada. */
export async function connectDatabase(): Promise<void> {
  const { mongodbUri, mongodbDbName } = getEnv();
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await mongoose.connect(mongodbUri, {
        dbName: mongodbDbName,
        serverSelectionTimeoutMS: 15_000,
      });
      logger.info(`MongoDB conectado (banco "${mongodbDbName}").`);
      return;
    } catch (err) {
      logger.error(`Falha ao conectar no MongoDB (tentativa ${attempt}/${MAX_ATTEMPTS}): ${errorMessage(err)}`);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          'Não foi possível conectar ao MongoDB. Verifique MONGODB_URI, usuário/senha e o Network Access (IP) no Atlas.',
        );
      }
      await sleep(attempt * 3000);
    }
  }
}

/** Garante que os índices dos models existam (idempotente). */
export async function ensureIndexes(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB desconectado.');
}
