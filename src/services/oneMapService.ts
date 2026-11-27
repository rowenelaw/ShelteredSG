import { haversineDistanceKm, SINGAPORE_BUS_STOPS } from '../data/singaporeTransitData';
import { SingaporeLocation } from '../types/transit';
import type { SearchSuggestion } from './transitService';

interface OneMapSearchResultItem {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
}

interface OneMapSearchResponse {
  found?: number;
  results?: OneMapSearchResultItem[];
}

export async function searchOneMapPlaces(
  query: string,
  signal?: AbortSignal
): Promise<SearchSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  try {
    const params = new URLSearchParams({
      action: 'search',
      searchVal: trimmed,
      returnGeom: 'Y',
      getAddrDetails: 'Y',
      pageNum: '1',
    });

    const resp = await fetch(`/api/onemap?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!resp.ok) return [];
    const data = (await resp.json()) as OneMapSearchResponse;
    if (!Array.isArray(data.results)) return [];

    return data.results
      .slice(0, 5)
      .map((item, idx): SearchSuggestion | null => {
        const lat = Number(item.LATITUDE);
        const lng = Number(item.LONGITUDE);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const title = item.SEARCHVAL || item.BUILDING || item.ADDRESS || trimmed;
        const nearbyStopIds = [...SINGAPORE_BUS_STOPS]
          .sort((a, b) => haversineDistanceKm({ lat, lng }, a) - haversineDistanceKm({ lat, lng }, b))
          .slice(0, 3)
          .map((s) => s.id);

        const location: SingaporeLocation = {
          id: `onemap_${item.POSTAL || idx}_${lat.toFixed(4)}_${lng.toFixed(4)}`,
          name: title,
          shortName: item.BUILDING && item.BUILDING !== 'NIL' ? item.BUILDING : title,
          category: 'Commercial',
          district: item.ROAD_NAME && item.ROAD_NAME !== 'NIL' ? item.ROAD_NAME : 'Singapore',
          region: lng < 103.79 ? 'West' : lng > 103.89 ? 'East' : lat > 1.4 ? 'North' : 'Central',
          lat,
          lng,
          nearbyStopIds,
          defaultShelterPct: 72,
        };

        return {
          id: location.id,
          title,
          subtitle: item.ADDRESS || `${item.ROAD_NAME ?? 'Singapore'} · OneMap`,
          kind: 'location',
          location,
        };
      })
      .filter((s): s is SearchSuggestion => s !== null);
  } catch {
    return [];
  }
}

export async function reverseGeocodeOneMap(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'revgeocode',
      location: `${lat},${lng}`,
      buffer: '40',
      addressType: 'All',
    });
    const resp = await fetch(`/api/onemap?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      GeocodeInfo?: Array<{ BUILDINGNAME?: string; ROAD?: string }>;
    };
    const first = data.GeocodeInfo?.[0];
    if (!first) return null;
    if (first.BUILDINGNAME && first.BUILDINGNAME !== 'NIL') return first.BUILDINGNAME;
    return first.ROAD ?? null;
  } catch {
    return null;
  }
}

export async function fetchOneMapRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  routeType: 'walk' | 'drive' | 'cycle' | 'pt' = 'walk'
): Promise<unknown | null> {
  try {
    const params = new URLSearchParams({
      action: 'route',
      start: `${start.lat},${start.lng}`,
      end: `${end.lat},${end.lng}`,
      routeType,
    });
    const resp = await fetch(`/api/onemap?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
