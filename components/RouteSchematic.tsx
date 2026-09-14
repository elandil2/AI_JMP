import React from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Clock, Coffee, Flag, MapPin, Navigation } from 'lucide-react';
import type { RouteSchematic as RouteSchematicType } from '../types';

interface RouteSchematicProps { data: RouteSchematicType; }

// These scoped connectors are decorative layout infrastructure; the ordered list is the route.
const routeStyles = `
.jmp-route { container: jmp-route / inline-size; margin-bottom: 2rem; color: #1e293b; }
.jmp-route * { box-sizing: border-box; }
.jmp-route__hint { margin: 0 0 12px; color: #64748b; font-size: 13px; line-height: 1.5; }
.jmp-route__panel { padding: 24px 20px; border: 1px solid #e2e8f0; border-radius: 16px; background: white; box-shadow: 0 1px 2px rgb(15 23 42 / .03); }
.jmp-route__list { display: grid; gap: 24px; list-style: none; padding: 0; margin: 0; }
.jmp-route__node { position: relative; min-width: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 14px; align-items: start; --route-accent: #64748b; --route-border: #cbd5e1; --route-tint: #f8fafc; }
.jmp-route__node[data-kind=origin] { --route-accent: #4f46e5; --route-border: #a5b4fc; --route-tint: #eef2ff; }
.jmp-route__node[data-kind=break] { --route-accent: #a16207; --route-border: #fcd34d; --route-tint: #fffbeb; }
.jmp-route__node[data-kind=destination] { --route-accent: #047857; --route-border: #6ee7b7; --route-tint: #ecfdf5; }
.jmp-route__track { position: relative; z-index: 1; display: flex; justify-content: center; align-items: center; gap: 8px; }
.jmp-route__number, .jmp-route__symbol { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; border: 2px solid var(--route-border); border-radius: 50%; color: var(--route-accent); background: var(--route-tint); }
.jmp-route__number { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.jmp-route__symbol { display: none; background: #fff; }
.jmp-route__body { min-width: 0; padding-top: 2px; }
.jmp-route__name { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.jmp-route__time { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; margin-top: 8px; padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; color: #475569; font-size: 12px; line-height: 1.4; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.jmp-route__time svg { flex-shrink: 0; }
.jmp-route__mobile-line { position: absolute; z-index: 0; left: 21px; top: 44px; width: 2px; height: calc(100% - 20px); background: #cbd5e1; }
.jmp-route__segment, .jmp-route__turn { display: none; pointer-events: none; }
@container jmp-route (min-width: 720px) {
  .jmp-route__panel { padding: 32px 64px; }
  .jmp-route__list { grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 0; row-gap: 56px; }
  .jmp-route__node { grid-column: var(--route-column); grid-row: var(--route-row); display: flex; flex-direction: column; align-items: center; text-align: center; }
  .jmp-route__track { width: 100%; }
  .jmp-route__symbol { display: flex; }
  .jmp-route__body { position: relative; z-index: 1; width: 100%; padding: 12px 10px 0; }
  .jmp-route__mobile-line { display: none; }
  .jmp-route__segment { display: block; position: absolute; z-index: 0; top: 21px; left: 50%; width: 100%; height: 3px; background: #cbd5e1; }
  .jmp-route__segment svg { position: absolute; width: 18px; height: 18px; left: 50%; top: 50%; transform: translate(-50%, -50%); color: #64748b; background: white; }
  .jmp-route__node[data-direction=reverse] .jmp-route__segment { left: auto; right: 50%; }
  .jmp-route__turn { display: block; position: absolute; z-index: 0; top: 21px; left: 50%; width: calc(50% + 28px); height: calc(100% + 59px); border: 3px solid #cbd5e1; border-left: 0; border-radius: 0 44px 44px 0; }
  .jmp-route__turn svg { position: absolute; right: -10px; top: 50%; width: 18px; height: 18px; color: #64748b; background: white; transform: translateY(-50%); }
  .jmp-route__node[data-direction=reverse] .jmp-route__turn { left: auto; right: 50%; border: 3px solid #cbd5e1; border-right: 0; border-radius: 44px 0 0 44px; }
  .jmp-route__node[data-direction=reverse] .jmp-route__turn svg { right: auto; left: -10px; }
}
@media print {
  .jmp-route__panel { box-shadow: none; }
  .jmp-route__node { break-inside: avoid; }
}
`;

export const RouteSchematic: React.FC<RouteSchematicProps> = ({ data }) => {
    if (!data?.nodes?.length) return null;
    return <section className="jmp-route" aria-label="Rota durakları">
        <style>{routeStyles}</style>
        <p className="jmp-route__hint">Başlangıçtan itibaren geçen süre</p>
        <div className="jmp-route__panel">
            <ol className="jmp-route__list" role="list">
                {data.nodes.map((node, index) => {
                    const row = Math.floor(index / 3);
                    const reverse = row % 2 === 1;
                    const position = index % 3;
                    const hasNext = index < data.nodes.length - 1;
                    const Icon = node.type === 'origin' ? Navigation : node.type === 'destination' ? Flag : node.type === 'break' ? Coffee : MapPin;
                    const layout = { '--route-column': reverse ? 3 - position : position + 1, '--route-row': row + 1 } as React.CSSProperties;
                    return <li key={index} className="jmp-route__node" data-kind={node.type} data-direction={reverse ? 'reverse' : 'forward'} style={layout}>
                        {hasNext && <span className="jmp-route__mobile-line" aria-hidden="true" />}
                        {hasNext && (position < 2
                            ? <span className="jmp-route__segment" aria-hidden="true">{reverse ? <ArrowLeft /> : <ArrowRight />}</span>
                            : <span className="jmp-route__turn" aria-hidden="true"><ArrowDown /></span>)}
                        <div className="jmp-route__track" aria-hidden="true">
                            <span className="jmp-route__number">{index + 1}</span>
                            <span className="jmp-route__symbol"><Icon size={22} strokeWidth={1.8} /></span>
                        </div>
                        <div className="jmp-route__body">
                            <h4 className="jmp-route__name">{node.name}</h4>
                            <span className="jmp-route__time"><Clock size={13} aria-hidden="true" />{node.timeFromStart}</span>
                        </div>
                    </li>;
                })}
            </ol>
        </div>
    </section>;
};
