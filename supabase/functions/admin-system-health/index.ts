import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const ALLOWED_ORIGINS = new Set([
  "https://admin.shobaikejanao.com",
  "https://shihabshajib01-cell.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

const PUBLIC_SITE_URL = "https://shobaikejanao.com/";
const ADMIN_SITE_URL = "https://admin.shobaikejanao.com/";
const COLLECTOR_VERSION = "2";

type HealthStatus = "healthy" | "degraded" | "critical" | "unknown";

type ProbeResult = {
  status: HealthStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: string;
};

type PromSample = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

const operationProbe = async (
  operation: () => Promise<{ error?: unknown } | void>
): Promise<ProbeResult> => {
  const started = performance.now();
  try {
    const result = await operation();
    const hasError =
      Boolean(result) &&
      typeof result === "object" &&
      "error" in result &&
      Boolean((result as { error?: unknown }).error);

    return {
      status: hasError ? "critical" : "healthy",
      httpStatus: hasError ? null : 200,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "critical",
      httpStatus: null,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      checkedAt: new Date().toISOString(),
    };
  }
};

const corsHeadersFor = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-system-health-scheduler",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const readNamedKey = (envName: string, legacyEnvName: string): string => {
  const raw = Deno.env.get(envName) || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.default === "string" && parsed.default) {
        return parsed.default;
      }
    } catch {
      // Fall back to the legacy key variable below.
    }
  }

  return Deno.env.get(legacyEnvName) || "";
};

const probeUrl = async (url: string): Promise<ProbeResult> => {
  const started = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "Sobaike-Janao-System-Health/1.0",
      },
    }).finally(() => clearTimeout(timeout));

    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    const status: HealthStatus =
      response.status >= 200 && response.status < 400 ? "healthy" : "critical";

    try {
      await response.body?.cancel();
    } catch {
      // Response status is enough for the availability probe.
    }

    return {
      status,
      httpStatus: response.status,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "critical",
      httpStatus: null,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      checkedAt: new Date().toISOString(),
    };
  }
};

const parseLabels = (raw: string): Record<string, string> => {
  const labels: Record<string, string> = {};
  const pairPattern = /([a-zA-Z_:][a-zA-Z0-9_:]*)="((?:\\.|[^"])*)"/g;
  for (const match of raw.matchAll(pairPattern)) {
    labels[match[1]] = match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  return labels;
};

const parsePrometheus = (raw: string): PromSample[] => {
  const samples: PromSample[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|NaN|[+-]Inf)(?:\s+\d+)?$/
    );
    if (!match) continue;

    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;

    samples.push({
      name: match[1],
      labels: parseLabels(match[2] || ""),
      value,
    });
  }

  return samples;
};

const firstMetricValue = (
  samples: PromSample[],
  name: string,
  predicate?: (sample: PromSample) => boolean
): number | null => {
  const sample = samples.find(
    (candidate) => candidate.name === name && (!predicate || predicate(candidate))
  );
  return sample ? sample.value : null;
};

