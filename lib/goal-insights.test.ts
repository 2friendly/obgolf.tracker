import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGoalInsights } from './goal-insights.ts';
import { buildGoalProgressIndex, type GoalProgressRecord, type GoalSessionRecord } from './goal-progress.ts';
import type { GoalInput } from './goals.ts';
import type { PlayerHoleStat, RoundRecord } from './rounds.ts';
import type { ClubMetric } from './club-import.ts';

const goal = (patch: Partial<GoalInput> = {}): GoalInput => ({ id: 'goal', title: 'Score goal', type: 'score', target_value: 90, starting_value: null, target_date: null, is_primary: true, status: 'active', unit: null, club: null, ...patch });
function round(day: number): RoundRecord {
  const pars = Array.from({length:18}, (_,i) => i < 4 ? 3 : i < 14 ? 4 : 5);
  return { id: `r-${day}`, kind: 'round', title: 'Course', category: 'On course', date: `2026-09-${String(day).padStart(2,'0')}`, notes: '', done: true, status: 'complete', holeCount: '18', players: [{ id:'me', name:'Me', scores: pars }],
    roundHoles: pars.map((par,i) => ({hole:i+1,par,score:par,playerStats:[{playerId:'me',score:par,completed:true,putts:1,penalties:0,teeResult:par > 3 ? 'in_play' : null,shots:[]}]})) };
}
const stat = (record: RoundRecord, hole: number): PlayerHoleStat => record.roundHoles[hole].playerStats![0];
function metric(id: number, carry = 200, patch: Partial<ClubMetric> = {}): ClubMetric { return { id:String(id), sampleType:'Single shot', club:'Driver', carry, ...patch }; }
function session(day: number, metrics: ClubMetric[]): GoalSessionRecord { return { id:`s-${day}`, kind:'session', category:'Simulator', date:`2026-09-${String(day).padStart(2,'0')}`, clubMetrics:metrics }; }
const detect = (records: GoalProgressRecord[], target = goal()) => detectGoalInsights(target, buildGoalProgressIndex(records));
const areas = (records: GoalProgressRecord[], target = goal()) => detect(records,target).findings.map(finding => finding.area);
function badPenalties(day: number, count = 4) { const result = round(day); stat(result,0).penalties = count; return result; }
function badTee(day: number) {
  const result = round(day);
  result.roundHoles.forEach(hole => { hole.playerStats![0].teeResult = null; });
  for (let i=4;i<14;i++) stat(result,i).teeResult = i < 10 ? 'in_play' : 'right';
  return result;
}
const carryGoal = goal({ type:'carry', title:'Driver carry', club:'Driver', unit:'m', target_value:230 });

test('one bad round or session never generates a weakness', () => {
  const bad = badPenalties(1,10); bad.roundHoles.forEach(hole => { hole.playerStats![0].putts=4; hole.playerStats![0].score=hole.par+4; hole.playerStats![0].teeResult='right'; });
  const practice = session(2,Array.from({length:100},(_,i)=>metric(i,i%2?300:50,{offline:30})));
  assert.deepEqual(detect([bad,practice]).findings,[]);
});

test('aggregate penalties cannot be driven by a single outlier', () => {
  assert.equal(areas([badPenalties(1,10),round(2),round(3),round(4),round(5)]).includes('penalties'),false);
  assert.equal(areas([badPenalties(1),badPenalties(2),round(3)]).includes('penalties'),false);
});

test('repeated penalties expose actual counts, dates and a reproducible rule', () => {
  const records = [4,4,4,4,3].map((count,i)=>badPenalties(i+1,count));
  const finding = detect(records).findings.find(item=>item.area==='penalties')!;
  assert.equal(finding.metric.value,3.8);
  assert.deepEqual(finding.sample,{rounds:5,holes:90,sessions:0,shots:0});
  assert.equal(finding.from,'2026-09-01'); assert.equal(finding.to,'2026-09-05');
  assert.ok(finding.evidence[0].includes('19 penalty strokes'));
  assert.ok(finding.rule.includes('3 rounds on distinct dates'));
  const target = goal({type:'penalties',target_value:1});
  assert.equal(detect(records,target).findings[0].relation,'goal_metric');
});

test('events must recur on distinct dates, not just in multiple records from the same day', () => {
  const records = [badPenalties(1),badPenalties(2),badPenalties(3)].map(item=>({...item,date:'2026-09-01'}));
  assert.deepEqual(detect(records).findings,[]);
});

test('the recent window prevents older patterns from dominating current findings', () => {
  const records = [1,2,3].map(day=>badPenalties(day)).concat([4,5,6,7,8].map(round));
  assert.equal(areas(records).includes('penalties'),false);
});

