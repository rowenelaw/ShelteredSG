import React, { useMemo, useState } from 'react';
import { Bookmark, Bus, CloudRain, Search, ShieldCheck } from 'lucide-react';
import { SINGAPORE_BUS_STOPS } from '../data/singaporeTransitData';
import { getBusStopArrivals } from '../services/transitService';
import { sampleRainAtCoords } from '../services/weatherService';
import { BusLoad, BusStop, WeatherSnapshot } from '../types/transit';

interface LiveBusArrivalsViewProps {
  selectedStopId: string;
  onSelectStopId: (id: string) => void;
  savedStopIds: string[];
  onToggleSaveStop: (id: string) => void;
  weather: WeatherSnapshot;
  tickOffsetSec: number;
  onUseStopAsOrigin: (stop: BusStop) => void;
  onUseStopAsDestination: (stop: BusStop) => void;
}

function getLoadDisplay(load: BusLoad): { label: string; colorClass: string } {
  if (load === 'LSD') return { label: 'Limited Standing', colorClass: 'text-red-700' };
  if (load === 'SDA') return { label: 'Standing Available', colorClass: 'text-amber-700' };
  return { label: 'Seats Available', colorClass: 'text-emerald-700' };
}

function formatBusType(type: 'SD' | 'DD' | 'BD'): string {
  if (type === 'DD') return 'Double Deck';
  if (type === 'BD') return 'Bendy';
  return 'Single Deck';
}

export const LiveBusArrivalsView: React.FC<LiveBusArrivalsViewProps> = ({
  selectedStopId,
  onSelectStopId,
  savedStopIds,
  onToggleSaveStop,
  weather,
  tickOffsetSec,
  onUseStopAsOrigin,
  onUseStopAsDestination,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const filteredStops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SINGAPORE_BUS_STOPS;
    return SINGAPORE_BUS_STOPS.filter(
      (s) =>
        s.id.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.roadName.toLowerCase().includes(q) ||
        s.services.some((svc) => svc.toLowerCase() === q)
    );
  }, [searchQuery]);

  const activeStop =
    SINGAPORE_BUS_STOPS.find((s) => s.id === selectedStopId) ?? SINGAPORE_BUS_STOPS[0];

  const arrivalData = useMemo(
    () => getBusStopArrivals(activeStop.id, tickOffsetSec),
    [activeStop.id, tickOffsetSec]
  );

  const visibleServices = useMemo(() => {
    const f = serviceFilter.trim().toLowerCase();
    if (!f) return arrivalData.services;
    return arrivalData.services.filter(
      (s) =>
        s.serviceNo.toLowerCase().includes(f) ||
        s.destinationName.toLowerCase().includes(f)
    );
  }, [arrivalData.services, serviceFilter]);

  const stopRain = useMemo(
    () => sampleRainAtCoords(activeStop.lat, activeStop.lng, weather),
    [activeStop.lat, activeStop.lng, weather]
  );

  const isSaved = savedStopIds.includes(activeStop.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
      {/* Left Bus Stop Directory */}
      <aside className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Singapore Bus Stops
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Search by 5-digit stop code, road, or bus service
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. 09048, Orchard, 106"
            aria-label="Filter Singapore bus stops"
            className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
          />
        </div>

        <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
          {filteredStops.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No matching bus stops found. Try codes like 09048, 03218, or 28009.
            </div>
          ) : (
            filteredStops.map((stop) => {
              const isSelected = stop.id === activeStop.id;
              return (
                <button
                  key={stop.id}
                  type="button"
                  onClick={() => onSelectStopId(stop.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {stop.name}
                    </span>
                    <span className="font-mono text-xs font-semibold text-blue-700 shrink-0 tabular-nums">
                      {stop.id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="truncate">{stop.roadName}</span>
                    <span className="shrink-0">
                      {stop.hasShelter ? 'Sheltered' : 'Unsheltered'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Live Arrival Board */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5 text-xs text-slate-500 font-mono tabular-nums">
              <span>Stop {activeStop.id}</span>
              <span aria-hidden="true">·</span>
              <span className="font-sans">{activeStop.roadName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-sans">{activeStop.region} Region</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              {activeStop.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1.5 text-slate-700">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    activeStop.hasShelter ? 'text-emerald-700' : 'text-amber-600'
                  }`}
                />
                {activeStop.hasShelter
                  ? activeStop.coveredLinkwayTo ?? 'Sheltered Boarding Stop'
                  : 'Open Roadside Stop (No Roof)'}
              </span>
              <span className="flex items-center gap-1.5 text-slate-700 font-mono tabular-nums">
                <CloudRain className="w-4 h-4 text-blue-600" />
                {stopRain.rainfallMmHr.toFixed(1)} mm/hr ({stopRain.severity})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleSaveStop(activeStop.id)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isSaved
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              {isSaved ? 'Saved Stop' : 'Save Stop'}
            </button>
            <button
              type="button"
              onClick={() => onUseStopAsOrigin(activeStop)}
              className="px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Route From Here
            </button>
            <button
              type="button"
              onClick={() => onUseStopAsDestination(activeStop)}
              className="px-3 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
            >
              Route To Here
            </button>
          </div>
        </div>

        {/* Service Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-700">
            Live Bus Arrivals ({visibleServices.length} services)
          </div>
          <input
            type="text"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            placeholder="Filter bus service (e.g. 106)"
            aria-label="Filter bus services at this stop"
            className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 w-56"
          />
        </div>

        {/* Arrival Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Service</th>
                <th className="py-2.5 px-4">Direction / Operator</th>
                <th className="py-2.5 px-4 text-right">Next Bus</th>
                <th className="py-2.5 px-4 text-right">2nd Bus</th>
                <th className="py-2.5 px-4 text-right">3rd Bus</th>
                <th className="py-2.5 px-4">Capacity & Fleet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleServices.map((svc) => {
                const load = getLoadDisplay(svc.nextBus.load);
                return (
                  <tr key={svc.serviceNo} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Bus className="w-4 h-4 text-blue-700 shrink-0" />
                        <span className="font-mono font-bold text-base text-slate-900 tabular-nums">
                          {svc.serviceNo}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        Towards {svc.destinationName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {svc.operator} · {svc.nextBus.feature === 'WAB' ? 'Wheelchair Accessible' : 'Standard'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={`text-base font-bold ${
                          svc.nextBus.minutesAway <= 1
                            ? 'text-emerald-700'
                            : svc.nextBus.minutesAway <= 5
                            ? 'text-blue-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {svc.nextBus.minutesAway === 0 ? 'Arr' : `${svc.nextBus.minutesAway} min`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {svc.nextBus2 ? `${svc.nextBus2.minutesAway} min` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {svc.nextBus3 ? `${svc.nextBus3.minutesAway} min` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className={`text-xs font-medium ${load.colorClass}`}>
                        {load.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatBusType(svc.nextBus.type)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
