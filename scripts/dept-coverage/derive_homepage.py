"""
For candidates whose listing has no homepage: take the landing-page URL Crossref holds for the journal's most recent articles (works?filter=issn:...&select=URL,resource) and reduce it to the
journal's own site root (an OJS site: everything up to /article/ or /issue/; otherwise scheme + host). A homepage found this way is only used to READ the aims and scope; it is never stored
as the journal's homepage. Big publisher platforms are skipped here and are also subject to robots.txt in aims_scope.py.
  python3 derive_homepage.py stage1b.json out.json
"""
import json,sys,re,time,urllib.request,urllib.parse
from concurrent.futures import ThreadPoolExecutor
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
SKIP=re.compile(r'(doi\.org|springer|wiley|elsevier|sciencedirect|tandfonline|sagepub|ieee|mdpi|frontiersin|nature\.com|oup\.com|cambridge\.org|iop(science)?\.org|degruyter|worldscientific|aip\.org|acs\.org|rsc\.org|jstage|scielo)',re.I)
def root(u):
    p=urllib.parse.urlparse(u)
    if SKIP.search(p.netloc): return None
    m=re.match(r'(.*?)/(article|issue)/',p.path)
    if m: return f'{p.scheme}://{p.netloc}{m.group(1)}'
    return f'{p.scheme}://{p.netloc}'
def one(r):
    for i in r['ids'][:2]:
        url='https://api.crossref.org/works?'+urllib.parse.urlencode({'filter':f'issn:{i}','rows':3,'select':'URL,resource','sort':'published','order':'desc','mailto':'info@celnet.in'})
        for a in range(3):
            try:
                d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=40))['message']['items']
                for it in d:
                    u=((it.get('resource') or {}).get('primary') or {}).get('URL') or it.get('URL')
                    h=root(u) if u else None
                    if h: return r['key'],h
                break
            except Exception: time.sleep(2*(a+1))
    return r['key'],None
s=json.load(open(sys.argv[1])); rows=[r for r in s['site']+s['ready'] if not r.get('homepage')]
out={}
with ThreadPoolExecutor(6) as ex:
    for k,h in ex.map(one,rows):
        if h: out[k]=h
json.dump(out,open(sys.argv[2],'w')); print(len(rows),'without homepage ->',len(out),'derived')
