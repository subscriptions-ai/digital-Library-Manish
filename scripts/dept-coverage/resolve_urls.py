"""
Resolve official journal URLs for shortlisted candidates that have none, ONLY through sources that match on an ISSN (never on the title):
  DOAJ public API (/api/search/journals/issn:<issn>)  -> the journal's own declared homepage and its aims-and-scope URL (declared by the publisher when the journal was registered)
  Wikidata SPARQL (P236 ISSN -> P856 official website)  -> community-curated, flagged as such
  OpenAlex /sources?filter=issn:<issn> (homepage_url)  -> an aggregator copy of publisher metadata, flagged as such
Each result keeps its provenance and a `direct` flag (journal/publisher-declared) so that repeated aggregator metadata is never counted as independent confirmation.
  python3 resolve_urls.py shortlist.csv out.json
"""
import csv,json,sys,os,re,time,urllib.request,urllib.parse
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def get(url):
    for a in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=40))
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(3*(a+1))
        except Exception: time.sleep(3*(a+1))
    return None
KEY=re.search(r'^OPENALEX_API_KEY=(.*)$',open(os.path.join(os.path.dirname(__file__),'..','..','.env')).read(),re.M).group(1).strip()
rows=list(csv.DictReader(open(sys.argv[1]))); out={}
for r in rows:
    ids=[x.strip() for x in r['issn'].split(';')]; found=[]
    for i in ids:
        d=get('https://doaj.org/api/search/journals/issn:'+i); time.sleep(0.4)
        for j in ((d or {}).get('results') or [])[:1]:
            b=j.get('bibjson',{}); ref=b.get('ref',{}); issns={b.get('pissn'),b.get('eissn')}
            if i in issns:
                if ref.get('journal'): found.append({'url':ref['journal'],'kind':'journal homepage','source':'DOAJ API','direct':True,'identifier':i})
                if ref.get('aims_scope'): found.append({'url':ref['aims_scope'],'kind':'aims and scope page','source':'DOAJ API','direct':True,'identifier':i})
        o=get(f'https://api.openalex.org/sources?filter=issn:{i}&select=id,homepage_url,issn&mailto=info@celnet.in&api_key={KEY}'); time.sleep(0.2)
        for s in ((o or {}).get('results') or [])[:1]:
            if s.get('homepage_url') and i in (s.get('issn') or []): found.append({'url':s['homepage_url'],'kind':'journal homepage','source':'OpenAlex (aggregator)','direct':False,'identifier':i})
    q='SELECT ?issn ?site WHERE { VALUES ?issn {'+' '.join(f'"{i}"' for i in ids)+'} ?j wdt:P236 ?issn ; wdt:P856 ?site . }'
    w=get('https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':q,'format':'json'})); time.sleep(1)
    for b in ((w or {}).get('results') or {}).get('bindings',[]): found.append({'url':b['site']['value'],'kind':'journal homepage','source':'Wikidata (community-curated)','direct':False,'identifier':b['issn']['value']})
    seen=set(); uniq=[]
    for f in found:
        if f['url'] not in seen: seen.add(f['url']); uniq.append(f)
    out[r['rank']]=uniq
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
print(sum(1 for r in rows if not r['officialUrl'] and out[r['rank']]),'of',sum(1 for r in rows if not r['officialUrl']),'without a URL now have an ISSN-matched URL;',sum(1 for r in rows if out[r['rank']] and any(f['source'].startswith('DOAJ') for f in out[r['rank']])),'in DOAJ')