const scrapePrometheus = async (
  supabaseUrl: string,
  secretKey: string
): Promise<{
  status: HealthStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: string;
  seriesCount: number;
  metricNameCount: number;
  databaseSizeMb: number | null;
  ramUsedPercent: number | null;
  diskUsedPercent: number | null;
  load1: number | null;
}> => {
  const started = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const basicAuth = btoa(`service_role:${secretKey}`);

    const response = await fetch(
      `${supabaseUrl}/customer/v1/privileged/metrics`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "text/plain",
          "User-Agent": "Sobaike-Janao-System-Health/1.0",
        },
      }
    ).finally(() => clearTimeout(timeout));

    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // Ignore response cleanup failures.
      }
      return {
        status: "degraded",
        httpStatus: response.status,
        latencyMs,
        checkedAt: new Date().toISOString(),
        seriesCount: 0,
        metricNameCount: 0,
        databaseSizeMb: null,
        ramUsedPercent: null,
        diskUsedPercent: null,
        load1: null,
      };
    }

    const raw = await response.text();
    const samples = parsePrometheus(raw);
    const metricNames = new Set(samples.map((sample) => sample.name));

    const memTotal = firstMetricValue(samples, "node_memory_MemTotal_bytes");
    const memAvailable = firstMetricValue(
      samples,
      "node_memory_MemAvailable_bytes"
    );
    const fsSize = firstMetricValue(
      samples,
      "node_filesystem_size_bytes",
      (sample) => sample.labels.mountpoint === "/" && sample.labels.fstype !== "rootfs"
    );
    const fsAvailable = firstMetricValue(
      samples,
      "node_filesystem_avail_bytes",
      (sample) => sample.labels.mountpoint === "/" && sample.labels.fstype !== "rootfs"
    );
    const databaseSizeMb = firstMetricValue(samples, "pg_database_size_mb");
    const load1 = firstMetricValue(samples, "node_load1");

    const ramUsedPercent =
      memTotal && memAvailable !== null && memTotal > 0
        ? Math.max(0, Math.min(100, ((memTotal - memAvailable) / memTotal) * 100))
        : null;
    const diskUsedPercent =
      fsSize && fsAvailable !== null && fsSize > 0
        ? Math.max(0, Math.min(100, ((fsSize - fsAvailable) / fsSize) * 100))
        : null;

    let status: HealthStatus = "healthy";
    if (
      (ramUsedPercent !== null && ramUsedPercent >= 90) ||
      (diskUsedPercent !== null && diskUsedPercent >= 90)
    ) {
      status = "critical";
    } else if (
      (ramUsedPercent !== null && ramUsedPercent >= 80) ||
      (diskUsedPercent !== null && diskUsedPercent >= 80)
    ) {
      status = "degraded";
    }

    return {
      status,
      httpStatus: response.status,
      latencyMs,
      checkedAt: new Date().toISOString(),
      seriesCount: samples.length,
      metricNameCount: metricNames.size,
      databaseSizeMb,
      ramUsedPercent:
        ramUsedPercent === null ? null : Number(ramUsedPercent.toFixed(1)),
      diskUsedPercent:
        diskUsedPercent === null ? null : Number(diskUsedPercent.toFixed(1)),
      load1: load1 === null ? null : Number(load1.toFixed(2)),
    };
  } catch {
    return {
      status: "degraded",
      httpStatus: null,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      checkedAt: new Date().toISOString(),
      seriesCount: 0,
      metricNameCount: 0,
      databaseSizeMb: null,
      ramUsedPercent: null,
      diskUsedPercent: null,
      load1: null,
    };
  }
};

