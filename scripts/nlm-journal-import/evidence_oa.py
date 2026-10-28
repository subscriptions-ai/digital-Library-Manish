import json,sys,re,time,os,urllib.request
S=sys.argv[1]; # the key comes from OPENALEX_API_KEY or the repository's .env; it is only used in the request and is never printed or stored
key=os.environ.get('OPENALEX_API_KEY') or re.search(r'^OPENALEX_API_KEY=(.*)$',open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','.env')).read(),re.M).group(1).strip()
held=json.load(open(S+'/nlm/run/held.json')); rows={r['issn']:r for r in json.load(open(S+'/nlm/run/manifest-466.json'))['rows']}
ev=json.load(open(S+'/nlm/run/evidence.json'))
norm=lambda t:set(w for w in re.sub(r'[^a-z0-9 ]+',' ',(t or '').lower()).split() if len(w)>2 and w not in('the','and','journal','for','der','die','und','des','revue','revista'))
todo=[h['issn'] for h in held if any('publication' in x or 'Crossref' in x for x in h['reasons'])]
print('to check',len(todo),flush=True); n=0
for i in todo:
    r=rows[i]; res=None
    for isn in [x for x in (r['issn'],r['eissn']) if x]:
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.openalex.org/sources/issn:{isn}?select=display_name,counts_by_year,works_count&mailto=info@celnet.in&api_key={key}',headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=40))
            cy={str(c['year']):c['works_count'] for c in d.get('counts_by_year',[])}
            a,b=norm(r['title']),norm(d.get('display_name'))
            res={'via':isn,'title':d.get('display_name'),'works2024to2026':sum(cy.get(str(y),0) for y in (2024,2025,2026)),'totalWorks':d.get('works_count'),'titleOverlap':round(len(a&b)/max(1,min(len(a),len(b))),2)}
            break
        except urllib.error.HTTPError as e:
            if e.code!=404: time.sleep(2)
        except Exception: time.sleep(2)
        time.sleep(0.1)
    ev[i]['openalex']=res; n+=1
    if n%100==0: print(n,flush=True)
    time.sleep(0.1)
json.dump(ev,open(S+'/nlm/run/evidence.json','w')); print('done')
