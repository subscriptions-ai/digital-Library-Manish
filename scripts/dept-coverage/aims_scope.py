"""
Aims-and-scope check from the journal's OWN website (stage 3). For every candidate with a homepage: fetch robots.txt, and only if the page is allowed fetch the homepage and up to two same-host
"aims / scope / about" pages, one request per host per second, with an identifying User-Agent. Nothing is bypassed: a robots disallow, a 4xx/5xx, a timeout or a non-HTML answer is recorded
as such and is NOT evidence of anything (a failed request does not prove a journal inactive; it simply gives no scope evidence).
Records per journal: pages fetched (URL, status, retrieval time, sha256 of the text), the distinct department phrases found, whether the site states cessation, and whether 2025/2026
appears as a volume/issue year (an independent sign of recent publication, not derived from Crossref).

  python3 aims_scope.py in.json out.json      in: stage1b.json (uses .site and .ready)
"""
import json,os,re,sys,time,hashlib,threading,urllib.request,urllib.parse,urllib.robotparser,html as H
from concurrent.futures import ThreadPoolExecutor
UA='STM Digital Library (mailto:info@celnet.in)'
PH={
 'Electrical Engineering':r'power systems?|power electronics|electrical (machines?|drives?|engineering|power|energy|insulation|systems?)|electric (machines?|drives?|motors?|vehicles?|power)|smart grids?|microgrids?|high[- ]voltage|energy conversion|control systems?|power quality|protection relay|transformers?|instrumentation and measurement|electrification|renewable energy (integration|systems)|power generation|power distribution|magnetics|dielectrics?|superconduct\w*',
 'Electronics & Telecommunication Engineering':r'telecommunications?|wireless (communications?|networks?|systems?)|antennas?|microwaves?|signal processing|electronics?|electronic (devices?|circuits?|systems?)|vlsi|integrated circuits?|optical (communications?|fib(er|re)s?)|photonics?|radar|\brf\b|radio frequency|embedded systems?|communication (systems?|networks?|engineering)|semiconductor devices?|information theory|\b[56]g\b|mimo|circuits and systems|sensors?',
 'Bio Technology':r'biotechnolog\w*|bioprocess\w*|fermentation|metabolic engineering|synthetic biology|biocatalys\w*|enzyme (technology|engineering|catalysis)|bioreactors?|industrial biotechnology|biofuels?|biorefiner\w*|recombinant|genetic engineering|bioengineering|downstream processing|cell culture|tissue engineering|applied microbiology|bioproduction|bioenergy',
}
PHR={d:re.compile(r'\b(?:'+p+r')\b',re.I) for d,p in PH.items()}
CEASE=re.compile(r'(ceased publication|no longer (published|accepting)|has been discontinued|publication (has )?(stopped|suspended)|journal (is )?(closed|archived)|archived journal)',re.I)
LINK=re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',re.I|re.S)
robots={}; rl=threading.Lock(); last={}; ll=threading.Lock()
def polite(host):
    with ll:
        t=time.time(); w=last.get(host,0)+1.0-t; last[host]=max(t,last.get(host,0)+1.0)
    if w>0: time.sleep(w)
def get(url,limit=400_000):
    polite(urllib.parse.urlparse(url).netloc)
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'})
    try:
        r=urllib.request.urlopen(req,timeout=15); ct=r.headers.get('Content-Type','')
        if 'html' not in ct.lower() and 'xml' not in ct.lower(): return r.status,None,url
        final=r.geturl()
        # a redirect may lead to another host whose robots.txt forbids automated access: the destination is checked too, and its content is discarded if disallowed
        if urllib.parse.urlparse(final).netloc!=urllib.parse.urlparse(url).netloc and not allowed(final): return 0,None,final
        return r.status,r.read(limit).decode(r.headers.get_content_charset() or 'utf-8','replace'),final
    except urllib.error.HTTPError as e: return e.code,None,url
    except Exception as e: return 0,None,url
