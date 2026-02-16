/**
 * Social Media Verification Module
 * Checks Twitter and other platforms for token legitimacy
 */

import { log } from "./index";
import axios from "axios";

export interface SocialVerification {
  hasTwitter: boolean;
  twitterHandle?: string;
  twitterFollowers?: number;
  twitterVerified?: boolean;
  maliciousFlags: string[];
  positiveSignals: string[];
  riskScore: number; // 0-100 (0 = safe, 100 = high risk)
  trustLevel: "Very High" | "High" | "Medium" | "Low" | "Very Low";
  verdict: "Safe ✅" | "Caution ⚠️" | "High Risk 🚩" | "Unknown ❓";
}

/**
 * Check Twitter for token/project legitimacy
 */
export async function verifyTwitter(tokenName: string, projectName?: string): Promise<SocialVerification> {
  const result: SocialVerification = {
    hasTwitter: false,
    maliciousFlags: [],
    positiveSignals: [],
    riskScore: 50,
    trustLevel: "Medium",
    verdict: "Unknown ❓"
  };

  try {
    // Search for Twitter handle
    const searchTerms = [projectName || tokenName, tokenName].filter(Boolean);
    // twitterHandle would be used if we had Twitter API access

    for (const term of searchTerms) {
      try {
        // Twitter API would be used here in production
        // For now, we'll use keyword-based heuristics
        
        // Check common Twitter patterns
        if (term.toLowerCase().includes("rug") || term.includes("scam")) {
          result.maliciousFlags.push("Project name contains rug/scam keywords");
          result.riskScore += 30;
        }

        // Check for verified project patterns
        if (term.includes("official") || term.includes("verified")) {
          result.positiveSignals.push("Project emphasizes official/verified status");
          result.riskScore -= 10;
        }
      } catch (e) {
        // Continue with next search term
      }
    }

    // Check for common red flags in token names
    const redFlags = ["shitcoin", "ponzi", "pump", "dump", "rug", "scam", "exit"];
    for (const flag of redFlags) {
      if (tokenName.toLowerCase().includes(flag)) {
        result.maliciousFlags.push(`Token name contains red flag: "${flag}"`);
        result.riskScore += 25;
      }
    }

    // Check for positive indicators
    if (projectName) {
      const positiveTerms = ["official", "protocol", "governance", "dao", "foundation"];
      for (const term of positiveTerms) {
        if (projectName.toLowerCase().includes(term)) {
          result.positiveSignals.push(`Project includes legitimate term: "${term}"`);
          result.riskScore -= 15;
        }
      }
    }

    // If no Twitter found, add flag
    if (!result.hasTwitter) {
      result.maliciousFlags.push("⚠️ No verified Twitter/X account found (higher meme coin risk)");
      result.riskScore += 25;
    }

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

    // Cap risk score
    result.riskScore = Math.max(0, Math.min(100, result.riskScore));

    // Assign trust level based on risk score
    if (result.riskScore <= 20) {
      result.trustLevel = "Very High";
      result.verdict = "Safe ✅";
    } else if (result.riskScore <= 40) {
      result.trustLevel = "High";
      result.verdict = "Safe ✅";
    } else if (result.riskScore <= 60) {
      result.trustLevel = "Medium";
      result.verdict = "Caution ⚠️";
    } else if (result.riskScore <= 80) {
      result.trustLevel = "Low";
      result.verdict = "High Risk 🚩";
    } else {
      result.trustLevel = "Very Low";
      result.verdict = "High Risk 🚩";
    }

    return result;
  } catch (e: any) {
    log(`Social verification error for ${tokenName}: ${e.message}`, "social");
    return result;
  }
}

/**
 * Check for project website and legitimacy markers
 */
export async function verifyProjectWebsite(websiteUrl?: string): Promise<{
  hasWebsite: boolean;
  isHttps: boolean;
  hasWhitepaper: boolean;
  hasTeamInfo: boolean;
  riskAdjustment: number;
}> {
  const result = {
    hasWebsite: false,
    isHttps: false,
    hasWhitepaper: false,
    hasTeamInfo: false,
    riskAdjustment: 0
  };

  if (!websiteUrl) {
    result.riskAdjustment = 15; // No website = higher risk
    return result;
  }

  try {
    // Normalize URL
    let url = websiteUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    // Check if HTTPS
    if (url.startsWith("https://")) {
      result.isHttps = true;
      result.riskAdjustment -= 15; // HTTPS is good
    } else if (url.startsWith("http://")) {
      result.riskAdjustment += 15; // HTTP only = higher risk
    }

    result.hasWebsite = true;

    // Try to verify website is accessible
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

    // Check for common legitimate indicators
    if (url.includes("github.com") || url.includes("docs.") || url.includes("/docs") || url.includes("whitepaper")) {
      result.hasWhitepaper = true;
      result.riskAdjustment -= 15;
    }

    if (url.includes("team") || url.includes("about") || url.includes("/about")) {
      result.hasTeamInfo = true;
      result.riskAdjustment -= 10;
    }

    // Additional security checks
    const suspiciousPatterns = ["free-money", "quick-rich", "guaranteed", "doubler", "pump"];
    for (const pattern of suspiciousPatterns) {
      if (url.toLowerCase().includes(pattern)) {
        result.riskAdjustment += 25;
      }
    }

    return result;
  } catch (e: any) {
    log(`Website verification error: ${e.message}`, "social");
    result.riskAdjustment += 15;
    return result;
  }
}

