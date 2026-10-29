"""
Second look at journal sites that answered but whose homepage and linked pages did not confirm a scope: try the standard aims-and-scope pages (Open Journal Systems: <journal root>/about and
/about/editorialPolicies; others: /about, /aims-and-scope, /about-the-journal), same-host only, robots.txt respected, one request per host per second. Phrase hits are merged with the earlier
ones; every extra page is recorded (URL, status, time, sha256). Nothing here changes the acceptance rule.
  python3 aims_scope_more.py stage1b.json scope.json   (updates scope.json in place)
"""
import json,sys,re,time,hashlib,urllib.parse
sys.path.insert(0,__import__('os').path.dirname(__file__))
import aims_scope as A
from concurrent.futures import ThreadPoolExecutor
s=json.load(open(sys.argv[1])); sc=json.load(open(sys.argv[2]))
rows=[r for r in s['site'] if (sc.get(r['key']) or {}).get('status')=='ok' and not any(len(v)>=3 for v in sc[r['key']]['hits'].values()) and not sc[r['key']].get('moreTried')]
print(len(rows),'sites to look at again',flush=True)
def paths(final):
    p=urllib.parse.urlparse(final); base=f'{p.scheme}://{p.netloc}'
    m=re.match(r'(.*?/index\.php/[^/]+)',p.path)
    roots=[base+m.group(1)] if m else [base+p.path.rstrip('/').rsplit('/',1)[0] if p.path.count('/')>1 and not p.path.endswith('/') else base+p.path.rstrip('/'), base]
    out=[]
    for r in dict.fromkeys(roots):
        for suf in ('/about','/about/editorialPolicies','/aims-and-scope','/aims-scope','/about-the-journal','/about-journal'):
            u=r+suf
            if u not in out: out.append(u)
    return out[:8]
def work(r):
    o=sc[r['key']]; texts=[]; new=[]
    final=o['pages'][0]['url']
    for u in paths(final):
        if not A.allowed(u): continue
        st,h,f=A.get(u)
        if h:
            t=A.text_of(h); texts.append(t); new.append({'url':f,'status':st,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':hashlib.sha256(t.encode()).hexdigest()})
            if len(new)>=3: break
    full=' '.join(texts)[:60000]
    hits={d:sorted(set(o['hits'].get(d,[]))|{m.group(0).lower() for m in rx.finditer(full)})[:12] for d,rx in A.PHR.items()}
    return r['key'],hits,new,bool(A.CEASE.search(full)),bool(re.search(r'\b(vol(ume)?\.?\s*\d+.{0,25}\b(2025|2026)|\b(2025|2026)\b.{0,25}(vol(ume)?|issue|no\.))',full,re.I))
with ThreadPoolExecutor(16) as ex:
    for n,(k,hits,new,cease,yr) in enumerate(ex.map(work,rows)):
        o=sc[k]; o['hits']=hits; o['pages']+= new; o['cease']=o['cease'] or cease; o['year2025_26']=o['year2025_26'] or yr; o['moreTried']=True
        if (n+1)%100==0: json.dump(sc,open(sys.argv[2],'w'),ensure_ascii=False); print(n+1,flush=True)
json.dump(sc,open(sys.argv[2],'w'),ensure_ascii=False); print('done')
