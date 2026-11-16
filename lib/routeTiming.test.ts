import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBreaks, calculateTruckDuration, getDirections, type DirectionsResult } from './googleMaps';
import { mapsTiming, parseHours, reconcileSchematic } from './routeTiming';
import type { GenerationEvent } from '../types';

test('arrival does not receive a break or overnight rest after the trip has ended', () => {
  assert.equal(calculateBreaks(4.5).totalBreakMinutes, 0);
  assert.equal(calculateBreaks(4.51).totalBreakMinutes, 45);
  assert.equal(calculateBreaks(9).totalBreakMinutes, 45);
  assert.equal(calculateBreaks(9.01).totalBreakMinutes, 705);
  assert.equal(calculateBreaks(18).totalBreakMinutes, 750);
  assert.throws(() => calculateBreaks(Infinity));
});

test('the live Gebze example has distinct Maps and truck planning durations with one consistent total', () => {
  const maps = { distance: { value: 395000 }, duration: { value: 14580 } } as DirectionsResult;
  const timing = mapsTiming(maps);
  assert.equal(timing.summary.mapsDuration, '4 sa 3 dk');
  assert.equal(timing.summary.drivingDuration, '6 sa 35 dk');
  assert.equal(timing.summary.breakDuration, '0 sa 45 dk');
  assert.equal(timing.summary.estimatedDuration, '7 sa 20 dk');
  assert.match(timing.summary.breakNote, /6 sa 35 dk.*0 sa 45 dk.*7 sa 20 dk/);
  const congested = mapsTiming({ ...maps, durationInTraffic: { value: 28800, text: '8h' } });
  assert.equal(congested.summary.drivingDuration, '8 sa 0 dk');
  assert.equal(congested.summary.estimatedDuration, '8 sa 45 dk');
  const schematic = reconcileSchematic({ totalDistance: 'wrong', totalDuration: 'wrong', nodes: [
    {name:'Arrival',type:'destination',timeFromStart:'7 sa 30 dk',distanceFromStart:'400 km'},
    {name:'Later',type:'stop',timeFromStart:'3s 30dk',distanceFromStart:'200 km'},
    {name:'Earlier',type:'stop',timeFromStart:'2 sa 15 dk',distanceFromStart:'100 km'}
  ]}, 'Gebze', 'Ankara', timing.summary, timing.totalHours);
  assert.deepEqual(schematic.nodes.map(n=>n.name), ['Gebze','Earlier','Later','Ankara']);
  assert.equal(schematic.nodes.at(-1)?.timeFromStart, timing.summary.estimatedDuration);
  assert.equal(parseHours('3s 30dk'), 3.5);
});

test('a near-arrival daily rest becomes a 10 h day; planning speed stays 60 and Maps stays a floor', () => {
  const route = { distance: { value: 550_000 }, duration: { value: 60 } } as DirectionsResult;
  const extended = mapsTiming(route);
  assert.equal(extended.summary.drivingDuration, '9 sa 10 dk');
  assert.equal(extended.summary.breakDuration, '1 sa 30 dk');
  assert.equal(extended.summary.estimatedDuration, '10 sa 40 dk');
  assert.equal(extended.summary.extendedDrivingDays, 1);
  assert.match(extended.summary.breakNote, /10 saatlik uzatılmış sürüş/);
  assert.match(extended.summary.breakNote, /varış 10 sa 15 dk gecikir/);
  assert.match(extended.summary.routeNotice ?? '', /60 km\/sa ortalama/);
  assert.doesNotMatch(extended.summary.routeNotice ?? '', /65/);

  const noExtension = mapsTiming(route, { maxExtendedDays: 0 });
  assert.equal(noExtension.summary.breakDuration, '11 sa 45 dk');
  assert.equal(noExtension.summary.estimatedDuration, '20 sa 55 dk');
  assert.equal(noExtension.summary.extendedDrivingDays, undefined);

  const at65 = mapsTiming(route, { planningSpeedKmh: 65 });
  assert.equal(at65.summary.drivingDuration, '8 sa 28 dk');
  assert.equal(at65.summary.breakDuration, '0 sa 45 dk');
  assert.equal(at65.summary.estimatedDuration, '9 sa 13 dk');
  assert.match(at65.summary.routeNotice ?? '', /65 km\/sa ortalama/);
  assert.match(at65.summary.breakNote, /Gerçek sürüş\/takograf hesabı değildir/);

  // More than 10 h of driving cannot be saved by an extension: the 11 h rest stays.
  const longer = mapsTiming({ ...route, distance: { text: '650 km', value: 650_000 } });
  assert.equal(longer.summary.extendedDrivingDays, undefined);
  assert.match(longer.summary.breakDuration ?? '', /^11 sa 45 dk$/);

  const mapsFloor = mapsTiming({
    ...route,
    duration: { text: '8 sa 30 dk', value: 8.5 * 3600 },
  }, { planningSpeedKmh: 65 });
  assert.equal(mapsFloor.drivingHours, 8.5);
  assert.equal(mapsFloor.summary.drivingDuration, '8 sa 30 dk');
  assert.throws(() => calculateTruckDuration(550_000, 59.9), /between 60 and 65/);
  assert.throws(() => calculateTruckDuration(550_000, 65.1), /between 60 and 65/);
});

