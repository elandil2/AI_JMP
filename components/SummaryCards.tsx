
"use client";
import React from 'react';
import { SummaryStats, WeatherInfo } from '../types';
import { Cloud, Sun, CloudRain, CloudLightning, CloudSnow, CloudFog, MapPin, Clock } from 'lucide-react';

interface SummaryCardsProps {
  data: SummaryStats;
  weather: {
    origin: WeatherInfo;
    destination: WeatherInfo;
    waypoints?: WeatherInfo[];
  };
}

const WeatherIcon = ({ icon, className }: { icon: string, className?: string }) => {
  switch (icon) {
    case 'sunny': return <Sun className={`${className} text-amber-500`} />;
    case 'rainy': return <CloudRain className={`${className} text-blue-500`} />;
    case 'storm': return <CloudLightning className={`${className} text-indigo-600`} />;
    case 'snow': return <CloudSnow className={`${className} text-cyan-300`} />;
    case 'fog': return <CloudFog className={`${className} text-slate-400`} />;
    default: return <Cloud className={`${className} text-slate-400`} />;
  }
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({ data, weather }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {/* Origin Weather */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between group hover:border-blue-200 transition-colors">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Başlangıç
            </span>
            <p className="text-sm font-semibold text-slate-700 mt-1 line-clamp-1" title={weather.origin.location}>
              {weather.origin.location}
            </p>
          </div>
          <WeatherIcon icon={weather.origin.icon} className="w-8 h-8" />
        </div>
        <div className="mt-4">
          <p className="text-3xl font-black text-slate-800">{weather.origin.temp}</p>
          <p className="text-xs text-slate-500 font-medium">{weather.origin.condition}</p>
        </div>
      </div>

      {/* Route Summary */}
      <div className="md:col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 p-5 rounded-2xl shadow-lg text-white flex flex-col justify-between relative overflow-hidden print:bg-white print:text-slate-900 print:border-2 print:border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-20 -mt-20 print:hidden"></div>

        <div className="flex items-center justify-between z-10">
          <div>
            <span className="text-xs font-bold text-slate-400 print:text-slate-600 uppercase tracking-wider">Toplam Mesafe</span>
            <p className="text-2xl font-bold text-white print:text-slate-900 mt-1">{data.totalDistance}</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 print:text-slate-600 uppercase tracking-wider flex items-center justify-end gap-1">
              <Clock className="w-3 h-3" /> Süre
            </span>
            <p className="text-2xl font-bold text-cyan-400 print:text-slate-900 mt-1">{data.estimatedDuration}</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700/50 print:border-slate-300 z-10 flex items-center justify-between">
          <div>
            <span className="text-xs text-rose-400 print:text-rose-600 font-bold block">ZORUNLU MOLA</span>
            <span className="text-lg font-bold">{data.mandatoryBreak && data.mandatoryBreak !== '-' ? data.mandatoryBreak : 'Gerekli Değil'}</span>
          </div>
          <div className="text-right max-w-[180px]">
            <span className="text-[10px] text-slate-400 print:text-slate-600 leading-tight block">
              {data.breakNote || 'Toplam süreye yasal dinlenme molaları dahildir.'}
            </span>
          </div>
        </div>
      </div>

      {/* Destination Weather */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between group hover:border-purple-200 transition-colors">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Varış (Tahmini)
            </span>
            <p className="text-sm font-semibold text-slate-700 mt-1 line-clamp-1" title={weather.destination.location}>
              {weather.destination.location}
            </p>
          </div>
          <WeatherIcon icon={weather.destination.icon} className="w-8 h-8" />
        </div>
        <div className="mt-4">
          <p className="text-3xl font-black text-slate-800">{weather.destination.temp}</p>
          <p className="text-xs text-slate-500 font-medium">{weather.destination.condition}</p>
        </div>
      </div>
    </div>
  );
};