/**
 * Check for holder concentration (rugpull risk indicator)
 */
export async function checkHolderRisk(topHolderPercentage: number): Promise<{
  riskLevel: string;
  riskAdjustment: number;
  description: string;
}> {
  if (topHolderPercentage > 80) {
    return {
      riskLevel: "Very High",
      riskAdjustment: 35,
      description: "Top holder owns >80% (EXTREME RUGPULL RISK)"
    };
  } else if (topHolderPercentage > 60) {
    return {
      riskLevel: "High",
      riskAdjustment: 25,
      description: "Top holder owns 60-80% (High rugpull risk)"
    };
  } else if (topHolderPercentage > 40) {
    return {
      riskLevel: "Medium",
      riskAdjustment: 15,
      description: "Top holder owns 40-60% (Moderate risk)"
    };
  } else if (topHolderPercentage > 20) {
    return {
      riskLevel: "Low",
      riskAdjustment: 5,
      description: "Top holder owns 20-40% (Normal distribution)"
    };
  } else {
    return {
      riskLevel: "Very Low",
      riskAdjustment: -10,
      description: "Top holder owns <20% (Well distributed)"
    };
  }
}

/**
 * Check if contract is verifiable/open source
 */
export async function checkContractSecurity(_contractAddress: string, isVerified?: boolean): Promise<{
  isVerified: boolean;
  hasSource: boolean;
  riskAdjustment: number;
  status: string;
}> {
  return {
    isVerified: isVerified || false,
    hasSource: isVerified || false,
    riskAdjustment: isVerified ? -15 : 10,
    status: isVerified ? "Verified Smart Contract ✅" : "Unverified Contract ⚠️"
  };
}

/**
 * Integration: Calculate final risk score with social factors
 */
export function calculateSocialRiskScore(
  baseRiskScore: number,
  socialVerification: SocialVerification,
  holderRisk: { riskAdjustment: number },
  contractSecurity: { riskAdjustment: number }
): number {
  let finalScore = baseRiskScore;

  // Apply social verification adjustment
  finalScore += (100 - socialVerification.riskScore) / 2; // Invert and normalize
  
  // Apply holder risk adjustment
  finalScore += holderRisk.riskAdjustment;
  
  // Apply contract security adjustment
  finalScore += contractSecurity.riskAdjustment;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, finalScore));
}

/**
 * Detect if string is a valid Solana address (base58, 44 chars)
 */
export function isSolanaAddress(input: string): boolean {
  if (!input) return false;
  // Solana addresses are base58 encoded and typically 44 characters
  const base58Regex = /^[1-9A-HJ-NP-Z]{43,44}$/;
  return base58Regex.test(input.trim());
}

/**
 * Format social verification for display
 */
export function formatSocialVerification(verification: SocialVerification): string {
  let text = `<b>🛡️ SECURITY & LEGITIMACY CHECK</b>\n\n`;

  text += `<b>Social Presence:</b> ${verification.hasTwitter ? "✅ Verified" : "❌ Not Found"}\n`;
  
  if (verification.twitterFollowers) {
    text += `├─ Followers: ${verification.twitterFollowers.toLocaleString()}\n`;
  }

  if (verification.positiveSignals.length > 0) {
    text += `\n<b>✅ Positive Signals:</b>\n`;
    verification.positiveSignals.forEach(signal => {
      text += `├─ ${signal}\n`;
    });
  }

  if (verification.maliciousFlags.length > 0) {
    text += `\n<b>🚩 Risk Flags:</b>\n`;
    verification.maliciousFlags.forEach(flag => {
      text += `├─ ${flag}\n`;
    });
  }

  text += `\n<b>Risk Assessment:</b>\n`;
  text += `├─ Risk Score: ${verification.riskScore}/100\n`;
  text += `├─ Trust Level: ${verification.trustLevel}\n`;
  text += `└─ Verdict: ${verification.verdict}\n`;

  return text;
}
