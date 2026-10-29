"""
Recover official homepages for the single-evidence candidates whose own site could not be read (no homepage listed, or the listed one did not answer), from identity-matched records only:
  Wikidata (public SPARQL endpoint): the journal item with the SAME ISSN (P236) and an official website (P856).
  The ISSN is the identity key: an item is accepted only when its ISSN equals one of the candidate's identifiers, never by title.
Then every recovered or retried URL (https/http and www variants, a longer timeout) goes through aims_scope.one(), which respects robots.txt and records failures as no evidence.
  python3 recover_homepages.py stage1b.json scope.json out-scope.json
"""
import json,sys,os,re,time,urllib.request,urllib.parse
sys.path.insert(0,os.path.dirname(__file__))
import aims_scope as A
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
s=json.load(open(sys.argv[1])); sc=json.load(open(sys.argv[2])); outp=sys.argv[3]
rows=[r for r in s['site']+s['ready'] if (sc.get(r['key']) or {}).get('status')!='ok']
print(len(rows),'candidates without a readable site',flush=True)
# 1. Wikidata by ISSN
wd={}
issns=sorted({i for r in rows for i in r['ids']})
for k in range(0,len(issns),80):
    vals=' '.join(f'"{i}"' for i in issns[k:k+80])
    q='SELECT ?issn ?site WHERE { VALUES ?issn {'+vals+'} ?j wdt:P236 ?issn ; wdt:P856 ?site . }'
    for a in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request('https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':q,'format':'json'}),headers=UA),timeout=60)
            for b in json.load(r)['results']['bindings']: wd.setdefault(b['issn']['value'],set()).add(b['site']['value'])
            break
        except Exception as e: time.sleep(4*(a+1))
    time.sleep(1)
print('Wikidata: official websites for',len(wd),'ISSNs',flush=True)
def variants(u):
    out=[u]
    if not u: return out
    p=urllib.parse.urlparse(u); host=p.netloc
    alt=[]
    if p.scheme=='http': alt.append(u.replace('http://','https://',1))
    if p.scheme=='https': alt.append(u.replace('https://','http://',1))
    if host.startswith('www.'): alt.append(u.replace('//www.','//',1))
    else: alt.append(u.replace('//','//www.',1))
    return out+[x for x in alt if x not in out]
res={}
from concurrent.futures import ThreadPoolExecutor
def work(r):
    urls=[]
    for i in r['ids']:
        for u in wd.get(i,[]): urls.append(('wikidata',u))
    if r.get('homepage'): urls=[('listing-variant',v) for v in variants(r['homepage'])]+urls
    elif not urls and r.get('homepageDerived'): pass
    best=None
    for src,u in urls[:6]:
        if not u.startswith('http'): continue
        k,o=A.one({'key':r['key'],'homepage':u}); o['recoveredFrom']=src
        if o['status']=='ok': return r['key'],o
        best=best or o
    return r['key'],best
with ThreadPoolExecutor(16) as ex:
    for n,(k,o) in enumerate(ex.map(work,rows)):
        if o: res[k]=o
        if (n+1)%100==0: print(n+1,flush=True)
json.dump(res,open(outp,'w'),ensure_ascii=False); print('done',len(res),'ok',sum(1 for v in res.values() if v['status']=='ok'))
