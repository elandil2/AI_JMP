
import React from 'react';
import { CriticalPoint } from '../types';
import { AlertTriangle, Cloud, Truck, HardHat, Info } from 'lucide-react';

interface CriticalPointsTableProps {
    points: CriticalPoint[];
}

export const CriticalPointsTable: React.FC<CriticalPointsTableProps> = ({ points }) => {
    if (!points || points.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-100 shadow-sm text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-emerald-500" />
                </div>
                <h4 className="text-lg font-bold text-slate-800 mb-1">Her Şey Yolunda</h4>
                <p className="text-slate-500 max-w-sm">
                    Bu rota üzerinde şu an için herhangi bir kritik engel, kaza veya yol çalışması raporlanmamıştır.
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-100">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-xs">
                    <tr>
                        <th className="px-6 py-4">Bölge</th>
                        <th className="px-6 py-4">Hava Durumu</th>
                        <th className="px-6 py-4">Trafik & Bilgi</th>
                        <th className="px-6 py-4">Kritik Uyarılar / Kaza Noktaları</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {points.map((point) => (
                        <tr key={point.id} className="hover:bg-slate-50 transition-colors">
                            {/* Location Column */}
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-800">{point.weather.location}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">{point.coordinate}</span>
                                </div>
                            </td>

                            {/* Weather Column */}
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">
                                        {point.weather.icon === 'rainy' ? '🌧️' :
                                            point.weather.icon === 'sunny' ? '☀️' :
                                                point.weather.icon === 'snow' ? '❄️' : '☁️'}
                                    </span>
                                    <div>
                                        <div className="font-semibold text-slate-800">{point.weather.temp}</div>
                                        <div className="text-xs text-slate-500">{point.weather.condition}</div>
                                    </div>
                                </div>
                            </td>

                            {/* Traffic Column */}
                            <td className="px-6 py-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Truck className={`w-4 h-4 ${point.traffic.status === 'heavy' ? 'text-red-500' : 'text-emerald-500'}`} />
                                        <span className="font-medium text-slate-800">{point.traffic.description}</span>
                                    </div>
                                    {point.traffic.tollInfo && (
                                        <div className="text-xs text-slate-400 pl-6">
                                            {point.traffic.tollInfo}
                                        </div>
                                    )}
                                </div>
                            </td>

                            {/* Incidents Column */}
                            <td className="px-6 py-4">
                                <div className="flex items-start gap-2">
                                    {point.incident.type === 'accident' ? (
                                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                    ) : point.incident.type === 'roadwork' ? (
                                        <HardHat className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    ) : (
                                        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                    )}
                                    <div>
                                        <div className={`font-bold ${point.incident.type === 'accident' ? 'text-rose-600' : 'text-slate-700'}`}>
                                            {point.incident.description}
                                        </div>
                                        {point.incident.source && (
                                            <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">
                                                Kaynak: {point.incident.source}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
