import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendGoalFocus } from './goal-recommendations.ts';
import { detectGoalInsights } from './goal-insights.ts';
import { buildGoalProgressIndex, type GoalProgressRecord, type GoalSessionRecord } from './goal-progress.ts';
import type { GoalInput } from './goals.ts';
import type { RoundRecord } from './rounds.ts';

function goal(patch: Partial<GoalInput> = {}): GoalInput {
  return {id:'score',title:'Break 90',type:'score',target_value:90,starting_value:null,target_date:null,status:'active',is_primary:true,club:null,unit:null,...patch};
}
function round(day: number, inPlay = 5, club = 'Driver', penalties = 0): RoundRecord {
  const pars = Array.from({length:18},()=>4);
  return {id:`r${day}`,kind:'round',title:'Round',category:'On course',date:`2026-09-${String(day).padStart(2,'0')}`,notes:'',done:true,status:'complete',holeCount:'18',players:[{id:'me',name:'Me',scores:pars}],
    roundHoles:pars.map((par,i)=>({hole:i+1,par,score:par,playerStats:[{playerId:'me',score:par,putts:1,penalties:i===0?penalties:0,completed:true,
      teeResult:i<10 ? i<inPlay ? 'in_play':'right' : null,
      shots:i<10 ? [{id:`shot${i}`,shotNumber:1,club,result:i<inPlay?'good':'right',penaltyStrokes:i===0?penalties:0}]:[]}]}))};
}
function session(day: number, offline = 20, speed = 90, club = 'Driver', count = 10): GoalSessionRecord {
  return {id:`s${day}`,kind:'session',category:'Simulator',date:`2026-09-${String(day).padStart(2,'0')}`,clubMetrics:Array.from({length:count},(_,i)=>({id:String(i),sampleType:'Single shot',club,offline:i%2 ? offline : -offline,clubSpeed:speed,carry:200}))};
}
function result(records: GoalProgressRecord[], goals = [goal()]) {
  const index = buildGoalProgressIndex(records);
  const primary = goals.find(g=>g.is_primary) ?? goals[0] ?? goal();
  const findings = new Map(goals.flatMap(g=>detectGoalInsights(g,index).findings).map(f=>[f.id,f]));
  return recommendGoalFocus(goals,index,{...detectGoalInsights(primary,index),findings:[...findings.values()]});
}

test('repeated attributed course misses and practice dispersion select one high-confidence club focus',()=>{
  const output = result([1,2,3].flatMap(d=>[round(d),session(d)]));
  assert.equal(output.primary?.id,'accuracy-driver');
  assert.equal(output.primary?.confidence,'high');
  assert.equal(output.primary?.ranking.agreement,1);
  assert.equal(output.primary?.evidence.length,2);
  assert.deepEqual(output.primary?.evidence.map(e=>e.sample),[{records:3,observations:30},{records:3,observations:30}]);
  assert.equal(output.primary?.ranking.score,output.candidates[0].ranking.score);
  assert.ok(output.primary?.goalIds.includes('score'));
});

test('OB/water recurrence qualifies even when most tees are in play and never invents a direction',()=>{
  const records = [1,2,3].map(d=>round(d,8));
  records.forEach(r=>r.roundHoles.slice(8,10).forEach(h=>{h.playerStats![0].teeResult='ob';h.playerStats![0].shots[0].result='ob';}));
  const output = result([...records,...[1,2,3].map(d=>session(d))]);
  assert.equal(output.primary?.id,'accuracy-driver');
  assert.ok(output.primary?.evidence[0].description.includes('6 OB'));
  assert.ok(output.primary?.evidence[0].description.includes('0 right'));
});

test('unlabelled tees cannot be linked to driver practice; companions and ambiguous first shots are excluded',()=>{
  const records = [1,2,3].map(d=>round(d));
  records.forEach(r=>r.roundHoles.forEach(h=>{h.playerStats![0].shots=[];h.playerStats!.push({...h.playerStats![0],playerId:'friend',shots:[{id:'f',shotNumber:1,club:'Driver',result:'right',penaltyStrokes:1}]});}));
  const output = result([...records,...[1,2,3].map(d=>session(d))]);
  assert.ok(output.candidates.every(c=>c.confidence!=='high'));
  assert.ok(output.candidates.every(c=>c.id!=='accuracy-driver'));
  const ambiguous = [1,2,3].map(d=>round(d));
  ambiguous.forEach(r=>r.roundHoles.forEach(h=>h.playerStats![0].shots.push({...h.playerStats![0].shots[0],id:'duplicate'})));
  assert.ok(result(ambiguous).candidates.every(c=>c.id!=='accuracy-driver'));
});

