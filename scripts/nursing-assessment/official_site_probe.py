"""
Does a journal's own site show a recent issue? One polite request per journal to the journal homepage, only where its host's robots.txt allows it. This is SUPPORTING
evidence for a person to confirm, never a pass on its own: it finds the newest year printed next to words like volume / issue / published and keeps one short phrase.

  python3 official_site_probe.py in.json out.json        in.json: [{"key","url"}]
out[key] = {url, finalUrl, http, robots: "allowed"|"disallowed"|"unknown", newestYear, phrase, checked}   (phrase is at most 80 characters of the page text, no page content is stored)
"""
import json,sys,re,time,html,urllib.request,urllib.robotparser,urllib.parse,datetime
UA='STM Digital Library (mailto:info@celnet.in)'
rp={}
def allowed(url):
    u=urllib.parse.urlparse(url); host=f'{u.scheme}://{u.netloc}'
    if host not in rp:
        r=urllib.robotparser.RobotFileParser(); r.set_url(host+'/robots.txt')
        try: r.read()
        except Exception: rp[host]=None; return None
        rp[host]=r
    r=rp[host]
    return None if r is None else r.can_fetch(UA,url)
KW=re.compile(r'(vol(?:ume)?\.?\s*\d+|issue|no\.\s*\d+|published|current issue|latest issue|online first|ahead of print|accepted|received)',re.I)
def probe(url):
    out={'url':url,'finalUrl':None,'http':None,'robots':'unknown','newestYear':None,'phrase':None,'checked':datetime.date.today().isoformat()}
    a=allowed(url); out['robots']='allowed' if a else ('disallowed' if a is False else 'unknown')
    if a is False: return out
    try:
        resp=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=25); out['http']=resp.status; out['finalUrl']=resp.geturl()
        txt=html.unescape(re.sub(r'<script.*?</script>|<style.*?</style>|<[^>]+>',' ',resp.read(400000).decode('utf8','ignore'),flags=re.S)); txt=re.sub(r'\s+',' ',txt)
    except Exception as e:
        out['http']=getattr(e,'code',None) or 'error'; return out
    best=0;phrase=None
    for m in re.finditer(r'\b(20[12]\d)\b',txt):
        y=int(m.group(1)); ctx=txt[max(0,m.start()-60):m.end()+40]
        if y<=datetime.date.today().year and KW.search(ctx) and y>best: best=y; phrase=ctx.strip()[:80]
    out['newestYear']=best or None; out['phrase']=phrase; return out
if __name__=='__main__':
    rows=json.load(open(sys.argv[1])); res={}
    for r in rows:
        res[r['key']]=probe(r['url']); time.sleep(2)
    json.dump(res,open(sys.argv[2],'w'),ensure_ascii=False); print('done',len(res))
