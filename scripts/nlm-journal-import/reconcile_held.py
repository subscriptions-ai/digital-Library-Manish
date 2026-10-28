import json,collections,re,sys
R=sys.argv[1]
held=json.load(open(R+'held.json')); ev=json.load(open(R+'evidence.json')); rows={r['issn']:r for r in json.load(open(R+'manifest-466.json'))['rows']}
passed=json.load(open(R+'passed.json'))['rows']
def best(i):
    e=ev[i]; c=[]
    cr,pm,oa=e.get('crossref'),e.get('pubmed'),e.get('openalex')
    if cr and cr['titleOverlap']>=0.5: c.append(('crossref',cr['doisIssued2024to2026']))
    if pm: c.append(('pubmed',pm['articles2024to2026']))
    if oa and oa['titleOverlap']>=0.5: c.append(('openalex',oa['works2024to2026']))
    return max([n for _,n in c],default=0)
def evidence_class(i):
    e=ev[i]; b=best(i)
    if b>=3: return None
    if b>=1: return 'E2 1-2 recent articles (borderline; passed a >=1 bar, fails >=3)'
    cr,pm,oa=e.get('crossref'),e.get('pubmed'),e.get('openalex')
    if cr and cr['doisIssued2024to2026']>=3 and cr['titleOverlap']<0.5: return 'ID Crossref recent DOIs under a different title'
    if cr or oa: return 'E1 record exists in Crossref/OpenAlex but 0 recent articles'
    return 'E0 no record in Crossref or OpenAlex and 0 PubMed articles 2024-26'
def dept_class(reasons):
    for w in reasons:
        if w.startswith('department'):
            if 'span' in w: return 'D3 NLM subjects span several departments'
            if 'non-journal' in w: return 'D4 title reads as non-journal serial'
            if 'does not name the field' in w: return 'D1 broad NLM subject, title does not name the field'
            if 'contradicts' in w: return 'D5 title contradicts the department'
            return 'D9 other department reason: '+w[:80]
    return None
prim=collections.Counter(); sec=collections.Counter(); overlap=0; both=[]
for h in held:
    i=h['issn']; d=dept_class(h['reasons']); e=evidence_class(i)
    # primary precedence: department/scope first, then identity, then recent-publication evidence
    p=d or e; prim[p]+=1
    if d and e: overlap+=1; sec[e]+=1; both.append(i)
print('HELD',len(held),'unique primary:',sum(prim.values())); 
for k,v in sorted(prim.items()): print('  ',v,k)
print('rows with BOTH a department reason and an evidence reason:',overlap,'-> secondary (evidence) reasons on those:',dict(sec))
# reason-instance counts as printed by the validator
inst=collections.Counter()
for h in held:
    for w in h['reasons']: inst[w.split(':')[0]]+=1
print('validator reason instances:',dict(inst),'sum',sum(inst.values()),'= 396 +',sum(inst.values())-396,'overlaps')
ev_total=sum(1 for h in held if evidence_class(h['issn']))
print('rows with an evidence-side reason (377+5):',ev_total)
# the extra 10: pass dept + (>=1 recent) but fail >=3
extra=[h for h in held if not dept_class(h['reasons']) and evidence_class(h['issn']) and evidence_class(h['issn']).startswith('E2')]
print('extra rows that a >=1 bar would have passed, held only by the >=3 bar:',len(extra))
print(collections.Counter(rows[h['issn']]['domain'] for h in extra))
print('PASSED',len(passed),'= 80 at >=1 bar -',len(extra),'= 70 at >=3 bar ->',80-len(extra))
# title-keyword requirement: how many held by it, and would they have passed the evidence bar
d1=[h for h in held if (dept_class(h['reasons']) or '').startswith('D1')]
print('title-keyword requirement (D1) holds:',len(d1),'by dept',dict(collections.Counter(rows[h['issn']]['domain'] for h in d1)),'| of these also evidence-failing:',sum(1 for h in d1 if evidence_class(h['issn'])))
json.dump({'unique_primary':prim,'overlapSecondary':sec,'validatorInstances':inst},open(R+'held-reconciliation.json','w'))