const combineStatus = (...statuses: Array<HealthStatus | undefined>): HealthStatus => {
  const defined = statuses.filter(
    (status): status is HealthStatus => Boolean(status)
  );
  if (defined.length === 0) return "unknown";
  if (defined.some((status) => status === "critical")) return "critical";
  if (defined.some((status) => status === "degraded")) return "degraded";
  if (defined.some((status) => status === "unknown")) return "unknown";
  return "healthy";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = readNamedKey(
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY"
  );
  const secretKey = readNamedKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY"
  );

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json(req, { error: "Monitoring configuration is incomplete." }, 500);
  }

  const serviceClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const schedulerToken = req.headers.get("x-system-health-scheduler") || "";
  const requestBody = await req.json().catch(() => ({}));
  const requestedMode = String(requestBody?.mode || "read");
  const scheduledRequest = schedulerToken.length >= 32;

  let databaseHealth: Record<string, unknown> | null = null;

  if (scheduledRequest) {
    const { data: tokenValid, error: tokenError } = await serviceClient.rpc(
      "service_verify_system_health_token",
      { p_token: schedulerToken }
    );

    if (tokenError || tokenValid !== true) {
      return json(req, { error: "Monitoring scheduler authorization failed." }, 403);
    }

    const { data: serviceDatabaseHealth, error: databaseError } =
      await serviceClient.rpc("service_get_database_health");

    databaseHealth = {
      database: databaseError || !serviceDatabaseHealth
        ? { status: "degraded" }
        : serviceDatabaseHealth,
    };
  } else {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(req, { error: "Authentication required." }, 401);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.slice("Bearer ".length);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return json(req, { error: "Invalid session." }, 401);
    }

    const [{ data: isAdmin, error: adminError }, { data: canAudit, error: permissionError }] =
      await Promise.all([
        userClient.rpc("is_active_admin"),
        userClient.rpc("has_permission", { p_permission_id: "system_health.view" }),
      ]);

    if (adminError || permissionError || isAdmin !== true || canAudit !== true) {
      return json(req, { error: "System health access denied." }, 403);
    }

    const { data, error } = await userClient.rpc("admin_get_system_health");
    if (error || !data) {
      return json(
        req,
        { error: error?.message || "System health data could not be loaded." },
        503
      );
    }

    databaseHealth = data as Record<string, unknown>;
  }

  const [publicSite, adminSite, prometheus, publicApi, authService, storageService] =
    await Promise.all([
      probeUrl(PUBLIC_SITE_URL),
      probeUrl(ADMIN_SITE_URL),
      scrapePrometheus(supabaseUrl, secretKey),
      operationProbe(async () => {
        const { error } = await publicClient.rpc("get_platform_sync_contract_version");
        return { error };
      }),
      operationProbe(async () => {
        const { error } = await serviceClient.auth.admin.listUsers({
          page: 1,
          perPage: 1,
        });
        return { error };
      }),
      operationProbe(async () => {
        const { error } = await serviceClient.storage.listBuckets();
        return { error };
      }),
    ]);

  const edgeRuntime: ProbeResult = {
    status: "healthy",
    httpStatus: 200,
    latencyMs: 0,
    checkedAt: new Date().toISOString(),
  };

  const databaseStatus =
    databaseHealth &&
    typeof databaseHealth.database === "object" &&
    databaseHealth.database !== null &&
    "status" in databaseHealth.database
      ? String((databaseHealth.database as Record<string, unknown>).status) as HealthStatus
      : undefined;

  const overallStatus = combineStatus(
    publicSite.status,
    adminSite.status,
    prometheus.status,
    databaseStatus,
    publicApi.status,
    authService.status,
    storageService.status,
    edgeRuntime.status
  );

  const infrastructure = {
    publicApi,
    auth: authService,
    storage: storageService,
    edgeRuntime,
    databaseStatus: databaseStatus || "unknown",
  };

  const live = {
    overallStatus,
    publicSite,
    adminSite,
    prometheus,
    infrastructure,
    collectedAt: new Date().toISOString(),
    collectorVersion: COLLECTOR_VERSION,
  };

  if (scheduledRequest || requestedMode === "snapshot") {
    const { error: insertError } = await serviceClient.rpc(
      "service_record_system_health_snapshot",
      {
        p_overall_status: overallStatus,
        p_public_site: publicSite,
        p_admin_site: adminSite,
        p_prometheus: prometheus,
        p_infrastructure: {
          projectRef: "ahiaymyqfmyyrjkwgvhi",
          metricsSource: "supabase-prometheus-compatible-metrics-api",
          ...infrastructure,
        },
        p_collector_version: COLLECTOR_VERSION,
      }
    );

    if (insertError) {
      console.error("System health snapshot persistence failed.", insertError);
      return json(req, { error: "Monitoring snapshot could not be persisted." }, 503);
    }
  }

  if (scheduledRequest) {
    return json(req, { ok: true, live }, 200);
  }

  return json(req, {
    ...(databaseHealth || {}),
    live,
  });
});
