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
import { verifyTwitter, formatSocialVerification, checkHolderRisk, checkContractSecurity, calculateSocialRiskScore } from "./social-verify";

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

  const OWNER_ID = '6491714705';
  const PREMIUM_GROUP_ID = process.env.PREMIUM_GROUP_ID || '';

  async function isInPremiumGroup(userId: string): Promise<boolean> {
    if (!PREMIUM_GROUP_ID) return false;
    try {
      const member = await bot.getChatMember(PREMIUM_GROUP_ID, userId);
      return member && (member.status === 'member' || member.status === 'administrator' || member.status === 'creator');
    } catch (e: any) {
      return false;
    }
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
    bot.sendMessage(chatId, "🚀 <b>Welcome to Coin Hunter Bot!</b>\n\nYour institutional-grade trading companion for Solana and Forex.", { parse_mode: 'HTML' });
  });

  bot.onText(/\/bind/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id.toString();
    if (!userId) return;

    if (!(await isPremiumOrAdmin(userId))) {
      return bot.sendMessage(chatId, "⚠️ This feature is reserved for premium members.");
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
        await storage.createGroupBinding({
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
      await storage.createGroupBinding({
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

  log("Telegram bot listeners setup complete.", "telegram");
}
