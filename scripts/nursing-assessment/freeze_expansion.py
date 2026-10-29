"""
Freeze the eligible NEW Nursing journals into a canary plan and a remainder plan (local files only; nothing is written to a database).

  python3 freeze_expansion.py <work-dir> <out-dir> <run-id>

Takes the MetadataOnly-eligible net-new journals from nu/assessment-final.json, removes (and records, with the reason) every journal that
  - the rename/continuation check flagged (NLM "Continues/Continued by" onto a catalogue journal, or a near-identical title already in the catalogue), and
  - the hand holds listed in HAND_HOLDS (newsletter-type serials that no pattern catches),
then orders the rest round-robin by listing source and writes the first min(25, n) as the canary and the rest as the remainder. Existing journals are never touched.
"""
import json,sys,hashlib,collections
W,O,RUN=sys.argv[1],sys.argv[2],sys.argv[3]
a=json.load(open(f'{W}/nu/assessment-final.json')); rn=json.load(open(f'{W}/nu/rename-out.json'))
HAND_HOLDS={'Stat':'newsletter-type serial of a state nurses association (publication type not a journal with confidence)','Nurse Author & Editor (Wiley-Blackwell)':'newsletter-type quarterly of nursing editors, not a research journal'}
PRIORITY=['SciELO','KoreaMed','NLM Catalog','CINAHL','OpenAlex']
elig=[x for x in a['netNew'] if x['metadataOnlyEligible']]; keep=[];held=[]
for x in elig:
    k=x['issns'][0]; r=rn.get(k,{})
    if r.get('nlmHit'): held.append({'title':x['title'],'issns':x['issns'],'reason':'rename/continuation: NLM relation to a catalogue journal','detail':r['nlmHit']}); continue
    if r.get('similar'): held.append({'title':x['title'],'issns':x['issns'],'reason':'near-identical title already in the catalogue (possible rename, edition or same-title conflict)','detail':r['similar']}); continue
    if x['title'] in HAND_HOLDS: held.append({'title':x['title'],'issns':x['issns'],'reason':HAND_HOLDS[x['title']]}); continue
    keep.append(x)
def label(x):
    srcs=sorted({s['source'] for s in x['sources']},key=lambda s:PRIORITY.index(s) if s in PRIORITY else 9); return srcs[0],srcs
def row(x):
    pf=(x.get('publisherFill') or {}).get('value'); ids=x['issns']; b,srcs=label(x)
    urls=[s['ref'] for s in x['sources'] if str(s['ref']).startswith('http')]
    p=x['publication']
    for key,u in (('crossref','https://api.crossref.org/journals/'),('openalex','https://api.openalex.org/sources/issn:')):
        if p.get(key): urls.append(u+p[key]['via'])
    if p.get('pubmed'): urls.append('https://pubmed.ncbi.nlm.nih.gov/?term='+p['pubmed']['via']+'%5BISSN%5D&filter=years.2024-2026')
    return {'title':x['title'],'issn':ids[0],'eissn':ids[1] if len(ids)>1 else None,'publisherName':x['publisher'] or pf,'subjects':[],'domain':'Nursing','country':None,'homepage':x['homepage'],'basisSource':b,'sourceId':'|'.join(f"{s['source']}:{s['ref']}" for s in x['sources']),
            'evidence':{'listedBy':srcs,'sources':x['sources'],'scope':x['scope'],'publication':{'class':p['class'],'why':p['why'],'recentMax':p['recentMax'],'currentlyPublishedStatements':p.get('currentlyPublishedStatements')},'renameCheck':{'nlmRelations':rn.get(x['issns'][0],{}).get('nlmRelations'),'similar':[]},'verified':'2026-10-28','urls':urls}}
rows=[row(x) for x in keep]
lists=collections.defaultdict(list)
for r in rows: lists[r['basisSource']].append(r)
order=[]; ls=[lists[k] for k in PRIORITY if k in lists]
while any(ls):
    for l in ls:
        if l: order.append(l.pop(0))
n=min(25,len(order)); canary,rest=order[:n],order[n:]
mk=lambda rs,src:{'runId':RUN,'source':'Multiple (per row basisSource)','department':'Nursing','rows':rs}
frozen={'runId':RUN,'candidates':len(order),'rows':order}
fb=json.dumps(frozen,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
open(f'{O}/manifest-frozen.json','wb').write(fb)
json.dump(mk(canary,0),open(f'{O}/plan-canary.json','w'),ensure_ascii=False); json.dump(mk(rest,0),open(f'{O}/plan-rest.json','w'),ensure_ascii=False)
json.dump(held,open(f'{O}/frozen-hand-and-rename-holds.json','w'),ensure_ascii=False,indent=1)
print('eligible',len(elig),'| held by rename/continuation/hand check',len(held),'| FROZEN',len(order),'| canary',len(canary),'| remainder',len(rest))
print('canary by label:',dict(collections.Counter(r['basisSource'] for r in canary)),'| remainder by label:',dict(collections.Counter(r['basisSource'] for r in rest)))
print('manifest sha256',hashlib.sha256(fb).hexdigest())
