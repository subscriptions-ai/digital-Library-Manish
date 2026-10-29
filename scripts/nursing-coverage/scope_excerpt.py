"""
Short Nursing aims/scope evidence from a journal's OWN homepage, for the eligible candidates only. One polite request per journal, only where the host's robots.txt allows it; if the page
cannot be read the scope evidence stays what the independent signals gave (nothing is invented). Keeps at most 200 characters around the first nursing statement, never the page.

  python3 scope_excerpt.py in.json out.json        in.json: [{"key","url"}]
out[key] = {url, finalUrl, http, robots, excerpt|null, retrieved}
"""
import json,sys,re,time,html,datetime,urllib.request,urllib.robotparser,urllib.parse
UA='STM Digital Library (mailto:info@celnet.in)'; rp={}
NUR=re.compile(r'(nurs\w*|midwi\w*|enfermer\w*|enfermag\w*|infirmi\w*|pflege\w*|kango|看護|간호)',re.I)
def allowed(url):
    u=urllib.parse.urlparse(url); host=f'{u.scheme}://{u.netloc}'
    if host not in rp:
        r=urllib.robotparser.RobotFileParser(); r.set_url(host+'/robots.txt')
        try: r.read(); rp[host]=r
        except Exception: rp[host]=None
    r=rp[host]; return None if r is None else r.can_fetch(UA,url)
def probe(url):
    o={'url':url,'finalUrl':None,'http':None,'robots':'unknown','excerpt':None,'retrieved':datetime.date.today().isoformat()}
    a=allowed(url); o['robots']='allowed' if a else ('disallowed' if a is False else 'unknown')
    if a is False: return o
    try:
        r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=25); o['http']=r.status; o['finalUrl']=r.geturl()
        txt=html.unescape(re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<[^>]+>',' ',r.read(600000).decode('utf8','ignore'),flags=re.S)); txt=re.sub(r'\s+',' ',txt)
    except Exception as e: o['http']=getattr(e,'code',None) or 'error'; return o
    for m in re.finditer(r'(aims?|scope|about the journal|focus|publishes|devoted|dedicated)',txt,re.I):
        seg=txt[m.start():m.start()+260]
        n=NUR.search(seg)
        if n: o['excerpt']=seg[:200].strip(); return o
    m=NUR.search(txt)
    if m: o['excerpt']=txt[max(0,m.start()-80):m.start()+120].strip()
    return o
if __name__=='__main__':
    res={}
    for r in json.load(open(sys.argv[1])): res[r['key']]=probe(r['url']); time.sleep(2)
    json.dump(res,open(sys.argv[2],'w'),ensure_ascii=False); print('done',len(res),'| with excerpt',sum(1 for v in res.values() if v['excerpt']))
