import OpenAI from "openai";
import { batchProcess } from "./replit_integrations/batch/index.ts";
import { getTelegramBot } from "./telegram";
import { storage } from "./storage";

const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

async function fetchNews(type: 'crypto' | 'forex') {
  // Mock feeds for now
  return [
    `Market Alert: ${type.toUpperCase()} shows significant movement today.`,
    `Central Bank Update: New data suggests shift in ${type === 'crypto' ? 'regulatory' : 'interest rate'} landscape.`
  ];
}

export async function broadcastNews() {
  const bot = getTelegramBot();
  if (!bot) return;

  const bindings = await storage.getAllGroupBindings();
  const newsBindings = bindings.filter(b => b.lane === 'news');

  for (const binding of newsBindings) {
    const type = binding.market as 'crypto' | 'forex';
    const items = await fetchNews(type);
    const hashtag = type === 'crypto' ? '#cryptonews' : '#forexnews';

    const summaries = await batchProcess(items, async (item) => {
      const response = await openrouter.chat.completions.create({
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [{ role: "user", content: `Summarize this briefly: ${item}` }],
      });
      return response.choices[0]?.message?.content || "";
    });

    for (const summary of summaries) {
      bot.sendMessage(binding.groupId, `${summary}\n\n${hashtag}`, {
        parse_mode: 'HTML',
        message_thread_id: binding.topicId ? parseInt(binding.topicId) : undefined
      });
    }
  }
}
