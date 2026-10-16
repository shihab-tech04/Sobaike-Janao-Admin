import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const ALLOWED_ORIGINS = new Set([
  "https://shihabshajib01-cell.github.io",
  "https://admin.shobaikejanao.com",
  "https://shobaikejanao.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const corsHeadersFor = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();

const attr = (tag: string, name: string) => {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
};

const metaContent = (html: string, keys: string[]) => {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = (
      attr(tag, "property") ||
      attr(tag, "name") ||
      attr(tag, "itemprop")
    ).toLowerCase();
    if (keys.includes(key)) {
      const content = attr(tag, "content");
      if (content) return content;
    }
  }
  return "";
};

const linkHref = (html: string, relName: string) => {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = attr(tag, "rel").toLowerCase().split(/\s+/);
    if (rel.includes(relName)) {
      const href = attr(tag, "href");
      if (href) return href;
    }
  }
  return "";
};

const pageTitle = (html: string) => {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]) : "";
};

const normalizedDate = (raw: string) => {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};


const isPrivateOrReservedIp = (raw: string): boolean => {
  const value = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!value) return true;

  if (value.includes(":")) {
    if (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      /^fe[89ab]/.test(value) ||
      value.startsWith("ff") ||
      value.startsWith("2001:db8:")
    ) return true;

    const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }

  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a,b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
};

const assertPublicResolvedHost = async (hostname: string): Promise<void> => {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Unsafe source hostname blocked.");
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) {
    if (isPrivateOrReservedIp(host)) throw new Error("Private or reserved source address blocked.");
    return;
  }

  const resolved = new Set<string>();
  try {
    for (const address of await Deno.resolveDns(host, "A")) resolved.add(String(address));
  } catch {}
  try {
    for (const address of await Deno.resolveDns(host, "AAAA")) resolved.add(String(address));
  } catch {}

  if (resolved.size === 0) throw new Error("Source hostname could not be resolved safely.");
  for (const address of resolved) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error("Source hostname resolves to a private or reserved address.");
    }
  }
};

async function readLimited(response: Response, limit = 768 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let html = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      break;
    }
    html += decoder.decode(value, { stream: true });
  }

  html += decoder.decode();
  return html;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response("Forbidden", { status: 403, headers: corsHeadersFor(req) });
    }
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(req, { error: "Authentication required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey =
      req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !publishableKey) {
      return json(req, { error: "Function configuration error." }, 500);
    }

    const supabase = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.slice("Bearer ".length);
    const { error: userError } = await supabase.auth.getUser(token);
    if (userError) return json(req, { error: "Invalid session." }, 401);

    const body = await req.json().catch(() => ({}));
    const input = String(body?.url ?? "").trim();

    let current = new URL(input);
    if (
      current.protocol !== "https:" ||
      current.username ||
      current.password ||
      current.port
    ) {
      return json(req, { error: "Only standard HTTPS article URLs are allowed." }, 400);
    }

    const checkDomain = async (url: string) => {
      const { data, error } = await supabase.rpc("admin_check_news_source_domain", {
        p_url: url,
      });
      if (error) throw new Error(error.message);
      return data as {
        approved?: boolean;
        hostname?: string;
        publisherName?: string | null;
      };
    };

    await assertPublicResolvedHost(current.hostname);
    let domain = await checkDomain(current.toString());
    if (!domain?.approved) {
      return json(req, 
        {
          error: "SOURCE_DOMAIN_NOT_APPROVED",
          hostname: domain?.hostname ?? current.hostname.toLowerCase(),
        },
        403
      );
    }

    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await fetch(current.toString(), {
        redirect: "manual",
        headers: {
          "User-Agent":
            "SobaiKeJanao-NewsIntake/1.0 (+https://shobaikejanao.com/)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });
      await assertPublicResolvedHost(current.hostname);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === 3) {
          return json(req, { error: "Source redirect could not be resolved." }, 422);
        }

        const next = new URL(location, current);
        if (
          next.protocol !== "https:" ||
          next.username ||
          next.password ||
          next.port
        ) {
          return json(req, { error: "Unsafe source redirect blocked." }, 422);
        }

        await assertPublicResolvedHost(next.hostname);
        const nextDomain = await checkDomain(next.toString());
        if (!nextDomain?.approved) {
          return json(req, 
            {
              error: "Redirected source domain is not approved.",
              hostname: nextDomain?.hostname ?? next.hostname,
            },
            403
          );
        }

        current = next;
        domain = nextDomain;
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return json(req, { error: `Source returned HTTP ${response?.status ?? 0}.` }, 422);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return json(req, { error: "The source URL is not an HTML article page." }, 422);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 2 * 1024 * 1024) {
      return json(req, { error: "Article page is too large to inspect safely." }, 422);
    }

    const html = await readLimited(response);
    if (!html) {
      return json(req, { error: "No readable article metadata was returned." }, 422);
    }

    const canonicalRaw = linkHref(html, "canonical") || current.toString();
    let canonicalUrl = new URL(canonicalRaw, current).toString();

    try {
      const canonical = new URL(canonicalUrl);
      if (
        canonical.protocol !== "https:" ||
        canonical.username ||
        canonical.password ||
        canonical.port
      ) {
        canonicalUrl = current.toString();
      } else {
        const canonicalDomain = await checkDomain(canonicalUrl);
        if (!canonicalDomain?.approved) canonicalUrl = current.toString();
        else domain = canonicalDomain;
      }
    } catch {
      canonicalUrl = current.toString();
    }

    const sourceTitle =
      metaContent(html, ["og:title", "twitter:title", "headline"]) ||
      pageTitle(html);
    const publisherName =
      metaContent(html, ["og:site_name", "application-name"]) ||
      domain?.publisherName ||
      current.hostname;
    const description = metaContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]).slice(0, 500);
    const sourcePublishedDate = normalizedDate(
      metaContent(html, [
        "article:published_time",
        "datepublished",
        "date",
        "pubdate",
        "publishdate",
      ])
    );

    return json(req, {
      sourceType: "news",
      publisherName: String(publisherName).slice(0, 160),
      sourceTitle: String(sourceTitle).slice(0, 300),
      canonicalUrl,
      sourcePublishedDate,
      descriptionPreview: description,
      hostname: domain?.hostname ?? current.hostname.toLowerCase(),
      approved: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to inspect article metadata.";
    return json(req, { error: message }, 400);
  }
});
