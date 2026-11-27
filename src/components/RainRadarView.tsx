import React, { useEffect, useMemo, useState } from 'react';
import { CloudLightning, CloudRain, Pause, Play, Wind } from 'lucide-react';
import { getWeatherSnapshot, WEATHER_SCENARIOS } from '../services/weatherService';
import { RainSeverity, WeatherScenarioId } from '../types/transit';
import { SingaporeTransitMap } from './SingaporeTransitMap';

interface RainRadarViewProps {
  weatherScenario: WeatherScenarioId;
  onChangeWeatherScenario: (id: WeatherScenarioId) => void;
}

const FORECAST_STEPS = [0, 15, 30, 60, 90, 120];

const REGION_FILTERS = ['All', 'Central', 'East', 'West', 'North', 'North-East'] as const;

function getSeverityBadgeText(severity: RainSeverity): { label: string; className: string } {
  switch (severity) {
    case 'thundery':
      return { label: 'Thundery Downpour', className: 'text-red-700 font-semibold' };
    case 'heavy':
      return { label: 'Heavy Rain', className: 'text-blue-700 font-semibold' };
    case 'moderate':
      return { label: 'Moderate Rain', className: 'text-blue-600 font-medium' };
    case 'light':
      return { label: 'Light Showers', className: 'text-sky-700' };
    default:
      return { label: 'Dry / Fair', className: 'text-emerald-700' };
  }
}

export const RainRadarView: React.FC<RainRadarViewProps> = ({
  weatherScenario,
  onChangeWeatherScenario,
}) => {
  const [forecastStepIdx, setForecastStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [regionFilter, setRegionFilter] = useState<(typeof REGION_FILTERS)[number]>('All');

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setForecastStepIdx((prev) => (prev + 1) % FORECAST_STEPS.length);
    }, 1400);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const forecastOffsetMin = FORECAST_STEPS[forecastStepIdx];
  const snapshot = useMemo(
    () => getWeatherSnapshot(weatherScenario, forecastOffsetMin),
    [weatherScenario, forecastOffsetMin]
  );

  const visibleCells = useMemo(() => {
    const filtered =
      regionFilter === 'All'
        ? snapshot.cells
        : snapshot.cells.filter((c) => c.region === regionFilter);
    return [...filtered].sort((a, b) => b.rainfallMmHr - a.rainfallMmHr);
  }, [snapshot.cells, regionFilter]);

  const lightningCount = snapshot.cells.filter((c) => c.lightningRisk).length;
  const wetAreasCount = snapshot.cells.filter((c) => c.rainfallMmHr >= 0.5).length;

  return (
    <div className="space-y-5">
      {/* Top Weather Overview & Scenario Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-slate-900">
              Singapore Real-Time Rain & Wind Radar
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {snapshot.islandSummary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {WEATHER_SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  onChangeWeatherScenario(sc.id);
                  setForecastStepIdx(0);
                  setIsPlaying(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  weatherScenario === sc.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quantitative Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5 text-blue-600" />
              Peak Island Rainfall
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {snapshot.maxRainfallMmHr.toFixed(1)} mm/hr
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-slate-500" />
              Prevailing Wind
            </div>
            <div className="text-sm font-semibold text-slate-900 mt-1">
              {snapshot.windSummary}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <CloudLightning className="w-3.5 h-3.5 text-amber-600" />
              Lightning Advisories
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {lightningCount} {lightningCount === 1 ? 'zone' : 'zones'}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Active Wet Sectors</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {wetAreasCount} / {snapshot.cells.length}
            </div>
          </div>
        </div>
      </div>

      {/* Radar Map + 2-Hour Forecast Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pause Radar
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Animate 2-Hr Forecast
                </>
              )}
            </button>
            <span className="text-xs text-slate-600 font-mono tabular-nums">
              Timeline:{' '}
              <strong className="text-slate-900">
                {forecastOffsetMin === 0 ? 'Live Now' : `+${forecastOffsetMin} min forecast`}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {FORECAST_STEPS.map((step, idx) => (
              <button
                key={step}
                type="button"
                onClick={() => {
                  setForecastStepIdx(idx);
                  setIsPlaying(false);
                }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                  forecastStepIdx === idx
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {step === 0 ? 'Now' : `+${step}m`}
              </button>
            ))}
          </div>
        </div>

        <SingaporeTransitMap
          weather={snapshot}
          radarFocusMode={true}
          heightClass="h-[460px] lg:h-[520px]"
        />
      </div>

      {/* Regional Rainfall Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Regional Rainfall & Bus Commute Advisories
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              NEA-style sector readings used by the route planner to penalize unsheltered walks
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {REGION_FILTERS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => setRegionFilter(region)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  regionFilter === region
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Area / Sector</th>
                <th className="py-2.5 px-4">Region</th>
                <th className="py-2.5 px-4 text-right">Rainfall Rate</th>
                <th className="py-2.5 px-4">Condition</th>
                <th className="py-2.5 px-4">Wind</th>
                <th className="py-2.5 px-4">Shelter Guidance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleCells.map((cell) => {
                const sev = getSeverityBadgeText(cell.severity);
                return (
                  <tr key={cell.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {cell.areaName}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs">
                      {cell.region}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {cell.rainfallMmHr.toFixed(1)} mm/hr
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <span className={sev.className}>{sev.label}</span>
                      {cell.lightningRisk && (
                        <span className="text-red-700 ml-1.5 font-medium">
                          · Lightning Risk
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600">
                      {cell.windDirection} {cell.windKmh} km/h
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      {cell.rainfallMmHr >= 20
                        ? 'Use MRT underpasses & covered interchanges'
                        : cell.rainfallMmHr >= 5
                        ? 'Prefer sheltered bus stops'
                        : 'Normal walking routes clear'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
