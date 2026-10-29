"""Shared helpers: ISSN check digit, title normalisation, ISSN clusters (union-find), nursing vocabulary, raw/work paths."""
import re,unicodedata,os,json
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
RAW=os.path.join(ROOT,'data','nursing-coverage','raw'); WORK=os.path.join(ROOT,'data','nursing-coverage','work'); OUT=os.path.join(ROOT,'docs','nursing-coverage-2026-10-29')
VALID=re.compile(r'^\d{4}-\d{3}[\dX]$')
def issn_ok(v):
    if not v or not VALID.match(v): return False
    d=v.replace('-',''); s=sum(int(d[i])*(8-i) for i in range(7)); c=(11-s%11)%11
    return d[7]==('X' if c==10 else str(c))
def fmt_issn(v):
    v=(v or '').strip().upper().replace(' ','')
    if re.match(r'^\d{7}[\dX]$',v): v=v[:4]+'-'+v[4:]
    return v if VALID.match(v) else None
def norm(t): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
def base(t):
    t=re.split(r'\s[:=/|]\s|\s=\s|\s-\s|\(|\[',(t or '').lower())[0]
    return norm(re.sub(r'\b(english edition|online|print|international edition|revista|journal of the|the)\b','',t))
STOP={'the','of','and','for','journal','international','revista','revue','de','la','el','der','die','und','in','on','a','an','da','do','dos','das','del','los','las','et','y','e','o','journals','review','reviews'}
def toks(t): return frozenset(w for w in norm(t).split() if len(w)>2 and w not in STOP)
# nursing vocabulary (a title word is the journal's own claim; it never makes a journal Nursing on its own)
NARROW=re.compile(r'nurs|midwif|enfermer|enfermag|infirm|sage-?femme|kango|pflege|hebamm|sykepleie|sjuksk|verpleeg|keperawatan|kebidanan|hemşire|hemsire|pielęgn|pielegn|medsestr|sestr|看護|간호',re.I)
PUBWORD=re.compile(r'nurs|midwi|enfermer|enfermag|infirm|pflege|sykepleie|verpleeg|kango|keperawatan|看護|간호',re.I)
NONJ=re.compile(r"\b(news ?letter|newsletter|news|directory|directories|proceedings|anais|actas|conference|congress|congreso|abstracts?|yearbook|handbook|guide|catalog(ue)?|annual report|manual|careers?|retirement)\b",re.I)
class UF:
    def __init__(s): s.p={}
    def f(s,x):
        s.p.setdefault(x,x)
        while s.p[x]!=x: s.p[x]=s.p[s.p[x]]; x=s.p[x]
        return x
    def u(s,a,b): s.p[s.f(a)]=s.f(b)
    def link(s,ids):
        ids=[i for i in ids if i and VALID.match(i)]
        for i in ids[1:]: s.u(ids[0],i)
        for i in ids: s.f(i)
        return ids
