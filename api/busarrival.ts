import type { IncomingMessage, ServerResponse } from 'node:http';

const LTA_BUS_ARRIVAL_ENDPOINT =
  'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival';

const BUS_STOP_CODE_REGEX = /^\d{5}$/;
const SERVICE_NO_REGEX = /^[A-Za-z0-9]{1,5}$/;

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

  const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();
  if (!accountKey) {
    sendJson(res, 503, {
      error: 'LTA_ACCOUNT_KEY is not configured on the server.',
      hint: 'Add LTA_ACCOUNT_KEY in your environment variables.',
    });
    return;
  }

  const busStopCode =
    readQueryParam(req, 'BusStopCode') || readQueryParam(req, 'busStopCode');
  const serviceNo =
    readQueryParam(req, 'ServiceNo') || readQueryParam(req, 'serviceNo');

  if (!BUS_STOP_CODE_REGEX.test(busStopCode)) {
    sendJson(res, 400, {
      error: 'Invalid or missing BusStopCode. Expected a 5-digit Singapore bus stop code (e.g. 04121).',
    });
    return;
  }

  if (serviceNo && !SERVICE_NO_REGEX.test(serviceNo)) {
    sendJson(res, 400, {
      error: 'Invalid ServiceNo format. Expected 1-5 alphanumeric characters (e.g. 7, 106, 174e).',
    });
    return;
  }

  const upstreamUrl = new URL(LTA_BUS_ARRIVAL_ENDPOINT);
  upstreamUrl.searchParams.set('BusStopCode', busStopCode);
  if (serviceNo) {
    upstreamUrl.searchParams.set('ServiceNo', serviceNo);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        AccountKey: accountKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstreamResponse.ok) {
      sendJson(res, upstreamResponse.status >= 500 ? 502 : upstreamResponse.status, {
        error: `LTA DataMall returned HTTP ${upstreamResponse.status}.`,
      });
      return;
    }

    const data = await upstreamResponse.json();
    sendJson(res, 200, data, 'public, s-maxage=15, stale-while-revalidate=5');
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    sendJson(res, isTimeout ? 504 : 502, {
      error: isTimeout
        ? 'Request to LTA DataMall timed out.'
        : 'Failed to fetch bus arrival data from LTA DataMall.',
    });
  }
}
