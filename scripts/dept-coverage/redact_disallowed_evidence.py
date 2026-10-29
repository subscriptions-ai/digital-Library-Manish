"""
Incident closeout: find every inserted journal whose recorded website evidence includes a page on a host whose robots.txt disallows automated access for that page, list it, and (with --apply)
REDACT the page-derived text from the committed manifests: evidence.site.snippet and evidence.site.hits are emptied and a `redacted` note is added. The page URL, status, retrieval time and the
sha256 of the text stay (they prove what was fetched without keeping the content). Every changed file's sha256 before and after is written to the redaction log; nothing is edited silently.
Production audit rows are NOT touched here (they are historical records; correcting them is a separate decision).
  python3 redact_disallowed_evidence.py <log.json> [--apply]
"""
import json,sys,glob,os,hashlib,urllib.parse,urllib.robotparser,urllib.request,time
from concurrent.futures import ThreadPoolExecutor
UA='STM Digital Library (mailto:info@celnet.in)'
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
def robots(host):
    rp=urllib.robotparser.RobotFileParser()
    try: rp.parse(urllib.request.urlopen(urllib.request.Request(host+'/robots.txt',headers={'User-Agent':UA}),timeout=12).read(200000).decode('utf-8','replace').splitlines())
    except urllib.error.HTTPError as e: rp.parse(['User-agent: *','Disallow:'] if e.code in (401,403,404,410) else ['User-agent: *','Disallow: /'])
    except Exception: rp.parse(['User-agent: *','Disallow:'])
    return rp
files=sorted(glob.glob(os.path.join(ROOT,'docs','dept-coverage[2-5]-2026-10-29','*.json')))
def rows_of(d):
    if isinstance(d,dict) and isinstance(d.get('rows'),list): return d['rows']
    return []
docs={}
for f in files:
    try: d=json.load(open(f))
    except Exception: continue
    if any((r.get('evidence') or {}).get('site') for r in rows_of(d) if isinstance(r,dict)): docs[f]=d
hosts=sorted({urllib.parse.urlparse(p['url']).scheme+'://'+urllib.parse.urlparse(p['url']).netloc for d in docs.values() for r in rows_of(d) for p in ((r.get('evidence') or {}).get('site') or {}).get('pages') or [] if (p.get('url') or '').startswith('http')})
with ThreadPoolExecutor(24) as ex: rp=dict(zip(hosts,ex.map(robots,hosts)))
def bad(p):
    u=p.get('url') or ''
    if not u.startswith('http'): return False
    pu=urllib.parse.urlparse(u); return not rp[pu.scheme+'://'+pu.netloc].can_fetch(UA,u)
affected={}; changed=[]
for f,d in docs.items():
    n=0
    for r in rows_of(d):
        site=(r.get('evidence') or {}).get('site') or {}
        if any(bad(p) for p in site.get('pages') or []):
            affected.setdefault(r['title'],{'issn':r['issn'],'department':r['domain'],'files':[]})['files'].append(os.path.relpath(f,ROOT)); n+=1
            if '--apply' in sys.argv and not site.get('redacted'):
                removed=json.dumps({'snippet':site.get('snippet'),'hits':site.get('hits')},sort_keys=True,ensure_ascii=False)
                site['snippet']=''; site['hits']={}; site['redacted']={'reason':'page-derived text came from a host whose robots.txt disallows automated access (see docs/dept-coverage6-2026-10-29/crawler-incident-closeout.md); text removed, URL, status, time and text sha256 kept','removedContentSha256':hashlib.sha256(removed.encode()).hexdigest()}
    if n and '--apply' in sys.argv:
        before=hashlib.sha256(open(f,'rb').read()).hexdigest()
        raw=json.dumps(d,ensure_ascii=False,indent=1) if os.path.basename(f) in ('audit-manifest.json',) else json.dumps(d,ensure_ascii=False)
        if os.path.basename(f)=='manifest-frozen.json': raw=json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False)
        open(f,'w').write(raw); after=hashlib.sha256(open(f,'rb').read()).hexdigest()
        changed.append({'file':os.path.relpath(f,ROOT),'rowsRedacted':n,'sha256Before':before,'sha256After':after})
json.dump({'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'applied':'--apply' in sys.argv,'hostsChecked':len(hosts),'affectedJournals':affected,'changedFiles':changed},open(sys.argv[1],'w'),indent=1,ensure_ascii=False)
print(len(hosts),'hosts;',len(affected),'affected journals:',list(affected)); print('changed files:',len(changed))
