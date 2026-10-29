"""
Public visibility check: for every row of a plan, GET <base>/api/library/journal/<issn> and require the right title, department and status MetadataOnly.
  python3 check_public.py plan.json [base-url]  -> prints a summary, exit 1 if any row fails.
"""
import json,sys,time,urllib.request,urllib.parse
plan=json.load(open(sys.argv[1])); base=(sys.argv[2] if len(sys.argv)>2 else 'https://journalslibrary.com').rstrip('/')
ok=0; bad=[]
for r in plan['rows']:
    url=f"{base}/api/library/journal/{urllib.parse.quote(r['issn'])}"
    for a in range(3):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library verification'}),timeout=30)); break
        except Exception as e: d=None; err=str(e)[:80]; time.sleep(2)
    j=(d or {}).get('journal',d) if isinstance(d,dict) else None
    good=bool(j) and str(j.get('title','')).strip()==r['title'].strip() and j.get('domain',j.get('department'))==r['domain'] and str(j.get('status'))=='MetadataOnly'
    if good: ok+=1
    else: bad.append({'issn':r['issn'],'title':r['title'],'got':(None if not j else {k:j.get(k) for k in('title','domain','department','status')}),'err':None if d else err})
print(json.dumps({'checked':len(plan['rows']),'ok':ok,'bad':bad[:10]},indent=1)); sys.exit(1 if bad else 0)
