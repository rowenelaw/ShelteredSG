import {
  BUS_CORRIDORS,
  BusCorridorDefinition,
  haversineDistanceKm,
  SINGAPORE_BUS_STOPS,
  SINGAPORE_LOCATIONS,
} from '../data/singaporeTransitData';
import {
  BusLoad,
  BusServiceArrival,
  BusStop,
  BusStopArrivalResponse,
  BusType,
  ComputedBusRoute,
  NextBusArrival,
  OptimizationMode,
  RainSeverity,
  RouteLeg,
  SingaporeLocation,
  WeatherSnapshot,
} from '../types/transit';
import { classifyRainSeverity, sampleRainAtCoords } from './weatherService';

/**
 * API INTEGRATION POINT (LTA DataMall):
 * Replace `getBusStopArrivals` with live fetch to your backend proxy calling:
 * - GET https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode={busStopCode}
 * - Header: AccountKey: process.env.LTA_ACCOUNT_KEY
 */

const STOP_MAP = new Map<string, BusStop>(SINGAPORE_BUS_STOPS.map((s) => [s.id, s]));

function deterministicHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function getOperatorForService(serviceNo: string): 'SBST' | 'SMRT' | 'TTS' | 'GAS' {
  const corridor = BUS_CORRIDORS.find((c) => c.serviceNo === serviceNo);
  if (corridor) return corridor.operator;
  const num = parseInt(serviceNo, 10) || 0;
  if (num >= 900 || num === 188 || num === 858) return 'SMRT';
  if (num === 106 || num === 97 || num === 167 || num === 183) return 'TTS';
  if (num === 35 || num === 83 || num === 119) return 'GAS';
  return 'SBST';
}

function getDestinationForService(serviceNo: string): string {
  const corridor = BUS_CORRIDORS.find((c) => c.serviceNo === serviceNo);
  if (corridor) return corridor.destinationName;
  const num = parseInt(serviceNo, 10) || 10;
  const fallbacks = [
    'Shenton Way Ter',
    'Marina Centre Ter',
    'HarbourFront Int',
    'Tampines Int',
    'Jurong East Int',
    'Bishan Int',
    'Bedok Int',
  ];
  return fallbacks[num % fallbacks.length];
}

export function getBusStopById(id: string): BusStop | undefined {
  return STOP_MAP.get(id);
}

export function getBusStopArrivals(
  busStopCode: string,
  tickOffsetSec = 0
): BusStopArrivalResponse {
  const stop = STOP_MAP.get(busStopCode);
  const serviceNos = stop?.services ?? ['14', '65', '106'];
  const nowMs = Date.now();

  const services: BusServiceArrival[] = serviceNos.map((serviceNo) => {
    const seed = deterministicHash(`${busStopCode}_${serviceNo}`);
    const corridor = BUS_CORRIDORS.find((c) => c.serviceNo === serviceNo);
    const headway = corridor?.avgHeadwayMin ?? (6 + (seed % 7));

    // Continuous deterministic ticking countdown
    const cycleSec = headway * 60;
    const elapsedSec = (seed % cycleSec) + tickOffsetSec;
    const firstBusSec = Math.max(15, cycleSec - (elapsedSec % cycleSec));
    const min1 = Math.max(0, Math.floor(firstBusSec / 60));
    const min2 = min1 + headway;
    const min3 = min2 + headway;

    const loads: BusLoad[] = ['SEA', 'SEA', 'SDA', 'SEA', 'LSD'];
    const types: BusType[] = ['DD', 'SD', 'DD', 'BD'];

    const makeArrival = (mins: number, offsetIdx: number): NextBusArrival => {
      const load = loads[(seed + offsetIdx) % loads.length];
      const type = types[(seed + offsetIdx) % types.length];
      return {
        originCode: busStopCode,
        destinationCode: corridor?.stopIds[corridor.stopIds.length - 1] ?? '03218',
        estimatedArrivalIso: new Date(nowMs + mins * 60000).toISOString(),
        minutesAway: mins,
        load,
        feature: 'WAB',
        type,
        lat: (stop?.lat ?? 1.3) + (mins * 0.0012),
        lng: (stop?.lng ?? 103.85) - (mins * 0.0014),
      };
    };

    return {
      serviceNo,
      operator: getOperatorForService(serviceNo),
      destinationName: getDestinationForService(serviceNo),
      nextBus: makeArrival(min1, 0),
      nextBus2: makeArrival(min2, 1),
      nextBus3: makeArrival(min3, 2),
    };
  });

  // Sort by soonest arrival
  services.sort((a, b) => a.nextBus.minutesAway - b.nextBus.minutesAway);

  return {
    busStopCode,
    updatedAtIso: new Date(nowMs).toISOString(),
    services,
  };
}

