"""
Freeze the eligible NEW journals into a canary plan (<= 25, stratified by department) and a remainder plan (batches of <= 100 at write time). Local files only; nothing is written to a
database. Existing journals are never touched.

  python3 freeze.py <run-id> <out-dir>

Reads work/stage2.json. Applies the recorded hand holds (serials no pattern catches), orders the rest round-robin by department so the canary covers every department that has
journals, then writes manifest-frozen.json (sorted, compact JSON; its sha256 is printed and recorded), plan-canary.json, plan-rest.json and hand-holds.json.
"""
import json,os,sys,hashlib,collections,subprocess
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
RUN,OUT=sys.argv[1],sys.argv[2]; W=os.path.join(ROOT,'data','dept-coverage','work'); os.makedirs(OUT,exist_ok=True)
st=json.load(open(f'{W}/stage2.json')); elig=st['eligible']
HAND_HOLDS={'PhotonicsViews':'magazine-style trade serial (Wiley), not a research journal',
 'Journal of Validation Technology':'trade periodical for the pharmaceutical industry, not a research journal',
 'maschinenbau':'German trade magazine of the same name; identity and type unconfirmed',
 'Pharmaceutical journal/The pharmaceutical journal':'professional news magazine of the Royal Pharmaceutical Society, not a research journal',
 'Panorama actual del medicamento':'professional drug-information bulletin of a pharmacists\' council, not a research journal'}
PRIORITY=['Crossref member','NLM Catalog','OpenAlex','DOAJ']; LABEL={'Crossref member':'Crossref','NLM Catalog':'NLM Catalog','OpenAlex':'OpenAlex','DOAJ':'DOAJ'}
keep=[];hand=[]
for c in elig:
    if c['title'] in HAND_HOLDS: hand.append({'title':c['title'],'issns':c['ids'],'dept':c['dept'],'reason':HAND_HOLDS[c['title']]}); continue
    keep.append(c)
def row(c):
    srcs=sorted({s['src'] for s in c['sources']},key=lambda s:PRIORITY.index(s)); p=c['publication']
    urls=[s['url'] for s in c['sources'] if s.get('url')]
    for k,u in (('crossref','https://api.crossref.org/journals/'),('openalex','https://api.openalex.org/sources/issn:')):
        if p.get(k): urls.append(u+p[k]['via'])
    if p.get('pubmed'): urls.append('https://pubmed.ncbi.nlm.nih.gov/?term='+p['pubmed']['via']+'%5BISSN%5D&filter=years.2024-2026')
    ids=c['ids']
    return {'title':c['title'],'issn':ids[0],'eissn':ids[1] if len(ids)>1 else None,'publisherName':c['publisher'],'subjects':[],'domain':c['dept'],'country':c.get('country'),'homepage':c.get('homepage'),
            'basisSource':LABEL[srcs[0]],'sourceId':'|'.join(f"{s['src']}:{s.get('ref')}" for s in c['sources']),
            'evidence':{'listedBy':srcs,'route':c['route'],'sources':c['sources'],'topics':(c.get('topicDecision') or {}).get('evidence'),'official':c['official'].get('evidence') if c['official'].get('dept') else None,
                        'titleTopics':(c.get('titleTopics') or {}).get('evidence'),'publication':{'class':p['class'],'why':p['why']},'publisherFill':c.get('publisherFill'),'renameCheck':{'nlmRelations':(c.get('renameCheck') or {}).get('nlmRelations')},'verified':'2026-10-29','urls':urls}}
rows=[row(c) for c in keep]
lists=collections.defaultdict(list)
for r in sorted(rows,key=lambda r:r['title']): lists[r['domain']].append(r)
order=[]; ls=[lists[k] for k in sorted(lists,key=lambda d:-len(lists[d]))]
while any(ls):
    for l in ls:
        if l: order.append(l.pop(0))
n=min(25,len(order)); canary,rest=order[:n],order[n:]
mk=lambda rs:{'runId':RUN,'source':'Multiple (per row basisSource)','rows':rs}
code=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True,cwd=ROOT).stdout.strip()
frozen={'runId':RUN,'candidates':len(order),'rows':order}
fb=json.dumps(frozen,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
open(f'{OUT}/manifest-frozen.json','wb').write(fb)
json.dump(mk(canary),open(f'{OUT}/plan-canary.json','w'),ensure_ascii=False); json.dump(mk(rest),open(f'{OUT}/plan-rest.json','w'),ensure_ascii=False)
json.dump(hand,open(f'{OUT}/hand-holds.json','w'),ensure_ascii=False,indent=1)
print('eligible',len(elig),'| hand holds',len(hand),'| FROZEN',len(order),'| canary',len(canary),'| remainder',len(rest),'| HEAD',code)
print('by dept',dict(collections.Counter(r['domain'] for r in order)))
print('canary by dept',dict(collections.Counter(r['domain'] for r in canary)))
print('basis',dict(collections.Counter(r['basisSource'] for r in order)))
print('manifest sha256',hashlib.sha256(fb).hexdigest())
