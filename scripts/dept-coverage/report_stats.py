"""
Reconciled counts for the report. Reads work/pool.json, classified.json, stage1.json, stage2.json and the production snapshots. Prints JSON.
Every net-new cluster gets exactly ONE primary outcome, by this precedence, so the totals add up:
  out-of-scope (no target department named by any evidence route) > held at stage 1 (first failed gate) > held at stage 2 (publication / rename / publisher) > eligible
"""
import json,os,sys,collections
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
W=os.path.join(ROOT,'data','dept-coverage','work')
pool=json.load(open(f'{W}/pool.json')); s1=json.load(open(f'{W}/stage1.json')); s2=json.load(open(f'{W}/stage2.json'))
cnt=pool['counts']; out={'pool':{'distinctJournals':len(pool['clusters']),**cnt}}
src=collections.defaultdict(collections.Counter)
for c in pool['clusters']:
    for s in {x['src'] if x['src']!='Crossref member' else 'Crossref member '+x.get('group','') for x in c['sources']}: src[s][c['class']]+=1
out['bySourceClass']={k:dict(v) for k,v in src.items()}
held1={h['key']:h for h in s1['held']}; held2={h['key']:h for h in s2['held']}; elig={c['key'] for c in s2['eligible']}
prim=collections.Counter(); byDept=collections.defaultdict(collections.Counter)
cand={c['key'] for c in s1['candidates']}
for c in pool['clusters']:
    if c['class']!='net-new': continue
    k=c['ids'][0]
    if k in elig: o='eligible'; d=next(x['dept'] for x in s2['eligible'] if x['key']==k)
    elif k in held2: o='held@2: '+held2[k]['why'].split(':')[0]; d=held2[k].get('dept')
    elif k in held1: o='held@1: '+held1[k]['why']; d=held1[k].get('dept')
    elif k in cand: o='candidate-not-resolved'; d=None
    else: o='out-of-scope (no target department)'; d=None
    prim[o]+=1; byDept[d or '(none)'][o]+=1
out['primaryOutcomeNetNew']=dict(prim.most_common()); out['sumCheck']=sum(prim.values())
out['byDepartment']={d:dict(v) for d,v in byDept.items() if d!='(none)'}
print(json.dumps(out,indent=1,ensure_ascii=False))