test('penalties require full recorded hole totals and never add shot attribution twice', () => {
  const records = [1,2,3].map(day=>badPenalties(day,2));
  records.forEach(item=>{stat(item,0).shots=[{id:'ob',shotNumber:1,club:'Driver',result:'ob',penaltyStrokes:2}];});
  assert.equal(detect(records).findings.find(item=>item.area==='penalties')!.metric.value,2);
  records[0].roundHoles[5].playerStats=[];
  assert.equal(areas(records).includes('penalties'),false);
});

test('score-only historical rounds never imply tracked penalties, putts, or tee outcomes', () => {
  const records = [1,2,3].map(day=>{
    const result = round(day); delete result.players; delete result.status;
    result.roundHoles=result.roundHoles.map(hole=>({hole:hole.hole,par:hole.par,score:hole.score})); return result;
  });
  assert.deepEqual(detect(records).findings,[]);
  assert.equal(detect(records).coverage.find(item=>item.area==='Penalties')!.sufficient,false);
});

test('tee and directional signals require at least 30 tracked outcomes and repeated per-round rates', () => {
  const enough = [1,2,3].map(badTee);
  const findings = detect(enough,goal({type:'tee_in_play',target_value:80})).findings;
  assert.equal(findings.find(item=>item.area==='tee_in_play')!.metric.value,60);
  assert.equal(findings.find(item=>item.area==='direction')!.metric.value,40);
  assert.equal(findings.find(item=>item.area==='direction')!.relation,'goal_metric');
  const tooFew = [1,2,3].map(badTee); tooFew.forEach(item=>{stat(item,13).teeResult=null;});
  assert.equal(areas(tooFew).includes('tee_in_play'),false);
  assert.equal(areas(tooFew).includes('direction'),false);
  const outlier = [badTee(1),round(2),round(3)]; outlier[0].roundHoles.forEach(hole=>{hole.playerStats![0].teeResult='right';});
  assert.equal(areas(outlier).includes('direction'),false);
});

test('par 3 tee results, missing outcomes and OB/water sides are never invented', () => {
  const records = [1,2,3].map(badTee);
  records.forEach(item=>{ for(let i=0;i<4;i++)stat(item,i).teeResult='right'; for(let i=10;i<14;i++)stat(item,i).teeResult='ob'; });
  assert.equal(areas(records).includes('direction'),false);
  assert.equal(detect(records).findings.find(item=>item.area==='tee_in_play')!.sample.holes,30);
});

test('putt totals require fully tracked rounds and reject a single high-putt outlier', () => {
  const records = [1,2,3].map(round); records.forEach(item=>item.roundHoles.forEach(hole=>{hole.playerStats![0].putts=2;}));
  assert.equal(detect(records).findings.find(item=>item.area==='putts')!.metric.value,36);
  stat(records[0],0).putts=null;
  assert.equal(areas(records).includes('putts'),false);
  const outlier = [1,2,3,4,5].map(round); outlier[0].roundHoles.forEach(hole=>{hole.playerStats![0].putts=10;});
  assert.equal(areas(outlier).includes('putts'),false);
});

test('three-putts are based on tracked holes with 54-hole and recurrence thresholds', () => {
  const records = [1,2,3].map(round); records.forEach(item=>{stat(item,0).putts=3;stat(item,1).putts=3;});
  const finding = detect(records).findings.find(item=>item.area==='three_putts')!;
  assert.ok(Math.abs(finding.metric.value-6/54*100)<1e-9);
  assert.ok(finding.evidence[0].includes('6 of 54'));
  stat(records[0],2).putts=null;
  assert.equal(areas(records).includes('three_putts'),false);
});

test('blow-up holes require repeated rounds, and use score relative to par', () => {
  const records = [1,2,3].map(round); records.forEach(item=>{stat(item,0).score=6;stat(item,4).score=7;});
  assert.equal(detect(records).findings.find(item=>item.area==='blow_up')!.metric.value,2);
  stat(records[2],4).score=4;
  assert.equal(areas(records).includes('blow_up'),false);
});

test('par scoring compares excess strokes rather than raw scores and requires repeated relative gaps', () => {
  const equal = [1,2,3].map(round); equal.forEach(item=>item.roundHoles.forEach(hole=>{hole.playerStats![0].score=hole.par+1;}));
  assert.equal(areas(equal).includes('par_scoring'),false);
  const weak = [1,2,3].map(round); weak.forEach(item=>item.roundHoles.filter(hole=>hole.par===3).forEach(hole=>{hole.playerStats![0].score=5;}));
  const finding = detect(weak).findings.find(item=>item.area==='par_scoring')!;
  assert.equal(finding.id,'par-3');assert.equal(finding.metric.value,2);assert.equal(finding.sample.holes,12);
  weak[2].roundHoles.filter(hole=>hole.par===3).forEach(hole=>{hole.playerStats![0].score=3;});
  assert.equal(areas(weak).includes('par_scoring'),false);
});

