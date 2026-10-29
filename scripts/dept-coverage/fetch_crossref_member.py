"""
Journals of ONE publisher (a Crossref member) that deposited journal articles recently, from the documented Crossref REST API:
  GET /members/{id}/works?filter=type:journal-article,from-pub-date:YYYY-MM-DD&rows=0&facet=issn:1000   -> every ISSN with its recent article count
  GET /journals/{issn}                                                                                  -> title, publisher, all ISSNs of the journal
Several ISSNs of one journal (print / electronic) are merged by the journal record's own ISSN list. Output: NDJSON, one journal per line, with recent-article counts for the
windows >= 2024-01-01 and >= 2025-07-01 so publication evidence is not a single arbitrary count.

  python3 fetch_crossref_member.py ieee 263
"""
import json,os,sys,re,time,urllib.request,urllib.parse
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
key,mid=sys.argv[1],sys.argv[2]
MAIL='info@celnet.in'; UA={'User-Agent':f'STM Digital Library (mailto:{MAIL})'}
def get(url):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=90))['message']
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(4*(a+1))
        except Exception: time.sleep(3*(a+1))
    return None
def facet(frm):
    m=get(f'https://api.crossref.org/members/{mid}/works?filter=type:journal-article,from-pub-date:{frm}&rows=0&facet=issn:1000&mailto={MAIL}')
    return {k.rsplit('/',1)[1]:v for k,v in m['facets']['issn']['values'].items()}, m['total-results']
a,ta=facet('2024-01-01'); b,tb=facet('2025-07-01')
member=get(f'https://api.crossref.org/members/{mid}?mailto={MAIL}')
out=os.path.join(RAW,f'crossref-{key}.ndjson')
from concurrent.futures import ThreadPoolExecutor
def look(issn): return issn,get(f'https://api.crossref.org/journals/{issn}?mailto={MAIL}')
with ThreadPoolExecutor(6) as ex: recs=list(ex.map(look,sorted(a,key=lambda x:-a[x])))
seen=set(); n=0
with open(out,'w') as f:
    for issn,j in recs:
        if not j or issn in seen: continue
        types={t['type']:t['value'] for t in j.get('issn-type',[])}
        allis=[x.strip() for x in j.get('ISSN',[])]; seen.update(allis)
        f.write(json.dumps({'title':j.get('title'),'publisher':j.get('publisher'),'issns':allis,'issnType':types,'recent2024':max(a.get(x,0) for x in allis),'recent2025h2':max(b.get(x,0) for x in allis),'totalDois':j.get('counts',{}).get('total-dois'),'member':mid,'source':'Crossref member '+member['primary-name']},ensure_ascii=False)+'\n'); n+=1
record(f'Crossref member {key} ({member["primary-name"]})','complete',query=f'GET /members/{mid}/works?filter=type:journal-article,from-pub-date:2024-01-01 and 2025-07-01&rows=0&facet=issn:1000 ; GET /journals/{{issn}}',fetched=n,reportedTotal=ta,pagination=f'ISSN facet returned {len(a)} ISSNs (limit 1000) -> {n} journals after merging print/electronic',files=[f'crossref-{key}.ndjson'],notes='Journal-article deposits only (proceedings and magazines under other types are not counted). A facet is capped at 1000 ISSNs, so a publisher with more journals than that would be partial.')
print('done',key,n,'journals from',len(a),'ISSNs')
