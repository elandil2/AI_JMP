import React from 'react';

// This file contains components and sections that were removed from the Report Page
// per user request on 2026-01-30. Kept for reference/backup.

/*
  // Original Imports needed:
  import { WeatherWidgets } from "@/components/WeatherWidgets";
  import { RouteTimeline } from "@/components/RouteTimeline";
*/

export const DeletedWeatherSection = ({ report }: any) => {
    return (
        <>
            {/* Weather Widgets - Only show if we have waypoints to avoid redundancy with SummaryCards */}
            {report.analysis.weather.waypoints && report.analysis.weather.waypoints.length > 0 && (
                <section>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="text-2xl">🌦️</span> Güzergah Hava Durumu
                    </h3>
                    {/* <WeatherWidgets
            origin={report.analysis.weather.origin}
            destination={report.analysis.weather.destination}
            waypoints={report.analysis.weather.waypoints}
          /> */}
                    <div>[WeatherWidgets Component was here]</div>
                </section>
            )}
        </>
    );
};

export const DeletedTimelineSection = ({ report }: any) => {
    return (
        <>
            {/* <RouteTimeline events={report.analysis.timeline} /> */}
            <div>[RouteTimeline Component was here]</div>
        </>
    );
};
