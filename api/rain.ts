import type { IncomingMessage, ServerResponse } from 'node:http';

const DATA_GOV_RAINFALL_URL =
  'https://api-open.data.gov.sg/v2/real-time/api/rainfall';

const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$/;
const PAGINATION_TOKEN_REGEX = /^[A-Za-z0-9_=-]{1,128}$/;

interface ServerlessRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessResponse extends ServerResponse {
  status?: (code: number) => ServerlessResponse;
  json?: (body: unknown) => void;
}

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

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
    return;
  }

  const dateParam = readQueryParam(req, 'date');
  const paginationToken = readQueryParam(req, 'paginationToken');

  if (dateParam && !DATE_PARAM_REGEX.test(dateParam)) {
    sendJson(res, 400, {
      error:
        'Invalid date format. Expected YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.',
    });
    return;
  }

  if (paginationToken && !PAGINATION_TOKEN_REGEX.test(paginationToken)) {
    sendJson(res, 400, {
      error: 'Invalid paginationToken format.',
    });
    return;
  }

  const upstreamUrl = new URL(DATA_GOV_RAINFALL_URL);
  if (dateParam) {
    upstreamUrl.searchParams.set('date', dateParam);
  }
  if (paginationToken) {
    upstreamUrl.searchParams.set('paginationToken', paginationToken);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstreamResponse.ok) {
      sendJson(
        res,
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        {
          error: `data.gov.sg Rainfall API returned HTTP ${upstreamResponse.status}.`,
        }
      );
      return;
    }

    const data = await upstreamResponse.json();
    // NEA 5-minute rainfall readings update every 5 minutes
    sendJson(res, 200, data, 'public, s-maxage=120, stale-while-revalidate=60');
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    sendJson(res, isTimeout ? 504 : 502, {
      error: isTimeout
        ? 'Request to data.gov.sg Rainfall API timed out.'
        : 'Failed to fetch rainfall data from data.gov.sg.',
    });
  }
}
