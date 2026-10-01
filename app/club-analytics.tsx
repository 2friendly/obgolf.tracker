'use client';
import { useMemo, useState } from 'react';
import { Activity, BarChart3, Gauge, Plus, Target } from 'lucide-react';
import { displayDistance, displaySpeed, distanceLabel, speedLabel, type UserPreferences } from '@/lib/preferences';
import type { ClubMetric } from '@/lib/club-import';
import { practiceSmash } from '@/lib/practice-shots';
export type { ClubMetric } from '@/lib/club-import';

type SessionLike={id:string;date:string;title:string;club?:string;carry?:number;speed?:number;clubMetrics?:ClubMetric[]};
type Props={sessions:SessionLike[];preferences:UserPreferences;onLog:()=>void;pretty:(date:string)=>string};
type Reading=Omit<ClubMetric,'sampleType'>&{sessionId:string;date:string;sessionTitle:string;sampleType:ClubMetric['sampleType']|'Legacy'};
type MetricKey='carry'|'total'|'clubSpeed'|'ballSpeed'|'smash'|'launch'|'spin';

const getMetricOptions=(preferences:UserPreferences):{key:MetricKey;label:string;unit:string;digits:number}[]=>[
 {key:'carry',label:'Carry',unit:distanceLabel(preferences.distanceUnit),digits:1},
 {key:'total',label:'Total distance',unit:distanceLabel(preferences.distanceUnit),digits:1},
 {key:'clubSpeed',label:'Club speed',unit:speedLabel(preferences.speedUnit),digits:1},
 {key:'ballSpeed',label:'Ball speed',unit:speedLabel(preferences.speedUnit),digits:1},
 {key:'smash',label:'Smash factor',unit:'',digits:2},
 {key:'launch',label:'Launch',unit:'°',digits:1},
 {key:'spin',label:'Backspin',unit:'rpm',digits:0}
];
const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const fmt=(value:number|undefined,digits=1)=>value===undefined?'—':value.toLocaleString('en-AU',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const safeClub=(club:string|undefined)=>club?.trim()||'Unspecified';

function TrendChart({points,label,unit,digits,pretty}:{points:{date:string;value:number;title:string}[];label:string;unit:string;digits:number;pretty:(date:string)=>string}){
 if(!points.length)return <div className="analytics-empty"><BarChart3 size={28}/><strong>No {label.toLocaleLowerCase()} data yet</strong><span>Add this measurement in a simulator or range session.</span></div>;
 const width=760,height=300,left=54,right=22,top=22,bottom=48;
 let min=Math.min(...points.map(point=>point.value)),max=Math.max(...points.map(point=>point.value));
 if(min===max){min-=Math.max(1,min*.05);max+=Math.max(1,max*.05);}else{const pad=(max-min)*.15;min-=pad;max+=pad;}
 const x=(index:number)=>points.length===1?(left+width-right)/2:left+index*(width-left-right)/(points.length-1);
 const y=(value:number)=>top+(max-value)*(height-top-bottom)/(max-min);
 const ticks=Array.from({length:5},(_,index)=>max-index*(max-min)/4);
 const labels=[0,Math.floor((points.length-1)/2),points.length-1].filter((value,index,array)=>array.indexOf(value)===index);
 return <div className="trend-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} progression: ${points.map(point=>`${fmt(point.value,digits)} ${unit} on ${pretty(point.date)}`).join(', ')}`}>
  {ticks.map(tick=><g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} className="analytics-gridline"/><text x={left-10} y={y(tick)+4} textAnchor="end" className="analytics-axis">{fmt(tick,digits)}</text></g>)}
  {points.length>1&&<polyline points={points.map((point,index)=>`${x(index)},${y(point.value)}`).join(' ')} className="analytics-line"/>}
  {points.map((point,index)=><g key={`${point.date}-${index}`}><circle cx={x(index)} cy={y(point.value)} r="5" className="analytics-dot"><title>{point.title} · {pretty(point.date)} · {fmt(point.value,digits)} {unit}</title></circle></g>)}
  {labels.map(index=><text key={index} x={x(index)} y={height-14} textAnchor={index===0?'start':index===points.length-1?'end':'middle'} className="analytics-axis">{pretty(points[index].date).replace(/\s\d{4}$/,'')}</text>)}
 </svg></div>;
}

