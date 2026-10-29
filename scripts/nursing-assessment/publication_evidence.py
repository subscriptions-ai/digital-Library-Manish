"""
Publication facts for a list of journals, from three public APIs. Facts only: no pass/fail is decided here.

  python3 publication_evidence.py in.json out.json

in.json: [{"key": "...", "title": "...", "issn": "...", "eissn": "..."}]. For each journal, out.json[key] holds
  crossref  {via, title, publisher, totalDois, byYear{2022..2026}, lastDoiYear, titleOverlap}      (https://api.crossref.org/journals/{issn})
  openalex  {via, title, host, homepage, isInDoaj, worksCount, byYear{...}, lastWorkYear, titleOverlap}   (https://api.openalex.org/sources/issn:{issn}; needs OPENALEX_API_KEY, optional)
  pubmed    {via, articles2024to2026}   (only asked when neither of the above shows a work in 2024-2026)
The OpenAlex key is read from OPENALEX_API_KEY or the repository's .env, used only in the request and never printed or stored.
"""
import json,sys,time,re,os,urllib.request,urllib.parse
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
YEARS=('2022','2023','2024','2025','2026')
def key():
    k=os.environ.get('OPENALEX_API_KEY')
    if k: return k
    p=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','.env')
    try: m=re.search(r'^OPENALEX_API_KEY=(.*)$',open(p).read(),re.M); return m.group(1).strip() if m else None
    except Exception: return None
KEY=key()
def get(url):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60))
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(2*(a+1))
        except Exception: time.sleep(2*(a+1))
    return 'ERR'
STOP={'the','and','journal','for','der','die','und','des','revue','revista','international','of'}
words=lambda t:set(w for w in re.sub(r'[^a-z0-9 ]+',' ',(t or '').lower()).split() if len(w)>2 and w not in STOP)
def overlap(a,b):
    a,b=words(a),words(b); return round(len(a&b)/max(1,min(len(a),len(b))),2)
def one(r):
    try:
        return _one(r)
    except Exception as e:
        return r['key'],{'crossref':None,'openalex':None,'pubmed':None,'error':str(e)[:120]}
def _one(r):
        ids=[x for x in (r.get('issn'),r.get('eissn')) if x]; ev={'crossref':None,'openalex':None,'pubmed':None}
        for isn in ids:
            d=get('https://api.crossref.org/journals/'+isn+'?mailto=info@celnet.in')
            if d and d!='ERR':
                m=d['message']; by={str(y):c for y,c in m.get('breakdowns',{}).get('dois-by-issued-year',[])}
                ev['crossref']={'via':isn,'title':m.get('title'),'publisher':m.get('publisher'),'totalDois':(m.get('counts') or {}).get('total-dois'),'byYear':{y:by.get(y,0) for y in YEARS},'lastDoiYear':max([int(y) for y in by] or [0]),'titleOverlap':overlap(r['title'],m.get('title'))}; break
            time.sleep(0.12)
        if KEY:
            for isn in ids:
                d=get(f'https://api.openalex.org/sources/issn:{isn}?select=display_name,counts_by_year,works_count,homepage_url,host_organization_name,is_in_doaj&mailto=info@celnet.in&api_key={KEY}')
                if d and d!='ERR':
                    cy={str(c['year']):c['works_count'] for c in d.get('counts_by_year',[])}
                    ev['openalex']={'via':isn,'title':d.get('display_name'),'host':d.get('host_organization_name'),'homepage':d.get('homepage_url'),'isInDoaj':d.get('is_in_doaj'),'worksCount':d.get('works_count'),'byYear':{y:cy.get(y,0) for y in YEARS},'lastWorkYear':max([int(y) for y,c in cy.items() if c] or [0]),'titleOverlap':overlap(r['title'],d.get('display_name'))}; break
                time.sleep(0.1)
        recent=lambda e,k:sum(e['byYear'].get(y,0) for y in ('2024','2025','2026')) if e else 0
        if recent(ev['crossref'],'x')==0 and recent(ev['openalex'],'x')==0:
            for isn in ids:
                q=urllib.parse.urlencode({'db':'pubmed','retmode':'json','retmax':0,'term':f'{isn}[ISSN]','datetype':'pdat','mindate':'2024/01/01','maxdate':'2026/12/31'})
                d=get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?'+q)
                if d and d!='ERR':
                    ev['pubmed']={'via':isn,'articles2024to2026':int(d['esearchresult'].get('count',0))}
                    if ev['pubmed']['articles2024to2026']>0: break
                time.sleep(0.35)
        return r['key'],ev
def run(rows,workers=6):
    from concurrent.futures import ThreadPoolExecutor
    out={}
    with ThreadPoolExecutor(workers) as ex:
        for i,(k,ev) in enumerate(ex.map(one,rows)):
            out[k]=ev
            if (i+1)%50==0:
                print(i+1,flush=True)
                if (i+1)%200==0 and len(sys.argv)>2: json.dump(out,open(sys.argv[2]+'.partial','w'))   # checkpoint: a stopped run keeps what it has
    return out
if __name__=='__main__':
    rows=json.load(open(sys.argv[1])); out=run(rows); json.dump(out,open(sys.argv[2],'w')); print('done',len(out))
