'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CirclePlus, Flag, Minus, Plus, Trash2 } from 'lucide-react';
import {
  getPlayerHoleStat,
  hydrateRound,
  attributedPenaltyStrokes,
  reconcileHolePenalties,
  shotResults,
  teeResults,
  updatePlayerHole,
  type RoundRecord,
  type RoundShot,
  type ShotResult,
  type TeeResult,
} from '@/lib/rounds';
import { displayDistance, distanceLabel, rounded, storeDistance, type DistanceUnit } from '@/lib/preferences';

type Props = {
  round: RoundRecord;
  distanceUnit: DistanceUnit;
  saveState: 'saved' | 'saving' | 'error';
  onChange: (round: RoundRecord) => void;
  onFinish: (round: RoundRecord) => void;
  onExit: () => void;
};

const clubs = ['Driver','3-wood','5-wood','Hybrid','4-iron','5-iron','6-iron','7-iron','8-iron','9-iron','PW','GW','SW','LW','Putter','Other'];
const teeLabels: Record<TeeResult,string> = { in_play:'In play', left:'Left', right:'Right', ob:'OB', water:'Water' };
const shotLabels: Record<ShotResult,string> = { good:'Good', left:'Left', right:'Right', short:'Short', long:'Long', top:'Top', fat:'Fat', thin:'Thin', ob:'OB', water:'Water', other:'Other' };
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),byte=>byte.toString(16).padStart(2,'0')).join('');

function firstIncompleteHole(round: RoundRecord) {
  return Math.max(0, round.roundHoles.findIndex((hole) => hole.playerStats?.some((stat) => !stat.completed)));
}

