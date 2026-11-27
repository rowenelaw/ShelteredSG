import React from 'react';
import { ArrowRight, Bookmark, Bus, CloudRain, ShieldCheck, Trash2 } from 'lucide-react';
import { SINGAPORE_BUS_STOPS, SINGAPORE_LOCATIONS } from '../data/singaporeTransitData';
import { getBusStopArrivals } from '../services/transitService';
import { sampleRainAtCoords } from '../services/weatherService';
import { SavedCommute, WeatherSnapshot } from '../types/transit';

interface SavedStopsViewProps {
  savedStopIds: string[];
  onRemoveStop: (id: string) => void;
  onInspectStop: (id: string) => void;
  savedCommutes: SavedCommute[];
  onRemoveCommute: (id: string) => void;
  onLoadCommute: (commute: SavedCommute) => void;
  weather: WeatherSnapshot;
  tickOffsetSec: number;
}

export const SavedStopsView: React.FC<SavedStopsViewProps> = ({
  savedStopIds,
  onRemoveStop,
  onInspectStop,
  savedCommutes,
  onRemoveCommute,
  onLoadCommute,
  weather,
  tickOffsetSec,
}) => {
  const savedStops = savedStopIds
    .map((id) => SINGAPORE_BUS_STOPS.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="space-y-6">
      {/* Saved Commutes */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Saved Commutes</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            One-click daily routes with live weather priority settings
          </p>
        </div>

        {savedCommutes.length === 0 ? (
          <div className="p-6 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-600">
            No saved commutes yet. Click "Save Route" in the Route Planner to bookmark your daily trips.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {savedCommutes.map((commute) => {
              const origin = SINGAPORE_LOCATIONS.find((l) => l.id === commute.originId);
              const dest = SINGAPORE_LOCATIONS.find((l) => l.id === commute.destinationId);
              if (!origin || !dest) return null;

              const oRain = sampleRainAtCoords(origin.lat, origin.lng, weather);
              const dRain = sampleRainAtCoords(dest.lat, dest.lng, weather);

              return (
                <div
                  key={commute.id}
                  className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="capitalize">{commute.preferredMode.replace('_', ' ')} priority</span>
                      <button
                        type="button"
                        onClick={() => onRemoveCommute(commute.id)}
                        aria-label={`Remove ${commute.label}`}
                        className="text-slate-400 hover:text-red-600 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                      <span className="truncate">{origin.shortName}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{dest.shortName}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums flex items-center gap-1.5">
                      <CloudRain className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        {oRain.rainfallMmHr.toFixed(1)} → {dRain.rainfallMmHr.toFixed(1)} mm/hr
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onLoadCommute(commute)}
                    className="w-full py-2 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Load in Route Planner
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved Bus Stops */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Saved Bus Stops</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Quick live arrival snapshots for your bookmarked stops
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {savedStops.length} stops
          </span>
        </div>

        {savedStops.length === 0 ? (
          <div className="p-6 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-600">
            No saved bus stops yet. Bookmark any stop from the Bus Arrivals view.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedStops.map((stop) => {
              const arrivals = getBusStopArrivals(stop.id, tickOffsetSec);
              const stopRain = sampleRainAtCoords(stop.lat, stop.lng, weather);

              return (
                <div
                  key={stop.id}
                  className="border border-slate-200 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <Bookmark className="w-3.5 h-3.5 text-blue-600" />
                        <span>Stop {stop.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{stop.roadName}</span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                        {stop.name}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                        <span className="flex items-center gap-1">
                          <ShieldCheck
                            className={`w-3.5 h-3.5 ${
                              stop.hasShelter ? 'text-emerald-700' : 'text-amber-600'
                            }`}
                          />
                          {stop.hasShelter ? 'Sheltered' : 'Unsheltered'}
                        </span>
                        <span className="font-mono tabular-nums">
                          {stopRain.rainfallMmHr.toFixed(1)} mm/hr
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveStop(stop.id)}
                      aria-label={`Remove stop ${stop.id}`}
                      className="text-slate-400 hover:text-red-600 p-1 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                    {arrivals.services.slice(0, 3).map((svc) => (
                      <div
                        key={svc.serviceNo}
                        className="bg-slate-50 border border-slate-200/70 rounded-md p-2 flex items-center justify-between"
                      >
                        <span className="font-mono font-semibold text-xs text-slate-900 flex items-center gap-1">
                          <Bus className="w-3 h-3 text-blue-700" />
                          {svc.serviceNo}
                        </span>
                        <span className="font-mono tabular-nums text-xs font-bold text-blue-700">
                          {svc.nextBus.minutesAway === 0
                            ? 'Arr'
                            : `${svc.nextBus.minutesAway}m`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectStop(stop.id)}
                    className="w-full py-1.5 px-3 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors"
                  >
                    Open Full Arrival Board
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
