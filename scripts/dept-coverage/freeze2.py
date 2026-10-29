"""
Freeze the eligible NEW journals of the second run (Bio Technology, Electrical Engineering, Electronics & Telecommunication): a canary of <= 25 stratified by department AND source, then the
remainder (written in batches of <= 100). Local files only. Cap: 2,000 unique journals.
  python3 freeze2.py <run-id> <out-dir>      reads work/stage2b.json
"""
import json,os,sys,hashlib,collections,subprocess
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
RUN,OUT=sys.argv[1],sys.argv[2]; W=os.path.join(ROOT,'data','dept-coverage2','work'); os.makedirs(OUT,exist_ok=True)
st=json.load(open(f'{W}/stage2b.json')); elig=st['eligible'][:]
HAND=json.load(open(f'{W}/hand-holds.json')) if os.path.exists(f'{W}/hand-holds.json') else {}
PRIORITY=['Crossref member','NLM Catalog','SciELO','J-STAGE','OpenAlex','DOAJ']; LABEL={'Crossref member':'Crossref','NLM Catalog':'NLM Catalog','SciELO':'SciELO','J-STAGE':'J-STAGE','OpenAlex':'OpenAlex','DOAJ':'DOAJ'}
keep=[];hand=[]
for c in sorted(elig,key=lambda c:c['title'].lower()):
    if c['title'] in HAND: hand.append({'title':c['title'],'issns':c['ids'],'dept':c['dept'],'reason':HAND[c['title']]}); continue
    keep.append(c)
keep=keep[:2000]
import re
_CTRL=re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')      # Postgres text cannot hold NUL: strip control characters from every evidence string
def _clean(o):
    if isinstance(o,str): return _CTRL.sub('',o)
    if isinstance(o,dict): return {k:_clean(v) for k,v in o.items()}
    if isinstance(o,list): return [_clean(v) for v in o]
    return o
def row(c):
    srcs=sorted({s['src'] for s in c['sources']},key=lambda s:PRIORITY.index(s)); p=c['publication']
    urls=[s['url'] for s in c['sources'] if s.get('url')]
    for k,u in (('crossref','https://api.crossref.org/journals/'),('openalex','https://api.openalex.org/sources/issn:')):
        if p.get(k): urls.append(u+p[k]['via'])
    if p.get('pubmed'): urls.append('https://pubmed.ncbi.nlm.nih.gov/?term='+p['pubmed']['via']+'%5BISSN%5D&filter=years.2024-2026')
    for pg in (c['site'].get('pages') or []): urls.append(pg['url'])
    ids=c['ids']
    return {'title':c['title'],'issn':ids[0],'eissn':ids[1] if len(ids)>1 else None,'publisherName':c['publisher'],'subjects':[],'domain':c['dept'],'country':c.get('country'),'homepage':c.get('homepage'),
            'basisSource':LABEL[srcs[0]],'sourceId':'|'.join(f"{s['src']}:{s.get('ref')}" for s in c['sources']),
            'evidence':{'listedBy':srcs,'families':c['families'],'sources':c['sources'],'official':c['official'].get('evidence') if (c.get('official') or {}).get('dept') else None,'lexicon':c.get('lexicon'),'topicShares':c.get('shares'),
                        'site':{'status':c['site'].get('status'),'hits':c['site'].get('hits'),'year2025_26':c['site'].get('year2025_26'),'pages':[{k:q[k] for k in('url','status','at','sha256')} for q in (c['site'].get('pages') or [])],'snippet':(c['site'].get('snippet') or '')[:300]},
                        'publication':{'class':p['class'],'why':p['why'],'corroboration':p.get('corroboration')},'publisherFill':c.get('publisherFill'),'renameCheck':{'nlmRelations':(c.get('renameCheck') or {}).get('nlmRelations')},'verified':'2026-10-29','urls':urls}}
rows=[_clean(row(c)) for c in keep]
lists=collections.defaultdict(list)
for r in rows: lists[(r['domain'],r['basisSource'])].append(r)
order=[]; ls=[lists[k] for k in sorted(lists,key=lambda k:-len(lists[k]))]
while any(ls):
    for l in ls:
        if l: order.append(l.pop(0))
n=min(25,len(order)); canary,rest=order[:n],order[n:]
mk=lambda rs:{'runId':RUN,'source':'Multiple (per row basisSource)','rows':rs}
code=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True,cwd=ROOT).stdout.strip()
fb=json.dumps({'runId':RUN,'candidates':len(order),'rows':order},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
open(f'{OUT}/manifest-frozen.json','wb').write(fb)
json.dump(mk(canary),open(f'{OUT}/plan-canary.json','w'),ensure_ascii=False); json.dump(mk(rest),open(f'{OUT}/plan-rest.json','w'),ensure_ascii=False)
for i in range(0,len(rest),100): json.dump(mk(rest[i:i+100]),open(f'{OUT}/plan-rest-{i//100+1}.json','w'),ensure_ascii=False)
json.dump(hand,open(f'{OUT}/hand-holds.json','w'),ensure_ascii=False,indent=1); open(f'{OUT}/frozen-at-commit.txt','w').write(code+'\n')
print('eligible',len(elig),'| hand holds',len(hand),'| FROZEN',len(order),'| canary',len(canary),'| batches',-(-len(rest)//100))
print('by dept',dict(collections.Counter(r['domain'] for r in order))); print('canary strata',dict(collections.Counter((r['domain'][:4],r['basisSource']) for r in canary)))
print('basis',dict(collections.Counter(r['basisSource'] for r in order))); print('manifest sha256',hashlib.sha256(fb).hexdigest())