interface LtaRawBusSlot {
  OriginCode?: string;
  DestinationCode?: string;
  EstimatedArrival?: string;
  Load?: string;
  Feature?: string;
  Type?: string;
  Latitude?: string;
  Longitude?: string;
}

interface LtaRawService {
  ServiceNo?: string;
  Operator?: string;
  NextBus?: LtaRawBusSlot;
  NextBus2?: LtaRawBusSlot;
  NextBus3?: LtaRawBusSlot;
}

interface LtaRawBusArrivalResponse {
  BusStopCode?: string;
  Services?: LtaRawService[];
}

function normalizeLtaSlot(
  slot: LtaRawBusSlot | undefined,
  fallbackStopCode: string
): NextBusArrival | null {
  if (!slot || !slot.EstimatedArrival) return null;
  const etaMs = Date.parse(slot.EstimatedArrival);
  if (Number.isNaN(etaMs)) return null;
  const minutesAway = Math.max(0, Math.floor((etaMs - Date.now()) / 60000));

  const load: BusLoad =
    slot.Load === 'SDA' || slot.Load === 'LSD' ? slot.Load : 'SEA';
  const type: BusType =
    slot.Type === 'DD' || slot.Type === 'BD' ? slot.Type : 'SD';
  const feature = slot.Feature === 'WAB' ? 'WAB' : 'STD';

  return {
    originCode: slot.OriginCode || fallbackStopCode,
    destinationCode: slot.DestinationCode || fallbackStopCode,
    estimatedArrivalIso: slot.EstimatedArrival,
    minutesAway,
    load,
    feature,
    type,
    lat: parseFloat(slot.Latitude || '0') || 0,
    lng: parseFloat(slot.Longitude || '0') || 0,
  };
}

