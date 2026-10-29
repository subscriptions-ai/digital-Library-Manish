"""
Stage 2: publication evidence (Crossref / OpenAlex / PubMed, per journal) and the rename / predecessor / near-title check against the WHOLE catalogue, for the stage-1 candidates.
  python3 stage2.py            reads work/stage1.json; writes work/pubevidence.json, work/rename.json, work/stage2.json {eligible:[...], held:[...]}
Publication class (same bar as the Nursing run so the two are comparable):
  P-A  >= 3 works in 2024-2026 in Crossref or OpenAlex (title overlap >= 0.5) or PubMed, AND at least one work in 2025-2026 (a journal that stopped in 2024 is not current)
  P-B  something, not enough ; P-C nothing recent ; P-I recent works only under a title that does not match (identity unconfirmed)
Only P-A, no rename/continuation/near-title hit, can be eligible.
"""
import json,os,sys,subprocess,collections
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT,RAW
W=os.path.join(ROOT,'data','dept-coverage','work'); D=os.path.dirname(os.path.abspath(__file__))
s1=json.load(open(f'{W}/stage1.json')); C=s1['candidates']
rows=[{'key':c['key'],'title':c['title'],'issn':c['ids'][0],'eissn':c['ids'][1] if len(c['ids'])>1 else None} for c in C]
pe=f'{W}/pubevidence.json'
have=json.load(open(pe)) if os.path.exists(pe) else {}
todo=[r for r in rows if r['key'] not in have]
if todo:                      # incremental: only journals not looked up before
    json.dump(todo,open(f'{W}/pub-in.json','w')); subprocess.run([sys.executable,f'{D}/publication_evidence.py',f'{W}/pub-in.json',f'{W}/pub-out.json'],check=True)
    have.update(json.load(open(f'{W}/pub-out.json'))); json.dump(have,open(pe,'w'))
ev=json.load(open(pe))
def cls(c):
    e=ev.get(c['key']) or {}; cr,oa,pm=e.get('crossref'),e.get('openalex'),e.get('pubmed')
    out=[]
    for name,x in(('crossref',cr),('openalex',oa)):
        if x and x['titleOverlap']>=0.5:
            yrs=sum(1 for y in('2024','2025','2026') if x['byYear'].get(y,0)>0)
            out.append((name,sum(x['byYear'].get(y,0) for y in('2024','2025','2026')),sum(x['byYear'].get(y,0) for y in('2025','2026')),yrs))
    if pm: out.append(('pubmed',pm['articles2024to2026'],None,None))
    mx=max([n for _,n,_,_ in out],default=0); cur=max([m for _,_,m,_ in out if m is not None],default=0)
    # Continuity: a few works in one burst is not a publishing journal. The best source must show works in at least two of the three calendar years 2024-2026 (a quarterly or an annual
    # journal passes; a one-year burst does not), and PubMed alone (which has no year split) needs 5.
    cont=any(n>=3 and m is not None and m>=1 and yrs>=2 for _,n,m,yrs in out) or any(k=='pubmed' and n>=5 for k,n,_,_ in out)
    if mx>=3 and cont: return 'P-A',[f'{mx} works 2024-26, {cur} in 2025-26 ('+', '.join(f'{k} {n}' for k,n,_,_ in out if n)+')']
    ident=False
    for x in (cr,oa):
        if x and x['titleOverlap']<0.5 and sum(x['byYear'].get(y,0) for y in('2024','2025','2026'))>=3: ident=True
    if ident and mx==0: return 'P-I',['recent works exist only under a different title']
    if mx>=1 or any(x and x['lastDoiYear' if x is cr else 'lastWorkYear']>=2023 for x in (cr,oa)): return 'P-B',[f'{mx} recent work(s), {cur} in 2025-26']
    return 'P-C',['no work in 2024-2026 in Crossref, OpenAlex or PubMed']
def fill_publisher(c):
    if (c.get('publisher') or '').strip(): return
    e=ev.get(c['key']) or {}
    for name in('crossref','openalex'):
        x=e.get(name); v=(x or {}).get('publisher') if name=='crossref' else (x or {}).get('host')
        if x and x['titleOverlap']>=0.5 and (v or '').strip(): c['publisher']=v.strip(); c['publisherFill']={'from':name,'via':x['via']}; return
for c in C: fill_publisher(c)
for c in C: c['publication']={}; c['publication']['class'],c['publication']['why']=cls(c); c['publication']['crossref']=(ev.get(c['key']) or {}).get('crossref'); c['publication']['openalex']=(ev.get(c['key']) or {}).get('openalex'); c['publication']['pubmed']=(ev.get(c['key']) or {}).get('pubmed')
print('publication classes',dict(collections.Counter(c['publication']['class'] for c in C)))
import urllib.request,urllib.parse,time,re
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
cand=[{'key':c['key'],'title':c['title'],'publisher':c['publisher'],'issns':c['ids'],'nlmUid':nlm_uid(c)} for c in C if c['publication']['class']=='P-A' and (c.get('publisher') or '').strip()]
print('NLM uid found for',sum(1 for x in cand if x['nlmUid']),'of',len(cand))
json.dump(cand,open(f'{W}/rename-in.json','w'))
rn=f'{W}/rename.json'
subprocess.run([sys.executable,f'{D}/rename_check.py',RAW,f'{W}/rename-in.json',rn],check=True)
rename=json.load(open(rn)); eligible=[]; held=[]
for c in C:
    if c['publication']['class']=='P-A' and not (c.get('publisher') or '').strip(): held.append({**{k:c[k] for k in('key','ids','title','dept')},'why':'no publisher recorded (also none in Crossref/OpenAlex with a matching title)'}); continue
    if c['publication']['class']!='P-A': held.append({**{k:c[k] for k in('key','ids','title','dept')},'why':'publication evidence '+c['publication']['class']+': '+c['publication']['why'][0]}); continue
    r=rename.get(c['key'],{})
    if r.get('nlmHit'): held.append({**{k:c[k] for k in('key','ids','title','dept')},'why':'rename/continuation: NLM relation to a catalogue journal','detail':r['nlmHit']}); continue
    if r.get('similar'): held.append({**{k:c[k] for k in('key','ids','title','dept')},'why':'near-identical title already in the catalogue (possible rename, edition or same-title conflict)','detail':r['similar']}); continue
    c['renameCheck']=r; eligible.append(c)
json.dump({'eligible':eligible,'held':held,'stage1Held':s1['held']},open(f'{W}/stage2.json','w'),ensure_ascii=False)
print('eligible',len(eligible),dict(collections.Counter(c['dept'] for c in eligible)))
print('held at stage 2',collections.Counter(h['why'].split(':')[0] for h in held))
