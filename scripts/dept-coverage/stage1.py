"""
Stage 1 (offline): which net-new journals of the pool pass the identity, scope and non-journal gates, and are worth a publication-evidence lookup?
Reads work/pool.json + work/classified.json (classify.ts). Writes work/stage1.json {candidates:[...], held:[...]} and prints the reason counts.
No network, nothing written to any database.
"""
import json,os,re,sys,collections,unicodedata
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
W=os.path.join(ROOT,'data','dept-coverage','work')
pool=json.load(open(f'{W}/pool.json')); cl=json.load(open(f'{W}/classified.json'))
TARGETS=['Electrical Engineering','Electronics & Telecommunication Engineering','Mechanical Engineering','Applied Mechanics','Pharmacy','Bio Technology','Chemical Engineering','Nano Technology','Architecture','Physiotherapy','Ayurveda']
NON_LATIN=re.compile(r'[^\u0000-ɏḀ-ỿ -⁯℀-⅏]')
NON_JOURNAL=re.compile(r"\b(directory|directories|newsletter|annual report|reports?|proceedings|yearbook|catalog(ue)?|who'?s who|abstracts?|monograph series|handbook|bibliography|symposium|conference|workshop|lecture notes|digest|magazine|bulletin|reprints?|supplement|news|communications of the|trade|buyers guide|price|schedule|calendar|series|foundations and trends)\b",re.I)
# Title evidence the five departments the brief names must have on top of any topic evidence (brief: not general chemistry -> Chem Eng, not general biology -> Biotech,
# not general traditional medicine -> Ayurveda, not rehabilitation -> Physiotherapy, not broad engineering -> Electrical/Mechanical).
TITLE_EV={
 'Ayurveda':re.compile(r'ayurved|\bunani\b|\bsiddha\b|homoeopath|homeopath|\bayush\b|naturopath|\byoga\b|panchakarma|rasashastra|\bsowa[- ]rigpa\b',re.I),
 'Physiotherapy':re.compile(r'physiotherap|physical therap|fisioterap|physical medicine|physical (and|&) (occupational therap|rehabilitation)|rehabilitation (medicine|science)|neurorehabilit|kinesiotherap|manual therap|sports (physical therap|physiotherap)|musculoskeletal (science|physiotherap)|\bfisio|\bfizyo',re.I),
 'Chemical Engineering':re.compile(r'chemical engineering|\baiche\b|\bicheme\b|chemical (and|&) (bio)?process|process (engineering|systems|safety|intensification)|reaction engineering|separation (and|&) purification|separation science|\bchemical reactor|catalysis (engineering|technology)|chemical process|bioprocess|membrane science|particle technology|powder technology|unit operations',re.I),
 'Bio Technology':re.compile(r'biotech\b|biotechnolog|bioprocess|bioengineering|biocatalys|synthetic biology|genetic engineering|\bbioinformatic|fermentation|metabolic engineering|biorefiner|tissue engineering|biosensor|biomaterial',re.I),
 'Architecture':re.compile(r'architect|landscape|urban (design|planning|studies)|town planning|interior design|built environment|building (design|science)|heritage|conservation',re.I),
}
def norm(t): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
STOP={'the','of','and','for','journal','international','de','la','in','on','a','an','et','y','e','transactions','ieee','acm','society'}
def toks(t): return {w for w in norm(t).split() if len(w)>2 and w not in STOP}
held=[]; cands=[]; reasons=collections.Counter(); byDeptReason=collections.defaultdict(collections.Counter)
for c in pool['clusters']:
    if c['class']!='net-new': continue
    ids=c['ids']; k=ids[0]; v=cl.get(k)
    if not v: continue
    recs=c['records']; oa=next((r for r in recs if r['src']=='OpenAlex'),None)
    t,o=v['topics'],v['official']
    # which routes name a target department? Each is a different kind of evidence; they must not disagree.
    named={}
    if t and t['confidence']=='high' and t['dept'] in TARGETS: named['topics']=t['dept']
    if o['confidence']=='high' and o['dept'] in TARGETS: named['official-list']=o['dept']
    nl=v.get('nlm')
    if nl and nl['confidence']=='high' and nl['dept'] in TARGETS: named['nlm-subject']=nl['dept']
    tt=v.get('titleTopics')
    if tt and tt['confidence']=='high' and tt['dept'] in TARGETS: named['title+topics']=tt['dept']
    if v.get('doaj') in TARGETS: named['doaj-rule']=v['doaj']
    ds=set(named.values()); route=None; dept=None
    if len(ds)==1: dept=ds.pop(); route='+'.join(named)
    elif len(ds)>1: route='conflict'
    # OpenAlex's subfield table is coarse between mechanical, electrical and electronics (an antenna journal's aerospace-flavoured topics read as Mechanical). When a recognised
    # body's own title picks the department and the topic classifier names a NEIGHBOURING engineering department, the body + title decides and the disagreement is recorded.
    NEIGH={'Mechanical Engineering','Electrical Engineering','Electronics & Telecommunication Engineering','Applied Mechanics'}
    if route=='conflict' and 'official-list' in named and 'topics' in named and named['topics'] in NEIGH and named['official-list'] in NEIGH and set(named)<={'official-list','topics','title+topics'}:
        others={n:d for n,d in named.items() if n not in('topics',)}
        if len(set(others.values()))==1: dept=named['official-list']; route='official-list(topics said '+named['topics']+')'
    # near-misses are interesting to the report (a target department named, evidence too thin)
    near=(t['dept'] if t and t['dept'] in TARGETS else None) or (o['dept'] if o['dept'] in TARGETS else None) or ((v.get('titleTopics') or {}).get('dept') if (v.get('titleTopics') or {}).get('dept') in TARGETS else None) or ((v.get('nlm') or {}).get('dept') if (v.get('nlm') or {}).get('dept') in TARGETS else None)
    title=c['title'] or ''
    def hold(why,d=None):
        held.append({'key':k,'ids':ids,'title':title,'dept':d or dept or near,'why':why,'sources':[s['src'] for s in c['sources']]}); reasons[why]+=1; byDeptReason[d or dept or near or '(none)'][why]+=1
    # ONE kind of evidence is never enough. A topic-only route (OpenAlex topics and nothing else) is held; an NLM-subject-only or DOAJ-only route needs the title to name the
    # department by a specific term (titleTopics.dept) or OpenAlex topics to give the department at least a quarter of the journal's works.
    if route and route!='conflict' and set(named)=={'topics'}:
        held.append({'key':k,'ids':ids,'title':title,'dept':dept,'why':'topic evidence only (a single kind of evidence)','sources':[s['src'] for s in c['sources']]}); reasons['topic evidence only (a single kind of evidence)']+=1; byDeptReason[dept]['topic only']+=1; continue
    if route and route!='conflict' and set(named)<= {'nlm-subject','doaj-rule'}:
        tnamed=(v.get('titleTopics') or {}).get('dept'); share=(v.get('deptShares') or {}).get(dept,0)
        if tnamed!=dept and share<0.25:
            held.append({'key':k,'ids':ids,'title':title,'dept':dept,'why':'catalogue subject only (title names no department term and topics give it under 25%)','sources':[s['src'] for s in c['sources']]}); reasons['catalogue subject only (title names no department term and topics give it under 25%)']+=1; continue
    if route is None:
        if near: hold('department evidence below the bar',near)
        else: reasons['no target department']+=1
        continue
    if route=='conflict': hold('topics and publisher-list evidence name different departments',None); continue
    if not c['validIssn']: hold('an identifier fails the ISSN check digit'); continue
    if NON_LATIN.search(title): hold('non-Latin title'); continue
    if NON_JOURNAL.search(title): hold('reads as a magazine, newsletter, proceedings, directory or other non-journal serial'); continue
    # identity: records that share an ISSN must be the same journal (Crossref lists occasionally carry another journal's ISSN)
    ts=[toks(r['title']) for r in recs if r.get('title')]
    if len(ts)>1 and any(len(a&b)/max(1,min(len(a),len(b)))<0.34 for i,a in enumerate(ts) for b in ts[i+1:]): hold('records sharing an ISSN carry different titles (identity unconfirmed)'); continue
    pub=next((r.get('publisher') for r in recs if r.get('publisher')),None)
    # no publisher in the listing is not a hold yet: stage 2 may fill it from Crossref's own journal record (title must match); it is held there if that fails too
    ev=TITLE_EV.get(dept)
    if ev and not ev.search(title) and 'official-list' not in route and 'title+topics' not in route:
        hold(f'{dept}: the title does not name the field (general {"chemistry" if dept=="Chemical Engineering" else "biology" if dept=="Bio Technology" else "traditional medicine" if dept=="Ayurveda" else "rehabilitation" if dept=="Physiotherapy" else "design"} is not {dept})'); continue
    if v['title'] and v['title']['verdict']=='wrong': hold('the title names another field',dept); continue
    j=v['judge']
    if j['dept'] and j['dept']!=dept and j['tier'] not in('low','unclassifiable'): hold(f"the journal classifier says {j['dept']} ({j['tier']})"); continue
    # recent-activity pre-filter (the lookup in stage 2 decides): OpenAlex counts_by_year, or the Crossref member deposit counts
    by=(oa or {}).get('byYear') or {}
    n24=sum(by.get(y,0) for y in('2024','2025','2026')); n25=sum(by.get(y,0) for y in('2025','2026'))
    cr=next((r for r in recs if r['src']=='Crossref member'),None)
    if cr: n24=max(n24,cr['recent2024']); n25=max(n25,cr['recent2025h2'])
    if n24<3 or n25<1: hold(f'fewer than 3 works in 2024-2026 or none in 2025-2026 (OpenAlex/Crossref counts)'); continue
    cands.append({'key':k,'ids':ids,'title':title,'dept':dept,'route':route,'publisher':pub,'sources':c['sources'],'topicDecision':t,'official':o,'judge':j,'recent':{'n2024_26':n24,'n2025_26':n25},
                  'country':(oa or {}).get('country'),'homepage':next((r.get('homepage') for r in recs if r.get('homepage')),None),'societies':(oa or {}).get('societies',[]),'issnl':(oa or {}).get('issnl'),'isOa':(oa or {}).get('isOa'),'inDoaj':(oa or {}).get('inDoaj')})
json.dump({'candidates':cands,'held':held},open(f'{W}/stage1.json','w'),ensure_ascii=False)
print('stage-1 candidates',len(cands),'by dept',dict(collections.Counter(c['dept'] for c in cands)))
print('route',dict(collections.Counter(c['route'] for c in cands)))
print('\nholds:'); [print(' ',n,w) for w,n in reasons.most_common()]
