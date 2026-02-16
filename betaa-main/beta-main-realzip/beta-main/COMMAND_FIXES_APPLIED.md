# Command Fixes Applied - Session 2

## Summary
Fixed critical issues with image support in `/ai`, `/ask`, `/setup`, `/analyze` commands and improved `/check` token verification with real website and social media checks.

---

## 1. Fixed Image Support in `/ai` and `/ask` Commands ✅

**File**: [server/telegram.ts](server/telegram.ts#L240)
**Issue**: Regex pattern `/\/(?:ai|ask)\s+(.*)` required text after command - failed silently when only image was sent
**Root Cause**: `\s+` requires one or more spaces, so sending just image without text wouldn't trigger the handler

**Fix Applied**:
```typescript
// BEFORE: Requires text after command
bot.onText(/\/(?:ai|ask)\s+(.*)/i, async (msg, match) => {

// AFTER: Optional text, works with just image
bot.onText(/\/(?:ai|ask)(?:\s+(.*))?/i, async (msg, match) => {
```

**Added Logging**:
```typescript
console.log('[telegram] Got image URL for /ai:', imageUrl);
```

---

## 2. Fixed Image Support in `/setup` Command ✅

**File**: [server/telegram.ts](server/telegram.ts#L529)
**Issue**: Same regex issue - couldn't handle images without text
**Root Cause**: Pattern didn't allow for optional text

**Fix Applied**:
```typescript
// BEFORE: Requires text or will fail
bot.onText(/\/setup\s*(.*)/i, async (msg, match) => {

// AFTER: Optional text, works with just image
bot.onText(/\/setup(?:\s+(.*))?/i, async (msg, match) => {
```

**Added Logging**:
```typescript
console.log('[telegram] Got image URL for /setup:', imageUrl);
```

---

## 3. Fixed Image Support in `/analyze` Command ✅

**File**: [server/telegram.ts](server/telegram.ts#L570)
**Issue**: Same pattern issue as `/setup`
**Fix Applied**: Changed regex to `/\/analyze(?:\s+(.*))?/i`

**Added Logging**:
```typescript
console.log('[telegram] Got image URL for /analyze:', imageUrl);
```

---

## 4. Improved Social Media Verification (`/check` command) ✅

**File**: [server/social-verify.ts](server/social-verify.ts#L23)

### Improvement #1: Changed Malicious Flag Messaging
- Old: Generic flags like "No verified Twitter account found"
- New: Descriptive with emojis: "⚠️ No verified Twitter/X account found (higher meme coin risk)"

### Improvement #2: Added Token Name Length Validation
```typescript
// Check token name for legitimacy length
if (tokenName.length < 3) {
  result.maliciousFlags.push("⚠️ Very short token name (potential unverified token)");
  result.riskScore += 10;
} else if (tokenName.length > 20) {
  result.maliciousFlags.push("⚠️ Unusually long token name");
  result.riskScore += 5;
} else {
  result.positiveSignals.push("✅ Token name length is typical");
  result.riskScore -= 5;
}
```

---

## 5. Enhanced Website Verification ✅

**File**: [server/social-verify.ts](server/social-verify.ts#L128)

### New Features:

**✅ Actual Website Accessibility Check**
```typescript
try {
  const response = await axios.head(url, { timeout: 5000, maxRedirects: 3 });
  if (response.status === 200 || response.status === 301 || response.status === 302) {
    result.riskAdjustment -= 10; // Website is accessible
  } else {
    result.riskAdjustment += 10; // Website returned non-200 status
  }
} catch (fetchErr) {
  result.riskAdjustment += 20; // Website not accessible
  log(`Website not accessible: ${url}`, "social");
}
```

**✅ Whitepaper & Documentation Detection**
```typescript
if (url.includes("github.com") || url.includes("docs.") || url.includes("/docs") || url.includes("whitepaper")) {
  result.hasWhitepaper = true;
  result.riskAdjustment -= 15;
}
```

**✅ Team Information Detection**
```typescript
if (url.includes("team") || url.includes("about") || url.includes("/about")) {
  result.hasTeamInfo = true;
  result.riskAdjustment -= 10;
}
```

**✅ Suspicious Pattern Detection**
```typescript
const suspiciousPatterns = ["free-money", "quick-rich", "guaranteed", "doubler", "pump"];
for (const pattern of suspiciousPatterns) {
  if (url.toLowerCase().includes(pattern)) {
    result.riskAdjustment += 25;
  }
}
```

**✅ URL Normalization**
```typescript
let url = websiteUrl.trim();
if (!url.startsWith("http://") && !url.startsWith("https://")) {
  url = "https://" + url;
}
```

---

## 6. Added axios Import to social-verify.ts ✅

**File**: [server/social-verify.ts](server/social-verify.ts#L6)
```typescript
import axios from "axios";
```
*Used for actual HTTP requests to verify websites and social media*

---

## Testing Checklist

### Image Support Commands

**`/ai` with Image**:
- Send image with caption: `/ai analyze this chart`
- Send image only: `/ai` (with image attachment)
- Expected: Bot analyzes image with Gemini vision

**`/ask` with Image**:
- Same as `/ai` (commands are aliases)
- Expected: Same results as `/ai`

**`/setup` with Image**:
- Send image with caption: `/setup` (with image attached)
- Send image with text: `/setup BTC chart analysis` (with image)
- Expected: Bot analyzes chart or pair with SETUP_PROMPT

**`/setup` with Pair**:
- Send: `/setup BTC/USDT`
- Send: `/setup ETH`
- Expected: Bot runs setup analysis on pair

**`/analyze` with Image**:
- Send image: `/analyze` (with image attached)
- Send image with context: `/analyze analyze this EUR/USD chart` (with image)
- Expected: Bot runs deep analysis with ANALYZE_PROMPT

**`/analyze` with Pair**:
- Send: `/analyze BTC/USDT`
- Send: `/analyze EUR/USD`
- Expected: Bot runs institutional analysis

### Token Verification (`/check`)

**`/check` with Mint Address**:
```
/check EPjFWaLb3bSsKUje29MC7pNqrescVeKYvwiMT4oCHja https://example.com
```
- Expected: 
  - ✅ Website accessibility check
  - ✅ HTTPS verification
  - ✅ Whitepaper detection
  - ✅ Team info detection
  - ✅ Suspicious pattern detection
  - ✅ Social media verification
  - ✅ AI deep research

**`/check` with Token Name**:
```
/check DOGE https://dogecoin.com
```
- Expected:
  - ✅ Name length validation  
  - ✅ Red flag detection (rug, scam, etc.)
  - ✅ Legitimate term detection (protocol, governance, etc.)

---

## Technical Details

### Image URL Extraction
All image commands now properly extract the file URL:
```typescript
if (msg.photo && msg.photo.length > 0) {
  const largestPhoto = msg.photo[msg.photo.length - 1];
  try {
    const fileUrl = await getTelegramBot()?.getFileLink(largestPhoto.file_id);
    imageUrl = fileUrl as string;
    console.log('[telegram] Got image URL for /command:', imageUrl);
  } catch (e: any) {
    console.error('[telegram] Failed to get photo URL:', e.message);
  }
}
```

### Image Passing Through Function Chain
- `/setup` → `runScanner(marketType, true, chatId, undefined, pair, "setup", imageUrl)`
- `/analyze` → `runScanner(marketType, true, chatId, undefined, pair, "analyze", imageUrl)`
- `/ai` → `askAI(query, imageUrl)` → OpenRouter vision model

### Website Verification Flow
1. Normalize URL (add https:// if missing)
2. Check HTTPS status (+/- score)
3. Verify accessibility with HEAD request
4. Detect documentation/whitepaper
5. Detect team information
6. Check for suspicious patterns
7. Return risk adjustment score

---

## Files Modified

1. **server/telegram.ts**
   - Fixed regex patterns for `/ai`, `/ask`, `/setup`, `/analyze`
   - Added image URL logging for debugging

2. **server/social-verify.ts**
   - Added axios import
   - Improved social media verification messages
   - Added token name length validation
   - Enhanced website verification with actual HTTP checks
   - Added whitepaper, team info, and suspicious pattern detection

---

## Compilation Status

✅ **No TypeScript Errors**
✅ **All Imports Resolved**
✅ **Ready for Testing**

---

## Next Steps

1. Start bot: `npm run dev`
2. Test each command with images
3. Test `/check` with various tokens and websites
4. Monitor console logs for image URL extraction
5. Verify risk scores are accurate

---

**Status**: ✅ Complete and Ready for Testing
**Last Updated**: Current Session
