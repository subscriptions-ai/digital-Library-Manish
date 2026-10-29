"""
Collision check of a plan against journals that appeared in production AFTER the catalogue snapshot the plan was built from (output of `prod.sh newrows <snapshot-time>`).
Exact identifier overlap (either column), exact normalised title, and near-identical title (token Jaccard >= 0.8 any publisher, >= 0.6 same publisher) are reported.

  python3 live_check.py plan.json newrows.json [own-ids.json]     exit status 1 if anything collides
"""
import json,sys,re,unicodedata
plan=json.load(open(sys.argv[1])); new=json.load(open(sys.argv[2]))['rows']
if len(sys.argv)>3:            # ids this run itself inserted earlier are not "someone else's" rows
    mine=set(json.load(open(sys.argv[3]))); new=[j for j in new if j['id'] not in mine]
norm=lambda t:re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
STOP={'the','of','and','for','journal','international','revista','revue','de','la','el','der','die','und','in','on','a','an','da','do','dos','das','del','los','las','et','y','e','o','journals','review','reviews'}
toks=lambda t:frozenset(w for w in norm(t).split() if len(w)>2 and w not in STOP)
ids={}
for j in new:
    for k in (j['issn'],j['eissn']):
        if k: ids[k]=j
bad=[]
for r in plan['rows']:
    mine=[x for x in (r['issn'],r.get('eissn')) if x]
    hit=next((ids[i] for i in mine if i in ids),None)
    if hit: bad.append((r['title'],'identifier already taken by',hit['title'])); continue
    t=toks(r['title']); pub=norm(r.get('publisherName'))
    for j in new:
        if norm(j['title'])==norm(r['title']): bad.append((r['title'],'same title as',j['title'])); break
        jt=toks(j['title'])
        if len(t)>=2 and jt:
            jac=len(t&jt)/len(t|jt); same=bool(pub) and norm(j.get('publisher')) and (pub in norm(j['publisher']) or norm(j['publisher']) in pub)
            if jac>=0.8 or (jac>=0.6 and same): bad.append((r['title'],f'near title {jac:.2f} to',j['title'])); break
print(f'{len(plan["rows"])} rows checked against {len(new)} journals created since the snapshot: {len(bad)} collisions')
for b in bad: print('  ',*b)
sys.exit(1 if bad else 0)
