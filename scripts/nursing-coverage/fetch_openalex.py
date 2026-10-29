"""
OpenAlex journal sources that have at least one topic in the Nursing FIELD (documented filter topics.field.id:29), by cursor, resumable.
Kept per source: ids, titles incl. alternate titles, ISSNs, publisher, country, homepage, DOAJ flag, works_count, counts_by_year, last publication year, and the top topics (nursing topic
weight is judged later; the filter alone is broad: the field also holds Nutrition and Dietetics).  The API key comes from OPENALEX_API_KEY or .env and is never printed or stored.

  python3 fetch_openalex.py            (re-run the same command to resume from data/nursing-coverage/raw/openalex-nursing.cursor)
"""
import json,os,sys,re,time,urllib.request,urllib.parse
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW,ROOT
KEY=os.environ.get('OPENALEX_API_KEY') or re.search(r'^OPENALEX_API_KEY=(.*)$',open(os.path.join(ROOT,'.env')).read(),re.M).group(1).strip()
FILTER='type:journal,topics.field.id:29'
SEL='id,display_name,alternate_titles,type,issn_l,issn,host_organization_name,country_code,homepage_url,is_oa,is_in_doaj,works_count,counts_by_year,topics,societies'
out=os.path.join(RAW,'openalex-nursing.ndjson'); ck=out.replace('.ndjson','.cursor')
cursor,pages,count='*',0,0
if os.path.exists(ck) and os.path.exists(out): c=json.load(open(ck)); cursor,pages,count=c['cursor'],c['pages'],c['count']
else: open(out,'w').close()
def get(cur):
    url='https://api.openalex.org/sources?'+urllib.parse.urlencode({'filter':FILTER,'select':SEL,'per-page':200,'cursor':cur,'mailto':'info@celnet.in','api_key':KEY})
    for a in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=90))
        except urllib.error.HTTPError as e:
            if e.code in(429,500,502,503): time.sleep(5*(a+1)); continue
            raise
        except Exception: time.sleep(3*(a+1))
    raise SystemExit('OpenAlex did not answer after 5 attempts; progress is checkpointed')
total=None; failures=0
while cursor:
    d=get(cursor); total=d['meta']['count']
    with open(out,'a') as f:
        for s in d['results']:
            s['topics']=[{'name':t.get('display_name'),'count':t.get('count'),'subfield':(t.get('subfield') or {}).get('display_name'),'field':(t.get('field') or {}).get('display_name')} for t in (s.get('topics') or [])[:10]]
            s['societies']=[(x.get('organization') if isinstance(x,dict) else x) for x in (s.get('societies') or [])][:3]
            f.write(json.dumps(s,ensure_ascii=False)+'\n')
    count+=len(d['results']); pages+=1; cursor=d['meta'].get('next_cursor') if d['results'] else None
    json.dump({'cursor':cursor,'pages':pages,'count':count,'total':total},open(ck,'w'))
    if pages%20==0: print(pages,'pages',count,'sources',flush=True)
    time.sleep(0.15)
record('OpenAlex (topics.field.id:29, type:journal)','complete' if count==total else 'partial',query=f'GET /sources?filter={FILTER}&select=...&per-page=200 (cursor paging)',fetched=count,reportedTotal=total,pagination=f'{pages} pages, cursor exhausted: {cursor is None}',failures=failures,files=['openalex-nursing.ndjson'],notes='Documented source filter. The Nursing field also contains Nutrition and Dietetics, so membership alone is not nursing scope; topic weights are scored later. counts_by_year gives works per year for the recent-publication evidence.')
print('done',count,'of',total)