function EfficiencyChart({readings,pretty,distanceUnit,speedUnit}:{readings:Reading[];pretty:(date:string)=>string;distanceUnit:string;speedUnit:string}){
 const points=readings.filter(reading=>reading.clubSpeed!==undefined&&reading.carry!==undefined).map(reading=>({x:reading.clubSpeed!,y:reading.carry!,...reading}));
 if(points.length<2)return <div className="analytics-empty compact"><Gauge size={26}/><strong>Efficiency needs two samples</strong><span>Track club speed and carry together to reveal the relationship.</span></div>;
 const width=560,height=280,left=54,right=22,top=22,bottom=46;
 let minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x)),minY=Math.min(...points.map(point=>point.y)),maxY=Math.max(...points.map(point=>point.y));
 if(minX===maxX){minX-=1;maxX+=1;}else{const pad=(maxX-minX)*.12;minX-=pad;maxX+=pad;}if(minY===maxY){minY-=2;maxY+=2;}else{const pad=(maxY-minY)*.12;minY-=pad;maxY+=pad;}
 const x=(value:number)=>left+(value-minX)*(width-left-right)/(maxX-minX),y=(value:number)=>top+(maxY-value)*(height-top-bottom)/(maxY-minY);
 const avgX=mean(points.map(point=>point.x)),avgY=mean(points.map(point=>point.y));
 const slope=points.reduce((sum,point)=>sum+(point.x-avgX)*(point.y-avgY),0)/points.reduce((sum,point)=>sum+(point.x-avgX)**2,0);
 const intercept=avgY-slope*avgX;
 const covariance=points.reduce((sum,point)=>sum+(point.x-avgX)*(point.y-avgY),0);
 const denominator=Math.sqrt(points.reduce((sum,point)=>sum+(point.x-avgX)**2,0)*points.reduce((sum,point)=>sum+(point.y-avgY)**2,0));
 const correlation=denominator?covariance/denominator:0;
 return <><div className="efficiency-meta"><span><b>{slope.toFixed(2)} {distanceUnit}</b> carry per extra {speedUnit}</span><span><b>{correlation.toFixed(2)}</b> correlation</span></div><div className="efficiency-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Club speed versus carry distance">
  <line x1={left} x2={width-right} y1={height-bottom} y2={height-bottom} className="analytics-gridline"/><line x1={left} x2={left} y1={top} y2={height-bottom} className="analytics-gridline"/>
  <line x1={x(minX)} y1={y(slope*minX+intercept)} x2={x(maxX)} y2={y(slope*maxX+intercept)} className="regression-line"/>
  {points.map((point,index)=><circle key={index} cx={x(point.x)} cy={y(point.y)} r="6" className="analytics-dot"><title>{point.sessionTitle} · {pretty(point.date)} · {fmt(point.x)} {speedUnit} / {fmt(point.y)} {distanceUnit}</title></circle>)}
  <text x={(left+width-right)/2} y={height-10} textAnchor="middle" className="analytics-axis">Club speed ({speedUnit})</text><text x="14" y={(top+height-bottom)/2} transform={`rotate(-90 14 ${(top+height-bottom)/2})`} textAnchor="middle" className="analytics-axis">Carry ({distanceUnit})</text>
 </svg></div></>;
}

