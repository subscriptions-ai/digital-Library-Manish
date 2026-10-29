"""
Stage 5: freeze the eligible set (local files only; nothing is written to a database).

  python3 stage5_freeze.py <run-id>      reads work/stage4.json and hand-holds.json (decisions a person made after reading the eligible titles; each with its reason)
  writes docs/nursing-coverage-2026-10-29/: manifest-frozen.json (byte-exact, hashed), plan-canary.json (<= 25, stratified by listing source), plan-rest.json, frozen-hand-holds.json, frozen-code-hashes.json

Once written, later discoveries are NOT added to this run: the frozen manifest is the whole authorization of the run.
"""
import json,os,sys,hashlib,collections,subprocess
sys.path.insert(0,os.path.dirname(__file__)); from common import *
RUN=sys.argv[1]
rows=[r for r in json.load(open(f'{WORK}/stage4.json')) if r['final']=='eligible']
hand=json.load(open(f'{OUT}/hand-holds.json')) if os.path.exists(f'{OUT}/hand-holds.json') else {}
PRIORITY=['SciELO','J-STAGE','KoreaMed','NLM Catalog','CINAHL','OpenAlex']
keep=[];held=[]
titleCount=collections.Counter(norm(r['title']) for r in rows)
for r in rows:
    if titleCount[norm(r['title'])]>1 and not (r['issns'][0] in hand): hand[r['issns'][0]]='same normalised title as another eligible candidate: unresolved same-title conflict'
    if r['issns'][0] in hand or r['title'] in hand: held.append({'title':r['title'],'issns':r['issns'],'reason':hand.get(r['issns'][0]) or hand.get(r['title'])}); continue
    keep.append(r)
def row(r):
    srcs=sorted({s['source'] for s in r['sources'] if s['source']!='DOAJ'},key=lambda s:PRIORITY.index(s) if s in PRIORITY else 9) or ['DOAJ']; ids=r['issns']; p=r['publication']
    ex=r.get('aimsExcerpt') or {}
    urls=[s['facts'].get('evidenceUrl') or s['facts'].get('jstageUrl') or '' for s in r['sources']]+([p['latestConfirmed']['url']] if p['latestConfirmed'] else [])
    return {'title':r['title'],'issn':ids[0],'eissn':ids[1] if len(ids)>1 else None,'publisherName':r['publisherResolved'],'subjects':[],'domain':'Nursing','country':None,'homepage':r['homepageResolved'],'basisSource':srcs[0],
      'sourceId':'|'.join(f"{s['source']}:{(s['facts'].get('uid') or s['facts'].get('oaId') or s['facts'].get('cd') or s['facts'].get('koreamedId') or s['facts'].get('evidenceUrl') or '')}" for s in r['sources']),
      'evidence':{'listedBy':sorted({s['source'] for s in r['sources']}),'alternateTitles':r['altTitles'][:6],'scope':{'tier':r['scope']['tier'],'signals':[k for k in('NLM','CINAHL','SCIELO','OA','DOAJ','SOCIETY','TITLE') if r['scope'][k]],'evidence':r['scope']['evidence'],'aimsExcerpt':ex.get('excerpt'),'aimsUrl':ex.get('finalUrl'),'aimsRetrieved':ex.get('retrieved')},
                  'publication':{'status':p['status'],'class':p['class'],'why':p['why'],'works2024to2026':p['works2024to2026'],'currentStatements':p['currentStatements'],'latestConfirmed':p['latestConfirmed']},
                  'lineage':{'nlmRelations':r.get('nlmRelations'),'nearCatalogueTitles':r['renameSimilar']},'urls':[u for u in urls if u],'verified':'2026-10-29'}}
rws=[row(r) for r in keep]
lists=collections.defaultdict(list)
for x in rws: lists[x['basisSource']].append(x)
order=[];ls=[lists[k] for k in PRIORITY if k in lists]+[v for k,v in lists.items() if k not in PRIORITY]
while any(ls):
    for l in ls:
        if l: order.append(l.pop(0))
n=min(25,len(order)); canary,rest=order[:n],order[n:]
frozen={'runId':RUN,'candidates':len(order),'rows':order}
fb=json.dumps(frozen,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
open(f'{OUT}/manifest-frozen.json','wb').write(fb)
mk=lambda rs:{'runId':RUN,'source':'Multiple (per row basisSource)','department':'Nursing','rows':rs}
json.dump(mk(canary),open(f'{OUT}/plan-canary.json','w'),ensure_ascii=False); json.dump(mk(rest),open(f'{OUT}/plan-rest.json','w'),ensure_ascii=False)
json.dump(held,open(f'{OUT}/frozen-hand-holds.json','w'),ensure_ascii=False,indent=1)
files=['scripts/journal-source-apply.cjs']+sorted(os.path.relpath(p,ROOT) for p in __import__('glob').glob(f'{ROOT}/scripts/nursing-coverage/*.py')+__import__('glob').glob(f'{ROOT}/scripts/nursing-assessment/*.py'))
def sha(p):
    with open(os.path.join(ROOT,p),'rb') as f: return hashlib.sha256(f.read()).hexdigest()
head=subprocess.check_output(['git','-C',ROOT,'rev-parse','HEAD']).decode().strip()
json.dump({'gitHead':head,'note':'files may be uncommitted at freeze time; their hashes are what ran','sha256':{f:sha(f) for f in files}},open(f'{OUT}/frozen-code-hashes.json','w'),indent=1)
print('eligible',len(rows),'| hand-held after reading titles',len(held),'| FROZEN',len(order),'| canary',len(canary),'| remainder',len(rest))
print('canary by label',dict(collections.Counter(x['basisSource'] for x in canary)),'| all by label',dict(collections.Counter(x['basisSource'] for x in order)))
print('manifest sha256',hashlib.sha256(fb).hexdigest())