export async function fetchLiveBusStopArrivals(
  busStopCode: string,
  serviceNo?: string,
  tickOffsetSec = 0
): Promise<{ data: BusStopArrivalResponse; source: 'lta-live' | 'simulated' }> {
  try {
    const params = new URLSearchParams({ BusStopCode: busStopCode });
    if (serviceNo?.trim()) {
      params.set('ServiceNo', serviceNo.trim());
    }
    const resp = await fetch(`/api/busarrival?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const raw = (await resp.json()) as LtaRawBusArrivalResponse;
    if (!raw || !Array.isArray(raw.Services)) {
      throw new Error('Malformed LTA response');
    }

    const mappedServices: BusServiceArrival[] = [];
    for (const svc of raw.Services) {
      const svcNo = svc.ServiceNo?.trim();
      if (!svcNo) continue;
      const nextBus = normalizeLtaSlot(svc.NextBus, busStopCode);
      if (!nextBus) continue;

      const op =
        svc.Operator === 'SMRT' ||
        svc.Operator === 'TTS' ||
        svc.Operator === 'GAS'
          ? svc.Operator
          : 'SBST';

      const destStop = STOP_MAP.get(nextBus.destinationCode);
      mappedServices.push({
        serviceNo: svcNo,
        operator: op,
        destinationName: destStop?.name ?? getDestinationForService(svcNo),
        nextBus,
        nextBus2: normalizeLtaSlot(svc.NextBus2, busStopCode),
        nextBus3: normalizeLtaSlot(svc.NextBus3, busStopCode),
      });
    }

    mappedServices.sort(
      (a, b) => a.nextBus.minutesAway - b.nextBus.minutesAway
    );

    return {
      source: 'lta-live',
      data: {
        busStopCode: raw.BusStopCode || busStopCode,
        updatedAtIso: new Date().toISOString(),
        services: mappedServices,
      },
    };
  } catch {
    return {
      source: 'simulated',
      data: getBusStopArrivals(busStopCode, tickOffsetSec),
    };
  }
}

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle: string;
  kind: 'location' | 'bus_stop' | 'custom';
  location: SingaporeLocation;
}

export function searchSingaporePlaces(query: string): SearchSuggestion[] {
  const q = query.trim().toLowerCase();

  const locationResults: SearchSuggestion[] = SINGAPORE_LOCATIONS.filter(
    (loc) =>
      !q ||
      loc.name.toLowerCase().includes(q) ||
      loc.shortName.toLowerCase().includes(q) ||
      loc.district.toLowerCase().includes(q) ||
      loc.region.toLowerCase().includes(q)
  ).map((loc) => ({
    id: loc.id,
    title: loc.name,
    subtitle: `${loc.district} · ${loc.category}`,
    kind: 'location',
    location: loc,
  }));

  const stopResults: SearchSuggestion[] = SINGAPORE_BUS_STOPS.filter(
    (stop) =>
      !q ||
      stop.id.includes(q) ||
      stop.name.toLowerCase().includes(q) ||
      stop.roadName.toLowerCase().includes(q) ||
      stop.services.some((s) => s.toLowerCase() === q)
  ).map((stop) => ({
    id: `stop_${stop.id}`,
    title: `${stop.name} (${stop.id})`,
    subtitle: `${stop.roadName} · Bus ${stop.services.slice(0, 4).join(', ')}`,
    kind: 'bus_stop',
    location: {
      id: `stop_${stop.id}`,
      name: `${stop.name} (${stop.id})`,
      shortName: stop.name,
      category: 'MRT / Hub',
      district: stop.roadName,
      region: stop.region,
      lat: stop.lat,
      lng: stop.lng,
      nearbyStopIds: [stop.id],
      defaultShelterPct: stop.hasShelter ? 88 : 25,
    },
  }));

  const combined = [...locationResults, ...stopResults];
  if (combined.length > 0) {
    return combined.slice(0, 10);
  }

  // Fallback for arbitrary free-text Singapore address queries
  if (q.length >= 2) {
    const hash = deterministicHash(q);
    const nearestLoc = SINGAPORE_LOCATIONS[hash % SINGAPORE_LOCATIONS.length];
    return [
      {
        id: `custom_${hash}`,
        title: query.trim(),
        subtitle: `Near ${nearestLoc.district} · Matched nearest Singapore corridor`,
        kind: 'custom',
        location: {
          ...nearestLoc,
          id: `custom_${hash}`,
          name: query.trim(),
          shortName: query.trim(),
          lat: nearestLoc.lat + ((hash % 9) - 4) * 0.0012,
          lng: nearestLoc.lng + ((hash % 7) - 3) * 0.0012,
        },
      },
    ];
  }

  return [];
}

export function resolveFreeTextLocation(text: string): SingaporeLocation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const results = searchSingaporePlaces(trimmed);
  return results[0]?.location ?? null;
}

function getStopSequenceSlice(
  corridor: BusCorridorDefinition,
  fromStopId: string,
  toStopId: string
): BusStop[] | null {
  const idxA = corridor.stopIds.indexOf(fromStopId);
  const idxB = corridor.stopIds.indexOf(toStopId);
  if (idxA === -1 || idxB === -1 || idxA === idxB) return null;

  const sliceIds =
    idxA < idxB
      ? corridor.stopIds.slice(idxA, idxB + 1)
      : corridor.stopIds.slice(idxB, idxA + 1).reverse();

  const stops = sliceIds.map((id) => STOP_MAP.get(id)).filter((s): s is BusStop => Boolean(s));
  return stops.length >= 2 ? stops : null;
}

function buildWalkLeg(
  id: string,
  fromLabel: string,
  toLabel: string,
  fromCoords: { lat: number; lng: number },
  toCoords: { lat: number; lng: number },
  shelterPct: number,
  shelterDescription: string,
  weather: WeatherSnapshot,
  toStopCode?: string,
  fromStopCode?: string
): RouteLeg {
  const straightKm = haversineDistanceKm(fromCoords, toCoords);
  const walkKm = Math.max(0.08, Math.min(0.95, straightKm * 1.25));
  const walkMeters = Math.round(walkKm * 1000);
  const durationMin = Math.max(2, Math.round((walkMeters / 75))); // ~4.5 km/h walk speed

  const midLat = (fromCoords.lat + toCoords.lat) / 2;
  const midLng = (fromCoords.lng + toCoords.lng) / 2;
  const rainSample = sampleRainAtCoords(midLat, midLng, weather);

  const uncoveredMeters = Math.round(walkMeters * (1 - shelterPct / 100));
  const uncoveredMinutes = Math.round(durationMin * (1 - shelterPct / 100) * 10) / 10;

  return {
    id,
    type: 'walk',
    fromLabel,
    toLabel,
    fromStopCode,
    toStopCode,
    fromCoords,
    toCoords,
    durationMin,
    distanceKm: Math.round((walkMeters / 1000) * 100) / 100,
    shelterPct,
    shelterDescription,
    uncoveredMeters,
    uncoveredMinutes,
    rainIntensityMmHr: rainSample.rainfallMmHr,
    rainSeverity: rainSample.severity,
  };
}

function buildBusLeg(
  id: string,
  corridor: BusCorridorDefinition,
  stops: BusStop[],
  tickOffsetSec: number
): RouteLeg {
  const boardStop = stops[0];
  const alightStop = stops[stops.length - 1];
  let rideDistanceKm = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    rideDistanceKm += haversineDistanceKm(stops[i], stops[i + 1]) * 1.28;
  }
  rideDistanceKm = Math.max(1.1, Math.round(rideDistanceKm * 10) / 10);

  const arrivals = getBusStopArrivals(boardStop.id, tickOffsetSec);
  const svcArrival = arrivals.services.find((s) => s.serviceNo === corridor.serviceNo);
  const nextArrivalMin = svcArrival ? svcArrival.nextBus.minutesAway : 4;
  const rideTimeMin = Math.max(4, Math.round((rideDistanceKm / corridor.avgSpeedKmh) * 60) + (stops.length - 1));

  return {
    id,
    type: 'bus',
    fromLabel: `${boardStop.name} (${boardStop.id})`,
    toLabel: `${alightStop.name} (${alightStop.id})`,
    fromStopCode: boardStop.id,
    toStopCode: alightStop.id,
    fromCoords: { lat: boardStop.lat, lng: boardStop.lng },
    toCoords: { lat: alightStop.lat, lng: alightStop.lng },
    waypoints: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    durationMin: rideTimeMin,
    distanceKm: rideDistanceKm,
    serviceNo: corridor.serviceNo,
    operator: corridor.operator,
    stopsCount: Math.max(2, stops.length * 3 - 1),
    waitTimeMin: nextArrivalMin,
    nextArrivalMin,
    busLoad: svcArrival?.nextBus.load ?? 'SEA',
    busType: svcArrival?.nextBus.type ?? 'DD',
    boardingStopSheltered: boardStop.hasShelter,
  };
}

function getShelterProfileForStop(
  location: SingaporeLocation,
  stop: BusStop,
  variantBias: 'sheltered' | 'direct'
): { shelterPct: number; description: string } {
  if (stop.hasShelter && stop.coveredLinkwayTo) {
    return {
      shelterPct: variantBias === 'sheltered' ? Math.max(90, location.defaultShelterPct) : 82,
      description: `Covered linkway via ${stop.coveredLinkwayTo}`,
    };
  }
  if (stop.hasShelter) {
    return {
      shelterPct: 68,
      description: 'Partially covered HDB & sheltered bus stop',
    };
  }
  return {
    shelterPct: 18,
    description: 'Open street footpath · Unsheltered boarding bay',
  };
}

function finalizeRoute(
  id: string,
  title: string,
  legs: RouteLeg[],
  weather: WeatherSnapshot,
  mode: OptimizationMode
): ComputedBusRoute {
  const walkLegs = legs.filter((l) => l.type === 'walk');
  const busLegs = legs.filter((l) => l.type === 'bus');

  const totalWaitMin = busLegs.reduce((sum, l) => sum + (l.waitTimeMin ?? 0), 0);
  const totalLegDurationMin = legs.reduce((sum, l) => sum + l.durationMin, 0);
  const totalDurationMin = totalLegDurationMin + totalWaitMin;

  const totalDistanceKm =
    Math.round(legs.reduce((sum, l) => sum + l.distanceKm, 0) * 10) / 10;

  const totalWalkMeters = Math.round(
    walkLegs.reduce((sum, l) => sum + l.distanceKm * 1000, 0)
  );
  const uncoveredWalkMeters = Math.round(
    walkLegs.reduce((sum, l) => sum + (l.uncoveredMeters ?? 0), 0)
  );
  const uncoveredExposureMin =
    Math.round(walkLegs.reduce((sum, l) => sum + (l.uncoveredMinutes ?? 0), 0) * 10) / 10;

  const shelterCoveragePct =
    totalWalkMeters > 0
      ? Math.max(0, Math.min(100, Math.round((1 - uncoveredWalkMeters / totalWalkMeters) * 100)))
      : 100;

  const avgRainIntensityMmHr =
    walkLegs.length > 0
      ? Math.round(
          (walkLegs.reduce((sum, l) => sum + (l.rainIntensityMmHr ?? 0), 0) /
            walkLegs.length) *
            10
        ) / 10
      : 0;

  // Unsheltered bus stop waiting adds exposure
  const unshelteredWaitPenalty = busLegs.reduce((sum, l) => {
    if (l.boardingStopSheltered) return sum;
    const stopRain = sampleRainAtCoords(l.fromCoords.lat, l.fromCoords.lng, weather).rainfallMmHr;
    return sum + (stopRain > 0.5 ? (l.waitTimeMin ?? 2) * 0.8 : 0);
  }, 0);

  const effectiveExposureMin = Math.round((uncoveredExposureMin + unshelteredWaitPenalty) * 10) / 10;

  const peakRainMm = Math.max(
    0,
    ...walkLegs.map((l) => l.rainIntensityMmHr ?? 0)
  );
  const peakRainSeverity: RainSeverity = classifyRainSeverity(peakRainMm);

  const serviceChain = busLegs
    .map((l) => l.serviceNo)
    .filter((s): s is string => Boolean(s));
  const transfers = Math.max(0, busLegs.length - 1);
  const nextBusMin = busLegs[0]?.nextArrivalMin ?? 4;

  // Singapore LTA adult card distance fare approximation
  const estimatedFareSgd =
    Math.round(Math.min(2.35, 1.09 + Math.max(0, totalDistanceKm - 3.2) * 0.085) * 100) / 100;

  // Compute optimization score (lower is better)
  const rainPenalty =
    (effectiveExposureMin * (1 + avgRainIntensityMmHr / 8)) +
    (uncoveredWalkMeters / 80) * (avgRainIntensityMmHr > 1 ? 1.8 : 0.3);

  let score = 0;
  if (mode === 'least_rain') {
    score = rainPenalty * 6.0 + totalDurationMin * 0.7 + totalDistanceKm * 0.4;
  } else if (mode === 'fastest') {
    score = totalDurationMin * 2.5 + totalDistanceKm * 0.3 + rainPenalty * 0.35;
  } else if (mode === 'shortest') {
    score = totalDistanceKm * 6.0 + totalDurationMin * 0.5 + rainPenalty * 0.3;
  } else {
    // Balanced: dynamically weights rain higher when rain is actually falling
    const rainMultiplier = avgRainIntensityMmHr >= 10 ? 2.6 : avgRainIntensityMmHr >= 1 ? 1.5 : 0.4;
    score = totalDurationMin * 1.3 + totalDistanceKm * 1.1 + rainPenalty * rainMultiplier;
  }

  let rainImpactNote = 'Dry walk conditions across all segments.';
  if (avgRainIntensityMmHr >= 0.5) {
    if (shelterCoveragePct >= 88) {
      rainImpactNote = `Protected via covered linkways (${shelterCoveragePct}% sheltered) despite ${avgRainIntensityMmHr} mm/hr rain.`;
    } else if (shelterCoveragePct >= 65) {
      rainImpactNote = `Moderate shelter (${shelterCoveragePct}%), ~${uncoveredWalkMeters}m exposed to ${peakRainSeverity} rain.`;
    } else {
      rainImpactNote = `High rain exposure: ${uncoveredWalkMeters}m uncovered walk in ${avgRainIntensityMmHr} mm/hr rain.`;
    }
  }

  return {
    id,
    title,
    serviceChain,
    transfers,
    totalDurationMin,
    totalDistanceKm,
    totalWalkMeters,
    uncoveredWalkMeters,
    uncoveredExposureMin: effectiveExposureMin,
    shelterCoveragePct,
    avgRainIntensityMmHr,
    peakRainSeverity,
    nextBusMin,
    estimatedFareSgd,
    recommendationTag: '',
    rainImpactNote,
    score: Math.round(score * 10) / 10,
    legs,
  };
}

function findNearestStops(loc: SingaporeLocation, count = 3): BusStop[] {
  const byId = loc.nearbyStopIds
    .map((id) => STOP_MAP.get(id))
    .filter((s): s is BusStop => Boolean(s));
  if (byId.length >= count) return byId.slice(0, count);

  const sorted = [...SINGAPORE_BUS_STOPS].sort(
    (a, b) => haversineDistanceKm(loc, a) - haversineDistanceKm(loc, b)
  );
  const merged = [...byId];
  for (const s of sorted) {
    if (!merged.some((m) => m.id === s.id)) {
      merged.push(s);
    }
    if (merged.length >= count) break;
  }
  return merged;
}

export function computeEfficientBusRoutes(
  origin: SingaporeLocation,
  destination: SingaporeLocation,
  weather: WeatherSnapshot,
  mode: OptimizationMode,
  tickOffsetSec = 0
): ComputedBusRoute[] {
  if (origin.id === destination.id) {
    return [];
  }

  const originStops = findNearestStops(origin, 3);
  const destStops = findNearestStops(destination, 3);

  const candidates: ComputedBusRoute[] = [];
  const usedSignatures = new Set<string>();

  // 1. Direct corridor routes
  for (const oStop of originStops) {
    for (const dStop of destStops) {
      if (oStop.id === dStop.id) continue;
      for (const corridor of BUS_CORRIDORS) {
        const slice = getStopSequenceSlice(corridor, oStop.id, dStop.id);
        if (!slice) continue;
        const sig = `direct_${corridor.serviceNo}_${oStop.id}_${dStop.id}`;
        if (usedSignatures.has(sig)) continue;
        usedSignatures.add(sig);

        const oShelter = getShelterProfileForStop(
          origin,
          oStop,
          oStop.hasShelter ? 'sheltered' : 'direct'
        );
        const dShelter = getShelterProfileForStop(
          destination,
          dStop,
          dStop.hasShelter ? 'sheltered' : 'direct'
        );

        const legs: RouteLeg[] = [
          buildWalkLeg(
            `${sig}_w1`,
            origin.shortName,
            `${oStop.name} (${oStop.id})`,
            { lat: origin.lat, lng: origin.lng },
            { lat: oStop.lat, lng: oStop.lng },
            oShelter.shelterPct,
            oShelter.description,
            weather,
            oStop.id
          ),
          buildBusLeg(`${sig}_b1`, corridor, slice, tickOffsetSec),
          buildWalkLeg(
            `${sig}_w2`,
            `${dStop.name} (${dStop.id})`,
            destination.shortName,
            { lat: dStop.lat, lng: dStop.lng },
            { lat: destination.lat, lng: destination.lng },
            dShelter.shelterPct,
            dShelter.description,
            weather,
            undefined,
            dStop.id
          ),
        ];

        candidates.push(
          finalizeRoute(
            sig,
            `Direct Bus ${corridor.serviceNo}`,
            legs,
            weather,
            mode
          )
        );
      }
    }
  }

  // 2. One-transfer routes through sheltered MRT/Interchange hubs
  const primaryOriginStop = originStops[0];
  const primaryDestStop = destStops[0];

  for (const c1 of BUS_CORRIDORS) {
    if (!c1.stopIds.includes(primaryOriginStop.id)) continue;
    for (const transferStopId of c1.stopIds) {
      if (transferStopId === primaryOriginStop.id || transferStopId === primaryDestStop.id) {
        continue;
      }
      const transferStop = STOP_MAP.get(transferStopId);
      if (!transferStop) continue;

      for (const c2 of BUS_CORRIDORS) {
        if (c2.serviceNo === c1.serviceNo) continue;
        if (!c2.stopIds.includes(transferStopId) || !c2.stopIds.includes(primaryDestStop.id)) {
          continue;
        }
        const slice1 = getStopSequenceSlice(c1, primaryOriginStop.id, transferStopId);
        const slice2 = getStopSequenceSlice(c2, transferStopId, primaryDestStop.id);
        if (!slice1 || !slice2) continue;

        const sig = `tx_${c1.serviceNo}_${c2.serviceNo}_${transferStopId}`;
        if (usedSignatures.has(sig)) continue;
        usedSignatures.add(sig);

        const oShelter = getShelterProfileForStop(origin, primaryOriginStop, 'sheltered');
        const dShelter = getShelterProfileForStop(destination, primaryDestStop, 'sheltered');

        const legs: RouteLeg[] = [
          buildWalkLeg(
            `${sig}_w1`,
            origin.shortName,
            `${primaryOriginStop.name} (${primaryOriginStop.id})`,
            { lat: origin.lat, lng: origin.lng },
            { lat: primaryOriginStop.lat, lng: primaryOriginStop.lng },
            oShelter.shelterPct,
            oShelter.description,
            weather,
            primaryOriginStop.id
          ),
          buildBusLeg(`${sig}_b1`, c1, slice1, tickOffsetSec),
          buildWalkLeg(
            `${sig}_w_tx`,
            `${transferStop.name} Bay A`,
            `${transferStop.name} Bay B`,
            { lat: transferStop.lat, lng: transferStop.lng },
            { lat: transferStop.lat + 0.0005, lng: transferStop.lng + 0.0005 },
            transferStop.hasShelter ? 94 : 25,
            transferStop.hasShelter
              ? `Sheltered transfer concourse at ${transferStop.name}`
              : `Open footpath crossing at ${transferStop.name}`,
            weather,
            transferStop.id,
            transferStop.id
          ),
          buildBusLeg(`${sig}_b2`, c2, slice2, tickOffsetSec + 120),
          buildWalkLeg(
            `${sig}_w2`,
            `${primaryDestStop.name} (${primaryDestStop.id})`,
            destination.shortName,
            { lat: primaryDestStop.lat, lng: primaryDestStop.lng },
            { lat: destination.lat, lng: destination.lng },
            dShelter.shelterPct,
            dShelter.description,
            weather,
            undefined,
            primaryDestStop.id
          ),
        ];

        candidates.push(
          finalizeRoute(
            sig,
            `Bus ${c1.serviceNo} → ${c2.serviceNo} via ${transferStop.name}`,
            legs,
            weather,
            mode
          )
        );
      }
    }
  }

  // 3. Ensure at least 3 distinct, realistic Singapore options exist for any pair
  //    (e.g., adding a "Sheltered Linkway Express" and "Short Walk Direct" comparison when graph paths are sparse)
  if (candidates.length < 3) {
    const directDist = haversineDistanceKm(origin, destination);
    const fallbackStops = SINGAPORE_BUS_STOPS.filter(
      (s) => s.id !== primaryOriginStop.id && s.id !== primaryDestStop.id && s.hasShelter
    ).sort(
      (a, b) =>
        haversineDistanceKm(origin, a) +
        haversineDistanceKm(a, destination) -
        (haversineDistanceKm(origin, b) + haversineDistanceKm(b, destination))
    );
    const hub = fallbackStops[0] ?? STOP_MAP.get('08057')!;

    const seed = deterministicHash(`${origin.id}_${destination.id}`);
    const fallbackSvc1 = primaryOriginStop.services[0] ?? '14';
    const fallbackSvc2 = primaryDestStop.services[0] ?? '106';

    const makeSyntheticRoute = (
      suffix: string,
      title: string,
      svcA: string,
      svcB: string | null,
      walkShelterPct: number,
      walkDesc: string,
      speedBoost: number,
      distFactor: number
    ) => {
      const legs: RouteLeg[] = [
        buildWalkLeg(
          `syn_${suffix}_w1`,
          origin.shortName,
          `${primaryOriginStop.name} (${primaryOriginStop.id})`,
          { lat: origin.lat, lng: origin.lng },
          { lat: primaryOriginStop.lat, lng: primaryOriginStop.lng },
          walkShelterPct,
          walkDesc,
          weather,
          primaryOriginStop.id
        ),
      ];

      const arrivals1 = getBusStopArrivals(primaryOriginStop.id, tickOffsetSec);
      const wait1 = arrivals1.services[0]?.nextBus.minutesAway ?? 3 + (seed % 5);

      if (!svcB) {
        const rideKm = Math.max(1.6, Math.round(directDist * distFactor * 10) / 10);
        const rideMin = Math.max(6, Math.round((rideKm / (23 * speedBoost)) * 60));
        legs.push({
          id: `syn_${suffix}_b1`,
          type: 'bus',
          fromLabel: `${primaryOriginStop.name} (${primaryOriginStop.id})`,
          toLabel: `${primaryDestStop.name} (${primaryDestStop.id})`,
          fromStopCode: primaryOriginStop.id,
          toStopCode: primaryDestStop.id,
          fromCoords: { lat: primaryOriginStop.lat, lng: primaryOriginStop.lng },
          toCoords: { lat: primaryDestStop.lat, lng: primaryDestStop.lng },
          waypoints: [
            { lat: primaryOriginStop.lat, lng: primaryOriginStop.lng },
            { lat: (primaryOriginStop.lat + primaryDestStop.lat) / 2 + 0.004, lng: (primaryOriginStop.lng + primaryDestStop.lng) / 2 - 0.004 },
            { lat: primaryDestStop.lat, lng: primaryDestStop.lng },
          ],
          durationMin: rideMin,
          distanceKm: rideKm,
          serviceNo: svcA,
          operator: getOperatorForService(svcA),
          stopsCount: Math.max(4, Math.round(rideKm * 2.2)),
          waitTimeMin: wait1,
          nextArrivalMin: wait1,
          busLoad: 'SEA',
          busType: 'DD',
          boardingStopSheltered: primaryOriginStop.hasShelter,
        });
      } else {
        const leg1Km = Math.max(1.2, Math.round(haversineDistanceKm(primaryOriginStop, hub) * 1.25 * 10) / 10);
        const leg2Km = Math.max(1.2, Math.round(haversineDistanceKm(hub, primaryDestStop) * 1.25 * 10) / 10);
        legs.push({
          id: `syn_${suffix}_b1`,
          type: 'bus',
          fromLabel: `${primaryOriginStop.name} (${primaryOriginStop.id})`,
          toLabel: `${hub.name} (${hub.id})`,
          fromStopCode: primaryOriginStop.id,
          toStopCode: hub.id,
          fromCoords: { lat: primaryOriginStop.lat, lng: primaryOriginStop.lng },
          toCoords: { lat: hub.lat, lng: hub.lng },
          waypoints: [
            { lat: primaryOriginStop.lat, lng: primaryOriginStop.lng },
            { lat: hub.lat, lng: hub.lng },
          ],
          durationMin: Math.max(5, Math.round((leg1Km / 24) * 60)),
          distanceKm: leg1Km,
          serviceNo: svcA,
          operator: getOperatorForService(svcA),
          stopsCount: Math.max(3, Math.round(leg1Km * 2)),
          waitTimeMin: wait1,
          nextArrivalMin: wait1,
          busLoad: 'SEA',
          busType: 'DD',
          boardingStopSheltered: primaryOriginStop.hasShelter,
        });
        legs.push(
          buildWalkLeg(
            `syn_${suffix}_wtx`,
            `${hub.name} Concourse`,
            `${hub.name} Boarding Bay`,
            { lat: hub.lat, lng: hub.lng },
            { lat: hub.lat + 0.0004, lng: hub.lng + 0.0004 },
            95,
            `Covered interchange linkway at ${hub.name}`,
            weather,
            hub.id,
            hub.id
          )
        );
        legs.push({
          id: `syn_${suffix}_b2`,
          type: 'bus',
          fromLabel: `${hub.name} (${hub.id})`,
          toLabel: `${primaryDestStop.name} (${primaryDestStop.id})`,
          fromStopCode: hub.id,
          toStopCode: primaryDestStop.id,
          fromCoords: { lat: hub.lat, lng: hub.lng },
          toCoords: { lat: primaryDestStop.lat, lng: primaryDestStop.lng },
          waypoints: [
            { lat: hub.lat, lng: hub.lng },
            { lat: primaryDestStop.lat, lng: primaryDestStop.lng },
          ],
          durationMin: Math.max(5, Math.round((leg2Km / 25) * 60)),
          distanceKm: leg2Km,
          serviceNo: svcB,
          operator: getOperatorForService(svcB),
          stopsCount: Math.max(3, Math.round(leg2Km * 2)),
          waitTimeMin: 3,
          nextArrivalMin: 3,
          busLoad: 'SDA',
          busType: 'SD',
          boardingStopSheltered: true,
        });
      }

      legs.push(
        buildWalkLeg(
          `syn_${suffix}_w2`,
          `${primaryDestStop.name} (${primaryDestStop.id})`,
          destination.shortName,
          { lat: primaryDestStop.lat, lng: primaryDestStop.lng },
          { lat: destination.lat, lng: destination.lng },
          walkShelterPct,
          walkDesc,
          weather,
          undefined,
          primaryDestStop.id
        )
      );

      return finalizeRoute(`syn_${suffix}`, title, legs, weather, mode);
    };

    if (!candidates.some((c) => c.transfers === 0)) {
      candidates.push(
        makeSyntheticRoute(
          'trunk',
          `Express Corridor ${fallbackSvc1}`,
          fallbackSvc1,
          null,
          42,
          'Direct open street crossing to express bus bay',
          1.18,
          1.22
        )
      );
    }

    candidates.push(
      makeSyntheticRoute(
        'sheltered_hub',
        `Bus ${fallbackSvc1} → ${fallbackSvc2} via ${hub.name}`,
        fallbackSvc1,
        fallbackSvc2,
        94,
        `Covered MRT underpass & sheltered linkway via ${hub.name}`,
        0.95,
        1.34
      )
    );

    if (candidates.length < 3) {
      const altSvc = primaryOriginStop.services[1] ?? '65';
      candidates.push(
        makeSyntheticRoute(
          'short_dist',
          `Direct Trunk ${altSvc}`,
          altSvc,
          null,
          65,
          'Standard HDB covered walkway & open crossing',
          0.92,
          1.16
        )
      );
    }
  }

  // Deduplicate by serviceChain and keep top 5 diverse routes
  const deduped: ComputedBusRoute[] = [];
  const seenChains = new Set<string>();
  const sortedByScore = [...candidates].sort((a, b) => a.score - b.score);

  for (const route of sortedByScore) {
    const chainKey = `${route.serviceChain.join('->')}_${route.legs[0]?.toStopCode}`;
    if (!seenChains.has(chainKey)) {
      seenChains.add(chainKey);
      deduped.push(route);
    }
    if (deduped.length >= 4) break;
  }

  // Assign crisp human recommendation labels based on comparative strengths
  if (deduped.length > 0) {
    const minRain = Math.min(...deduped.map((r) => r.uncoveredExposureMin));
    const minTime = Math.min(...deduped.map((r) => r.totalDurationMin));
    const minDist = Math.min(...deduped.map((r) => r.totalDistanceKm));

    deduped.forEach((route, idx) => {
      if (idx === 0) {
        if (mode === 'least_rain') route.recommendationTag = 'Lowest Rain Exposure';
        else if (mode === 'fastest') route.recommendationTag = 'Fastest Arrival';
        else if (mode === 'shortest') route.recommendationTag = 'Shortest Distance';
        else route.recommendationTag = 'Best Overall Efficiency';
      } else if (route.uncoveredExposureMin === minRain && route.uncoveredExposureMin < deduped[0].uncoveredExposureMin) {
        route.recommendationTag = 'Least Rain Exposure';
      } else if (route.totalDurationMin === minTime) {
        route.recommendationTag = 'Fastest Travel Time';
      } else if (route.totalDistanceKm === minDist) {
        route.recommendationTag = 'Shortest Distance';
      } else {
        route.recommendationTag = route.transfers === 0 ? 'No Transfer Option' : 'Alternative Transfer';
      }
    });
  }

  return deduped;
}