test('unfinished rounds and companions do not contribute to scoring findings', () => {
  const unfinished = [1,2,3].map(day=>({...badPenalties(day),status:'active' as const}));
  assert.deepEqual(detect(unfinished).findings,[]);
  const companions = [1,2,3].map(round);companions.forEach(item=>{item.players!.push({id:'other',name:'Other',scores:Array(18).fill(10)});item.roundHoles.forEach(hole=>hole.playerStats!.push({...hole.playerStats![0],playerId:'other',score:10,penalties:5,putts:4,teeResult:'right'}));});
  assert.deepEqual(detect(companions).findings,[]);
});

test('carry variation requires individual samples within multiple sessions', () => {
  const records = [1,2,3].map(day=>session(day,Array.from({length:10},(_,i)=>metric(i,i%2?250:150))));
  const finding = detect(records,carryGoal).findings.find(item=>item.area==='carry_consistency')!;
  assert.equal(finding.metric.value,25);assert.equal(finding.sample.shots,30);
  assert.equal(finding.relation,'goal_metric');
  const summaries = records.map(item=>({...item,clubMetrics:item.clubMetrics!.map(reading=>({...reading,sampleType:'Average' as const}))}));
  assert.equal(areas(summaries,carryGoal).includes('carry_consistency'),false);
  const insufficient = records.map(item=>({...item,clubMetrics:item.clubMetrics!.slice(0,9)}));
  assert.equal(areas(insufficient,carryGoal).includes('carry_consistency'),false);
});

test('practice offline bias requires recurring multi-shot sessions, respects clubs, and remains practice evidence', () => {
  const records = [1,2,3].map(day=>session(day,Array.from({length:10},(_,i)=>metric(i,200,{offline:i<6?15:0}))));
  const finding = detect(records,carryGoal).findings.find(item=>item.area==='practice_direction')!;
  assert.equal(finding.metric.value,60);assert.equal(finding.sample.sessions,3);
  assert.ok(finding.evidence.some(item=>item.includes('does not establish a course miss')));
  assert.equal(areas(records,goal({...carryGoal,club:'7-iron'})).includes('practice_direction'),false);
  assert.equal(detect(records).findings[0].relation,'practice_context');
  const oneOutlier = [session(1,Array.from({length:100},(_,i)=>metric(i,200,{offline:15}))),session(2,Array.from({length:10},(_,i)=>metric(i,200,{offline:0}))),session(3,Array.from({length:10},(_,i)=>metric(i,200,{offline:0})))];
  assert.equal(areas(oneOutlier,carryGoal).includes('practice_direction'),false);
});

test('sustained carry regression uses 6 session means, while one bad session does not trigger', () => {
  const records = [200,200,200,180,180,180].map((carry,i)=>session(i+1,[metric(1,carry,{sampleType:'Average'})]));
  const finding = detect(records,carryGoal).findings.find(item=>item.area==='carry')!;
  assert.equal(finding.metric.value,180);assert.equal(finding.sample.sessions,6);
  const outlier = [200,200,200,200,200,100].map((carry,i)=>session(i+1,[metric(1,carry,{sampleType:'Average'})]));
  assert.equal(areas(outlier,carryGoal).includes('carry'),false);
  assert.equal(areas(records.slice(1),carryGoal).includes('carry'),false);
});

test('invalid practice values, Best summaries and course measurements cannot create practice weaknesses', () => {
  const invalid = [1,2,3].map(day=>session(day,Array.from({length:10},(_,i)=>metric(i,NaN,{offline:Infinity}))));
  const best = [1,2,3].map(day=>session(day,Array.from({length:10},(_,i)=>metric(i,i%2?250:50,{sampleType:'Best',offline:30}))));
  const course = [1,2,3].map(day=>({...session(day,Array.from({length:10},(_,i)=>metric(i,i%2?250:50,{offline:30}))),category:'Course round'}));
  assert.deepEqual(detect([...invalid,...best,...course],carryGoal).findings,[]);
});

test('insights are deterministic, do not mutate observations, and prioritize direct goal evidence', () => {
  const records = [1,2,3].map(badTee); records.forEach(item=>{stat(item,0).penalties=4;});
  const snapshot = structuredClone(records);
  const target = goal({type:'tee_in_play',target_value:80});
  const result = detect(records,target);
  assert.deepEqual(detect([...records].reverse(),target),result);
  assert.deepEqual(records,snapshot);
  assert.equal(result.findings[0].area,'tee_in_play');
  assert.ok(result.findings.every(item=>item.evidence.length>=2 && item.rule.length>0));
});

test('healthy samples report assessed coverage without inventing a finding', () => {
  const result = detect([1,2,3].map(round));
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.find(item=>item.area==='Penalties')!.sufficient,true);
  assert.equal(result.coverage.find(item=>item.area==='Tee results')!.sufficient,true);
  assert.deepEqual(detect([]).findings,[]);
});
