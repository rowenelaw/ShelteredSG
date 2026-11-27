export type OptimizationMode = 'balanced' | 'least_rain' | 'fastest' | 'shortest';

export type WeatherScenarioId = 'live_monsoon' | 'west_squall' | 'cbd_drizzle' | 'dry_clear';

export type RainSeverity = 'dry' | 'light' | 'moderate' | 'heavy' | 'thundery';

export type BusLoad = 'SEA' | 'SDA' | 'LSD'; // LTA DataMall standard codes: Seats Available, Standing Available, Limited Standing

export type BusFeature = 'WAB' | 'STD'; // Wheelchair Accessible Bus

export type BusType = 'SD' | 'DD' | 'BD'; // Single Deck, Double Deck, Bendy

export type BusOperator = 'SBST' | 'SMRT' | 'TTS' | 'GAS';

export interface SingaporeLocation {
  id: string;
  name: string;
  shortName: string;
  category: 'MRT / Hub' | 'Commercial' | 'Campus' | 'Residential' | 'Airport';
  district: string;
  region: 'Central' | 'East' | 'West' | 'North' | 'North-East';
  lat: number;
  lng: number;
  nearbyStopIds: string[];
  /** Percentage of walkway sheltered to its primary bus stop */
  defaultShelterPct: number;
}

export interface BusStop {
  id: string; // 5-digit LTA BusStopCode, e.g., "09048"
  name: string;
  roadName: string;
  region: 'Central' | 'East' | 'West' | 'North' | 'North-East';
  lat: number;
  lng: number;
  hasShelter: boolean;
  coveredLinkwayTo?: string;
  services: string[];
}

export interface NextBusArrival {
  originCode: string;
  destinationCode: string;
  estimatedArrivalIso: string;
  minutesAway: number;
  load: BusLoad;
  feature: BusFeature;
  type: BusType;
  lat: number;
  lng: number;
}

export interface BusServiceArrival {
  serviceNo: string;
  operator: BusOperator;
  destinationName: string;
  nextBus: NextBusArrival;
  nextBus2: NextBusArrival | null;
  nextBus3: NextBusArrival | null;
}

export interface BusStopArrivalResponse {
  busStopCode: string;
  updatedAtIso: string;
  services: BusServiceArrival[];
}

export interface RainCell {
  id: string;
  areaName: string;
  region: 'Central' | 'East' | 'West' | 'North' | 'North-East';
  lat: number;
  lng: number;
  radiusKm: number;
  rainfallMmHr: number;
  severity: RainSeverity;
  forecast2Hr: string;
  windKmh: number;
  windDirection: string;
  lightningRisk: boolean;
}

export interface WeatherSnapshot {
  scenarioId: WeatherScenarioId;
  scenarioLabel: string;
  updatedAtIso: string;
  islandSummary: string;
  maxRainfallMmHr: number;
  windSummary: string;
  cells: RainCell[];
}

export interface RouteLeg {
  id: string;
  type: 'walk' | 'bus';
  fromLabel: string;
  toLabel: string;
  fromStopCode?: string;
  toStopCode?: string;
  fromCoords: { lat: number; lng: number };
  toCoords: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  durationMin: number;
  distanceKm: number;
  // Walk-specific shelter & rain metrics
  shelterPct?: number;
  shelterDescription?: string;
  uncoveredMeters?: number;
  uncoveredMinutes?: number;
  rainIntensityMmHr?: number;
  rainSeverity?: RainSeverity;
  // Bus-specific live metrics
  serviceNo?: string;
  operator?: BusOperator;
  stopsCount?: number;
  waitTimeMin?: number;
  nextArrivalMin?: number;
  busLoad?: BusLoad;
  busType?: BusType;
  boardingStopSheltered?: boolean;
}

export interface ComputedBusRoute {
  id: string;
  title: string;
  serviceChain: string[];
  transfers: number;
  totalDurationMin: number;
  totalDistanceKm: number;
  totalWalkMeters: number;
  uncoveredWalkMeters: number;
  uncoveredExposureMin: number;
  shelterCoveragePct: number;
  avgRainIntensityMmHr: number;
  peakRainSeverity: RainSeverity;
  nextBusMin: number;
  estimatedFareSgd: number;
  recommendationTag: string;
  rainImpactNote: string;
  score: number;
  legs: RouteLeg[];
}

export interface SavedCommute {
  id: string;
  label: string;
  originId: string;
  destinationId: string;
  preferredMode: OptimizationMode;
}