def allowed(url):
    p=urllib.parse.urlparse(url); host=p.scheme+'://'+p.netloc
    with rl:
        rp=robots.get(host)
    if rp is None:
        rp=urllib.robotparser.RobotFileParser()
        polite(p.netloc)
        try:
            r=urllib.request.urlopen(urllib.request.Request(host+'/robots.txt',headers={'User-Agent':UA}),timeout=12); rp.parse(r.read(200000).decode('utf-8','replace').splitlines())
        except urllib.error.HTTPError as e: rp.parse(['User-agent: *','Disallow:'] if e.code in (401,403,404,410) else ['User-agent: *','Disallow: /'])   # no robots file = allowed; a server error = do not crawl
        except Exception: rp.parse(['User-agent: *','Disallow:'])
        with rl: robots[host]=rp
    return rp.can_fetch(UA,url)
def text_of(h):
    h=re.sub(r'(?is)<(script|style|noscript|svg|nav|footer|header)\b.*?</\1>',' ',h)
    meta=' '.join(re.findall(r'(?is)<meta[^>]+(?:name|property)=["\'](?:description|og:description)["\'][^>]+content=["\'](.*?)["\']',h))
    t=re.sub(r'(?s)<[^>]+>',' ',h.replace('\x00','')); t=H.unescape(re.sub(r'\s+',' ',t+' '+meta)); return t.strip()
def one(rec):
    url=rec['homepage']; out={'homepage':url,'pages':[],'status':'not-fetched','hits':{},'cease':False,'year2025_26':False,'snippet':''}
    if not url or not url.startswith('http'): out['status']='no homepage'; return rec['key'],out
    try:
        if not allowed(url): out['status']='robots-disallowed'; return rec['key'],out
        st,h,final=get(url)
        if h is None: out['status']=f'unreachable ({st})'; return rec['key'],out
        texts=[text_of(h)]; out['pages'].append({'url':final,'status':st,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':hashlib.sha256(texts[0].encode()).hexdigest()})
        host=urllib.parse.urlparse(final).netloc; seen={final}; more=[]
        for href,label in LINK.findall(h):
            lab=re.sub(r'<[^>]+>','',label)
            if re.search(r'aims?\s*(and|&)?\s*scope|focus and scope|scope|about (the )?journal|journal (information|overview)|about us|^about$',lab,re.I) or re.search(r'aims?-?(and|&)?-?scope|/about',href,re.I):
                u=urllib.parse.urljoin(final,href.split('#')[0])
                if urllib.parse.urlparse(u).netloc==host and u not in seen and u not in more and re.match(r'https?',u): more.append(u)
        for u in more[:2]:
            if not allowed(u): continue
            st2,h2,f2=get(u)
            if h2: t=text_of(h2); texts.append(t); out['pages'].append({'url':f2,'status':st2,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':hashlib.sha256(t.encode()).hexdigest()})
        full=' '.join(texts)[:60000]; out['status']='ok'
        for d,rx in PHR.items(): out['hits'][d]=sorted({m.group(0).lower() for m in rx.finditer(full)})[:12]
        out['cease']=bool(CEASE.search(full)); out['year2025_26']=bool(re.search(r'\b(vol(ume)?\.?\s*\d+.{0,25}\b(2025|2026)|\b(2025|2026)\b.{0,25}(vol(ume)?|issue|no\.))',full,re.I))
        i=re.search(r'(aims?\s*(and|&)\s*scope|focus and scope|scope)',full,re.I); out['snippet']=full[i.start():i.start()+500] if i else full[:300]
        out['textChars']=len(full)
    except Exception as e: out['status']='error '+str(e)[:60]
    return rec['key'],out
if __name__=='__main__':
    s=json.load(open(sys.argv[1])); rows=s['site']+s['ready']; outp=sys.argv[2]
    res=json.load(open(outp)) if os.path.exists(outp) else {}
    todo=[r for r in rows if r['key'] not in res]; print(len(todo),'to fetch of',len(rows),flush=True)
    with ThreadPoolExecutor(16) as ex:
        for i,(k,o) in enumerate(ex.map(one,todo)):
            res[k]=o
            if (i+1)%50==0: json.dump(res,open(outp,'w'),ensure_ascii=False); print(i+1,flush=True)
    json.dump(res,open(outp,'w'),ensure_ascii=False); print('done',len(res))
