import 'dotenv/config';
import axios from 'axios';

/**
 * Descobre o TELEGRAM_CHAT_ID usando o método getUpdates da Bot API.
 * Antes: abra o seu bot no Telegram e envie qualquer mensagem (ex.: /start).
 * Só precisa do BOT_TOKEN no .env.
 */
interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  username?: string;
  title?: string;
}
interface UpdatesResponse {
  ok: boolean;
  description?: string;
  result?: Array<{ message?: { chat: TelegramChat }; my_chat_member?: { chat: TelegramChat } }>;
}

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    console.error('Defina BOT_TOKEN no arquivo .env primeiro.');
    process.exit(1);
  }

  const { data } = await axios.get<UpdatesResponse>(`https://api.telegram.org/bot${token}/getUpdates`, {
    timeout: 15_000,
    validateStatus: () => true,
  });

  if (!data.ok) {
    console.error(`Telegram recusou a requisição: ${data.description ?? 'erro desconhecido'}`);
    process.exit(1);
  }

  const chats = new Map<number, TelegramChat>();
  for (const update of data.result ?? []) {
    const chat = update.message?.chat ?? update.my_chat_member?.chat;
    if (chat) chats.set(chat.id, chat);
  }

  if (chats.size === 0) {
    console.log('Nenhuma conversa encontrada. Abra seu bot no Telegram, envie /start e rode este comando de novo.');
    return;
  }
  console.log('Conversas encontradas (use o "id" como TELEGRAM_CHAT_ID):\n');
  for (const chat of chats.values()) {
    const label = chat.title ?? chat.first_name ?? chat.username ?? '(sem nome)';
    console.log(`  id: ${chat.id}   tipo: ${chat.type}   nome: ${label}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/bot\d+:[\w-]+/g, 'bot<TOKEN>') : String(err));
  process.exit(1);
});
