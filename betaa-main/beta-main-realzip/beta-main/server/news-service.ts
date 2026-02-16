import OpenAI from "openai";
import { batchProcess } from "./replit_integrations/batch/index.ts";
import { getTelegramBot } from "./telegram";
import { storage } from "./storage";

let openrouter: OpenAI | null = null;
function getOpenRouterClient(): OpenAI | null {
  if (openrouter) return openrouter;
  const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL;
  try {
    openrouter = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true } as any);
    return openrouter;
  } catch (e) {
    console.error('Failed to initialize OpenAI client for news-service:', e);
    openrouter = null;
    return null;
  }
}

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

    const client = getOpenRouterClient();
    const summaries = await batchProcess(items, async (item) => {
      if (!client) return item; // fallback: send raw item if no AI
      const response = await client.chat.completions.create({
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [{ role: "user", content: `Summarize this briefly: ${item}` }],
      } as any);
      return (response.choices && response.choices[0] && response.choices[0].message?.content) || "";
    });

    for (const summary of summaries) {
      bot.sendMessage(binding.groupId, `${summary}\n\n${hashtag}`, {
        parse_mode: 'HTML',
        message_thread_id: binding.topicId ? parseInt(binding.topicId) : undefined
      });
    }
  }
}
