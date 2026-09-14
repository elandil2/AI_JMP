import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBreaks, getDirections, type DirectionsResult } from './googleMaps';
import { mapsTiming, parseHours, reconcileSchematic } from './routeTiming';

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

test('Maps sums all legs for an intermediate stop and preserves traffic duration', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'fake';
  let requested = '';
  globalThis.fetch = async input => {
    requested = String(input);
    return new Response(JSON.stringify({status:'OK',routes:[{summary:'A-B-C',legs:[
      {distance:{value:100000},duration:{value:3600},duration_in_traffic:{value:4000},start_address:'A',end_address:'B',steps:[]},
      {distance:{value:200000},duration:{value:7200},duration_in_traffic:{value:8000},start_address:'B',end_address:'C',steps:[]}
    ]}]}));
  };
  try {
    const result = await getDirections('40,29','39,32',{stopCoords:'40,30',departureTime:new Date(Date.now()+60000)});
    assert.equal(result?.distance.value,300000);
    assert.equal(result?.duration.value,10800);
    assert.equal(result?.durationInTraffic?.value,12000);
    assert.equal(result?.endAddress,'C');
    assert.ok(new URL(requested).searchParams.has('departure_time'));
    assert.equal(new URL(requested).searchParams.get('waypoints'),'40,30');
  } finally {
    globalThis.fetch=oldFetch;
    if(oldKey===undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY=oldKey;
  }
});
