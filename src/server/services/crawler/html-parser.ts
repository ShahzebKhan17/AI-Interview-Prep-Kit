export interface DiscoveredLink {
  url: string;
  anchorText: string;
  score: number;
}

export interface ExtractedPageContent {
  url: string;
  title: string;
  description: string;
  cleanedText: string;
  links: DiscoveredLink[];
}

// Tracking/noise query parameters to discard during normalization
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

// Binary / media extensions to discard
const NOISE_EXTENSIONS = /\.(pdf|zip|tar|gz|exe|dmg|pkg|png|jpe?g|gif|webp|svg|ico|mp4|mp3|avi|mov)$/i;

/**
 * Normalizes a URL:
 * - Resolves against optional baseUrl if relative
 * - Removes hash fragment
 * - Strips tracking query parameters
 * - Standardizes trailing slashes (preserves root `/`)
 */
export function normalizeUrl(urlStr: string, baseUrl?: string): string {
  try {
    const parsed = baseUrl ? new URL(urlStr, baseUrl) : new URL(urlStr);
    parsed.hash = "";

    // Delete tracking params
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }

    let normalized = parsed.toString();
    // Normalize trailing slash for non-root paths
    if (parsed.pathname !== "/" && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return urlStr;
  }
}

/**
 * Evaluates whether a target URL shares the exact same origin as the seed URL.
 */
export function isSameOrigin(targetUrl: string, seedUrl: string): boolean {
  try {
    const t = new URL(targetUrl);
    const s = new URL(seedUrl);
    return t.origin.toLowerCase() === s.origin.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Deterministically scores a discovered link based on its anchor text and path tokens.
 */
export function scoreLink(urlStr: string, anchorText: string): number {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname.toLowerCase();
    const anchor = anchorText.toLowerCase();
    const combined = `${path} ${anchor}`;

    // 1. Immediate Disqualifiers / Noise Penalties
    if (NOISE_EXTENSIONS.test(path)) {
      return -100;
    }

    const noiseKeywords = [
      "privacy",
      "terms",
      "legal",
      "cookie",
      "login",
      "signin",
      "sign-in",
      "signup",
      "sign-up",
      "register",
      "cart",
      "checkout",
      "pricing",
      "press-release",
      "investor-relations",
      "download",
    ];

    for (const noise of noiseKeywords) {
      if (combined.includes(noise)) {
        return -100;
      }
    }

    let score = 0;

    // 2. High Value: Careers / Hiring / Jobs
    const careerKeywords = [
      "career",
      "careers",
      "job",
      "jobs",
      "join-us",
      "working-at",
      "hiring",
      "openings",
      "positions",
      "work-with-us",
    ];
    if (careerKeywords.some((kw) => combined.includes(kw))) {
      score += 40;
    }

    // 3. High Value: About / Company Overview / Mission
    const aboutKeywords = [
      "about",
      "about-us",
      "company",
      "mission",
      "our-story",
      "who-we-are",
      "overview",
    ];
    if (aboutKeywords.some((kw) => combined.includes(kw))) {
      score += 30;
    }

    // 4. Products / Platform / Solutions / Technology
    const productKeywords = [
      "product",
      "products",
      "platform",
      "solutions",
      "features",
      "technology",
      "developers",
      "how-it-works",
    ];
    if (productKeywords.some((kw) => combined.includes(kw))) {
      score += 25;
    }

    // 5. Engineering / Team / Culture
    const engineeringKeywords = [
      "engineering",
      "tech-blog",
      "team",
      "culture",
      "values",
      "leadership",
    ];
    if (engineeringKeywords.some((kw) => combined.includes(kw))) {
      score += 20;
    }

    // Shorter path penalty / Root path deduction
    if (parsed.pathname === "/" || parsed.pathname === "") {
      score -= 5;
    }

    return score;
  } catch {
    return -100;
  }
}

/**
 * Extracts links from HTML, resolves relatives, normalizes them, scores them,
 * and discards off-origin or noise links.
 */
export function extractAndRankLinks(html: string, baseUrl: string): DiscoveredLink[] {
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const discovered: DiscoveredLink[] = [];
  const seenUrls = new Set<string>();

  // Add the base seed URL to seen to avoid re-fetching root
  seenUrls.add(normalizeUrl(baseUrl));

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const rawAnchor = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

    // Skip empty, javascript, mailto, tel links
    if (
      !rawHref ||
      rawHref.startsWith("#") ||
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:")
    ) {
      continue;
    }

    try {
      // Resolve relative URL against page base
      const resolved = new URL(rawHref, baseUrl);

      // Enforce protocol whitelist
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        continue;
      }

      // Enforce same-origin policy
      if (!isSameOrigin(resolved.toString(), baseUrl)) {
        continue;
      }

      const normalized = normalizeUrl(resolved.toString());
      if (seenUrls.has(normalized)) {
        continue;
      }
      seenUrls.add(normalized);

      const score = scoreLink(normalized, rawAnchor);
      if (score > 0) {
        discovered.push({
          url: normalized,
          anchorText: rawAnchor,
          score,
        });
      }
    } catch {
      // Ignore invalid URL
      continue;
    }
  }

  // Sort descending by score
  return discovered.sort((a, b) => b.score - a.score);
}

/**
 * Decodes standard HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Extracts clean, readable text from HTML content:
 * - Strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<iframe>`, `<noscript>`, `<svg>`
 * - Extracts title and meta description
 * - Cleans and normalizes whitespace
 */
export function parseAndCleanHtml(html: string, pageUrl: string): ExtractedPageContent {
  // 1. Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim()) : "";

  // 2. Extract meta description
  const metaDescMatch = html.match(
    /<meta\s+(?:[^>]*?\s+)?(?:name|property)=["'](?:description|og:description)["']\s+(?:[^>]*?\s+)?content=["']([^"']*)["']/i
  );
  const description = metaDescMatch
    ? decodeHtmlEntities(metaDescMatch[1].replace(/\s+/g, " ").trim())
    : "";

  // 3. Extract candidate links prior to stripping tags
  const links = extractAndRankLinks(html, pageUrl);

  // 4. Strip boilerplate tags
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");

  // Replace block elements with linebreaks to preserve paragraph structure
  cleaned = cleaned
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  cleaned = decodeHtmlEntities(cleaned);

  // Normalize excessive whitespace and consecutive blank lines
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length > 0);

  // Cap cleaned body length to 15,000 characters to prevent prompt bloat
  const cleanedText = lines.join("\n").slice(0, 15000);

  return {
    url: pageUrl,
    title: title || description.slice(0, 80) || new URL(pageUrl).hostname,
    description,
    cleanedText,
    links,
  };
}
