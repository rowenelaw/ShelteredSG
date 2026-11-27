import type { IncomingMessage, ServerResponse } from 'node:http';

const ONEMAP_TOKEN_URL = 'https://www.onemap.gov.sg/api/auth/post/getToken';
const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const ONEMAP_REVGEOCODE_URL = 'https://www.onemap.gov.sg/api/public/revgeocode';
const ONEMAP_ROUTE_URL = 'https://www.onemap.gov.sg/api/public/routingsvc/route';

const COORD_PAIR_REGEX = /^-?\d{1,2}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?$/;
const ALLOWED_ROUTE_TYPES = new Set(['walk', 'drive', 'cycle', 'pt']);
const ALLOWED_PT_MODES = new Set(['TRANSIT', 'BUS', 'RAIL']);
const ALLOWED_ADDRESS_TYPES = new Set(['All', 'HDB']);
const DATE_REGEX = /^\d{2}-\d{2}-\d{4}$/;
const TIME_REGEX = /^\d{2}:\d{2}:\d{2}$/;

interface ServerlessRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessResponse extends ServerResponse {
  status?: (code: number) => ServerlessResponse;
  json?: (body: unknown) => void;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

// In-memory 3-day token cache for warm serverless container reuse
let cachedOneMapToken: CachedToken | null = null;

function sendJson(
  res: ServerlessResponse,
  statusCode: number,
  payload: unknown,
  cacheControl = 'no-store'
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
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

function isValidCoordPair(value: string): boolean {
  if (!COORD_PAIR_REGEX.test(value)) return false;
  const [latStr, lngStr] = value.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function getSingaporeDateAndTime(): { date: string; time: string } {
  const sgNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })
  );
  const mm = String(sgNow.getMonth() + 1).padStart(2, '0');
  const dd = String(sgNow.getDate()).padStart(2, '0');
  const yyyy = sgNow.getFullYear();
  const hh = String(sgNow.getHours()).padStart(2, '0');
  const min = String(sgNow.getMinutes()).padStart(2, '0');
  const ss = String(sgNow.getSeconds()).padStart(2, '0');
  return {
    date: `${mm}-${dd}-${yyyy}`,
    time: `${hh}:${min}:${ss}`,
  };
}

async function getOneMapAccessToken(forceRefresh = false): Promise<string> {
  const staticToken = process.env.ONEMAP_API_TOKEN?.trim();
  if (staticToken && !forceRefresh) {
    return staticToken;
  }

  const nowMs = Date.now();
  // Refresh 5 minutes before expiry (tokens last 3 days)
  if (
    !forceRefresh &&
    cachedOneMapToken &&
    cachedOneMapToken.expiresAtMs - 300_000 > nowMs
  ) {
    return cachedOneMapToken.accessToken;
  }

  const email = process.env.ONEMAP_EMAIL?.trim();
  const password = process.env.ONEMAP_PASSWORD;

  if (!email || !password) {
    if (staticToken) return staticToken;
    throw new Error('ONEMAP_CREDENTIALS_MISSING');
  }

  const tokenResp = await fetch(ONEMAP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(8000),
  });

  if (!tokenResp.ok) {
    throw new Error(`ONEMAP_TOKEN_HTTP_${tokenResp.status}`);
  }

  const tokenJson = (await tokenResp.json()) as {
    access_token?: string;
    expiry_timestamp?: string | number;
  };

  const accessToken = tokenJson.access_token?.trim();
  if (!accessToken) {
    throw new Error('ONEMAP_TOKEN_INVALID_RESPONSE');
  }

  // OneMap expiry_timestamp is Unix epoch seconds (or fallback to 72 hours)
  const rawExpiry = Number(tokenJson.expiry_timestamp);
  const expiresAtMs =
    Number.isFinite(rawExpiry) && rawExpiry > 0
      ? rawExpiry * 1000
      : nowMs + 3 * 24 * 60 * 60 * 1000;

  cachedOneMapToken = { accessToken, expiresAtMs };
  return accessToken;
}

