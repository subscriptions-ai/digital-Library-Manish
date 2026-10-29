"""
Stages 3-4 of the second run: combine the aims-and-scope check with stage 1, then publication evidence (lineage-aware), publisher fill and the rename / predecessor check.
  python3 stage2b.py        reads work/stage1b.json + work/scope.json; writes work/stage2b.json {eligible, held}
Aims & scope (the journal's own site): >=3 distinct phrases of the department and at least twice the best competing target department; a site that states cessation is a hold.
Publication evidence, by lineage (OpenAlex repeats Crossref's DOIs, so the two are NOT independent):
  direct          Crossref journal record (publisher-deposited DOIs): >=3 works in 2024-26, works in >=2 of the 3 years, >=1 in 2025-26
  corroboration   at least one signal NOT derived from Crossref: PubMed work in 2025-26, J-STAGE's own latest-publication date >= 2025, 2025/2026 volume or issue on the journal's own site, DOAJ listing
  eligible when `direct`, or when OpenAlex alone shows >=3 works in >=2 years AND a corroboration exists. Failed requests and missing records are never treated as inactivity.
"""
import json,os,sys,subprocess,collections,re,time,urllib.request,urllib.parse
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
W=os.path.join(ROOT,'data','dept-coverage2','work'); R2=os.path.join(ROOT,'data','dept-coverage2','raw'); D=os.path.dirname(os.path.abspath(__file__))
s1=json.load(open(f'{W}/stage1b.json')); sc=json.load(open(f'{W}/scope.json'))
EL,ET,BT='Electrical Engineering','Electronics & Telecommunication Engineering','Bio Technology'; T=[EL,ET,BT]
held=list(s1['held']); C=[]
WEAK={'control system','control systems','transformer','transformers','sensor','sensors','electronic','electronics','communication system','communication systems','communication network','communication networks','applied microbiology','cell culture','recombinant','bioenergy','embedded system','embedded systems','magnetics','dielectric','dielectrics','power generation','power distribution'}
for r in s1['ready']+s1['site']:
    d=r['dept']; o=sc.get(r['key']) or {}; h={k:[p for p in v if p not in WEAK] for k,v in (o.get('hits') or {}).items()}   # generic phrases (sensors, electronics, control systems, applied microbiology ...) do not count as scope
    mine=len(h.get(d,[])); other=max([len(h.get(x,[])) for x in T if x!=d]+[0])
    r['site']={'status':o.get('status'),'hits':{k:v for k,v in h.items() if v},'cease':o.get('cease'),'year2025_26':o.get('year2025_26'),'pages':o.get('pages'),'snippet':o.get('snippet')}
    if o.get('cease'): held.append({'key':r['key'],'ids':r['ids'],'title':r['title'],'dept':d,'why':'the journal\'s own site states that publication has ceased'}); continue
    siteOk=o.get('status')=='ok' and mine>=3 and mine>=2*max(other,1)-0 and (other==0 or mine>=2*other)
    # Electrical vs Electronics: a site that is strong for both is ambiguous unless the title already picked
    if o.get('status')=='ok' and mine>=3 and other>=3 and d in (EL,ET) and max([len(h.get(x,[])) for x in (EL,ET) if x!=d]+[0])*2>mine: siteOk=False
    if siteOk: r['families']['site']=f'{mine} phrases'
    if len(r['families'])>=2: C.append(r)
    else: held.append({'key':r['key'],'ids':r['ids'],'title':r['title'],'dept':d,'why':'one kind of department evidence only, and the journal\'s own site gave no usable aims-and-scope confirmation ('+(o.get('status') or 'not fetched')+')'})
print('after aims & scope:',len(C),dict(collections.Counter(c['dept'] for c in C)),'| from the single-kind group:',sum(1 for c in C if 'site' in c['families'] and len(c['families'])==2 and not any(k in c['families'] for k in('title','society','catalogue') ) ))
# ---- publication evidence
rows=[{'key':c['key'],'title':c['title'],'issn':c['ids'][0],'eissn':c['ids'][1] if len(c['ids'])>1 else None} for c in C]
pe=f'{W}/pubevidence.json'; old=f'{ROOT}/data/dept-coverage/work/pubevidence.json'
have=json.load(open(pe)) if os.path.exists(pe) else (json.load(open(old)) if os.path.exists(old) else {})
todo=[r for r in rows if r['key'] not in have]
if todo:
    json.dump(todo,open(f'{W}/pub-in.json','w')); subprocess.run([sys.executable,f'{D}/publication_evidence.py',f'{W}/pub-in.json',f'{W}/pub-out.json'],check=True)
    have.update(json.load(open(f'{W}/pub-out.json'))); json.dump(have,open(pe,'w'))
