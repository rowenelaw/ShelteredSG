import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DiscussionEmbed } from 'disqus-react';
import { LiveBusArrivalsView } from './components/LiveBusArrivalsView';
import { RainRadarView } from './components/RainRadarView';
import { RoutePlannerView } from './components/RoutePlannerView';
import { SavedStopsView } from './components/SavedStopsView';
import { SINGAPORE_LOCATIONS } from './data/singaporeTransitData';
import { getWeatherSnapshot } from './services/weatherService';
import {
  BusStop,
  OptimizationMode,
  SavedCommute,
  SingaporeLocation,
  WeatherScenarioId,
} from './types/transit';

type ActiveTab = 'planner' | 'arrivals' | 'radar' | 'saved';

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'planner', label: 'Route Planner' },
  { id: 'arrivals', label: 'Bus Arrivals' },
  { id: 'radar', label: 'Rain Radar' },
  { id: 'saved', label: 'Saved Stops' },
];

const DEFAULT_SAVED_STOPS = ['09048', '03509', '28009'];

const DEFAULT_SAVED_COMMUTES: SavedCommute[] = [
  {
    id: 'commute_orchard_mbs',
    label: 'Orchard ION → Marina Bay Sands',
    originId: 'loc_orchard',
    destinationId: 'loc_marina_bay',
    preferredMode: 'balanced',
  },
  {
    id: 'commute_je_nus',
    label: 'Jurong East → NUS Kent Ridge',
    originId: 'loc_jurong_east',
    destinationId: 'loc_nus',
    preferredMode: 'least_rain',
  },
];

function stopToLocation(stop: BusStop): SingaporeLocation {
  return {
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
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('planner');
  const [origin, setOrigin] = useState<SingaporeLocation>(SINGAPORE_LOCATIONS[0]); // Orchard
  const [destination, setDestination] = useState<SingaporeLocation>(SINGAPORE_LOCATIONS[1]); // Marina Bay Sands
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('balanced');
  const [weatherScenario, setWeatherScenario] = useState<WeatherScenarioId>('live_monsoon');
  const [selectedStopId, setSelectedStopId] = useState<string>('09048');

  const [tickOffsetSec, setTickOffsetSec] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [savedStopIds, setSavedStopIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('shelteredsg_saved_stops');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SAVED_STOPS;
  });

  const [savedCommutes, setSavedCommutes] = useState<SavedCommute[]>(() => {
    try {
      const raw = localStorage.getItem('shelteredsg_saved_commutes');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SAVED_COMMUTES;
  });

  useEffect(() => {
    try {
      localStorage.setItem('shelteredsg_saved_stops', JSON.stringify(savedStopIds));
    } catch {
      // ignore storage errors
    }
  }, [savedStopIds]);

  useEffect(() => {
    try {
      localStorage.setItem('shelteredsg_saved_commutes', JSON.stringify(savedCommutes));
    } catch {
      // ignore storage errors
    }
  }, [savedCommutes]);

  // Live countdown ticker every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTickOffsetSec((prev) => prev + 15);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const weather = useMemo(
    () => getWeatherSnapshot(weatherScenario, 0),
    [weatherScenario]
  );

  const disqusConfig = useMemo(
    () => ({
      url: typeof window !== 'undefined' ? window.location.href : '',
      identifier: 'shelteredsg-main',
      title: 'ShelteredSG — Rain-Aware Singapore Bus Routing',
      language: 'en',
    }),
    []
  );

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTickOffsetSec((prev) => prev + 15);
    setTimeout(() => setIsRefreshing(false), 350);
  };

  const handleToggleSaveStop = (stopId: string) => {
    setSavedStopIds((prev) =>
      prev.includes(stopId) ? prev.filter((id) => id !== stopId) : [stopId, ...prev]
    );
  };

  const handleSaveCommute = (
    orig: SingaporeLocation,
    dest: SingaporeLocation,
    mode: OptimizationMode
  ) => {
    const newItem: SavedCommute = {
      id: `commute_${orig.id}_${dest.id}`,
      label: `${orig.shortName} → ${dest.shortName}`,
      originId: orig.id,
      destinationId: dest.id,
      preferredMode: mode,
    };
    setSavedCommutes((prev) => {
      const filtered = prev.filter((c) => c.id !== newItem.id);
      return [newItem, ...filtered];
    });
  };

  const handleInspectStopInBoard = (stopId: string) => {
    setSelectedStopId(stopId);
    setActiveTab('arrivals');
  };

  const handleLoadCommute = (commute: SavedCommute) => {
    const foundOrigin = SINGAPORE_LOCATIONS.find((l) => l.id === commute.originId);
    const foundDest = SINGAPORE_LOCATIONS.find((l) => l.id === commute.destinationId);
    if (foundOrigin && foundDest) {
      setOrigin(foundOrigin);
      setDestination(foundDest);
      setOptimizationMode(commute.preferredMode);
      setActiveTab('planner');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation Bar: Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('planner');
            }}
            className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ShelteredSG
          </a>

          {/* Zone 2: 4 Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-blue-600 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh Live Data
            </button>
          </div>
        </div>

        {/* Compact Mobile Sub-Nav */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-slate-100 px-3 py-1.5 flex items-center gap-1 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-5">
        {activeTab === 'planner' && (
          <RoutePlannerView
            origin={origin}
            destination={destination}
            onChangeOrigin={setOrigin}
            onChangeDestination={setDestination}
            optimizationMode={optimizationMode}
            onChangeMode={setOptimizationMode}
            weatherScenario={weatherScenario}
            onChangeWeatherScenario={setWeatherScenario}
            weather={weather}
            tickOffsetSec={tickOffsetSec}
            onSaveCommute={handleSaveCommute}
            onInspectStopInBoard={handleInspectStopInBoard}
          />
        )}

        {activeTab === 'arrivals' && (
          <LiveBusArrivalsView
            selectedStopId={selectedStopId}
            onSelectStopId={setSelectedStopId}
            savedStopIds={savedStopIds}
            onToggleSaveStop={handleToggleSaveStop}
            weather={weather}
            tickOffsetSec={tickOffsetSec}
            onUseStopAsOrigin={(stop) => {
              setOrigin(stopToLocation(stop));
              setActiveTab('planner');
            }}
            onUseStopAsDestination={(stop) => {
              setDestination(stopToLocation(stop));
              setActiveTab('planner');
            }}
          />
        )}

        {activeTab === 'radar' && (
          <RainRadarView
            weatherScenario={weatherScenario}
            onChangeWeatherScenario={setWeatherScenario}
          />
        )}

        {activeTab === 'saved' && (
          <SavedStopsView
            savedStopIds={savedStopIds}
            onRemoveStop={(id) =>
              setSavedStopIds((prev) => prev.filter((item) => item !== id))
            }
            onInspectStop={handleInspectStopInBoard}
            savedCommutes={savedCommutes}
            onRemoveCommute={(id) =>
              setSavedCommutes((prev) => prev.filter((c) => c.id !== id))
            }
            onLoadCommute={handleLoadCommute}
            weather={weather}
            tickOffsetSec={tickOffsetSec}
          />
        )}

        <DiscussionEmbed
          shortname='shelteredsg'
          config={disqusConfig}
        />
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            ShelteredSG · Singapore Weather-Aware Bus Routing & Live Arrival Frontend
          </span>
          <span>
            Simulated LTA DataMall & NEA rainfall datasets ready for live API connection
          </span>
        </div>
      </footer>
    </div>
  );
}
