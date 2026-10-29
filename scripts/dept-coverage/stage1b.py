"""
Stage 1 of the second run (Bio Technology, Electrical Engineering, Electronics & Telecommunication). Offline. Reads data/dept-coverage2/work/pool.json + classified.json.
A journal is READY when at least TWO different kinds of department evidence agree (families: title term, society list, catalogue subject, OpenAlex topics) and nothing contradicts;
with ONE promising kind it goes to the aims-and-scope check (stage 3, the journal's own website) instead of being guessed. Writes work/stage1b.json.
"""
import json,os,re,sys,collections,unicodedata
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
W=os.path.join(ROOT,'data',os.environ.get('RUN_DIR','dept-coverage2'),'work')
cl=json.load(open(f'{W}/classified.json'))
def clusters():
    for line in open(f'{W}/pool.ndjson'):
        if line.strip(): yield json.loads(line)
EL,ET,BT='Electrical Engineering','Electronics & Telecommunication Engineering','Bio Technology'; T=[EL,ET,BT]
NON_LATIN=re.compile(r'[^\u0000-ɏḀ-ỿ -⁯℀-⅏]')
NON_JOURNAL=re.compile(r"\b(directory|directories|newsletter|annual report|reports?|proceedings|yearbook|catalog(ue)?|who'?s who|abstracts?|monograph series|handbook|bibliography|symposium|conference|workshop|lecture notes|digest|magazine|bulletin|reprints?|supplement|news|communications of the|trade|buyers guide|price|schedule|calendar|series|foundations and trends|standards?|technical review|book series|transactions of the .* conference|review of .* literature|guidelines?|specifications?|patent)\b",re.I)
def norm(t): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
STOP={'the','of','and','for','journal','international','de','la','in','on','a','an','et','y','e','transactions','ieee','acm','society'}
def toks(t): return {w for w in norm(t).split() if len(w)>2 and w not in STOP}
def resolve_el_et(title_hits,d):
    return d
ready=[];site=[];held=[];reasons=collections.Counter(); outside=[]
def families(k,v,heldInfo=None):
    """-> {dept: {family: detail}} for the three departments, and a contradiction note"""
    fam={d:{} for d in T}
    for d in v['title']: fam[d]['title']=1
    o=v['official']
    if o and o['confidence']=='high' and o['dept'] in T: fam[o['dept']]['society']=v['body']
    c=v['catalogue']
    # NLM subject counts only together with a biotechnology term in the title (the subject alone also files chemistry, sensors and plant biology)
    if c.get('nlm')==BT and BT in v['title']: fam[BT]['catalogue']='NLM subject+title'
    # an NLM subject alone (nlmSubjectOnly) is NOT a family: NLM files chemistry, sensors and general biology under Biotechnology too
    if c.get('scielo')==BT: fam[BT]['catalogue']='SciELO WoS'
    if c.get('scielo')==ET: fam[ET]['catalogue']='SciELO WoS'
    if c.get('kbart')==BT: fam[BT]['catalogue']='Springer KBART sector list'
    if c.get('kbart')==ET: fam[ET]['catalogue']='Springer KBART sector list'
    if c.get('kbart')=='EL_OR_ET':
        hit=[d for d in (EL,ET) if d in v['title']]
        if len(hit)==1: fam[hit[0]]['catalogue']='Springer KBART sector list (title picks)'
    if c.get('scielo')=='EL_OR_ET':
        hit=[d for d in (EL,ET) if d in v['title']]
        if len(hit)==1: fam[hit[0]]['catalogue']='SciELO WoS (title picks)'
    if c.get('doaj') in T: fam[c['doaj']]['catalogue']='DOAJ'
    # topics
    ts=v['topicsStrict']; lex=(v['lexicon'] or {}).get('share',{}) ; ln=(v['lexicon'] or {}).get('topics',{}); sh=v['shares']
    for d in T:
        strong = bool(ts and ts['dept']==d and ts['confidence']=='high') or (lex.get(d,0)>=0.5 and ln.get(d,0)>=3)
        s=sh.get(d,0)+(sh.get('AMBIGUOUS_ELECTRICAL',0) if d==EL else 0)
        moderate = strong or (lex.get(d,0)>=0.25 and ln.get(d,0)>=2) or s>=0.25
        if strong: fam[d]['topics']='strong'
        elif moderate and v['topicTotal']>=30: fam[d]['topics']='moderate'
    return fam