test('an exact 9-hour modeled arrival gets its required 4.5-hour break but no overnight rest', () => {
  const exactNineHours = mapsTiming({
    distance: { value: 540_000 },
    duration: { value: 60 },
  } as DirectionsResult);

  assert.equal(exactNineHours.drivingHours, 9);
  assert.equal(exactNineHours.summary.breakDuration, '0 sa 45 dk');
  assert.equal(exactNineHours.summary.estimatedDuration, '9 sa 45 dk');
});

test('Maps sums all legs for an intermediate stop and preserves traffic duration', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'fake';
  let requestedUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({routes:[{description:'A-B-C',legs:[
      {distanceMeters:100000,staticDuration:'3600s',duration:'4000s',steps:[]},
      {distanceMeters:200000,staticDuration:'7200s',duration:'8000s',steps:[]}
    ]}]}));
  };
  try {
    const departureTime = new Date(Date.now()+3600000);
    const result = await getDirections('40,29','39,32',{stopCoords:'40,30',departureTime});
    assert.equal(result?.distance.value,300000);
    assert.equal(result?.duration.value,10800);
    assert.equal(result?.durationInTraffic?.value,12000);
    assert.equal(result?.endAddress,'39,32');
    assert.equal(requestedUrl,'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.equal(requestInit?.method,'POST');
    assert.equal((requestInit?.headers as Record<string,string>)['X-Goog-Api-Key'],'fake');
    const body = JSON.parse(String(requestInit?.body));
    assert.equal(body.routingPreference,'TRAFFIC_AWARE');
    assert.equal(body.departureTime,departureTime.toISOString());
    assert.deepEqual(body.intermediates,[{location:{latLng:{latitude:40,longitude:30}},via:true}]);
    assert.deepEqual(body.routeModifiers,{avoidFerries:true});
  } finally {
    globalThis.fetch=oldFetch;
    if(oldKey===undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY=oldKey;
  }
});

test('Maps reports the Routes API error message when the request is denied', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'fake';
  const events: GenerationEvent[] = [];
  globalThis.fetch = async () => new Response(JSON.stringify({error:{code:403,status:'PERMISSION_DENIED',message:'Routes API has not been used in project 123.'}}),{status:403});
  try {
    const result = await getDirections('40,29','39,32',{useTolls:false,onUsage:event=>{events.push(event);}});
    assert.equal(result,null);
    assert.equal(events[0].errorCode,'PERMISSION_DENIED');
    assert.match(events[0].error ?? '',/has not been used/);
  } finally {
    globalThis.fetch=oldFetch;
    if(oldKey===undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY=oldKey;
  }
});

test('summary splits breaks from overnight rests and dates the arrival', () => {
  const route = { distance: { value: 645_000 }, duration: { value: 60 } } as DirectionsResult;
  const timing = mapsTiming(route, { departureTime: '2026-11-17T07:18:00.000Z' });
  assert.equal(timing.summary.shortBreakCount, 1);
  assert.equal(timing.summary.dailyRestCount, 1);
  assert.equal(timing.summary.departureTime, '2026-11-17T07:18:00.000Z');
  // 10 h 45 min driving + 45 min break + 11 h rest = 22 h 30 min.
  assert.equal(timing.summary.arrivalTime, '2026-11-18T05:48:00.000Z');
  assert.match(timing.summary.durationLabel ?? '', /gece dinlenmesi dahil/);

  const sameDay = mapsTiming({ distance: { value: 300_000 }, duration: { value: 60 } } as DirectionsResult);
  assert.equal(sameDay.summary.shortBreakCount, 1);
  assert.equal(sameDay.summary.dailyRestCount, 0);
  assert.equal(sameDay.summary.arrivalTime, undefined);
  assert.equal(sameDay.summary.durationLabel, 'Toplam yolculuk (mola dahil)');
});