test('one large session or one bad round never qualifies a linked recommendation',()=>{
  assert.equal(result([round(1,0),session(1,100,90,'Driver',500)]).primary,null);
  const outlier = result([round(1,0),round(2,10),round(3,10),session(1,100),session(2,0),session(3,0)]);
  assert.equal(outlier.primary,null);
  assert.equal(outlier.status,'insufficient_evidence');
});

test('missing offline, average/best readings, different clubs and same-day records cannot inflate agreement',()=>{
  for (const kind of ['missing','Average','Best','other','same-day'] as const) {
    const sessions = [1,2,3].map(d=>session(d));
    sessions.forEach(s=>{ if(kind==='same-day')s.date='2026-09-01'; else s.clubMetrics!.forEach(m=>{if(kind==='missing')delete m.offline;else if(kind==='other')m.club='3 Wood';else m.sampleType=kind;}); });
    assert.equal(result([...sessions,...[1,2,3].map(d=>round(d))]).candidates.find(c=>c.id==='accuracy-driver')?.confidence,'moderate',kind);
  }
});

test('club matching preserves wood versus hybrid and ignores par 3 and second-shot clubs',()=>{
  const records = [1,2,3].map(d=>round(d,5,'3 Wood'));
  assert.equal(result([...records,...[1,2,3].map(d=>session(d,20,90,'3 Hybrid'))]).candidates.find(c=>c.id==='accuracy-3wood')?.confidence,'moderate');
  records.forEach(r=>r.roundHoles.forEach(h=>{h.par=3;if (h.playerStats![0].shots[0]) h.playerStats![0].shots[0].shotNumber=2;}));
  assert.ok(result(records).candidates.every(c=>!c.club));
});

test('primary goal relevance outranks an unrelated larger problem and secondary goals affect relevance',()=>{
  const records = [1,2,3].map(d=>round(d,5,'Driver',5));
  records.forEach(r=>r.roundHoles.forEach(h=>{h.playerStats![0].putts=2;}));
  const putting = goal({id:'putting',type:'putts',target_value:30});
  const output = result(records,[putting,goal({is_primary:false})]);
  assert.equal(output.primary?.area,'putting');
  const penalty = output.candidates.find(c=>c.area==='penalties')!;
  assert.equal(penalty.ranking.relevance,0.85*0.7);
  assert.equal(result(records,[putting,goal({status:'archived',is_primary:false})]).candidates.find(c=>c.area==='penalties')!.ranking.relevance,0.15);
});

test('size and sample agreement contribute reproducibly to priority; duplicate areas are merged',()=>{
  const output = result([1,2,3].flatMap(d=>[round(d,3),session(d)]));
  const c=output.primary!;
  const r=c.ranking;
  assert.equal(r.score,r.relevance*40+r.magnitude*25+r.confidence*15+r.trend*10+r.agreement*10);
  assert.equal(new Set(output.candidates.map(c=>`${c.area}:${c.club}`)).size,output.candidates.length);
  assert.ok(result([1,2,3].map(d=>round(d,0))).candidates.find(c=>c.id==='accuracy-driver')!.ranking.magnitude > result([1,2,3].map(d=>round(d,5))).candidates.find(c=>c.id==='accuracy-driver')!.ranking.magnitude);
});

function transferRecords() {
  return [...[1,2,3].map(d=>session(d,30)),...[4,5,6].map(d=>round(d,4,'Driver',2)),...[7,8,9].map(d=>session(d,15)),...[10,11,12].map(d=>round(d,8,'Driver',0))];
}
test('dispersion improvement followed by lower attributed course penalties exposes possible transfer, not causality',()=>{
  const output=result(transferRecords());
  const transfer=output.connections.find(c=>c.kind==='possible_transfer')!;
  assert.ok(transfer);
  assert.deepEqual(transfer.evidence.map(e=>e.value),[30,15,2,0]);
  assert.ok(transfer.evidence[3].metric.includes('first-tee penalties'));
  assert.ok(transfer.interpretation.includes('does not establish'));
  assert.ok(transfer.evidence[1].to < transfer.evidence[3].from);
});

test('accuracy transfer can be measured without penalty observations',()=>{
  const records=transferRecords();
  records.filter((r):r is RoundRecord=>r.kind==='round').forEach(r=>r.roundHoles.forEach(h=>{if (h.playerStats![0].shots[0]) h.playerStats![0].shots[0].penaltyStrokes=NaN;}));
  const transfer=result(records).connections.find(c=>c.kind==='possible_transfer')!;
  assert.ok(transfer);
  assert.equal(transfer.evidence[3].unit,'%');
  assert.equal(transfer.evidence[3].value,80);
});

