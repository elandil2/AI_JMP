
"use client";
import React from 'react';
import { TimelineEvent } from '../types';
import {
  Truck,
  MapPin,
  AlertTriangle,
  Wind,
  Navigation,
  Flag,
  Coffee,
  AlertOctagon,
  Map
} from 'lucide-react';

interface RouteTimelineProps {
  events: TimelineEvent[];
}

const getIcon = (iconType: string | undefined, eventType: string) => {
  if (iconType === 'wind') return <Wind className="w-5 h-5 text-white" />;
  if (iconType === 'traffic') return <Truck className="w-5 h-5 text-white" />;
  if (iconType === 'descent') return <Navigation className="w-5 h-5 text-white" />;
  if (iconType === 'toll') return <MapPin className="w-5 h-5 text-white" />;

  if (eventType === 'start') return <Navigation className="w-5 h-5 text-white" />;
  if (eventType === 'end') return <Flag className="w-5 h-5 text-white" />;
  if (eventType === 'break') return <Coffee className="w-5 h-5 text-white" />;
  if (eventType === 'stop') return <Map className="w-5 h-5 text-white" />;
  if (eventType === 'danger') return <AlertOctagon className="w-5 h-5 text-white" />;

  return <AlertTriangle className="w-5 h-5 text-white" />;
};

const getColorClass = (type: string) => {
  switch (type) {
    case 'start': return 'bg-cyan-800';
    case 'end': return 'bg-emerald-700';
    case 'danger': return 'bg-rose-500';
    case 'warning': return 'bg-amber-700';
    case 'break': return 'bg-yellow-700';
    case 'stop': return 'bg-indigo-500';
    default: return 'bg-slate-400';
  }
};

export const RouteTimeline: React.FC<RouteTimelineProps> = ({ events }) => {
  // Speech Synthesis Function
  const speakInstructions = () => {
    if (!window.speechSynthesis) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const fullText = events.map(e => `${e.title}. ${e.description}`).join('. ');
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.0;

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h3 className="text-xl font-bold text-slate-800">Yolculuk Akışı</h3>
        <button
          type="button"
          onClick={speakInstructions}
          className="flex min-h-11 items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-md"
        >
          <span className="text-lg" aria-hidden="true">🔊</span> Akışı Seslendir
        </button>
      </div>

      <div className="relative pl-4">
        {/* Vertical Line */}
        <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-slate-200 border-l border-dashed border-slate-300"></div>

        <div className="space-y-8">
          {events.length === 0 && (
            <p className="text-slate-500 italic text-sm">
              Bu rota için özel bir kritik nokta veya olay belirtilmemiştir.
            </p>
          )}
          {events.map((event, index) => (
            <div key={event.id || index} className="relative flex gap-4">
              {/* Icon Bubble */}
              <div className={`
                flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center shadow-md z-10 border-4 border-white
                ${getColorClass(event.type)}
              `}>
                {getIcon(event.icon, event.type)}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-1">
                <h4 className={`break-words text-base font-bold ${event.type === 'danger' ? 'text-rose-600' : 'text-slate-800'}`}>
                  {event.title}
                </h4>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  {event.type === 'danger' && <span className="font-bold text-rose-600 mr-1">EN KRİTİK BÖLGE:</span>}
                  {event.type === 'warning' && <span className="font-bold text-amber-600 mr-1">Dikkat:</span>}
                  {event.type === 'break' && <span className="font-bold text-slate-700 mr-1">PLANLI MOLA:</span>}
                  {event.type === 'stop' && <span className="font-bold text-indigo-700 mr-1">ROTA GEÇİŞİ:</span>}
                  {event.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
