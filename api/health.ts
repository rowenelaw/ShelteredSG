import type { IncomingMessage, ServerResponse } from 'node:http';

const LTA_ENDPOINT =
  'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival';
const ONEMAP_TOKEN_URL = 'https://www.onemap.gov.sg/api/auth/post/getToken';
const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';

interface ServerlessRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessResponse extends ServerResponse {
  status?: (code: number) => ServerlessResponse;
  json?: (body: unknown) => void;
}

type ServiceStatus = 'healthy' | 'configured' | 'unconfigured' | 'degraded';

function sendJson(res: ServerlessResponse, statusCode: number, payload: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const nextRes = res.status(statusCode);
    if (typeof nextRes.json === 'function') {
      nextRes.json(payload);
      return;
    }
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function readQueryParam(req: ServerlessRequest, key: string): string {
  const fromQuery = req.query?.[key];
  if (typeof fromQuery === 'string') return fromQuery.trim();
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string') {
    return fromQuery[0].trim();
  }
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      return (parsed.searchParams.get(key) ?? '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

async function checkOneMapHealth(liveProbe: boolean): Promise<{
  configured: boolean;
  authMode: 'email_password' | 'static_token' | 'none';
  status: ServiceStatus;
  upstreamReachable?: boolean;
  httpStatus?: number;
}> {
  const staticToken = process.env.ONEMAP_API_TOKEN?.trim();
  const email = process.env.ONEMAP_EMAIL?.trim();
  const password = process.env.ONEMAP_PASSWORD;

  const hasEmailPassword = Boolean(email && password);
  const configured = Boolean(staticToken || hasEmailPassword);
  const authMode = hasEmailPassword
    ? 'email_password'
    : staticToken
    ? 'static_token'
    : 'none';

  if (!configured) {
    return { configured: false, authMode, status: 'unconfigured' };
  }

  if (!liveProbe) {
    return { configured: true, authMode, status: 'configured' };
  }

  try {
    let token = staticToken ?? '';
    if (hasEmailPassword && email && password) {
      const tokenResp = await fetch(ONEMAP_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(4000),
      });
      if (!tokenResp.ok) {
        return {
          configured: true,
          authMode,
          status: 'degraded',
          upstreamReachable: false,
          httpStatus: tokenResp.status,
        };
      }
      const tokenJson = (await tokenResp.json()) as { access_token?: string };
      token = tokenJson.access_token?.trim() ?? '';
    }

    if (!token) {
      return {
        configured: true,
        authMode,
        status: 'degraded',
        upstreamReachable: false,
      };
    }

    const probeUrl = `${ONEMAP_SEARCH_URL}?searchVal=raffles%20place&returnGeom=N&getAddrDetails=N&pageNum=1`;
    const searchResp = await fetch(probeUrl, {
      method: 'GET',
      headers: {
        Authorization: token,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });

    return {
      configured: true,
      authMode,
      status: searchResp.ok ? 'healthy' : 'degraded',
      upstreamReachable: searchResp.ok,
      httpStatus: searchResp.status,
    };
  } catch {
    return {
      configured: true,
      authMode,
      status: 'degraded',
      upstreamReachable: false,
    };
  }
}

async function checkLtaHealth(liveProbe: boolean): Promise<{
  configured: boolean;
  status: ServiceStatus;
  upstream: string;
  refreshIntervalSeconds: number;
  upstreamReachable?: boolean;
  httpStatus?: number;
}> {
  const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();
  const configured = Boolean(accountKey);

  if (!configured) {
    return {
      configured: false,
      status: 'unconfigured',
      upstream: LTA_ENDPOINT,
      refreshIntervalSeconds: 20,
    };
  }

  if (!liveProbe) {
    return {
      configured: true,
      status: 'configured',
      upstream: LTA_ENDPOINT,
      refreshIntervalSeconds: 20,
    };
  }

  try {
    const resp = await fetch(`${LTA_ENDPOINT}?BusStopCode=04121`, {
      method: 'GET',
      headers: {
        AccountKey: accountKey!,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });
    return {
      configured: true,
      status: resp.ok ? 'healthy' : 'degraded',
      upstream: LTA_ENDPOINT,
      refreshIntervalSeconds: 20,
      upstreamReachable: resp.ok,
      httpStatus: resp.status,
    };
  } catch {
    return {
      configured: true,
      status: 'degraded',
      upstream: LTA_ENDPOINT,
      refreshIntervalSeconds: 20,
      upstreamReachable: false,
    };
  }
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'Method not allowed. Use GET.' });
    return;
  }

  const probeParam = readQueryParam(req, 'probe').toLowerCase();
  const liveProbe = probeParam === '1' || probeParam === 'true';

  const [lta, onemap] = await Promise.all([
    checkLtaHealth(liveProbe),
    checkOneMapHealth(liveProbe),
  ]);

  const anyDegraded = lta.status === 'degraded' || onemap.status === 'degraded';

  sendJson(res, anyDegraded ? 503 : 200, {
    ok: !anyDegraded,
    service: 'shelteredsg-api-proxy',
    probeMode: liveProbe ? 'live' : 'config',
    ltaAccountKeyConfigured: lta.configured,
    oneMapConfigured: onemap.configured,
    services: {
      ltaDataMall: lta,
      oneMap: {
        ...onemap,
        endpoints: {
          token: ONEMAP_TOKEN_URL,
          search: ONEMAP_SEARCH_URL,
          revgeocode: 'https://www.onemap.gov.sg/api/public/revgeocode',
          route: 'https://www.onemap.gov.sg/api/public/routingsvc/route',
        },
      },
    },
    timestamp: new Date().toISOString(),
  });
}
