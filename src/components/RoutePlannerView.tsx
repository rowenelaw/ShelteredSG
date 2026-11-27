import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Bookmark,
  Bus,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudRain,
  Footprints,
  Navigation,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { SINGAPORE_LOCATIONS } from '../data/singaporeTransitData';
import {
  computeEfficientBusRoutes,
  getBusStopArrivals,
} from '../services/transitService';
import { sampleRainAtCoords, WEATHER_SCENARIOS } from '../services/weatherService';
import {
  BusLoad,
  BusStop,
  OptimizationMode,
  SingaporeLocation,
  WeatherScenarioId,
  WeatherSnapshot,
} from '../types/transit';
import { LocationSearchInput } from './LocationSearchInput';
import { SingaporeTransitMap } from './SingaporeTransitMap';

interface RoutePlannerViewProps {
  origin: SingaporeLocation;
  destination: SingaporeLocation;
  onChangeOrigin: (loc: SingaporeLocation) => void;
  onChangeDestination: (loc: SingaporeLocation) => void;
  optimizationMode: OptimizationMode;
  onChangeMode: (mode: OptimizationMode) => void;
  weatherScenario: WeatherScenarioId;
  onChangeWeatherScenario: (id: WeatherScenarioId) => void;
  weather: WeatherSnapshot;
  tickOffsetSec: number;
  onSaveCommute: (origin: SingaporeLocation, destination: SingaporeLocation, mode: OptimizationMode) => void;
  onInspectStopInBoard: (stopId: string) => void;
}

const PRESET_JOURNEYS: { label: string; fromId: string; toId: string }[] = [
  { label: 'Orchard → Marina Bay', fromId: 'loc_orchard', toId: 'loc_marina_bay' },
  { label: 'Jurong East → NUS', fromId: 'loc_jurong_east', toId: 'loc_nus' },
  { label: 'Tampines → Bugis', fromId: 'loc_tampines', toId: 'loc_bugis' },
  { label: 'Woodlands → Raffles Pl', fromId: 'loc_woodlands', toId: 'loc_raffles_place' },
];

const MODE_OPTIONS: { id: OptimizationMode; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'least_rain', label: 'Least Rain' },
  { id: 'fastest', label: 'Fastest' },
  { id: 'shortest', label: 'Shortest' },
];

function formatLoadLabel(load?: BusLoad): { text: string; className: string } {
  if (load === 'LSD') return { text: 'Limited Standing', className: 'text-red-700' };
  if (load === 'SDA') return { text: 'Standing Available', className: 'text-amber-700' };
  return { text: 'Seats Available', className: 'text-emerald-700' };
}

