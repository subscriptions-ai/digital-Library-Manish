"""MLT: look up, in OpenAlex, the sources of NLM-narrow-heading serials that are in neither the catalogue nor the OpenAlex pool (read-only). usage: python3 dept-mlt-fetch-nlm-sources.py <nlm-not-in-pool.json> <out.ndjson>"""
import json,os,re,sys,time,urllib.request,urllib.parse
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
KEY=os.environ.get('OPENALEX_API_KEY') or re.search(r'^OPENALEX_API_KEY=(.*)$',open(os.path.join(ROOT,'.env')).read(),re.M).group(1).strip()
SEL='id,display_name,alternate_titles,type,issn_l,issn,host_organization_name,country_code,homepage_url,is_oa,is_in_doaj,works_count,counts_by_year,topics,societies'
issns=sorted({i.upper() for x in json.load(open(sys.argv[1])) for i,_ in x['issn']}); seen=set(); n=0
with open(sys.argv[2],'w') as f:
    for k in range(0,len(issns),40):
        url='https://api.openalex.org/sources?'+urllib.parse.urlencode({'filter':'issn:'+'|'.join(issns[k:k+40]),'select':SEL,'per-page':200,'mailto':'info@celnet.in','api_key':KEY})
        for a in range(5):
            try: d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=90)); break
            except Exception: time.sleep(3*(a+1)); d=None
        if not d: continue
        for s in d['results']:
            if s['id'] in seen: continue
            seen.add(s['id']); s['topics']=[{'name':t.get('display_name'),'count':t.get('count'),'subfield':(t.get('subfield') or {}).get('display_name'),'field':(t.get('field') or {}).get('display_name')} for t in (s.get('topics') or [])[:25]]
            s['societies']=[]; f.write(json.dumps(s,ensure_ascii=False)+'\n'); n+=1
        time.sleep(0.15)
print(n,'sources for',len(issns),'ISSNs')
