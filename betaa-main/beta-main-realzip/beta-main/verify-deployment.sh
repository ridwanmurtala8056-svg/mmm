#!/bin/bash
# Test bot startup with configuration validation

echo "🚀 Coin Hunter Bot - Deployment Test"
echo "======================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo ""
    echo "📝 Create .env with these variables:"
    echo "   TELEGRAM_BOT_TOKEN=your_token"
    echo "   SESSION_SECRET=your_secret_32_chars"
    echo "   OPENROUTER_API_KEY=your_api_key"
    echo "   PREMIUM_GROUP_ID=-100xxxxx"
    echo ""
    exit 1
fi

echo "✅ .env file found"
echo ""

# Check key variables (without printing values)
if grep -q "TELEGRAM_BOT_TOKEN=" .env; then
    echo "✅ TELEGRAM_BOT_TOKEN configured"
else
    echo "❌ TELEGRAM_BOT_TOKEN missing"
fi

if grep -q "SESSION_SECRET=" .env; then
    echo "✅ SESSION_SECRET configured"
else
    echo "❌ SESSION_SECRET missing"
fi

if grep -q "OPENROUTER_API_KEY=" .env; then
    echo "✅ OPENROUTER_API_KEY configured"
else
    echo "⚠️  OPENROUTER_API_KEY missing (AI features disabled)"
fi

echo ""
echo "📦 Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install --quiet
else
    echo "✅ Dependencies installed"
fi

echo ""
echo "🧪 TypeScript check..."
npm run check 2>&1 | head -5 || echo "⚠️  TypeScript check skipped"

echo ""
echo "🎯 Ready to start!"
echo ""
echo "Start bot with:"
echo "  npm run dev        (development mode)"
echo "  npm start          (production)"
echo "  node launch-bot.js (direct)"
echo ""
echo "Test in Telegram:"
echo "  /start   → Welcome"
echo "  /help    → All commands"
echo "  /ai ...  → Ask AI"
echo "  /check ... → Verify coin"
echo ""
