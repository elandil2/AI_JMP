
import React from 'react';
import { WeatherInfo } from '../types';
import { Cloud, Sun, CloudRain, CloudLightning, CloudSnow, CloudFog, Thermometer } from 'lucide-react';

interface WeatherWidgetsProps {
    origin: WeatherInfo;
    destination: WeatherInfo;
    waypoints?: WeatherInfo[];
}

const getWeatherIcon = (iconName: string) => {
    switch (iconName) {
        case 'sunny': return <Sun className="w-8 h-8 text-amber-500" />;
        case 'rainy': return <CloudRain className="w-8 h-8 text-blue-500" />;
        case 'storm': return <CloudLightning className="w-8 h-8 text-purple-500" />;
        case 'snow': return <CloudSnow className="w-8 h-8 text-cyan-300" />;
        case 'fog': return <CloudFog className="w-8 h-8 text-slate-400" />;
        default: return <Cloud className="w-8 h-8 text-slate-500" />;
    }
};

const WeatherCard: React.FC<{ weather: WeatherInfo; label: string }> = ({ weather, label }) => (
    <div className="flex flex-col items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px] flex-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</span>
        <div className="mb-2">
            {getWeatherIcon(weather.icon)}
        </div>
        <div className="text-center">
            <h4 className="font-bold text-slate-700 text-lg">{weather.temp}</h4>
            <p className="text-xs text-slate-500 font-medium truncate max-w-[120px]" title={weather.location}>
                {weather.location}
            </p>
            <p className="text-xs text-slate-400 mt-1">{weather.condition}</p>
        </div>
    </div>
);

export const WeatherWidgets: React.FC<WeatherWidgetsProps> = ({ origin, destination, waypoints = [] }) => {
    return (
        <div className="flex flex-wrap gap-4 w-full">
            <WeatherCard weather={origin} label="BAŞLANGIÇ" />

            {waypoints.map((wp, idx) => (
                <WeatherCard key={idx} weather={wp} label={`YOL ÜZERİ ${idx + 1}`} />
            ))}

            <WeatherCard weather={destination} label="VARIŞ" />
        </div>
    );
};
