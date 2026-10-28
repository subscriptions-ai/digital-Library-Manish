import json,sys,time,re,urllib.request,urllib.parse
S=sys.argv[1]; rows=json.load(open(S+'/nlm/run/manifest-466.json'))['rows']
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def get(url):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60))
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(2*(a+1))
        except Exception: time.sleep(2*(a+1))
    return 'ERR'
norm=lambda t:set(w for w in re.sub(r'[^a-z0-9 ]+',' ',(t or '').lower()).split() if len(w)>2 and w not in('the','and','journal','for','der','die','und','des','and','revue','revista'))
out={}
for i,r in enumerate(rows):
    ev={'issn':r['issn'],'crossref':None,'pubmed':None}
    for isn in [x for x in (r['issn'],r['eissn']) if x]:
        d=get('https://api.crossref.org/journals/'+isn+'?mailto=info@celnet.in')
        if d and d!='ERR':
            m=d['message']; yrs=dict((str(y),c) for y,c in m.get('breakdowns',{}).get('dois-by-issued-year',[]))
            rec=sum(yrs.get(str(y),0) for y in (2024,2025,2026)); a,b=norm(r['title']),norm(m.get('title'))
            ov=len(a&b)/max(1,min(len(a),len(b)))
            ev['crossref']={'via':isn,'title':m.get('title'),'publisher':m.get('publisher'),'totalDois':m['counts'].get('total-dois'),'doisIssued2024to2026':rec,'titleOverlap':round(ov,2)}
            break
        time.sleep(0.15)
    if not (ev['crossref'] and ev['crossref']['doisIssued2024to2026']>0):
        for isn in [x for x in (r['issn'],r['eissn']) if x]:
            q=urllib.parse.urlencode({'db':'pubmed','retmode':'json','retmax':0,'term':f'{isn}[ISSN]','datetype':'pdat','mindate':'2024/01/01','maxdate':'2026/12/31'})
            d=get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?'+q)
            if d and d!='ERR':
                n=int(d['esearchresult'].get('count',0)); ev['pubmed']={'via':isn,'articles2024to2026':n}
                if n>0: break
            time.sleep(0.4)
    out[r['issn']]=ev
    if (i+1)%50==0: print(i+1,flush=True)
    time.sleep(0.15)
json.dump(out,open(S+'/nlm/run/evidence.json','w'))
print('done',len(out))