export function ClubAnalytics({sessions,preferences,onLog,pretty}:Props){
 const metricOptions=getMetricOptions(preferences);
 const readings=useMemo<Reading[]>(()=>sessions.flatMap<Reading>(session=>session.clubMetrics?.length?session.clubMetrics.map<Reading>(metric=>({...metric,smash:practiceSmash(metric),carry:displayDistance(metric.carry,preferences.distanceUnit),total:displayDistance(metric.total,preferences.distanceUnit),clubSpeed:displaySpeed(metric.clubSpeed,preferences.speedUnit),ballSpeed:displaySpeed(metric.ballSpeed,preferences.speedUnit),club:safeClub(metric.club),sessionId:session.id,date:session.date,sessionTitle:session.title})):session.club||session.carry!==undefined||session.speed!==undefined?[{id:`legacy-${session.id}`,club:safeClub(session.club),sampleType:'Legacy' as const,carry:displayDistance(session.carry,preferences.distanceUnit),clubSpeed:displaySpeed(session.speed,preferences.speedUnit),sessionId:session.id,date:session.date,sessionTitle:session.title}]:[]).sort((a,b)=>a.date.localeCompare(b.date)),[sessions,preferences.distanceUnit,preferences.speedUnit]);
 const clubs=useMemo(()=>[...new Set(readings.map(reading=>reading.club))].sort((a,b)=>a.localeCompare(b)),[readings]);
 const [selectedClub,setClub]=useState(''),[metric,setMetric]=useState<MetricKey>('carry'),[sampleType,setSampleType]=useState('All types');
 const club=clubs.includes(selectedClub)?selectedClub:clubs.includes('Driver')?'Driver':clubs[0]||'';
 const clubReadings=readings.filter(reading=>reading.club===club&&(sampleType==='All types'||reading.sampleType===sampleType));
 const types=[...new Set(readings.filter(reading=>reading.club===club).map(reading=>reading.sampleType))];
 const option=metricOptions.find(item=>item.key===metric)!;
 const points=clubReadings.filter(reading=>reading[metric]!==undefined).map(reading=>({date:reading.date,value:reading[metric] as number,title:reading.sessionTitle}));
 const values=points.map(point=>point.value),latest=points.at(-1)?.value,first=points[0]?.value,change=latest!==undefined&&first!==undefined?latest-first:undefined;
 const summaries=clubs.map(name=>{const items=readings.filter(reading=>reading.club===name),carries=items.flatMap(item=>item.carry===undefined?[]:[item.carry]),speeds=items.flatMap(item=>item.clubSpeed===undefined?[]:[item.clubSpeed]),smashes=items.flatMap(item=>item.smash===undefined?[]:[item.smash]);return{name,samples:items.length,latest:items.at(-1)?.date||'',avgCarry:carries.length?mean(carries):undefined,bestCarry:carries.length?Math.max(...carries):undefined,avgSpeed:speeds.length?mean(speeds):undefined,avgSmash:smashes.length?mean(smashes):undefined,carryChange:carries.length>1?carries.at(-1)!-carries[0]:undefined};});
 return <div className="analytics-surface"><div className="heading"><div><h2>Club analytics</h2><p className="muted">Track how every club changes across sessions—not just your best shot.</p></div><button className="button primary" onClick={onLog}><Plus size={16}/>Log club data</button></div>
 {!readings.length?<section className="panel analytics-welcome"><Activity size={34}/><h2>Build your club baseline.</h2><p className="muted">Log carry, speed, launch and spin from your next simulator session. Each new sample will extend the trend.</p><button className="button primary" onClick={onLog}><Plus size={16}/>Add first measurement</button></section>:<>
  <div className="club-strip" role="tablist" aria-label="Select club">{clubs.map(name=><button key={name} role="tab" aria-selected={club===name} className={club===name?'active':''} onClick={()=>setClub(name)}>{name}<small>{readings.filter(reading=>reading.club===name).length}</small></button>)}</div>
  <section className="panel analytics-controls"><div className="metric-picker">{metricOptions.map(item=><button key={item.key} className={metric===item.key?'active':''} onClick={()=>setMetric(item.key)}>{item.label}</button>)}</div>{types.length>1&&<div className="sample-filter"><span>Sample</span><select value={sampleType} onChange={event=>setSampleType(event.target.value)}><option>All types</option>{types.map(type=><option key={type}>{type}</option>)}</select></div>}</section>
  <div className="analytics-kpis"><article><span>LATEST</span><strong>{fmt(latest,option.digits)}<small>{option.unit}</small></strong><em>{points.at(-1)?pretty(points.at(-1)!.date):'No sample'}</em></article><article><span>AVERAGE</span><strong>{values.length?fmt(mean(values),option.digits):'—'}<small>{option.unit}</small></strong><em>{values.length} measured samples</em></article><article><span>RANGE</span><strong>{values.length?`${fmt(Math.min(...values),option.digits)}–${fmt(Math.max(...values),option.digits)}`:'—'}<small>{option.unit}</small></strong><em>Observed minimum to maximum</em></article><article><span>CHANGE</span><strong className={change!==undefined&&change>0?'positive':''}>{change===undefined?'—':`${change>0?'+':''}${fmt(change,option.digits)}`}<small>{option.unit}</small></strong><em>First to latest sample</em></article></div>
  <section className="panel analytics-chart-panel"><div className="sectionhead"><div><span className="eyebrow">PROGRESSION</span><h2>{club} · {option.label}</h2></div><span className="badge">{sampleType.toUpperCase()}</span></div><TrendChart points={points} label={option.label} unit={option.unit} digits={option.digits} pretty={pretty}/><p className="analytics-note">For the cleanest trend, compare the same sample type and similar simulator conditions.</p></section>
  <div className="analytics-grid"><section className="panel"><div className="sectionhead"><div><span className="eyebrow">EFFICIENCY</span><h2>Speed → carry</h2></div><Target size={19}/></div><EfficiencyChart readings={clubReadings} pretty={pretty} distanceUnit={distanceLabel(preferences.distanceUnit)} speedUnit={speedLabel(preferences.speedUnit)}/></section><section className="panel"><div className="sectionhead"><div><span className="eyebrow">DELIVERY PROFILE</span><h2>{club} averages</h2></div><Gauge size={19}/></div><div className="delivery-grid">{metricOptions.slice(2).map(item=>{const available=clubReadings.flatMap(reading=>reading[item.key]===undefined?[]:[reading[item.key] as number]);return <div key={item.key}><span>{item.label}</span><strong>{available.length?fmt(mean(available),item.digits):'—'} <small>{item.unit}</small></strong></div>;})}</div></section></div>
  <section className="panel club-table-panel"><div className="sectionhead"><div><span className="eyebrow">CLUB BENCHMARKS</span><h2>Your current bag</h2></div><span className="badge">{readings.length} SAMPLES</span></div><div className="club-table"><div className="club-table-head"><span>Club</span><span>Samples</span><span>Avg carry</span><span>Best carry</span><span>Avg speed</span><span>Avg smash</span><span>Carry change</span></div>{summaries.map(row=><button key={row.name} onClick={()=>{setClub(row.name);setMetric('carry');}}><strong>{row.name}</strong><span>{row.samples}</span><span>{fmt(row.avgCarry)} {distanceLabel(preferences.distanceUnit)}</span><span>{fmt(row.bestCarry)} {distanceLabel(preferences.distanceUnit)}</span><span>{fmt(row.avgSpeed)} {speedLabel(preferences.speedUnit)}</span><span>{fmt(row.avgSmash,2)}</span><span className={row.carryChange!==undefined&&row.carryChange>0?'positive':''}>{row.carryChange===undefined?'—':`${row.carryChange>0?'+':''}${fmt(row.carryChange)} ${distanceLabel(preferences.distanceUnit)}`}</span></button>)}</div></section>
 </>}</div>;
}
