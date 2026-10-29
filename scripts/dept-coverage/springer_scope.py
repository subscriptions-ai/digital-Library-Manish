"""
Springer journals: the landing page https://www.springer.com/journal/<id> carries almost no scope text (median about 4,000 characters, no aims). The journal's own aims-and-scope page is
https://link.springer.com/journal/<id>/aims-and-scope (Nature journals: <site>/about or /aims). robots.txt is checked first; one request per host per second; a failure is no evidence.
Phrase hits are merged into scope.json with the page URL, status, time and sha256.
  python3 springer_scope.py stage1b.json pool.ndjson scope.json
"""
import json,sys,re,time,hashlib,urllib.parse
sys.path.insert(0,__import__('os').path.dirname(__file__))
import aims_scope as A
from concurrent.futures import ThreadPoolExecutor
s=json.load(open(sys.argv[1])); sc=json.load(open(sys.argv[3]))
want={r['key']:r for l in ('ready','site') for r in s[l]}
ids={}
for line in open(sys.argv[2]):
    c=json.loads(line)
    if c['ids'][0] not in want: continue
    for r in c['records']:
        if r['src']=='Springer KBART' and r.get('homepage'):
            m=re.search(r'springer\.com/journal/(\d+)',r['homepage']) or re.search(r'nature\.com/([a-z0-9]+)/?',r['homepage'])
            if m: ids[c['ids'][0]]=(r['homepage'],m.group(1)); break
print(len(ids),'candidates with a Springer Nature journal page',flush=True)
def work(item):
    k,(hp,jid)=item
    urls=[f'https://link.springer.com/journal/{jid}/aims-and-scope'] if 'springer.com' in hp else [hp.rstrip('/')+'/about',hp.rstrip('/')+'/aims']
    o=sc.get(k) or {'hits':{},'pages':[],'status':'ok','cease':False,'year2025_26':False}
    texts=[];new=[]
    for u in urls:
        if not A.allowed(u): new.append({'url':u,'status':'robots-disallowed','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':''}); continue
        st,h,f=A.get(u)
        if h:
            t=A.text_of(h); texts.append(t); new.append({'url':f,'status':st,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':hashlib.sha256(t.encode()).hexdigest(),'chars':len(t)})
        else: new.append({'url':u,'status':st,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':''})
    full=' '.join(texts)[:60000]
    hits={d:sorted(set(o.get('hits',{}).get(d,[]))|{m.group(0).lower() for m in rx.finditer(full)})[:12] for d,rx in A.PHR.items()}
    return k,hits,new,bool(A.CEASE.search(full)),bool(re.search(r'\b(vol(ume)?\.?\s*\d+.{0,25}\b(2025|2026)|\b(2025|2026)\b.{0,25}(vol(ume)?|issue|no\.))',full,re.I)),len(full)
with ThreadPoolExecutor(8) as ex:
    for n,(k,hits,new,cease,yr,L) in enumerate(ex.map(work,list(ids.items()))):
        o=sc.setdefault(k,{'hits':{},'pages':[],'status':'ok','cease':False,'year2025_26':False}); o['hits']=hits; o['pages']=(o.get('pages') or [])+new; o['cease']=o.get('cease') or cease; o['year2025_26']=o.get('year2025_26') or yr; o['springerAimsTried']=True; o['aimsChars']=L; o['status']='ok' if (o.get('status')=='ok' or L) else o.get('status')
        if (n+1)%50==0: print(n+1,flush=True)
json.dump(sc,open(sys.argv[3],'w'),ensure_ascii=False); print('done',len(ids))
