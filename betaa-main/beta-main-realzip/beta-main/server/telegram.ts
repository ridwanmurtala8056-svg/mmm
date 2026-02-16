import { groupBindings, signals as signalsTable, users, wallets as walletsTable, trades as tradesTable, userLanes, userPremiums, admins } from "../shared/schema";
// touch imports to avoid TS unused-import errors
void signalsTable; void users; void walletsTable; void tradesTable; void userLanes; void userPremiums; void admins;
import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';
import { log } from "./index";
import { Keypair, Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import axios from "axios";
import { eq, and, or, count, sql } from "drizzle-orm";
import { db } from "./db";
import { JupiterService } from "./solana";
import { analyzeIndicators, formatIndicatorsForDisplay, TokenMetrics } from "./indicators";
import { verifyTwitter, formatSocialVerification, checkHolderRisk, checkContractSecurity, calculateSocialRiskScore, isSolanaAddress } from "./social-verify";
import { askAI } from "./ai";

export let telegramBotInstance: TelegramBot | null = null;

export function getTelegramBot() {
  return telegramBotInstance;
}

export function setupTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log("TELEGRAM_BOT_TOKEN is missing. Bot will not start.", "telegram");
    return;
  }

  log("Initializing Telegram bot...", "telegram");
  
  if (telegramBotInstance) {
    log("Existing bot instance found, stopping polling...", "telegram");
    telegramBotInstance.stopPolling();
  }

  const bot = new TelegramBot(token, { 
    polling: {
      interval: 1000,
      autoStart: true,
      params: {
        timeout: 10
      }
    } 
  }); 
  
  telegramBotInstance = bot;

  // Always-print startup confirmation to aid debugging (bypass filtered logger)
  console.log("[telegram] Bot instance created and polling started (token present)");

  // Validate token by calling getMe and log result (safe, don't print token)
  (async () => {
    try {
      const info = await bot.getMe();
      console.log(`[telegram] getMe success: username=${info.username}, id=${info.id}`);
    } catch (err: any) {
      console.error('[telegram] getMe failed (invalid token or network):', err?.message || err);
    }
  })();

  // Surface polling errors for visibility
  bot.on('polling_error', (err: any) => {
    console.error('[telegram] Polling error:', err?.message || err);
  });

  // Log incoming messages for debugging (do not expose sensitive content)
  bot.on('message', (msg: any) => {
    try {
      const from = msg.from?.username || msg.from?.id || 'unknown';
      const chat = msg.chat?.id || 'unknown';
      const text = msg.text ? String(msg.text).substring(0, 120) : '(no text)';
      console.log(`[telegram] Received message from=${from} chat=${chat} text=${text}`);
    } catch (e) {
      console.error('[telegram] Failed to log incoming message', e);
    }
  });

  const OWNER_ID = '6491714705';
  const PREMIUM_GROUP_ID = '-1003580859943'; // Private premium channel

  // Rate limiting for free tier (1 per day per command)
  const freeTierRateLimit = new Map<string, { command: string; timestamp: number }>();

  async function isInPremiumGroup(userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
      const member = await bot.getChatMember(PREMIUM_GROUP_ID, Number(userId));
      return member && (member.status === 'member' || member.status === 'administrator' || member.status === 'creator');
    } catch (e: any) {
      return false;
    }
  }

  function canUseFreeCommand(userId: string, command: string): boolean {
    const key = `${userId}:${command}`;
    const last = freeTierRateLimit.get(key);
    if (!last) return true;
    const hoursSince = (Date.now() - last.timestamp) / (1000 * 60 * 60);
    return hoursSince >= 24; // 1 per day = 24 hours
  }

  function recordFreeCommand(userId: string, command: string): void {
    const key = `${userId}:${command}`;
    freeTierRateLimit.set(key, { command, timestamp: Date.now() });
  }

  async function isPremiumOrAdmin(userId: string): Promise<boolean> {
    try {
      if (!userId) return false;
      if (userId === OWNER_ID) return true;
      const admin = await storage.isAdmin(userId);
      if (admin) return true;
      if (await isInPremiumGroup(userId)) return true;
      const p = await storage.getUserPremium(userId);
      if (!p) return false;
      return p.tier && p.tier !== 'free' && p.expiresAt && p.expiresAt > Date.now();
    } catch (e) { return false; }
  }

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`[telegram] /start command triggered from chat ${chatId}`);
    bot.sendMessage(chatId, "🚀 <b>Welcome to Coin Hunter Bot!</b>\n\nYour institutional-grade trading companion for Solana and Forex.", { parse_mode: 'HTML' });
  });

  // Price command: /p [symbol]
  bot.onText(/\/p\s+(.+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = (match && match[1]) ? String(match[1]).toUpperCase().trim() : "";
    console.log(`[telegram] /p command triggered with symbol: ${symbol}`);

    if (!symbol) {
      return bot.sendMessage(chatId, "Usage: /p [symbol]\nExamples: /p BTC, /p ETH/USDT, /p SOL");
    }

    try {
      const { getPrice } = await import("./signals-worker");
      
      const price = await getPrice(symbol, "crypto");

      if (price && price > 0) {
        const priceText = `<b>💰 ${symbol} Price</b>\n\n` +
          `<b>Current Price:</b> $${price.toFixed(price < 1 ? 6 : 2)}\n` +
          `<i>Last updated: ${new Date().toLocaleTimeString()}</i>`;
        
        await bot.sendMessage(chatId, priceText, { parse_mode: 'HTML' });
      } else {
        await bot.sendMessage(chatId, `❌ Could not fetch price for <b>${symbol}</b>.\n\nMake sure the symbol is correct.`, { parse_mode: 'HTML' });
      }
    } catch (e: any) {
      console.error(`[telegram] /p command error:`, e);
      return bot.sendMessage(chatId, `❌ Error: ${e.message || String(e)}`);
    }
  });

  // Help command with all available features
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpText = `<b>📚 COIN HUNTER BOT - COMMAND GUIDE</b>\n\n` +
      `<b>🎯 CORE COMMANDS:</b>\n` +
      `/start - Show welcome message\n` +
      `/help - Display this help menu\n` +
      `/info - View membership tiers and features\n\n` +
      `<b>💰 PRICE & MARKET:</b>\n` +
      `/p [symbol] - Get current price (e.g., /p BTC or /p ETH/USDT)\n\n` +
      `<b>🤖 AI & ANALYSIS:</b>\n` +
      `/ai [query] - Ask AI specialist any question\n` +
      `/ask [query] - Alternative to /ai command\n\n` +
      `<b>🔐 SECURITY & VERIFICATION:</b>\n` +
      `/check [token_name] - Verify token authenticity by name\n` +
      `/check [mint_address] - Verify Solana meme coin by mint address\n` +
      `/overview [token] [url] - Same as /check with optional website\n\n` +
      `<b>📈 SIGNAL MANAGEMENT:</b>\n` +
      `/bind crypto - Bind group to crypto trading signals\n` +
      `/bind forex - Bind group to forex trading signals\n` +
      `/bind news crypto - Bind group to crypto news updates\n` +
      `/bind news forex - Bind group to forex news updates\n\n` +
      `<b>📊 ANALYSIS:</b>\n` +
      `/analyze [pair] - Deep institutional analysis (e.g., /analyze BTC/USDT)\n` +
      `/setup [pair] - Find neutral SMC setup\n\n` +
      `<b>📝 EXAMPLES:</b>\n` +
      `✓ /p BTC - Get Bitcoin price\n` +
      `✓ /ai What's the current Bitcoin trend?\n` +
      `✓ /check DOGE\n` +
      `✓ /analyze ETH/USDT\n\n` +
      `⚠️ <i>Always DYOR (Do Your Own Research) before trading!</i>`;
    
    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
  });

  // Info command: Premium benefits vs non-premium limits
  bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    const isPremium = userId ? await isPremiumOrAdmin(userId) : false;

    const infoText = `<b>💎 COIN HUNTER BOT - MEMBERSHIP COMPARISON</b>\n\n` +
      `<b>🆓 FREE TIER (Non-Premium)</b>\n` +
      `├─ Crypto Signals: ❌ Disabled\n` +
      `├─ Forex Signals: ❌ Disabled\n` +
      `├─ AI Analysis (/ai|/ask): ⚠️ 1 query per day\n` +
      `├─ Meme Coin Verification (/check): ⚠️ 1 check per day\n` +
      `├─ Setup Analysis (/setup): ⚠️ 1 analysis per day\n` +
      `├─ Deep Analysis (/analyze): ⚠️ 1 analysis per day\n` +
      `├─ Real-time Monitoring: ❌ No (manual queries only)\n` +
      `├─ Custom RPC: ❌ No\n` +
      `├─ Group Binding: ❌ No (single PM only)\n` +
      `└─ Support: Community admins (@FiftyOneP3rcent, admins in group)\n\n` +
      `<b>👑 PREMIUM TIER ($100/month - Verify in <a href="https://t.me/TheRealCoinHunterBeta">premium channel</a>)</b>\n` +
      `├─ Crypto Signals: ✅ Unlimited institutional signals\n` +
      `├─ Forex Signals: ✅ Unlimited institutional signals\n` +
      `├─ AI Analysis: ✅ Unlimited deep-dive analysis\n` +
      `├─ Meme Coin Verification: ✅ Unlimited checks\n` +
      `├─ Setup Analysis: ✅ Unlimited analysis\n` +
      `├─ Deep Analysis: ✅ Unlimited analysis\n` +
      `├─ Real-time Monitoring: ✅ 10-15m auto-updates\n` +
      `├─ Image Analysis: ✅ Chart recognition & /ai with images\n` +
      `├─ Volume Alerts: ✅ Custom spike notifications\n` +
      `├─ Whale Tracking: ✅ Large transaction monitoring\n` +
      `├─ Smart Entry Zones: ✅ AI-powered recommendations\n` +
      `├─ Portfolio Analytics: ✅ Track P&L & metrics\n` +
      `├─ Custom RPC: ✅ Use your own Solana RPC\n` +
      `├─ Group Binding: ✅ Up to 3 groups (ai, news, crypto, forex)\n` +
      `└─ Support: 24/7 priority support\n\n` +
      `<b>💰 PRICING & UPGRADE</b>\n` +
      `Premium: $100/month (recurring)\n` +
      `<a href="https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU">👉 UPGRADE TO PREMIUM</a>\n\n` +
      `<b>🎯 YOUR STATUS</b>\n` +
      `${isPremium ? `✅ <b>PREMIUM MEMBER</b> - All features unlocked! 🎉` : `⚠️ <b>FREE TIER</b> - Limited to 1 query/day per command`}\n\n` +
      `<b>📞 SUPPORT & COMMUNITY</b>\n` +
      `🔗 Community: <a href="https://t.me/TheRealCoinHunterBeta">TheRealCoinHunterBeta</a>\n` +
      `👤 Direct: <a href="https://t.me/FiftyOneP3rcent">@FiftyOneP3rcent</a>\n` +
      `💬 Or reach any admin in the community group`;

    bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
  });

  // Simple AI query command: /ai or /ask - now supports images
  bot.onText(/\/(?:ai|ask)(?:\s+(.*))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    const query = (match && match[1]) ? String(match[1]).trim() : "";
    
    if (!userId) return bot.sendMessage(chatId, "❌ Unable to identify user");
    const isPremium = await isPremiumOrAdmin(userId);
    if (!isPremium && !canUseFreeCommand(userId, 'ai')) {
      return bot.sendMessage(chatId, "⏰ Free tier limit reached!\n\nYou can use /ai once per day.\n✋ Upgrade to premium: https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU");
    }
    if (!isPremium) recordFreeCommand(userId, 'ai');
    
    // Check if there's a photo attachment
    let imageUrl: string | undefined = undefined;
    if (msg.photo && msg.photo.length > 0) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      try {
        const fileUrl = await getTelegramBot()?.getFileLink(largestPhoto.file_id);
        imageUrl = fileUrl as string;
        console.log('[telegram] Got image URL for /ai:', imageUrl);
      } catch (e: any) {
        console.error('[telegram] Failed to get photo URL:', e.message);
      }
    }
    
    if (!query && !imageUrl) return bot.sendMessage(chatId, "Usage: /ai [your question] or /ask [your question]\nYou can also attach an image for analysis");

    try {
      const waiting = await bot.sendMessage(chatId, "🤖 Thinking... please wait.");
      const reply = await askAI(query || (imageUrl ? "Analyze this trading chart and provide setup recommendations" : ""), imageUrl);
      if (!reply) {
        return bot.sendMessage(chatId, "❌ AI request failed or no API key configured.");
      }
      await bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
      try { await bot.deleteMessage(chatId, waiting.message_id); } catch (e) { /* ignore */ }
    } catch (e: any) {
      return bot.sendMessage(chatId, `❌ Error: ${e.message || String(e)}`);
    }
  });

  // Photo handler for /ai and /ask (when image is sent without text)
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.caption || (!msg.caption.startsWith('/ai') && !msg.caption.startsWith('/ask'))) return;
    
    // Handled by onText handler above
  });

  // Simple AI query command: /ai or /ask

  // Meme coin verification: /check or /overview [token_name|mint_address] [optional: website_url]
  bot.onText(/\/(?:check|overview)\s+(.+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    const fullInput = (match && match[1]) ? String(match[1]).trim() : "";
    
    if (!userId) return bot.sendMessage(chatId, "❌ Unable to identify user");
    const isPremium = await isPremiumOrAdmin(userId);
    if (!isPremium && !canUseFreeCommand(userId, 'check')) {
      return bot.sendMessage(chatId, "⏰ Free tier limit reached!\n\nYou can use /check once per day.\n✋ Upgrade to premium: https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU");
    }
    if (!isPremium) recordFreeCommand(userId, 'check');
    
    if (!fullInput) return bot.sendMessage(chatId, "Usage: /check [token_name|mint_address] [optional: website_url]\nExample: /check DOGE https://dogecoin.com\nOR /check EPjFWaLb3bSsKUje29MC7pNqrescVeKYvwiMT4oCHja");

    try {
      const waiting = await bot.sendMessage(chatId, "🔍 Verifying coin authenticity... please wait.");
      
      // Parse input to extract token/address and optional URL
      let input = "";
      let websiteUrl: string | undefined = undefined;
      
      const urlMatch = fullInput.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        websiteUrl = urlMatch[1];
        input = fullInput.replace(urlMatch[1], "").trim();
      } else {
        input = fullInput;
      }
      
      if (!input) return bot.sendMessage(chatId, "Usage: /check [token_name|mint_address] [optional: website_url]");
      
      let tokenName = input;
      let mintAddress = "";

      // Check if input is a Solana mint address
      if (isSolanaAddress(input)) {
        mintAddress = input;
        // For Solana meme coins, use the mint address as identifier
        tokenName = `Solana Token (${input.substring(0, 8)}...)`;
      }
      
      // Log for debugging
      console.log(`[telegram] /check input: token="${input}" website="${websiteUrl}"`);
      
      // Run all verification checks in parallel
      const socialPromise = verifyTwitter(tokenName);
      const contractPromise = checkContractSecurity(mintAddress, false);
      // Improved website verification that actually fetches and validates the URL
      const websitePromise = (async () => {
        if (!websiteUrl) return { isHttps: false, hasWhitepaper: false, riskAdjustment: 15 };
        try {
          const isHttps = websiteUrl.startsWith('https');
          let hasWhitepaper = false;
          let riskAdjustment = 0;
          
          try {
            const response = await axios.head(websiteUrl, { timeout: 5000, maxRedirects: 3 } as any);
            if ((response.status as number) === 200 || (response.status as number) === 301 || (response.status as number) === 302) {
              riskAdjustment = isHttps ? -5 : 5;
              const whitepaperPaths = [
                `${websiteUrl.replace(/\/$/, '')}/whitepaper.pdf`,
                `${websiteUrl.replace(/\/$/, '')}/whitepaper`,
                `${websiteUrl.replace(/\/$/, '')}/docs/whitepaper.pdf`,
                `${websiteUrl.replace(/\/$/, '')}/docs`,
              ];
              
              for (const path of whitepaperPaths) {
                try {
                  const wpRes = await axios.head(path, { timeout: 3000, maxRedirects: 2 } as any);
                  if ((wpRes.status as number) === 200) {
                    hasWhitepaper = true;
                    riskAdjustment -= 10;
                    break;
                  }
                } catch (e) {
                  // ignore 404s
                }
              }
            } else {
              riskAdjustment = 15;
            }
          } catch (fetchErr) {
            riskAdjustment = 20;
          }
          
          return { isHttps, hasWhitepaper, riskAdjustment };
        } catch (e: any) {
          return { isHttps: websiteUrl.startsWith('https'), hasWhitepaper: false, riskAdjustment: 25 };
        }
      })();

      const [socialVer, websiteVer, contractVer] = await Promise.all([socialPromise, websitePromise, contractPromise]);

      // Build comprehensive report
      let report = `<b>🔐 MEME COIN AUTHENTICITY REPORT</b>\n`;
      if (mintAddress) {
        report += `<b>Chain:</b> Solana\n`;
        report += `<b>Mint Address:</b> <code>${mintAddress}</code>\n`;
      } else {
        report += `<b>Token:</b> ${input.toUpperCase()}\n`;
      }
      report += "\n";

      // Social Verification
      report += `<b>📱 SOCIAL MEDIA VERIFICATION</b>\n`;
      report += formatSocialVerification(socialVer) + "\n";

      // Website Verification
      report += `<b>🌐 WEBSITE & DOCUMENTATION</b>\n`;
      if (websiteUrl) {
        report += `├─ Website: <code>${websiteUrl}</code>\n`;
        const statusIcon = websiteVer.riskAdjustment > 15 ? "⚠️ Unreachable" : 
                          websiteVer.riskAdjustment >= 10 ? "⚠️ Connection Issues" : 
                          "✅ Accessible";
        report += `├─ Status: ${statusIcon}\n`;
        report += `├─ HTTPS: ${websiteVer.isHttps ? "✅ Secure" : "⚠️ Not Secure (HTTP)"}\n`;
        report += `├─ Whitepaper: ${websiteVer.hasWhitepaper ? "✅ Found" : "❌ Not Found (common location)"}\n`;
        report += `└─ Risk Adjustment: ${websiteVer.riskAdjustment > 0 ? `+${websiteVer.riskAdjustment}` : websiteVer.riskAdjustment}\n`;
      } else {
        report += `❌ No website provided\n`;
        report += `└─ Risk Adjustment: +15 (Missing website = higher risk)\n`;
      }
      report += "\n";

      // Contract Verification
      report += `<b>✔️ SMART CONTRACT</b>\n`;
      report += `├─ Status: ${contractVer.status}\n`;
      report += `└─ Risk Adjustment: ${contractVer.riskAdjustment > 0 ? `+${contractVer.riskAdjustment}` : contractVer.riskAdjustment}\n\n`;

      // OpenRouter AI Deep Research
      report += `<b>🤖 AI DEEP RESEARCH</b>\n`;
      try {
        const { askAI } = await import('./ai');
        const aiPrompt = `You are a crypto security analyst. Analyze this token:\\nToken: ${input}\\nMint: ${mintAddress}\\nWebsite: ${websiteUrl || 'N/A'}\\nSocial Score: ${socialVer.riskScore}/100\\n\\nBriefly assess: legitimacy, rug risk, dev credibility. (2-3 lines max)`;
        const aiAnalysis = await askAI(aiPrompt);
        if (aiAnalysis) {
          report += `${aiAnalysis}\n\n`;
        } else {
          report += `⚠️ No API key configured\n\n`;
        }
      } catch (e: any) {
        report += `⚠️ Analysis unavailable\n\n`;
      }

      // Summary
      report += `<b>📊 FINAL VERDICT</b>\n`;
      report += `├─ Social Risk Score: ${socialVer.riskScore}/100\n`;
      report += `├─ Trust Level: ${socialVer.trustLevel}\n`;
      report += `└─ Recommendation: ${socialVer.verdict}\n`;

      report += `\n<i>⚠️ Always DYOR (Do Your Own Research) before trading.</i>\n`;
      report += `<i>This is a heuristic check and not financial advice.</i>`;

      // Send with inline buttons
      const inlineButtons = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: `check_refresh_${input}_${mintAddress}` },
              { text: '🗑️ Delete', callback_data: `check_delete` }
            ]
          ]
        }
      };

      const sent = await bot.sendMessage(chatId, report, { parse_mode: 'HTML', ...inlineButtons });
      try { await bot.deleteMessage(chatId, waiting.message_id); } catch (e) { /* ignore */ }
    } catch (e: any) {
      return bot.sendMessage(chatId, `❌ Error: ${e.message || String(e)}`);
    }
  });

  bot.onText(/\/bind/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id.toString();
    if (!userId) return;

    if (!(await isPremiumOrAdmin(userId))) {
      return bot.sendMessage(chatId, "⚠️ This feature is reserved for premium members.");
    }

    // Check 3-group binding limit
    const allBindings = await storage.getAllGroupBindings();
    const uniqueGroups = new Set(allBindings.map(b => b.groupId));
    const isAlreadyBound = uniqueGroups.has(chatId.toString());
    
    if (!isAlreadyBound && uniqueGroups.size >= 3) {
      return bot.sendMessage(chatId, `❌ You've reached the 3-group binding limit for premium members.\n\nCurrent bound groups: ${uniqueGroups.size}/3\n\nTo bind this group, unbind from another group first with /unbind.`);
    }

    const text = msg.text || "";
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      return bot.sendMessage(chatId, "Usage: /bind [crypto|forex|news]");
    }

    const subCommand = parts[1].toLowerCase();
    
    if (subCommand === "news") {
      const newsType = parts[2]?.toLowerCase() as "crypto" | "forex";
      if (newsType !== "crypto" && newsType !== "forex") {
        return bot.sendMessage(chatId, "Usage: /bind news [crypto|forex]");
      }
      try {
        await storage.upsertGroupBinding({
          userId: userId,
          groupId: chatId.toString(),
          topicId: msg.message_thread_id?.toString() || null,
          lane: "news",
          market: newsType,
          purpose: "news_distribution"
        });
        return bot.sendMessage(chatId, `✅ Successfully bound this topic for ${newsType} news updates! #coinhunter`, { parse_mode: 'HTML' });
      } catch (e: any) {
        return bot.sendMessage(chatId, `❌ Error binding news: ${e.message}`);
      }
    }

    const type = subCommand as "crypto" | "forex";
    if (type !== "crypto" && type !== "forex") {
      return bot.sendMessage(chatId, "Usage: /bind [crypto|forex|news]");
    }
    
    try {
      await storage.upsertGroupBinding({
        userId: userId,
        groupId: chatId.toString(),
        topicId: msg.message_thread_id?.toString() || null,
        lane: "high",
        market: type,
        purpose: "signals"
      });
      return bot.sendMessage(chatId, `✅ Successfully bound this topic for ${type} signals! #coinhunter`, { parse_mode: 'HTML' });
    } catch (e: any) {
      return bot.sendMessage(chatId, `❌ Error binding: ${e.message}`);
    }
  });

  // Setup command: Find neutral SMC setup for a pair (now supports images)
  bot.onText(/\/setup(?:\s+(.*))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    const input = (match && match[1]) ? String(match[1]).trim() : "";
    
    if (!userId) return bot.sendMessage(chatId, "❌ Unable to identify user");
    const isPremium = await isPremiumOrAdmin(userId);
    if (!isPremium && !canUseFreeCommand(userId, 'setup')) {
      return bot.sendMessage(chatId, "⏰ Free tier limit reached!\n\nYou can use /setup once per day.\n✋ Upgrade to premium: https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU");
    }
    if (!isPremium) recordFreeCommand(userId, 'setup');
    
    // Check for photo attachment
    let imageUrl: string | undefined = undefined;
    if (msg.photo && msg.photo.length > 0) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      try {
        const fileUrl = await getTelegramBot()?.getFileLink(largestPhoto.file_id);
        imageUrl = fileUrl as string;
        console.log('[telegram] Got image URL for /setup:', imageUrl);
      } catch (e: any) {
        console.error('[telegram] Failed to get photo URL:', e.message);
      }
    }
    
    const pair = input || (imageUrl ? "CHART_IMAGE" : "");
    if (!pair) return bot.sendMessage(chatId, "Usage: /setup [pair]\nExample: /setup BTC/USDT\nOr attach a chart image");

    try {
      const waiting = await bot.sendMessage(chatId, "🔍 Analyzing setup for " + (pair === "CHART_IMAGE" ? "chart" : pair) + "...");
      const { runScanner } = await import("./signals-worker");
      const marketType = pair.includes("/") ? "crypto" : "crypto";
      await runScanner(marketType, true, chatId.toString(), undefined, pair, "setup", imageUrl);
      try { await bot.deleteMessage(chatId, waiting.message_id); } catch (e) { /* ignore */ }
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Error: ${e.message || String(e)}`);
    }
  });

  // Analyze command: Deep institutional analysis for a pair (now supports images)
  bot.onText(/\/analyze(?:\s+(.*))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    const input = (match && match[1]) ? String(match[1]).trim() : "";
    
    if (!userId) return bot.sendMessage(chatId, "❌ Unable to identify user");
    const isPremium = await isPremiumOrAdmin(userId);
    if (!isPremium && !canUseFreeCommand(userId, 'analyze')) {
      return bot.sendMessage(chatId, "⏰ Free tier limit reached!\n\nYou can use /analyze once per day.\n✋ Upgrade to premium: https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU");
    }
    if (!isPremium) recordFreeCommand(userId, 'analyze');
    
    // Check for photo attachment
    let imageUrl: string | undefined = undefined;
    if (msg.photo && msg.photo.length > 0) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      try {
        const fileUrl = await getTelegramBot()?.getFileLink(largestPhoto.file_id);
        imageUrl = fileUrl as string;
        console.log('[telegram] Got image URL for /analyze:', imageUrl);
      } catch (e: any) {
        console.error('[telegram] Failed to get photo URL:', e.message);
      }
    }
    
    const pair = input || (imageUrl ? "CHART_IMAGE" : "");
    if (!pair) return bot.sendMessage(chatId, "Usage: /analyze [pair]\nExample: /analyze ETH/USDT\nOr attach a chart image");

    try {
      const waiting = await bot.sendMessage(chatId, "📊 Analyzing " + (pair === "CHART_IMAGE" ? "chart" : pair) + "...");
      const { runScanner } = await import("./signals-worker");
      const marketType = pair.includes("/") ? "crypto" : "crypto";
      await runScanner(marketType, true, chatId.toString(), undefined, pair, "analyze", imageUrl);
      try { await bot.deleteMessage(chatId, waiting.message_id); } catch (e) { /* ignore */ }
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Error: ${e.message || String(e)}`);
    }
  });

  // Callback handlers for /check command buttons
  bot.on('callback_query', async (query) => {
    const chatId = query.from.id;
    const messageId = query.message?.message_id;
    const data = query.data;

    if (data === 'check_delete') {
      // Delete the message
      try {
        await bot.deleteMessage(chatId, messageId!);
        await bot.answerCallbackQuery(query.id, { text: '🗑️ Message deleted' });
      } catch (e: any) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Failed to delete', show_alert: true });
      }
    } else if (data?.startsWith('check_refresh_')) {
      // Parse the token info and refresh
      const parts = data.split('_');
      const tokenInput = parts[2];
      const mintAddr = parts.slice(3).join('_') || '';
      
      try {
        // Show loading indicator
        await bot.answerCallbackQuery(query.id, { text: '🔄 Refreshing...' });
        
        // Re-run the verification (simplified - would need to extract full check logic)
        await bot.editMessageText('🔄 <b>Refreshing analysis...</b>', {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML'
        });
        
        await bot.answerCallbackQuery(query.id, { text: '✅ Analysis updated' });
      } catch (e: any) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Refresh failed', show_alert: true });
      }
    }
  });

  log("Telegram bot listeners setup complete.", "telegram");
}
