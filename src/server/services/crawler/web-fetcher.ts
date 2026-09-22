import dns from "node:dns/promises";
import net from "node:net";

export interface FetchResult {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export interface IWebFetcher {
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
  isAllowedByRobots(targetUrl: string, options?: FetchOptions): Promise<boolean>;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_REDIRECTS = 3;
export const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

/**
 * Validates whether an IP address is private, loopback, link-local, or otherwise reserved.
 * When allowLoopback is true, loopback addresses (127.0.0.0/8, ::1) are permitted,
 * while other private ranges (10/8, 172.16/12, 192.168/16, 169.254/16, fc00::/7, fe80::/10, etc.)
 * remain strictly blocked.
 */
export function isPrivateOrReservedIp(ip: string, allowLoopback = false): boolean {
  if (!net.isIP(ip)) {
    return true; // Not a valid IP
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [b0, b1] = parts;

    // 0.0.0.0/8 (Broadcast/Current network)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (Private RFC1918)
    if (b0 === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return !allowLoopback;
    // 169.254.0.0/16 (Link-local / AWS & Cloud Metadata: 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16 (Private RFC1918)
    if (b0 === 192 && b1 === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
    // 192.0.0.0/24, 192.0.2.0/24 (Documentation/Reserved)
    if (b0 === 192 && b1 === 0) return true;
    // 224.0.0.0/4 (Multicast)
    if (b0 >= 224) return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // ::1 (Loopback)
    if (lower === "::1" || lower === "0000:0000:0000:0000:0000:0000:0000:0001") return !allowLoopback;
    // fe80::/10 (Link-local)
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    // fc00::/7 (Unique local address / private)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // :: (Unspecified)
    if (lower === "::") return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
    if (lower.includes("::ffff:")) {
      const ipv4Part = lower.split("::ffff:")[1];
      if (ipv4Part && net.isIPv4(ipv4Part)) {
        return isPrivateOrReservedIp(ipv4Part, allowLoopback);
      }
    }
    return false;
  }

  return true;
}

export interface SafeUrlOptions {
  allowLocalAddresses?: boolean;
}

/**
 * Validates a URL against strict SSRF constraints:
 * - Scheme must be http: or https:
 * - Hostname must not resolve to private, loopback, or metadata addresses
 * - In evaluator mode (allowLocalAddresses = true), localhost and 127.0.0.1/::1 are permitted,
 *   while cloud metadata and private networks remain blocked.
 */
export async function validateSafeUrl(urlStr: string, options?: SafeUrlOptions): Promise<URL> {
  const allowLocal = options?.allowLocalAddresses ?? false;

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid URL format: ${urlStr}`);
  }

  // 1. Allow only http: or https:
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Prohibited protocol '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname;

  // 2. Reject explicit localhost unless allowLocalAddresses is enabled
  const isLocalDomain =
    hostname.toLowerCase() === "localhost" ||
    hostname.toLowerCase().endsWith(".localhost") ||
    hostname.toLowerCase().endsWith(".local");

  if (isLocalDomain && !allowLocal) {
    throw new Error(`Access to local domains is prohibited: ${hostname}`);
  }

  // 3. Resolve DNS and inspect resolved IP addresses
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname, allowLocal)) {
      throw new Error(`Access to private/loopback/cloud-metadata IP is prohibited: ${hostname}`);
    }
  } else {
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        throw new Error(`DNS lookup yielded no addresses for ${hostname}`);
      }
      for (const addr of addresses) {
        if (isPrivateOrReservedIp(addr.address, allowLocal)) {
          throw new Error(`Host '${hostname}' resolved to prohibited IP: ${addr.address}`);
        }
      }
    } catch (err) {
      if ((err as Error).message.includes("prohibited")) {
        throw err;
      }
      // Allow hermetic offline testing for mock domain names in test environment
      if (
        (process.env.NODE_ENV === "test" || allowLocal) &&
        ((err as NodeJS.ErrnoException).code === "EAI_AGAIN" ||
          (err as NodeJS.ErrnoException).code === "ENOTFOUND")
      ) {
        return parsed;
      }
      throw new Error(`DNS resolution failed for '${hostname}': ${(err as Error).message}`);
    }
  }

  return parsed;
}

export interface SafeWebFetcherOptions {
  userAgent?: string;
  allowLocalAddresses?: boolean;
}

/**
 * Production Web Fetcher enforcing SSRF security, content-type checking,
 * redirect validation, byte limits, and timeouts.
 */
export class SafeWebFetcher implements IWebFetcher {
  private userAgent: string;
  private allowLocalAddresses: boolean;

  constructor(optionsOrUserAgent?: string | SafeWebFetcherOptions) {
    if (typeof optionsOrUserAgent === "string") {
      this.userAgent = optionsOrUserAgent;
      this.allowLocalAddresses = false;
    } else {
      this.userAgent =
        optionsOrUserAgent?.userAgent ||
        "AI-Interview-Prep-Kit-Crawler/1.0 (+https://example.com/bot)";
      this.allowLocalAddresses = optionsOrUserAgent?.allowLocalAddresses ?? false;
    }
  }

  async fetch(urlStr: string, options: FetchOptions = {}): Promise<FetchResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    let currentUrl = urlStr;
    let redirectCount = 0;

    while (redirectCount <= maxRedirects) {
      // Validate every redirect destination through SSRF checks
      const validUrl = await validateSafeUrl(currentUrl, {
        allowLocalAddresses: this.allowLocalAddresses,
      });

      const response = await fetch(validUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...options.headers,
        },
        redirect: "manual", // Handle redirects manually to validate destination IPs
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          throw new Error(`Received HTTP ${response.status} redirect without a Location header.`);
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error(`Exceeded maximum allowed redirects (${maxRedirects}).`);
        }

        // Resolve relative redirect locations
        currentUrl = new URL(locationHeader, validUrl).toString();
        continue;
      }

      if (!response.ok) {
        return {
          status: response.status,
          contentType: response.headers.get("content-type") || "",
          body: "",
          finalUrl: validUrl.toString(),
        };
      }

      // Validate Content-Type before reading full body
      const contentType = response.headers.get("content-type") || "";
      const isHtml =
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml+xml") ||
        contentType.includes("text/plain");

      if (!isHtml) {
        throw new Error(
          `Invalid Content-Type '${contentType}'. Only HTML and text documents are allowed.`
        );
      }

      // Read response with bounded size cap (maxBytes)
      if (!response.body) {
        return {
          status: response.status,
          contentType,
          body: "",
          finalUrl: validUrl.toString(),
        };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new Error(`Response body exceeded maximum allowed limit of ${maxBytes} bytes.`);
          }
          chunks.push(value);
        }
      }

      const fullBuffer = Buffer.concat(chunks);
      const text = fullBuffer.toString("utf-8");

      return {
        status: response.status,
        contentType,
        body: text,
        finalUrl: validUrl.toString(),
      };
    }

    throw new Error(`Exceeded maximum allowed redirects (${maxRedirects}).`);
  }

  /**
   * Checks whether the target URL is permitted by robots.txt at the origin root.
   */
  async isAllowedByRobots(targetUrlStr: string, options: FetchOptions = {}): Promise<boolean> {
    try {
      const parsed = await validateSafeUrl(targetUrlStr, {
        allowLocalAddresses: this.allowLocalAddresses,
      });
      const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

      const result = await this.fetch(robotsUrl, {
        timeoutMs: Math.min(options.timeoutMs ?? 2000, 2000),
        maxRedirects: 1,
      });

      if (result.status !== 200 || !result.body) {
        return true; // If robots.txt is missing or 404, assume crawling is allowed
      }

      const lines = result.body.split(/\r?\n/);
      let appliesToAll = false;
      const disallowedPaths: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("#")) continue;

        const userAgentMatch = line.match(/^User-agent:\s*(.+)$/i);
        if (userAgentMatch) {
          const ua = userAgentMatch[1].trim();
          appliesToAll = ua === "*";
          continue;
        }

        if (appliesToAll) {
          const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
          if (disallowMatch) {
            const path = disallowMatch[1].trim();
            if (path) disallowedPaths.push(path);
          }
        }
      }

      const pathname = parsed.pathname;
      for (const disallowed of disallowedPaths) {
        if (pathname.startsWith(disallowed)) {
          return false; // Explicitly disallowed
        }
      }

      return true;
    } catch {
      // In case of robots.txt fetch error or strict timeout, permit normal page fetch
      return true;
    }
  }
}

/**
 * Mock Web Fetcher for hermetic unit and integration testing without external networks.
 */
export class MockWebFetcher implements IWebFetcher {
  private fixtures: Map<string, { status: number; contentType: string; body: string; finalUrl?: string }>;
  private disallowedRobots: Set<string>;
  private allowLocalAddresses: boolean;

  constructor(options?: { allowLocalAddresses?: boolean }) {
    this.fixtures = new Map();
    this.disallowedRobots = new Set();
    this.allowLocalAddresses = options?.allowLocalAddresses ?? false;
  }

  setFixture(url: string, data: { status?: number; contentType?: string; body: string; finalUrl?: string }): void {
    this.fixtures.set(url, {
      status: data.status ?? 200,
      contentType: data.contentType ?? "text/html; charset=utf-8",
      body: data.body,
      finalUrl: data.finalUrl,
    });
  }

  setDisallowedRobots(pathPrefix: string): void {
    this.disallowedRobots.add(pathPrefix);
  }

  async fetch(urlStr: string, options?: FetchOptions): Promise<FetchResult> {
    // Enforce SSRF validation even in MockWebFetcher to verify security behavior
    await validateSafeUrl(urlStr, { allowLocalAddresses: this.allowLocalAddresses });

    const fixture = this.fixtures.get(urlStr);
    if (!fixture) {
      return {
        status: 404,
        contentType: "text/html",
        body: "<html><body>404 Not Found</body></html>",
        finalUrl: urlStr,
      };
    }

    const body = options?.maxBytes ? fixture.body.slice(0, options.maxBytes) : fixture.body;

    return {
      status: fixture.status,
      contentType: fixture.contentType,
      body,
      finalUrl: fixture.finalUrl || urlStr,
    };
  }

  async isAllowedByRobots(targetUrlStr: string): Promise<boolean> {
    const parsed = new URL(targetUrlStr);
    for (const prefix of this.disallowedRobots) {
      if (parsed.pathname.startsWith(prefix)) {
        return false;
      }
    }
    return true;
  }
}

let defaultWebFetcher: IWebFetcher = new SafeWebFetcher();

export function getDefaultWebFetcher(): IWebFetcher {
  return defaultWebFetcher;
}

export function setWebFetcher(fetcher: IWebFetcher): void {
  defaultWebFetcher = fetcher;
}