test('overlapping dates, too few shots or one exceptional improved session block transfer',()=>{
  const overlap=transferRecords();
  overlap.find(r=>r.id==='s9')!.date='2026-09-10';
  assert.equal(result(overlap).connections.length,0);
  const outlier=transferRecords();
  outlier.filter((r):r is GoalSessionRecord=>r.kind==='session' && ['s8','s9'].includes(r.id)).forEach(s=>s.clubMetrics!.forEach(m=>{m.offline=30;}));
  assert.equal(result(outlier).connections.length,0);
  const few=transferRecords();
  (few.find(r=>r.id==='s8') as GoalSessionRecord).clubMetrics!.pop();
  assert.equal(result(few).connections.length,0);
});

test('practice speed improvement and course accuracy deterioration surface both trends without causal claim',()=>{
  const records=[...[1,2,3].map(d=>session(d,20,90)),...[4,5,6].map(d=>round(d,7)),...[7,8,9].map(d=>session(d,20,100)),...[10,11,12].map(d=>round(d,3))];
  const output=result(records);
  const mixed=output.connections.find(c=>c.kind==='mixed_trends')!;
  assert.deepEqual(mixed.evidence.map(e=>e.value),[90,100,70,30]);
  assert.ok(mixed.interpretation.includes('does not show'));
  assert.equal(output.candidates.find(c=>c.id==='accuracy-driver')!.trend,'worsening');
  assert.equal(output.candidates.find(c=>c.id==='accuracy-driver')!.ranking.trend,1);
});

test('stable ordering and input immutability; inactive goals do not get recommendations',()=>{
  const records=[1,2,3].flatMap(d=>[round(d),session(d)]), original=structuredClone(records);
  assert.deepEqual(result(records),result([...records].reverse()));
  assert.deepEqual(records,original);
  assert.equal(result(records,[goal({status:'completed',is_primary:false})]).primary,null);
});

test('larger recurring samples raise coverage priority and practice alone can supply a moderate focus',()=>{
  const three=result([1,2,3].map(d=>round(d))).candidates.find(c=>c.id==='accuracy-driver')!;
  const five=result([1,2,3,4,5].map(d=>round(d))).candidates.find(c=>c.id==='accuracy-driver')!;
  assert.ok(five.ranking.confidence>three.ranking.confidence);
  assert.ok(five.ranking.score>three.ranking.score);
  const practice=result([1,2,3].map(d=>session(d)),[goal({type:'carry',club:'Driver',unit:'m',target_value:230})]);
  assert.equal(practice.primary?.id,'practice-accuracy-driver');
  assert.equal(practice.primary?.confidence,'moderate');
  assert.ok(practice.primary?.goalIds.includes('score'));
});

test('stale practice measurements do not confer high confidence on a current course pattern',()=>{
  const old=[1,2,3].map(d=>({...session(d),date:`2025-09-0${d}`}));
  const output=result([...old,...[1,2,3].map(d=>round(d))]);
  assert.equal(output.candidates.find(c=>c.id==='accuracy-driver')?.confidence,'moderate');
  assert.equal(output.candidates.find(c=>c.id==='accuracy-driver')?.ranking.agreement,0);
});

test('a single exceptional fast session or single poor round cannot create mixed trends',()=>{
  const records=[...[1,2,3].map(d=>session(d,20,90)),...[4,5,6].map(d=>round(d,9)),session(7,20,120),session(8,20,90),session(9,20,90),...[10,11,12].map(d=>round(d,5))];
  assert.ok(result(records).connections.every(c=>c.kind!=='mixed_trends'));
  const records2=[...[1,2,3].map(d=>session(d,20,90)),...[4,5,6].map(d=>round(d,9)),...[7,8,9].map(d=>session(d,20,100)),round(10,0),round(11,9),round(12,9)];
  assert.ok(result(records2).connections.every(c=>c.kind!=='mixed_trends'));
});

test('practice-only accuracy priority incorporates a sustained dispersion trend',()=>{
  const records=[...[1,2,3].map(d=>session(d,30)),...[4,5,6].map(d=>session(d,15))];
  const output=result(records,[goal({type:'carry',club:'Driver',unit:'m',target_value:230})]);
  assert.equal(output.primary?.trend,'improving');
  assert.equal(output.primary?.ranking.trend,0);
});
