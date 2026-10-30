"""
Medical Laboratory Technology: OpenAlex journal SOURCES for one filter (type:journal plus topics.subfield.id / topics.id), cursor-paged and resumable. READ-ONLY against OpenAlex.
Output goes to ~/stm-evidence/dept-mlt-2026-10-30/raw (outside the repository). The API key comes from OPENALEX_API_KEY or .env and is never printed or stored.

  python3 scripts/dept-mlt-fetch-openalex.py NAME 'type:journal,topics.subfield.id:3607|2734'      (re-run the same command to resume)
"""
import json,os,sys,re,time,urllib.request,urllib.parse
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
RAW=os.path.expanduser('~/stm-evidence/dept-mlt-2026-10-30/raw'); os.makedirs(RAW,exist_ok=True)
def record(*a,**k): pass
name,FILTER=sys.argv[1],sys.argv[2]
KEY=os.environ.get('OPENALEX_API_KEY') or re.search(r'^OPENALEX_API_KEY=(.*)$',open(os.path.join(ROOT,'.env')).read(),re.M).group(1).strip()
SEL='id,display_name,alternate_titles,type,issn_l,issn,host_organization_name,country_code,homepage_url,is_oa,is_in_doaj,works_count,counts_by_year,topics,societies'
out=os.path.join(RAW,f'openalex-{name}.ndjson'); ck=out.replace('.ndjson','.cursor')
cursor,pages,count='*',0,0
if os.path.exists(ck) and os.path.exists(out): c=json.load(open(ck)); cursor,pages,count=c['cursor'],c['pages'],c['count']
else: open(out,'w').close()
def get(cur):
    url='https://api.openalex.org/sources?'+urllib.parse.urlencode({'filter':FILTER,'select':SEL,'per-page':200,'cursor':cur,'mailto':'info@celnet.in','api_key':KEY})
    for a in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=90))
        except urllib.error.HTTPError as e:
            if e.code in(429,500,502,503,504): time.sleep(5*(a+1)); continue
            raise
        except Exception: time.sleep(3*(a+1))
    raise SystemExit('OpenAlex did not answer after 5 attempts; progress is checkpointed')
total=None
while cursor:
    d=get(cursor); total=d['meta']['count']
    with open(out,'a') as f:
        for s in d['results']:
            s['topics']=[{'name':t.get('display_name'),'count':t.get('count'),'subfield':(t.get('subfield') or {}).get('display_name'),'field':(t.get('field') or {}).get('display_name')} for t in (s.get('topics') or [])[:25]]
            s['societies']=[(x.get('organization') if isinstance(x,dict) else x) for x in (s.get('societies') or [])][:3]
            f.write(json.dumps(s,ensure_ascii=False)+'\n')
    count+=len(d['results']); pages+=1; cursor=d['meta'].get('next_cursor') if d['results'] else None
    json.dump({'cursor':cursor,'pages':pages,'count':count,'total':total},open(ck,'w'))
    if pages%10==0: print(name,pages,'pages',count,'of',total,flush=True)
    time.sleep(0.15)
record(f'OpenAlex sources: {name}','complete' if count==total else 'partial',query=f'GET /sources?filter={FILTER}&select=...&per-page=200 (cursor paging)',fetched=count,reportedTotal=total,pagination=f'{pages} pages, cursor exhausted: {cursor is None}',files=[f'openalex-{name}.ndjson'],notes='Documented source filter; a source is returned when at least one of its topics is in the listed subfields, so membership alone is not department scope (topic weights are scored later).')
print('done',name,count,'of',total)
