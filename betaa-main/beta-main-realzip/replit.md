# Coin Hunter Bot

## Overview

Coin Hunter Bot is a Telegram-based cryptocurrency trading terminal that uses Smart Money Concepts (SMC) for market analysis on the Solana blockchain. The bot provides AI-powered trading signals, automated trade execution via Jupiter DEX, wallet management with encrypted private key storage, and multi-lane signal distribution to Telegram groups/topics. The web frontend is minimal — it simply directs users to interact with the bot on Telegram.

The project lives primarily in the `beta-main/` directory, which contains the full application. The root `package.json` contains some shared utility dependencies (zod, openai, p-limit, p-retry) but the main application code and dependencies are in `beta-main/`.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built with Vite
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui (New York style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming, plus `tailwindcss-animate` and `@tailwindcss/typography` plugins
- **Path aliases**: `@/*` maps to `client/src/*`
- **Purpose**: The frontend is minimal — it mostly tells users to interact via Telegram. The real functionality is all server-side.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules (`"type": "module"`)
- **Dev runner**: `tsx` for TypeScript execution without compilation
- **Entry point**: `server/index.ts` — starts Express server on port 5000, initializes Telegram bot, and kicks off the signal generator worker

Key server modules:
- **`server/telegram.ts`** — Telegram bot setup using `node-telegram-bot-api` with polling. Handles all user commands, wallet management, trade execution, and signal distribution. This is the primary user interface.
- **`server/signals-worker.ts`** — Automated signal generation using AI (OpenRouter/OpenAI). Monitors markets and generates SMC-based trading signals at different priority lanes (high/med/low).
- **`server/solana.ts`** — Jupiter DEX integration for Solana token swaps. Has multi-endpoint fallback with 8+ Jupiter API endpoints and quote caching.
- **`server/storage.ts`** — Database abstraction layer. Encrypts wallet private keys using AES-256-CBC with the `SESSION_SECRET` environment variable as the master key. Also uses in-memory caching for signals to reduce database load.
- **`server/ai.ts`** — OpenAI/OpenRouter client initialization with support for multiple API key sources. Used for chart analysis (image-to-pair extraction) and market analysis.
- **`server/db.ts`** — Database connection using Drizzle ORM with `@libsql/client` (SQLite).
- **`server/indicators.ts`** — Technical analysis calculations (RSI, MACD, EMA, Bollinger Bands, Fibonacci, etc.)
- **`server/price-service.ts`** — Multi-source price fetching with Binance and CryptoCompare fallback.
- **`server/social-verify.ts`** — Token social media verification and risk scoring.
- **`server/news-service.ts`** — AI-powered news summarization using batch processing.
- **`server/restore.ts`** — Supabase backup/restore (currently disabled, running local-only mode).
- **`server/supabase.ts`** — Optional Supabase client initialization.

### Replit Integration Files
The `.replit_integration_files/` directory contains Replit AI integration modules:
- **`batch/`** — Rate-limited batch processing utilities using `p-limit` and `p-retry` for OpenRouter API calls
- **`chat/`** — Chat conversation routes and storage for an AI chat feature using Replit's AI Integrations service
- **`shared/models/chat.ts`** — PostgreSQL-based schema for conversations and messages (uses `pgTable`, separate from the main SQLite schema)

**Important schema conflict**: The main app schema (`shared/schema.ts`) uses SQLite (`sqliteTable`), but it re-exports from `shared/models/chat.ts` which uses PostgreSQL (`pgTable`). This will cause issues if both are used with the same database connection. The chat integration expects a PostgreSQL database while the main app runs on SQLite.

### Data Storage
- **Primary Database**: SQLite via `@libsql/client` (file: `local.db`)
- **ORM**: Drizzle ORM with SQLite dialect
- **Schema**: `shared/schema.ts` defines all tables using `sqliteTable`
- **Optional backup**: Supabase PostgreSQL (currently disabled)
- **Drizzle configs**: Both `drizzle-sqlite.config.ts` and `drizzle-postgres.config.ts` exist, but SQLite is the active one
- **Encryption**: Wallet private keys are encrypted with AES-256-CBC using `SESSION_SECRET`

Database tables:
- `group_bindings` — Telegram group/topic bindings for signal distribution (lane + market type)
- `users` — Telegram user profiles with trading preferences (safety profile, fee tiers, MEV protection, TP/SL settings, RPC preferences)
- `user_lanes` — User-specific signal lane configurations
- `wallets` — Encrypted Solana wallet storage
- `signals` — AI-generated trading signals
- `trades` — Trade execution history
- `user_subscriptions` — Subscription management
- `user_premiums` — Premium user tracking
- `admins` — Bot admin users

### Authentication & Security
- No traditional web auth — users are identified by their Telegram ID
- Wallet private keys encrypted with AES-256-CBC using `SESSION_SECRET` (must be 32+ chars)
- `SESSION_SECRET` is critical — if changed, existing encrypted wallets become unreadable
- Bot admin permissions managed through the `admins` table

### Vite Dev Proxy
- The Vite dev server proxies `/api` requests to `http://localhost:5000` (the Express backend)

## External Dependencies

### AI Services (one required)
- **OpenRouter** (recommended) — `OPENROUTER_API_KEY` + `OPENROUTER_BASE_URL` — Used for market analysis, signal generation, chart analysis, and news summarization. Models used include `google/gemini-2.0-flash-001` and `meta-llama/llama-3.3-70b-instruct`.
- **OpenAI** (alternative) — `OPENAI_API_KEY` — Direct OpenAI API access
- **Replit AI Integrations** — `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit's built-in AI service; also `AI_INTEGRATIONS_OPENROUTER_API_KEY` + `AI_INTEGRATIONS_OPENROUTER_BASE_URL` for OpenRouter via Replit

### Telegram
- **node-telegram-bot-api** — Bot interface using long-polling. Requires `TELEGRAM_BOT_TOKEN` from @BotFather.

### Blockchain
- **Solana Web3.js** (`@solana/web3.js`) — Solana blockchain interaction
- **Jupiter DEX API** — Token swaps on Solana with 8+ fallback endpoints for reliability
- **Solana RPC** — `SOLANA_RPC_URL` (defaults to `https://api.mainnet-beta.solana.com`)

### Price Data
- **Binance API** — Primary price source (`api.binance.com`)
- **CryptoCompare API** — Fallback price source (`min-api.cryptocompare.com`)

### Database (Optional)
- **Supabase** — Optional PostgreSQL backup (currently disabled). Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`.
- **LibSQL/SQLite** — Primary local database via `@libsql/client`

### Key NPM Packages
- `drizzle-orm` + `drizzle-kit` — Database ORM and migrations
- `express` — HTTP server
- `tsx` — TypeScript execution
- `dotenv` — Environment variable loading
- `bs58` — Base58 encoding for Solana keypairs
- `axios` — HTTP client for API calls
- `p-limit` / `p-retry` — Concurrency control and retry logic for API rate limiting
- `zod` + `drizzle-zod` — Schema validation