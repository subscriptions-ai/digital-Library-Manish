"""
Audit of the website evidence already collected: every page URL kept in a scope.json is checked against the robots.txt of ITS OWN host (not only the host first requested). A page on a host that
disallows automated access is purged from that scope file (status "robots-disallowed (redirect destination)", hits and pages emptied) so no decision can rest on it.
  python3 robots_audit.py scope.json [more scope.json ...]   -> prints per file, writes <file>.audit.json (hosts and counts)
"""
import json,sys,urllib.parse,urllib.robotparser,urllib.request,collections
from concurrent.futures import ThreadPoolExecutor
UA='STM Digital Library (mailto:info@celnet.in)'
def robots(host):
    rp=urllib.robotparser.RobotFileParser()
    try:
        r=urllib.request.urlopen(urllib.request.Request(host+'/robots.txt',headers={'User-Agent':UA}),timeout=12); rp.parse(r.read(200000).decode('utf-8','replace').splitlines())
    except urllib.error.HTTPError as e: rp.parse(['User-agent: *','Disallow:'] if e.code in (401,403,404,410) else ['User-agent: *','Disallow: /'])
    except Exception: rp.parse(['User-agent: *','Disallow:'])
    return rp
files=sys.argv[1:]; scopes={f:json.load(open(f)) for f in files}
hosts=sorted({urllib.parse.urlparse(p['url']).scheme+'://'+urllib.parse.urlparse(p['url']).netloc for sc in scopes.values() for o in sc.values() for p in o.get('pages',[]) if (p.get('url') or '').startswith('http') and p.get('status') not in ('robots-disallowed',)})
print(len(hosts),'distinct hosts',flush=True)
with ThreadPoolExecutor(24) as ex: rp=dict(zip(hosts,ex.map(robots,hosts)))
for f,sc in scopes.items():
    bad=collections.Counter(); purged=[]
    for k,o in sc.items():
        for p in o.get('pages',[]):
            u=p.get('url') or ''
            if not u.startswith('http') or p.get('status')=='robots-disallowed': continue
            pu=urllib.parse.urlparse(u); h=pu.scheme+'://'+pu.netloc
            if not rp[h].can_fetch(UA,u): bad[pu.netloc]+=1; purged.append(k); break
    for k in set(purged):
        o=sc[k]; o['status']='robots-disallowed (redirect destination)'; o['hits']={}; o['pages']=[]; o['snippet']=''; o['cease']=False; o['year2025_26']=False
    json.dump(sc,open(f,'w'),ensure_ascii=False); json.dump({'entries':len(sc),'purged':sorted(set(purged)),'hosts':dict(bad)},open(f+'.audit.json','w'))
    print(f,len(sc),'entries;',len(set(purged)),'purged; hosts',dict(bad.most_common(6)),flush=True)
