"""
Recover a missing ISSN for pooled records that carry none (NLM serials, OpenAlex sources, J-STAGE journals), from a trustworthy second source only.

  python3 recover_issn.py        ->  work/recovered-issns.json   (+ ledger entry)

Rule (conservative; a title alone is never enough):  Crossref's journal record (GET /journals?query=<title>) is accepted only if
  - its normalised title equals the record's normalised title (or the base title with subtitle/translation removed), AND
  - its publisher matches the record's publisher / organisation (equal or one contains the other, normalised), AND
  - exactly one Crossref journal satisfies both.
An ISSN recovered this way joins the record's ISSN cluster in stage 1 and is then de-duplicated against the catalogue like any other identifier. Records with no match stay without an ISSN
(and cannot be inserted); nothing is guessed.  NLM serials whose dates are closed are not attempted (they are ceased).
"""
import json,os,re,sys,time,urllib.request,urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,os.path.dirname(__file__)); from common import *; from ledger import record
nlm=json.load(open(f'{RAW}/nlm-nursing-serials.json')); js=json.load(open(f'{RAW}/jstage-journals.json'))
todo=[]
closed=lambda s: bool(re.search(r'-\s*\[?\s*c?\d{4}',s or '')) and not re.search(r'-\s*\]?\s*$',s or '')
for r in nlm:
    if not [i for i,_ in r['issn'] if fmt_issn(i)] and not closed(r['issued']): todo.append({'src':'NLM Catalog','title':r['title'],'publisher':r['publisher'],'alts':r.get('altTitles') or []})
for r in js:
    if not [fmt_issn(x) for x in (r['issn'],r['eissn'],r['issnL']) if fmt_issn(x)] and not r['suspended']: todo.append({'src':'J-STAGE','title':r['title'],'publisher':r['organization'],'alts':[]})
CORE={'Research and Theory','Issues, ethics and legal aspects','Leadership and Management'}
for line in open(f'{RAW}/openalex-nursing.ndjson'):
    s=json.loads(line)
    if [fmt_issn(x) for x in [s.get('issn_l')]+(s.get('issn') or []) if fmt_issn(x)]: continue
    tops=s.get('topics') or []; tot=sum(t['count'] or 0 for t in tops) or 1
    sh=sum(t['count'] or 0 for t in tops if (t['field']=='Nursing' and t['subfield'] in CORE) or re.search(r'nurs|midwif',t['name'] or '',re.I))/tot
    if sh>=0.25 or NARROW.search(s['display_name'] or ''): todo.append({'src':'OpenAlex','title':s['display_name'],'publisher':s.get('host_organization_name'),'alts':s.get('alternate_titles') or []})
def pubmatch(a,b):
    a,b=norm(a),norm(b)
    if not a or not b: return False
    if a==b or a in b or b in a: return True
    ta,tb=set(a.split()),set(b.split()); return len(ta&tb)/max(1,min(len(ta),len(tb)))>=0.8
def one(r):
    q=urllib.parse.urlencode({'query':r['title'],'rows':8,'mailto':'info@celnet.in'}); res={'src':r['src'],'title':r['title'],'publisher':r['publisher'],'recovered':None,'note':None}
    for a in range(3):
        try: d=json.load(urllib.request.urlopen(urllib.request.Request('https://api.crossref.org/journals?'+q,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=60)); break
        except Exception: d=None; time.sleep(2*(a+1))
    if not d: res['note']='Crossref did not answer (not read as "no ISSN exists")'; return res
    hits=[]
    for it in d['message'].get('items',[]):
        t=it.get('title') or ''
        if (norm(t)==norm(r['title']) or base(t)==base(r['title'])) and pubmatch(it.get('publisher'),r['publisher']):
            ids=[fmt_issn(x) for x in it.get('ISSN',[]) if fmt_issn(x) and issn_ok(fmt_issn(x))]
            if ids: hits.append({'title':t,'publisher':it.get('publisher'),'issns':ids})
    if len(hits)==1: res['recovered']=hits[0]['issns']; res['match']=hits[0]; res['note']='Crossref journal record: same title and same publisher, unique'
    else: res['note']=f'{len(hits)} Crossref journals matched title+publisher (need exactly 1)'
    return res
t0=time.time()
with ThreadPoolExecutor(6) as ex: out=list(ex.map(one,todo))
json.dump(out,open(f'{WORK}/recovered-issns.json','w'),ensure_ascii=False)
ok=[o for o in out if o['recovered']]; byS={s:sum(1 for o in out if o['src']==s) for s in('NLM Catalog','J-STAGE','OpenAlex')}; okS={s:sum(1 for o in ok if o['src']==s) for s in byS}
record('ISSN recovery (Crossref journal records)','complete',query='GET https://api.crossref.org/journals?query=<title>&rows=8, accept only exact title + publisher + unique',fetched=len(out),attempted=byS,recovered=okS,failures=sum(1 for o in out if (o['note'] or '').startswith('Crossref did not answer')),notes='Records without an ISSN cannot be inserted; recovery is the only way they can become eligible. Unrecovered records stay without an ISSN.')
print(len(todo),'records without ISSN attempted',byS,'| recovered',okS)