async function fetchOneMapWithAuth(upstreamUrl: string): Promise<Response> {
  let token = await getOneMapAccessToken(false);
  let resp = await fetch(upstreamUrl, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (resp.status === 401) {
    cachedOneMapToken = null;
    token = await getOneMapAccessToken(true);
    resp = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: token,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
  }

  return resp;
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
    return;
  }

  const hasStaticToken = Boolean(process.env.ONEMAP_API_TOKEN?.trim());
  const hasEmailPassword = Boolean(
    process.env.ONEMAP_EMAIL?.trim() && process.env.ONEMAP_PASSWORD
  );

  if (!hasStaticToken && !hasEmailPassword) {
    sendJson(res, 503, {
      error: 'OneMap credentials are not configured on the server.',
      hint: 'Set ONEMAP_EMAIL and ONEMAP_PASSWORD (or ONEMAP_API_TOKEN) in your environment variables.',
    });
    return;
  }

  let action = readQueryParam(req, 'action').toLowerCase();
  if (!action) {
    if (readQueryParam(req, 'searchVal')) action = 'search';
    else if (readQueryParam(req, 'location')) action = 'revgeocode';
    else if (readQueryParam(req, 'start') && readQueryParam(req, 'end')) action = 'route';
  }

  let upstreamUrl: URL;
  let cacheControl = 'public, s-maxage=300, stale-while-revalidate=60';

  if (action === 'search') {
    const searchVal = readQueryParam(req, 'searchVal');
    if (!searchVal || searchVal.length > 120) {
      sendJson(res, 400, {
        error: 'Invalid or missing searchVal (expected 1-120 characters).',
      });
      return;
    }
    const returnGeom = readQueryParam(req, 'returnGeom') === 'N' ? 'N' : 'Y';
    const getAddrDetails = readQueryParam(req, 'getAddrDetails') === 'N' ? 'N' : 'Y';
    const rawPage = Number(readQueryParam(req, 'pageNum') || '1');
    const pageNum =
      Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 50 ? String(rawPage) : '1';

    upstreamUrl = new URL(ONEMAP_SEARCH_URL);
    upstreamUrl.searchParams.set('searchVal', searchVal);
    upstreamUrl.searchParams.set('returnGeom', returnGeom);
    upstreamUrl.searchParams.set('getAddrDetails', getAddrDetails);
    upstreamUrl.searchParams.set('pageNum', pageNum);
  } else if (action === 'revgeocode') {
    const location = readQueryParam(req, 'location');
    if (!isValidCoordPair(location)) {
      sendJson(res, 400, {
        error: 'Invalid or missing location. Expected "lat,lng" (e.g. 1.3,103.8).',
      });
      return;
    }
    const rawBuffer = Number(readQueryParam(req, 'buffer') || '40');
    const buffer =
      Number.isFinite(rawBuffer) && rawBuffer >= 0 && rawBuffer <= 500
        ? String(Math.round(rawBuffer))
        : '40';
    const rawAddressType = readQueryParam(req, 'addressType') || 'All';
    const addressType = ALLOWED_ADDRESS_TYPES.has(rawAddressType) ? rawAddressType : 'All';

    upstreamUrl = new URL(ONEMAP_REVGEOCODE_URL);
    upstreamUrl.searchParams.set('location', location);
    upstreamUrl.searchParams.set('buffer', buffer);
    upstreamUrl.searchParams.set('addressType', addressType);
  } else if (action === 'route') {
    const start = readQueryParam(req, 'start');
    const end = readQueryParam(req, 'end');
    const routeType = (readQueryParam(req, 'routeType') || 'walk').toLowerCase();

    if (!isValidCoordPair(start) || !isValidCoordPair(end)) {
      sendJson(res, 400, {
        error: 'Invalid or missing start/end coordinates. Expected "lat,lng".',
      });
      return;
    }
    if (!ALLOWED_ROUTE_TYPES.has(routeType)) {
      sendJson(res, 400, {
        error: 'Invalid routeType. Allowed values: walk, drive, cycle, pt.',
      });
      return;
    }

    upstreamUrl = new URL(ONEMAP_ROUTE_URL);
    upstreamUrl.searchParams.set('start', start);
    upstreamUrl.searchParams.set('end', end);
    upstreamUrl.searchParams.set('routeType', routeType);

    if (routeType === 'pt') {
      cacheControl = 'public, s-maxage=60, stale-while-revalidate=30';
      const sgNow = getSingaporeDateAndTime();
      const rawDate = readQueryParam(req, 'date');
      const rawTime = readQueryParam(req, 'time');
      const rawMode = readQueryParam(req, 'mode').toUpperCase();
      const rawMaxWalk = Number(readQueryParam(req, 'maxWalkDistance') || '1000');
      const rawItin = Number(readQueryParam(req, 'numItineraries') || '3');

      upstreamUrl.searchParams.set(
        'date',
        DATE_REGEX.test(rawDate) ? rawDate : sgNow.date
      );
      upstreamUrl.searchParams.set(
        'time',
        TIME_REGEX.test(rawTime) ? rawTime : sgNow.time
      );
      upstreamUrl.searchParams.set(
        'mode',
        ALLOWED_PT_MODES.has(rawMode) ? rawMode : 'BUS'
      );
      if (Number.isFinite(rawMaxWalk) && rawMaxWalk >= 100 && rawMaxWalk <= 5000) {
        upstreamUrl.searchParams.set('maxWalkDistance', String(Math.round(rawMaxWalk)));
      }
      if (Number.isInteger(rawItin) && rawItin >= 1 && rawItin <= 5) {
        upstreamUrl.searchParams.set('numItineraries', String(rawItin));
      }
    }
  } else {
    sendJson(res, 400, {
      error: 'Missing or invalid action. Use action=search, action=revgeocode, or action=route.',
    });
    return;
  }

  try {
    const upstreamResponse = await fetchOneMapWithAuth(upstreamUrl.toString());
    if (!upstreamResponse.ok) {
      sendJson(
        res,
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        { error: `OneMap API returned HTTP ${upstreamResponse.status}.` }
      );
      return;
    }

    const data = await upstreamResponse.json();
    sendJson(res, 200, data, cacheControl);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'ONEMAP_CREDENTIALS_MISSING') {
      sendJson(res, 503, {
        error: 'OneMap credentials are not configured on the server.',
      });
      return;
    }
    if (message.startsWith('ONEMAP_TOKEN_HTTP_')) {
      sendJson(res, 502, {
        error: 'Failed to authenticate with OneMap token service.',
      });
      return;
    }
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    sendJson(res, isTimeout ? 504 : 502, {
      error: isTimeout
        ? 'Request to OneMap API timed out.'
        : 'Failed to fetch data from OneMap API.',
    });
  }
}
