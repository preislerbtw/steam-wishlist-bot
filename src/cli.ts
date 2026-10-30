import { connectDatabase, disconnectDatabase, ensureIndexes } from './config/database';
import { getEnv } from './config/env';
import { createInterface } from 'node:readline/promises';
import {
  addGame,
  findRegisteredByName,
  getCurrentPrice,
  listGames,
  removeGame,
  searchGames,
  setGameActive,
  ValidationError,
} from './controllers/game.controller';
import { getSettings, setMaximumPrice, setMinimumDiscount } from './controllers/settings.controller';
import { getTelegramService } from './services/telegram.service';
import { formatBRL } from './utils/money';
import { errorMessage } from './utils/logger';

const HELP = `
GameDeals Bot - CLI

Uso: npm run cli -- <comando> [argumento]

  add <NOME ou APP_ID>      Adiciona um jogo (ex.: add elden ring  /  add 1245620)
  search <NOME>             Busca jogos na Steam pelo nome, sem adicionar
  remove <NOME ou APP_ID>   Remove um jogo cadastrado
  enable <NOME ou APP_ID>   Reativa o monitoramento de um jogo
  disable <NOME ou APP_ID>  Pausa o monitoramento de um jogo
  list                      Lista os jogos cadastrados
  price <NOME ou APP_ID>    Consulta o preço atual na Steam
  settings                  Mostra os filtros atuais
  discount <VALOR>          Define o desconto mínimo em % (ex.: 50)
  limit <VALOR>             Define o preço máximo em R$ (ex.: 100). 0 = sem limite
  test-telegram             Envia uma mensagem de teste ao seu Telegram
`;

const isNumeric = (value: string | undefined): boolean => /^\d+$/.test((value ?? '').trim());

/** Pergunta no terminal e devolve a resposta digitada. */
async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Busca na Steam pelo nome e deixa o usuário escolher o resultado certo. Retorna o App ID ou null. */
async function pickFromSteamSearch(term: string): Promise<number | null> {
  const results = await searchGames(term);
  if (results.length === 0) {
    console.log(`Nenhum jogo encontrado para "${term}". Tente outro nome ou use o App ID.`);
    return null;
  }
  if (results.length === 1 && results[0]) {
    console.log(`Encontrado: ${results[0].name} (${results[0].appId})`);
    return results[0].appId;
  }
  console.log(`Resultados para "${term}":\n`);
  results.forEach((r, i) => console.log(`  ${i + 1}) ${r.name}  [App ID ${r.appId}]`));
  const answer = await ask('\nDigite o número do jogo (Enter para cancelar): ');
  const index = Number(answer);
  const chosen = Number.isInteger(index) ? results[index - 1] : undefined;
  if (!chosen) {
    console.log('Cancelado.');
    return null;
  }
  return chosen.appId;
}

/** Aceita App ID ou parte do nome de um jogo JÁ cadastrado. */
async function resolveRegisteredAppId(arg: string | undefined): Promise<number | null> {
  if (!arg) throw new ValidationError('Informe o nome ou o App ID do jogo.');
  if (isNumeric(arg)) return Number(arg);

  const matches = await findRegisteredByName(arg);
  if (matches.length === 0) {
    console.log(`Nenhum jogo cadastrado com "${arg}" no nome. Veja a lista com: npm run cli -- list`);
    return null;
  }
  if (matches.length > 1) {
    console.log(`Vários jogos combinam com "${arg}". Seja mais específico ou use o App ID:\n`);
    for (const g of matches) console.log(`  ${String(g.appId).padEnd(9)} ${g.name}`);
    return null;
  }
  return matches[0]?.appId ?? null;
}

async function run(command: string | undefined, arg: string | undefined): Promise<void> {
  switch (command) {
    case 'search': {
      if (!arg) throw new ValidationError('Informe o nome do jogo. Ex.: npm run cli -- search elden ring');
      const results = await searchGames(arg);
      if (results.length === 0) return console.log('Nenhum jogo encontrado.');
      for (const r of results) console.log(`${String(r.appId).padEnd(9)} ${r.name}`);
      return;
    }
    case 'add': {
      if (!arg) throw new ValidationError('Informe o nome ou o App ID. Ex.: npm run cli -- add elden ring');
      const appId = isNumeric(arg) ? Number(arg) : await pickFromSteamSearch(arg);
      if (appId === null) return;
      const { game, created } = await addGame(appId);
      console.log(created ? `Adicionado: ${game.name} (${game.appId})` : `Já cadastrado: ${game.name} (${game.appId})`);
      return;
    }
    case 'remove': {
      const appId = await resolveRegisteredAppId(arg);
      if (appId === null) return;
      const removed = await removeGame(appId);
      console.log(removed ? 'Jogo removido.' : 'Jogo não encontrado.');
      return;
    }
    case 'enable':
    case 'disable': {
      const appId = await resolveRegisteredAppId(arg);
      if (appId === null) return;
      const game = await setGameActive(appId, command === 'enable');
      console.log(game ? `${game.name}: monitoramento ${game.active ? 'ATIVO' : 'PAUSADO'}.` : 'Jogo não encontrado.');
      return;
    }
    case 'list': {
      const games = await listGames();
      if (games.length === 0) return console.log('Nenhum jogo cadastrado.');
      for (const g of games) console.log(`${g.active ? 'ATIVO  ' : 'PAUSADO'} ${String(g.appId).padEnd(9)} ${g.name}`);
      return;
    }
    case 'price': {
      const appId = await resolveRegisteredAppId(arg);
      if (appId === null) return;
      const info = await getCurrentPrice(appId);
      if (info.isFree) return console.log(`${info.name}: gratuito.`);
      if (!info.price) return console.log(`${info.name}: a Steam não informou preço.`);
      const p = info.price;
      console.log(`${info.name}: ${formatBRL(p.finalPrice)} (de ${formatBRL(p.originalPrice)}, -${p.discountPercent}%)`);
      return;
    }
    case 'settings': {
      const s = await getSettings();
      console.log(`Desconto mínimo: ${s.minimumDiscount}%`);
      console.log(`Preço máximo:    ${s.maximumPrice > 0 ? formatBRL(s.maximumPrice) : 'sem limite'}`);
      console.log(`Intervalo local: ${s.checkInterval} min`);
      return;
    }
    case 'discount': {
      const s = await setMinimumDiscount(arg);
      console.log(`Desconto mínimo: ${s.minimumDiscount}%`);
      return;
    }
    case 'limit': {
      const s = await setMaximumPrice(arg);
      console.log(`Preço máximo: ${s.maximumPrice > 0 ? formatBRL(s.maximumPrice) : 'sem limite'}`);
      return;
    }
    case 'test-telegram': {
      await getTelegramService().sendMessage('Steam Wishlist Bot conectado com sucesso!');
      console.log('Mensagem de teste enviada. Confira seu Telegram.');
      return;
    }
    default:
      console.log(HELP);
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const arg = rest.join(' ').trim() || undefined; // permite nomes com espaços sem aspas
  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    return 0;
  }
  getEnv();
  try {
    await connectDatabase();
    await ensureIndexes();
    await run(command, arg);
    return 0;
  } catch (err) {
    console.error(err instanceof ValidationError ? err.message : errorMessage(err));
    return 1;
  } finally {
    await disconnectDatabase().catch(() => undefined);
  }
}

main().then((code) => process.exit(code));