for c in clusters():
    if c['class']!='net-new': continue
    k=c['ids'][0]; v=cl.get(k)
    if not v: continue
    fam=families(k,v)
    # Electrical vs Electronics: only when the title (the existing taxonomy's own tie-break) picks one, or one lexicon clearly dominates
    for a,b in ((EL,ET),(ET,EL)):
        if fam[a] and fam[b]:
            la=(v['lexicon'] or {}).get('share',{}).get(a,0); lb=(v['lexicon'] or {}).get('share',{}).get(b,0)
            if 'title' in fam[a] and 'title' not in fam[b]: fam[b]={}
            elif 'title' in fam[b] and 'title' not in fam[a]: pass
            elif la<2*lb: fam[a]={}
    cand=[(d,f) for d,f in fam.items() if f]
    title=c['title'] or ''
    if not cand: reasons['out of scope (no evidence for the three departments)']+=1; continue
    # more than one department with >=2 families: contradiction
    strong=[(d,f) for d,f in cand if len(f)>=2]
    def hold(why,d=None): held.append({'key':k,'ids':c['ids'],'title':title,'dept':d,'why':why}); reasons[why]+=1
    if len(strong)>1: hold('two target departments have equal evidence'); continue
    d,f=(strong[0] if strong else cand[0]) if len(cand)==1 or strong else (None,None)
    if d is None:
        hold('evidence for several departments, none with two kinds'); continue
    if not c['validIssn']: hold('an identifier fails the ISSN check digit',d); continue
    if NON_LATIN.search(title): hold('non-Latin title',d); continue
    STRONG_ET=r'antenna|microwave|signal processing|photonic|optic|vlsi|radar|telecommunication|wireless communication|\brf\b|radio|electromagnetic'
    if d==ET and re.search(r'computer (networks?|communication|and communication|engineering)|networking|distributed systems|data communication|internet of things',title,re.I) and not re.search(STRONG_ET,title,re.I): hold('a computer-network / networking title: the existing taxonomy files these under Computer / IT, not Electronics & Telecommunication',d); continue
    if d==BT and re.search(r'microbiolog|biolog(y|ia|ical sciences)|biosciences|life sciences|natural sciences|bogor',title,re.I) and not re.search(r'biotech|bioprocess|bioengineering|biocatal|fermentation|synthetic biology',title,re.I): hold('a general biology / microbiology title: not Biotechnology without a biotechnology term in the title',d); continue
    if re.search(r'\b(science|sciences|engineering|technology|multidiscipline)\b',title,re.I) and not re.search(r'elektro|electr|electron|telecom|telekomunikasi|radio|wireless|photon|optic|signal|antenna|microwave|biotech|bioprocess|bioengineering|biorefin|synthetic biology|grid|power|communication',title,re.I) and not (set(f)&{'society','catalogue'}): hold('a broad engineering / science title with no department term: needs the title or a society or catalogue subject, not topics and a website alone',d); continue
    if re.search(r'multidisciplin|interdisciplin|bioinformatic|biostatistic|microwave surgery|general and applied microbiology',title,re.I): hold('multidisciplinary, bioinformatics/biostatistics or a medical/general-microbiology title: not this department',d); continue
    if NON_JOURNAL.search(title): hold('reads as a magazine, newsletter, proceedings, series, standard or other non-journal serial',d); continue
    ts=[toks(r['title']) for r in c['records'] if r.get('title')]
    if len(ts)>1 and any(len(a&b)/max(1,min(len(a),len(b)))<0.34 for i,a in enumerate(ts) for b in ts[i+1:]): hold('records sharing an ISSN carry different titles (identity unconfirmed)',d); continue
    j=v['judge']
    if j['dept'] and j['dept']!=d and j['tier'] not in('low','unclassifiable') and j['dept'] not in T: hold(f"the journal classifier says {j['dept']} ({j['tier']})",d); continue
    pub=next((r.get('publisher') for r in c['records'] if r.get('publisher')),None)
    oa=next((r for r in c['records'] if r['src']=='OpenAlex'),None)
    by=(oa or {}).get('byYear') or {}; n24=sum(by.get(y,0) for y in('2024','2025','2026')); n25=sum(by.get(y,0) for y in('2025','2026'))
    cr=next((r for r in c['records'] if r['src']=='Crossref member'),None)
    if cr: n24=max(n24,cr['recent2024']); n25=max(n25,cr['recent2025h2'])
    js=v.get('jstage'); jok=bool(js and (js.get('currentPubdate') or '')>='2025-01-01' and not js.get('suspended'))
    lowcount=(n24<3 or n25<1) and not jok      # OpenAlex's own counts can be missing or unlinked: Crossref is asked directly in stage 2 before anything is held for this
    rec={'key':k,'ids':c['ids'],'title':title,'dept':d,'families':f,'publisher':pub,'sources':c['sources'],'recent':{'n2024_26':n24,'n2025_26':n25,'jstage':js},'homepage':next((r.get('homepage') for r in c['records'] if r['src']=='Springer KBART' and r.get('homepage')),None) or next((r.get('homepage') for r in c['records'] if r.get('homepage')),None),
         'country':(oa or {}).get('country'),'lowcount':lowcount,'societies':(oa or {}).get('societies',[]),'official':v['official'],'lexicon':v['lexicon'],'shares':v['shares']}
    (ready if len(f)>=2 else site).append(rec)
print('READY (>=2 kinds):',len(ready),dict(collections.Counter(r['dept'] for r in ready)))
print('needs aims-and-scope check (1 kind):',len(site),dict(collections.Counter(r['dept'] for r in site)))
print('families in ready:',dict(collections.Counter('+'.join(sorted(r['families'])) for r in ready)))
print('single family in site:',dict(collections.Counter('+'.join(sorted(r['families'])) for r in site)))
print('holds:'); [print(' ',n,w) for w,n in reasons.most_common()]
json.dump({'ready':ready,'site':site,'held':held},open(f'{W}/stage1b.json','w'),ensure_ascii=False)