export function ActiveRound({round:source,distanceUnit,saveState,onChange,onFinish,onExit}:Props) {
  const round=useMemo(()=>hydrateRound(source),[source]);
  const initialHole=Math.min(round.roundHoles.length-1,Math.max(0,(round.activeHole??firstIncompleteHole(round)+1)-1));
  const [holeIndex,setHoleIndex]=useState(initialHole),[playerId,setPlayerId]=useState(round.players?.[0]?.id??''),[detailsOpen,setDetailsOpen]=useState(false);
  const hole=round.roundHoles[holeIndex],players=round.players??[],player=players.find(item=>item.id===playerId)??players[0];
  const stat=getPlayerHoleStat(round,holeIndex,player.id)!;
  const shownScore=stat.score??hole.par;
  const attributedPenalties=attributedPenaltyStrokes(stat.shots);
  const roundScore=round.roundHoles.reduce((sum,item,index)=>{const primaryStat=getPlayerHoleStat(round,index,round.players?.[0]?.id??'');return sum+(primaryStat?.completed?primaryStat.score??0:0);},0);
  const roundPar=round.roundHoles.reduce((sum,item,index)=>sum+(getPlayerHoleStat(round,index,round.players?.[0]?.id??'')?.completed?item.par:0),0);

  function change(patch:Parameters<typeof updatePlayerHole>[3]){
    const next=updatePlayerHole(round,holeIndex,player.id,patch),wasComplete=round.status==='complete';onChange({...next,status:wasComplete?'complete':'active',activeHole:holeIndex+1,done:wasComplete});
  }
  function goTo(index:number){const next=Math.max(0,Math.min(round.roundHoles.length-1,index));setHoleIndex(next);setDetailsOpen(false);onChange({...round,activeHole:next+1,clientUpdatedAt:new Date().toISOString()});}
  function finishHole(){
    const completed=updatePlayerHole(round,holeIndex,player.id,{score:shownScore,completed:true});
    const nextPlayer=players.find(item=>!getPlayerHoleStat(completed,holeIndex,item.id)?.completed);
    if(nextPlayer){onChange({...completed,status:'active',activeHole:holeIndex+1,done:false});setPlayerId(nextPlayer.id);setDetailsOpen(false);return;}
    const nextHole=completed.roundHoles.findIndex((item,index)=>index>holeIndex&&item.playerStats?.some(itemStat=>!itemStat.completed));
    if(nextHole>=0){onChange({...completed,status:'active',activeHole:nextHole+1,done:false});setHoleIndex(nextHole);setPlayerId(players[0].id);setDetailsOpen(false);return;}
    const earlierHole=completed.roundHoles.findIndex(item=>item.playerStats?.some(itemStat=>!itemStat.completed));
    if(earlierHole>=0){onChange({...completed,status:'active',activeHole:earlierHole+1,done:false});setHoleIndex(earlierHole);setPlayerId(players[0].id);setDetailsOpen(false);return;}
    onFinish({...completed,status:'complete',activeHole:completed.roundHoles.length,done:true,completedAt:new Date().toISOString(),clientUpdatedAt:new Date().toISOString()});
  }
  function addShot(){const shot:RoundShot={id:uid(),shotNumber:stat.shots.length+1,club:hole.par>3&&stat.shots.length===0?'Driver':'',result:'good',penaltyStrokes:0};change({shots:[...stat.shots,shot]});}
  function updateShot(id:string,patch:Partial<RoundShot>){
    const shots=stat.shots.map(shot=>{if(shot.id!==id)return shot;const result=patch.result??shot.result;const switchedToPenalty=(result==='ob'||result==='water')&&shot.result!=='ob'&&shot.result!=='water';const switchedFromPenalty=result!=='ob'&&result!=='water'&&(shot.result==='ob'||shot.result==='water');return{...shot,...patch,penaltyStrokes:patch.penaltyStrokes??(switchedToPenalty?1:switchedFromPenalty?0:shot.penaltyStrokes)};});
    change({shots,penalties:reconcileHolePenalties(stat.penalties,stat.shots,shots)});
  }
  function removeShot(id:string){const shots=stat.shots.filter(shot=>shot.id!==id).map((shot,index)=>({...shot,shotNumber:index+1}));change({shots,penalties:reconcileHolePenalties(stat.penalties,stat.shots,shots)});}

  return <div className="active-round">
    <header className="active-round-top"><button type="button" className="active-exit" onClick={onExit}><ArrowLeft/>Rounds</button><div><strong>{round.title}</strong><span>{round.teeName?`${round.teeName} tees · `:''}{round.holeCount} holes</span></div><span className={`autosave-state ${saveState}`} aria-live="polite">{saveState==='saving'?'Saving…':saveState==='error'?'Save failed':'Saved'}</span></header>
    <div className="hole-progress" aria-label="Round holes">{round.roundHoles.map((item,index)=>{const states=item.playerStats??[],complete=states.length>0&&states.every(itemStat=>itemStat.completed),started=states.some(itemStat=>itemStat.score!==null||itemStat.putts!==null||itemStat.teeResult!==null||itemStat.shots.length>0);return <button type="button" key={item.hole} aria-current={index===holeIndex?'step':undefined} className={complete?'complete':started?'started':''} onClick={()=>goTo(index)}>{complete?<Check/>:item.hole}</button>;})}</div>
    <main className="active-hole">
      <section className="active-hole-heading"><span className="eyebrow">HOLE {hole.hole} OF {round.holeCount}</span><h1>Hole {hole.hole}</h1><p>Par {hole.par}{hole.distance!==undefined?` · ${rounded(displayDistance(hole.distance,distanceUnit))}${distanceLabel(distanceUnit)}`:''}</p><div className="live-total"><span>{roundScore||'—'} strokes</span><strong>{roundPar?signed(roundScore-roundPar):'Even'}</strong></div></section>
      {players.length>1&&<div className="active-players" role="tablist" aria-label="Current player">{players.map(item=>{const itemStat=getPlayerHoleStat(round,holeIndex,item.id);return <button type="button" role="tab" aria-selected={item.id===player.id} className={item.id===player.id?'active':''} key={item.id} onClick={()=>{setPlayerId(item.id);setDetailsOpen(false);}}><span>{item.name}</span>{itemStat?.completed?<Check/>:<small>{itemStat?.score??'—'}</small>}</button>;})}</div>}
      <section className="capture-card score-capture"><span className="capture-label">{player.name} · score</span><div className="stepper"><button type="button" aria-label="Subtract one stroke" onClick={()=>change({score:Math.max(1,shownScore-1)})}><Minus/></button><strong>{shownScore}</strong><button type="button" aria-label="Add one stroke" onClick={()=>change({score:Math.min(30,shownScore+1)})}><Plus/></button></div><span className="score-relative">{signed(shownScore-hole.par)}</span></section>
      {hole.par>3&&<section className="capture-section"><div className="capture-title"><span>Tee result</span><small>Optional</small></div><div className="choice-grid tee-choices">{teeResults.map(result=>{const selected=stat.teeResult===result;return <button type="button" key={result} className={selected?'selected':''} onClick={()=>change({teeResult:selected?null:result,penalties:!selected&&(result==='ob'||result==='water')?Math.max(1,stat.penalties):stat.penalties})}>{teeLabels[result]}</button>;})}</div></section>}
      <div className="capture-split"><section className="capture-section"><div className="capture-title"><span>Putts</span><small>Optional</small></div><div className="mini-stepper"><button type="button" aria-label="Subtract a putt" onClick={()=>change({putts:Math.max(0,(stat.putts??2)-1)})}><Minus/></button><strong>{stat.putts??'—'}</strong><button type="button" aria-label="Add a putt" onClick={()=>change({putts:Math.min(10,(stat.putts??1)+1)})}><Plus/></button></div></section><section className="capture-section"><div className="capture-title"><span>Penalties</span><small>{attributedPenalties?`${attributedPenalties} from shots`:'Hole total'}</small></div><div className="penalty-choices">{[0,1,2,3].map(value=><button type="button" key={value} disabled={value<attributedPenalties} className={stat.penalties===value?'selected':''} onClick={()=>change({penalties:value})}>{value===0?'None':`+${value}`}</button>)}</div></section></div>
      <button type="button" className="finish-hole" onClick={finishHole}><Flag/>Finish {players.length>1?player.name:'hole'}<ChevronRight/></button>
      <button type="button" className="details-toggle" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(value=>!value)}><CirclePlus/>{detailsOpen?'Hide shot details':stat.shots.length?`Shot details · ${stat.shots.length}`:'Add shot details'}<span>Optional</span></button>
      {detailsOpen&&<section className="shot-details"><div className="shot-details-head"><div><span className="eyebrow">DETAILED CAPTURE</span><h2>Shots on hole {hole.hole}</h2></div><button type="button" className="button small" onClick={addShot}><Plus/>Add shot</button></div><p className="shot-source-note">Hole penalties are the total. Shot penalties explain where they came from and are not added again.</p>{stat.shots.map(shot=><article className="shot-editor" key={shot.id}><div className="shot-editor-head"><strong>Shot {shot.shotNumber}</strong><button type="button" className="iconbtn" aria-label={`Remove shot ${shot.shotNumber}`} onClick={()=>removeShot(shot.id)}><Trash2/></button></div><div className="shot-fields"><label className="field">Club<select value={shot.club} onChange={event=>updateShot(shot.id,{club:event.target.value})}><option value="">Choose club</option>{clubs.map(club=><option key={club}>{club}</option>)}</select></label><label className="field">Distance ({distanceLabel(distanceUnit)})<input inputMode="decimal" type="number" min="0" max={distanceUnit==='yd'?1100:1000} value={rounded(displayDistance(shot.distance,distanceUnit))??''} onChange={event=>updateShot(shot.id,{distance:event.target.value===''?undefined:storeDistance(Number(event.target.value),distanceUnit)})}/></label></div><div className="shot-results">{shotResults.map(result=><button type="button" key={result} className={shot.result===result?'selected':''} onClick={()=>updateShot(shot.id,{result})}>{shotLabels[result]}</button>)}</div><div className="shot-fields"><label className="field">Penalty strokes<select value={shot.penaltyStrokes} onChange={event=>updateShot(shot.id,{penaltyStrokes:Number(event.target.value)})}><option value="0">None</option><option value="1">+1</option><option value="2">+2</option></select></label><label className="field">Notes<input maxLength={500} value={shot.notes??''} placeholder="Optional detail" onChange={event=>updateShot(shot.id,{notes:event.target.value})}/></label></div></article>)}{!stat.shots.length&&<button type="button" className="add-first-shot" onClick={addShot}><Plus/>Add the first shot</button>}</section>}
      <div className="active-hole-nav"><button type="button" disabled={holeIndex===0} onClick={()=>goTo(holeIndex-1)}><ChevronLeft/>Previous</button><span>Hole {hole.hole}</span><button type="button" disabled={holeIndex===round.roundHoles.length-1} onClick={()=>goTo(holeIndex+1)}>Next<ChevronRight/></button></div>
    </main>
  </div>;
}

function signed(value:number){return value===0?'E':value>0?`+${value}`:`${value}`;}
