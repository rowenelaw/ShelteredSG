import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { searchOneMapPlaces } from '../services/oneMapService';
import { searchSingaporePlaces, SearchSuggestion } from '../services/transitService';
import { SingaporeLocation } from '../types/transit';

interface LocationSearchInputProps {
  label: string;
  placeholder: string;
  value: SingaporeLocation | null;
  onSelect: (location: SingaporeLocation) => void;
  markerTone: 'origin' | 'destination';
}

export const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  label,
  placeholder,
  value,
  onSelect,
  markerTone,
}) => {
  const [query, setQuery] = useState(value?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [oneMapSuggestions, setOneMapSuggestions] = useState<SearchSuggestion[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.name ?? '');
  }, [value?.id, value?.name]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (value) {
          setQuery(value.name);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 3 || (value && trimmed === value.name)) {
      setOneMapSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await searchOneMapPlaces(trimmed, controller.signal);
      if (!controller.signal.aborted) {
        setOneMapSuggestions(results);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, value]);

  const localSuggestions = useMemo(() => searchSingaporePlaces(query), [query]);

  const suggestions: SearchSuggestion[] = useMemo(() => {
    if (oneMapSuggestions.length === 0) return localSuggestions;
    const seen = new Set(localSuggestions.map((s) => s.title.toLowerCase()));
    const merged = [...localSuggestions];
    for (const item of oneMapSuggestions) {
      if (!seen.has(item.title.toLowerCase())) {
        merged.push(item);
      }
    }
    return merged.slice(0, 10);
  }, [localSuggestions, oneMapSuggestions]);

  const handleChoose = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.location.name);
    setIsOpen(false);
    setOneMapSuggestions([]);
    onSelect(suggestion.location);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => Math.min(suggestions.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = suggestions[highlightedIdx] ?? suggestions[0];
      if (picked) {
        handleChoose(picked);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      <div className="relative flex items-center">
        <span
          className={`absolute left-3 flex items-center justify-center w-5 h-5 rounded-md text-xs font-mono font-semibold ${
            markerTone === 'origin'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-slate-900 text-white'
          }`}
          aria-hidden="true"
        >
          {markerTone === 'origin' ? 'A' : 'B'}
        </span>
        <input
          type="text"
          value={query}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIdx(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIdx(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label}
          className="w-full h-10 pl-10 pr-8 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 transition-colors"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(true);
            }}
            aria-label={`Clear ${label}`}
            className="absolute right-2 p-1 text-slate-400 hover:text-slate-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 pointer-events-none" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto divide-y divide-slate-100"
        >
          {suggestions.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={idx === highlightedIdx}
              onClick={() => handleChoose(item)}
              onMouseEnter={() => setHighlightedIdx(idx)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                idx === highlightedIdx ? 'bg-blue-50/70' : 'hover:bg-slate-50'
              }`}
            >
              <MapPin
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  item.kind === 'bus_stop' ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {item.title}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {item.subtitle}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