export const RoutePlannerView: React.FC<RoutePlannerViewProps> = ({
  origin,
  destination,
  onChangeOrigin,
  onChangeDestination,
  optimizationMode,
  onChangeMode,
  weatherScenario,
  onChangeWeatherScenario,
  weather,
  tickOffsetSec,
  onSaveCommute,
  onInspectStopInBoard,
}) => {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [expandedLegsRouteId, setExpandedLegsRouteId] = useState<string | null>(null);
  const [mapSelectedStop, setMapSelectedStop] = useState<BusStop | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const routes = useMemo(
    () =>
      computeEfficientBusRoutes(
        origin,
        destination,
        weather,
        optimizationMode,
        tickOffsetSec
      ),
    [origin, destination, weather, optimizationMode, tickOffsetSec]
  );

  const activeRoute =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  const originRain = useMemo(
    () => sampleRainAtCoords(origin.lat, origin.lng, weather),
    [origin, weather]
  );
  const destRain = useMemo(
    () => sampleRainAtCoords(destination.lat, destination.lng, weather),
    [destination, weather]
  );

  const mapStopArrivals = useMemo(() => {
    if (!mapSelectedStop) return null;
    return getBusStopArrivals(mapSelectedStop.id, tickOffsetSec);
  }, [mapSelectedStop, tickOffsetSec]);

  const handleSwap = () => {
    const prevOrigin = origin;
    onChangeOrigin(destination);
    onChangeDestination(prevOrigin);
    setSelectedRouteId(null);
  };

  const handleBookmark = () => {
    onSaveCommute(origin, destination, optimizationMode);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  const applyPreset = (fromId: string, toId: string) => {
    const fromLoc = SINGAPORE_LOCATIONS.find((l) => l.id === fromId);
    const toLoc = SINGAPORE_LOCATIONS.find((l) => l.id === toId);
    if (fromLoc && toLoc) {
      onChangeOrigin(fromLoc);
      onChangeDestination(toLoc);
      setSelectedRouteId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-5 items-start">
      {/* Left Route Search & Optimization Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
            Journey Planner
          </h1>
          <button
            type="button"
            onClick={handleBookmark}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {justSaved ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                Saved
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5" />
                Save Route
              </>
            )}
          </button>
        </div>

        {/* Origin & Destination Inputs */}
        <div className="space-y-2.5 relative">
          <LocationSearchInput
            label="Start Location"
            placeholder="Search MRT, landmark, or 5-digit stop code"
            value={origin}
            onSelect={(loc) => {
              onChangeOrigin(loc);
              setSelectedRouteId(null);
            }}
            markerTone="origin"
          />

          <div className="flex justify-end -my-1 pr-1">
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap start and destination locations"
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <ArrowUpDown className="w-3 h-3" />
              Swap
            </button>
          </div>

          <LocationSearchInput
            label="End Location"
            placeholder="Search destination in Singapore"
            value={destination}
            onSelect={(loc) => {
              onChangeDestination(loc);
              setSelectedRouteId(null);
            }}
            markerTone="destination"
          />
        </div>

        {/* Quick Preset Commutes */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {PRESET_JOURNEYS.map((preset) => {
            const isCurrent = origin.id === preset.fromId && destination.id === preset.toId;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.fromId, preset.toId)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Optimization Mode Segmented Bar */}
        <div className="pt-1 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">
              Route Priority
            </span>
            <span className="text-xs text-slate-500">
              Weather · Time · Distance
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChangeMode(opt.id);
                  setSelectedRouteId(null);
                }}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                  optimizationMode === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Weather Situation & Scenario Simulator */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              {weather.maxRainfallMmHr > 0.5 ? (
                <CloudRain className="w-4 h-4 text-blue-600 shrink-0" />
              ) : (
                <Sun className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>Corridor Rain Status</span>
            </div>
            <select
              aria-label="Simulate Singapore weather condition"
              value={weatherScenario}
              onChange={(e) => onChangeWeatherScenario(e.target.value as WeatherScenarioId)}
              className="text-xs font-medium bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:border-blue-600"
            >
              {WEATHER_SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs pt-0.5">
            <div>
              <span className="text-slate-500">At {origin.shortName}:</span>
              <div className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                {originRain.rainfallMmHr.toFixed(1)} mm/hr · {originRain.severity}
              </div>
            </div>
            <div>
              <span className="text-slate-500">At {destination.shortName}:</span>
              <div className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                {destRain.rainfallMmHr.toFixed(1)} mm/hr · {destRain.severity}
              </div>
            </div>
          </div>
        </div>

        {/* Recommended Routes List */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              {routes.length} Suggested Bus Routes
            </span>
            <span>Ranked for {MODE_OPTIONS.find((m) => m.id === optimizationMode)?.label}</span>
          </div>

          {routes.length === 0 ? (
            <div className="p-6 text-center border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-600">
              Start and end locations are identical. Choose a different destination to calculate bus routes.
            </div>
          ) : (
            <div className="space-y-2.5">
              {routes.map((route, idx) => {
                const isSelected = activeRoute?.id === route.id;
                const isExpanded = expandedLegsRouteId === route.id || (isSelected && expandedLegsRouteId === null && idx === 0);

                return (
                  <div
                    key={route.id}
                    className={`rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRouteId(route.id);
                        setExpandedLegsRouteId(route.id);
                      }}
                      className="w-full text-left p-3.5 focus:outline-none"
                    >
                      {/* Top line: Recommendation tag & live arrival */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span
                          className={`font-semibold ${
                            idx === 0 ? 'text-blue-700' : 'text-slate-600'
                          }`}
                        >
                          {route.recommendationTag}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600">
                          Next bus{' '}
                          <strong className="text-slate-900">
                            {route.nextBusMin === 0 ? 'Arr' : `${route.nextBusMin} min`}
                          </strong>
                        </span>
                      </div>

                      {/* Route Service Chain + Total Time */}
                      <div className="flex items-baseline justify-between gap-3 mt-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Bus className="w-4 h-4 text-blue-700 shrink-0" />
                          <span className="font-display font-semibold text-base text-slate-900 truncate">
                            Bus {route.serviceChain.join(' → ')}
                          </span>
                        </div>
                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <span className="text-base font-bold text-slate-900">
                            {route.totalDurationMin} min
                          </span>
                        </div>
                      </div>

                      {/* Clean Unboxed Metadata Row */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 mt-1.5 tabular-nums">
                        <span>{route.totalDistanceKm.toFixed(1)} km</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            route.shelterCoveragePct >= 80
                              ? 'text-emerald-700 font-medium'
                              : route.uncoveredExposureMin >= 3
                              ? 'text-amber-700 font-medium'
                              : 'text-slate-700'
                          }
                        >
                          {route.shelterCoveragePct}% sheltered ({route.uncoveredWalkMeters}m uncovered)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>${route.estimatedFareSgd.toFixed(2)}</span>
                      </div>

                      {/* Rain Exposure Summary */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-600 truncate">
                          {route.rainImpactNote}
                        </span>
                        <span className="text-blue-700 font-medium shrink-0 flex items-center gap-0.5">
                          {isExpanded ? (
                            <>
                              Hide <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              Steps <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Expandable Step-by-Step Itinerary */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-100 space-y-2.5">
                        {route.legs.map((leg) => {
                          if (leg.type === 'walk') {
                            const isHighShelter = (leg.shelterPct ?? 0) >= 75;
                            return (
                              <div key={leg.id} className="flex items-start gap-2.5 text-xs">
                                <Footprints
                                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                                    isHighShelter ? 'text-emerald-700' : 'text-amber-600'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-slate-900 truncate">
                                      Walk to {leg.toLabel}
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-600 shrink-0">
                                      {leg.durationMin} min · {Math.round(leg.distanceKm * 1000)}m
                                    </span>
                                  </div>
                                  <div className="text-slate-500 mt-0.5">
                                    {leg.shelterDescription} ({leg.shelterPct}% covered
                                    {(leg.rainIntensityMmHr ?? 0) >= 0.5
                                      ? ` · ${leg.rainIntensityMmHr?.toFixed(1)} mm/hr rain`
                                      : ''}
                                    )
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const loadInfo = formatLoadLabel(leg.busLoad);
                          return (
                            <div key={leg.id} className="flex items-start gap-2.5 text-xs">
                              <Bus className="w-4 h-4 mt-0.5 shrink-0 text-blue-700" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-900">
                                    Board Bus {leg.serviceNo} ({leg.operator})
                                  </span>
                                  <span className="font-mono tabular-nums text-slate-700 shrink-0">
                                    {leg.durationMin} min · {leg.distanceKm.toFixed(1)} km
                                  </span>
                                </div>
                                <div className="text-slate-600 mt-0.5">
                                  {leg.fromLabel} → {leg.toLabel}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 font-mono tabular-nums text-[11px]">
                                  <span className="text-blue-700 font-semibold">
                                    Arrives in {leg.nextArrivalMin === 0 ? 'Arr' : `${leg.nextArrivalMin} min`}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className={loadInfo.className}>{loadInfo.text}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-500">
                                    {leg.boardingStopSheltered ? 'Sheltered Stop' : 'Open Stop'}
                                  </span>
                                  {leg.fromStopCode && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <button
                                        type="button"
                                        onClick={() => onInspectStopInBoard(leg.fromStopCode!)}
                                        className="text-blue-700 hover:underline font-sans font-medium"
                                      >
                                        Live Stop Board
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Right Column: Interactive Map & Quick Stop Inspector */}
      <section className="space-y-4">
        <SingaporeTransitMap
          weather={weather}
          origin={origin}
          destination={destination}
          selectedRoute={activeRoute}
          selectedStopId={mapSelectedStop?.id ?? null}
          onSelectStop={(stop) => setMapSelectedStop(stop)}
          heightClass="h-[520px] lg:h-[640px]"
        />

        {/* Selected Route Key Metrics Summary Strip */}
        {activeRoute && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                Total Journey Time
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {activeRoute.totalDurationMin} min
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Includes {activeRoute.nextBusMin === 0 ? '<1' : activeRoute.nextBusMin} min wait
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                Rain Protection
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {activeRoute.shelterCoveragePct}%
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {activeRoute.uncoveredWalkMeters}m exposed walk
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Navigation className="w-3.5 h-3.5" />
                Route Distance
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {activeRoute.totalDistanceKm.toFixed(1)} km
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {activeRoute.transfers === 0 ? 'Direct trip' : `${activeRoute.transfers} transfer`} · ${activeRoute.estimatedFareSgd.toFixed(2)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <CloudRain className="w-3.5 h-3.5 text-blue-600" />
                Corridor Rain Peak
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {activeRoute.avgRainIntensityMmHr.toFixed(1)} mm/h
              </div>
              <div className="text-xs text-slate-500 mt-0.5 capitalize">
                {activeRoute.peakRainSeverity} conditions
              </div>
            </div>
          </div>
        )}

        {/* Interactive Map Stop Arrival Drawer */}
        {mapSelectedStop && mapStopArrivals && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {mapSelectedStop.name}{' '}
                  <span className="font-mono text-slate-500">({mapSelectedStop.id})</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {mapSelectedStop.roadName} ·{' '}
                  {mapSelectedStop.hasShelter
                    ? mapSelectedStop.coveredLinkwayTo ?? 'Sheltered bus stop'
                    : 'Unsheltered stop'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onInspectStopInBoard(mapSelectedStop.id)}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  Open Full Stop Board
                </button>
                <button
                  type="button"
                  onClick={() => setMapSelectedStop(null)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {mapStopArrivals.services.slice(0, 4).map((svc) => (
                <div
                  key={svc.serviceNo}
                  className="border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-mono font-semibold text-sm text-slate-900">
                      {svc.serviceNo}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[90px]">
                      {svc.operator}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-sm font-bold text-blue-700">
                      {svc.nextBus.minutesAway === 0 ? 'Arr' : `${svc.nextBus.minutesAway}m`}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {svc.nextBus2 ? `${svc.nextBus2.minutesAway}m` : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
