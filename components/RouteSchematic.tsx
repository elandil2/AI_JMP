import React from 'react';
import { RouteSchematic as RouteSchematicType } from '../types';
import { ArrowRight, ArrowLeft, ArrowDown, MapPin, Coffee, Flag, Navigation, Clock } from 'lucide-react';

interface RouteSchematicProps {
    data: RouteSchematicType;
}

export const RouteSchematic: React.FC<RouteSchematicProps> = ({ data }) => {
    if (!data?.nodes || data.nodes.length === 0) return null;

    // Configuration
    const ITEMS_PER_ROW = 4;

    // Chunk nodes
    const chunks: RouteSchematicType['nodes'][] = []; // Corrected type to match data.nodes
    for (let i = 0; i < data.nodes.length; i += ITEMS_PER_ROW) {
        chunks.push(data.nodes.slice(i, i + ITEMS_PER_ROW));
    }

    return (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 mb-8 overflow-hidden">
            {/* We use a flex column of rows rather than a single grid to easily handle the "row" containers for connectors */}
            <div className="flex flex-col gap-12">
                {chunks.map((chunk, chunkIndex) => {
                    const isEvenRow = chunkIndex % 2 === 0; // L -> R
                    const isLastChunk = chunkIndex === chunks.length - 1;

                    // Prepare display items for this row
                    // Even row: Just the items. If short, they start at left. OK.
                    // Odd row: Reverse items. If short, we need to pad the START so they align to right.
                    let displayItems: (RouteSchematicType['nodes'][number] | null)[] = [...chunk]; // Corrected type

                    if (!isEvenRow) {
                        displayItems.reverse(); // [4, 5] -> [5, 4]
                        // If chunk has 2 items, we need 2 empty slots first: [null, null, 5, 4]
                        while (displayItems.length < ITEMS_PER_ROW) {
                            displayItems.unshift(null);
                        }
                    } else {
                        // Even row: [0, 1] -> [0, 1, null, null] (Explicit padding not strictly needed for flex-start but good for grid)
                        while (displayItems.length < ITEMS_PER_ROW) {
                            displayItems.push(null);
                        }
                    }

                    return (
                        <div key={chunkIndex} className="relative">
                            <div className="grid grid-cols-4 gap-4">
                                {displayItems.map((node, colIndex) => {
                                    if (!node) return <div key={`empty-${chunkIndex}-${colIndex}`}></div>; // Added chunkIndex to key for uniqueness

                                    // Find original index to know about connections?
                                    // Actually, we just need to know if this node connects to the Next one IN THIS ROW.
                                    const nodeIndex = data.nodes.indexOf(node);
                                    const nextNode = data.nodes[nodeIndex + 1];

                                    // Check if next node is in the same row
                                    // The 'chunk' contains the original subset.
                                    const isNextInSameRow = chunk.includes(nextNode);

                                    return (
                                        <div key={nodeIndex} className="relative flex flex-col items-center">
                                            {/* Arrow within row */}
                                            {isNextInSameRow && (
                                                <div className={`absolute top-1/2 -translate-y-1/2 text-slate-300
                                                ${isEvenRow ? '-right-5 translate-x-1/2' : '-left-5 -translate-x-1/2'}
                                            `}>
                                                    {isEvenRow ? (
                                                        <ArrowRight className="w-5 h-5" />
                                                    ) : (
                                                        <ArrowLeft className="w-5 h-5" />
                                                    )}
                                                </div>
                                            )}

                                            {/* Node Card */}
                                            <div className="w-full flex flex-col items-center z-10 p-2">
                                                <div className={`
                                            w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-sm border-[3px] transition-transform hover:scale-105 bg-white
                                            ${node.type === 'origin' ? 'border-indigo-200 text-indigo-600' :
                                                        node.type === 'destination' ? 'border-emerald-200 text-emerald-600' :
                                                            node.type === 'break' ? 'border-amber-200 text-amber-600' :
                                                                'border-slate-200 text-slate-500'}
                                            `}>
                                                    {node.type === 'origin' && <Navigation className="w-5 h-5" />}
                                                    {node.type === 'destination' && <Flag className="w-5 h-5" />}
                                                    {node.type === 'break' && <Coffee className="w-5 h-5" />}
                                                    {/* Default Fallback for 'stop' or undefined */}
                                                    {(!['origin', 'destination', 'break'].includes(node.type)) && <MapPin className="w-5 h-5" />}
                                                </div>
                                                <div className="text-center w-full">
                                                    <h4 className="font-bold text-slate-800 text-sm mb-1 truncate px-1" title={node.name}>{node.name}</h4>
                                                    <div className="inline-flex items-center justify-center gap-1 text-[10px] bg-slate-50 border border-slate-100 rounded-md px-2 py-0.5 text-slate-500 font-medium">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{node.timeFromStart}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ROW CONNECTOR (The Curve) */}
                            {!isLastChunk && (
                                <div className={`absolute -bottom-8 w-8 h-16 border-slate-300 z-0
                                ${isEvenRow ? 'right-[calc(12.5%-1rem)] border-r-2 border-b-2 rounded-br-2xl rounded-bl-none' :
                                        'left-[calc(12.5%-1rem)] border-l-2 border-b-2 rounded-bl-2xl rounded-br-none'}
                            `}>
                                    {/* The connector logic:
                                 Even Row (ends right): Connects to Odd Row (starts right).
                                 Wait. 
                                 Even Row exits at Rightmost item.
                                 Odd Row (reversed) starts at Rightmost item.
                                 So the flow is Vertical Down.
                                 We just need a straight line?
                                 User said "curve down".
                                 Usually snake goes out side, curves, comes back.
                                 But here, items are grid aligned.
                                 Item 3 (Row0-End) is directly above Item 4 (Row1-Start).
                                 So the connection is simply an arrow pointing DOWN.
                             */}
                                    <div className="hidden">Overriding complex connector, simplified below</div>
                                </div>
                            )}

                            {!isLastChunk && (
                                // Simple vertical arrow connecting the ends
                                <div className={`absolute -bottom-8 flex flex-col items-center justify-center h-12 text-slate-300
                                ${isEvenRow ? 'right-[calc(12.5%-0.5rem)]' : 'left-[calc(12.5%-0.5rem)]'}
                            `}>
                                    <div className="h-full w-0.5 bg-slate-300/50"></div>
                                    <ArrowDown className="w-4 h-4 text-slate-300 -mt-1" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