def pubclass(c):
    e=have.get(c['key']) or {}; cr,oa,pm=e.get('crossref'),e.get('openalex'),e.get('pubmed')
    def stat(x):
        if not x or x['titleOverlap']<0.5: return None
        by=x['byYear']; n=sum(by.get(y,0) for y in('2024','2025','2026')); return {'n':n,'cur':sum(by.get(y,0) for y in('2025','2026')),'yrs':sum(1 for y in('2024','2025','2026') if by.get(y,0)>0)}
    a,b=stat(cr),stat(oa)
    direct=bool(a and a['n']>=3 and a['yrs']>=2 and a['cur']>=1)
    oaok=bool(b and b['n']>=3 and b['yrs']>=2 and b['cur']>=1)
    corr=[]
    if pm and pm.get('articles2024to2026',0)>=1: corr.append('PubMed '+str(pm['articles2024to2026'])+' articles 2024-26')
    js=c['recent'].get('jstage')
    if js and (js.get('currentPubdate') or '')>='2025-01-01' and not js.get('suspended'): corr.append('J-STAGE latest publication '+js['currentPubdate'])
    if c['site'].get('year2025_26'): corr.append('2025/2026 volume or issue on the journal\'s own site')
    if oa and oa.get('isInDoaj'): corr.append('DOAJ listing (per OpenAlex)')
    if direct: return 'P-A','direct (Crossref publisher deposits)',corr,a,b
    if oaok and corr: return 'P-A','OpenAlex counts + independent corroboration',corr,a,b
    if (a or b): return 'P-B','recent works but not enough: '+(f'Crossref {a["n"]} works/{a["yrs"]} yrs' if a else f'OpenAlex only {b["n"]} works/{b["yrs"]} yrs, no independent corroboration'),corr,a,b
    return 'P-C','no matching record or no recent work in Crossref/OpenAlex (a missing record is not proof of inactivity; no corroboration either)',corr,a,b
def fill(c):
    if (c.get('publisher') or '').strip(): return
    e=have.get(c['key']) or {}
    for name in('crossref','openalex'):
        x=e.get(name); v=(x or {}).get('publisher') if name=='crossref' else (x or {}).get('host')
        if x and x['titleOverlap']>=0.5 and (v or '').strip(): c['publisher']=v.strip(); c['publisherFill']={'from':name,'via':x['via']}; return
elig=[]
for c in C:
    fill(c); cls,why,corr,a,b=pubclass(c); c['publication']={'class':cls,'why':why,'corroboration':corr,'crossref':have.get(c['key'],{}).get('crossref'),'openalex':have.get(c['key'],{}).get('openalex'),'pubmed':have.get(c['key'],{}).get('pubmed')}
    base={k:c[k] for k in('key','ids','title','dept')}
    if cls!='P-A': held.append({**base,'why':f'publication evidence {cls}: {why}'}); continue
    if not (c.get('publisher') or '').strip(): held.append({**base,'why':'no publisher recorded (also none in Crossref/OpenAlex with a matching title)'}); continue
    elig.append(c)
print('P-A with publisher:',len(elig))
# ---- NLM uid + rename / similarity
def nlm_uid(c):
    for r in c['sources']:
        if r['src']=='NLM Catalog' and str(r.get('ref','')).startswith('nlmcatalog:'): return r['ref'].split(':')[1]
    for i in c['ids']:
        q=urllib.parse.urlencode({'db':'nlmcatalog','retmode':'json','term':f'{i}[ISSN]'})
        for a in range(3):
            try:
                d=json.load(urllib.request.urlopen(urllib.request.Request('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?'+q,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=40)); ids=d['esearchresult']['idlist']; time.sleep(0.35)
                if ids: return ids[0]
                break
            except Exception: time.sleep(2*(a+1))
    return None
rn=f'{W}/rename.json'; rin=f'{W}/rename-in.json'
cache=json.load(open(rn)) if os.path.exists(rn) else {}
need=[c for c in elig if c['key'] not in cache]
if need:
    json.dump([{'key':c['key'],'title':c['title'],'publisher':c['publisher'],'issns':c['ids'],'nlmUid':nlm_uid(c)} for c in need],open(rin,'w'))
    subprocess.run([sys.executable,f'{D}/rename_check.py',R2,rin,rn+'.new'],check=True); cache.update(json.load(open(rn+'.new'))); json.dump(cache,open(rn,'w'))
final=[]
for c in elig:
    r=cache.get(c['key'],{}); base={k:c[k] for k in('key','ids','title','dept')}
    if r.get('nlmHit'): held.append({**base,'why':'rename/continuation: NLM relation to a catalogue journal','detail':r['nlmHit']}); continue
    if r.get('similar'): held.append({**base,'why':'near-identical title already in the catalogue (possible rename, edition or same-title conflict)','detail':r['similar']}); continue
    c['renameCheck']=r; final.append(c)
json.dump({'eligible':final,'held':held},open(f'{W}/stage2b.json','w'),ensure_ascii=False)
print('eligible',len(final),dict(collections.Counter(c['dept'] for c in final)))
print('held total',len(held),collections.Counter(h['why'].split(':')[0][:70] for h in held).most_common(8))
