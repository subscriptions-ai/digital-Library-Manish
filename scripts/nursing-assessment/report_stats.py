"""Numbers for the Nursing assessment report, computed from the assessment files (local only).   python3 report_stats.py <work-dir>"""
import json,collections,sys
W=sys.argv[1]
a=json.load(open(f'{W}/nu/assessment-final.json')); pool=json.load(open(f'{W}/nu/pool.json')); prof=json.load(open(f'{W}/nu/profile.json'))
NR,NN=a['needsReview'],a['netNew']
o={}
o['production']={'status':{x['status']:x['n'] for x in prof['st']},'at':prof['at']}
o['nr']={'total':len(NR),'basis':dict(collections.Counter((x['basis'] or '').split(' listing')[0] for x in NR)),'noPublisherToday':sum(1 for x in NR if not (x['publisher'] or '').strip()),'publisherFilledFromEvidence':sum(1 for x in NR if x.get('publisherFill')),
 'scopeTier':dict(collections.Counter(x['scope']['tier'] for x in NR)),'publicationClass':dict(collections.Counter(x['publication']['class'] for x in NR)),
 'eligible':sum(1 for x in NR if x['metadataOnlyEligible']),'acceptedEligible':sum(1 for x in NR if x['acceptedEligible']),
 'primary':dict(collections.Counter(x['primary'] or 'ELIGIBLE' for x in NR).most_common()),'allReasons':dict(collections.Counter(k for x in NR for k,_ in x['holdReasons']).most_common()),
 'singleBlocker':dict(collections.Counter(x['holdReasons'][0][0] for x in NR if len(x['holdReasons'])==1).most_common())}
o['pool']={'sourceRecords':pool['counts'],'netNewMerged':len(NN),'multiSourceMerged':sum(1 for x in NN if len(x['sources'])>1)}
o['nn']={'total':len(NN),'scopeTier':dict(collections.Counter(x['scope']['tier'] for x in NN)),'publicationClass':dict(collections.Counter(x['publication']['class'] for x in NN)),
 'eligible':sum(1 for x in NN if x['metadataOnlyEligible']),'acceptedEligible':sum(1 for x in NN if x['acceptedEligible']),
 'eligibleBySourceMembership':dict(collections.Counter(s for x in NN if x['metadataOnlyEligible'] for s in {y['source'] for y in x['sources']})),
 'eligibleByPrimaryLabel':dict(collections.Counter(json.load(open(f'{W}/../nu_label.json')).get(x['issns'][0],'?') for x in NN if x['metadataOnlyEligible'])) if False else None,
 'primary':dict(collections.Counter(x['primary'] or 'ELIGIBLE' for x in NN).most_common()),'allReasons':dict(collections.Counter(k for x in NN for k,_ in x['holdReasons']).most_common()),
 'singleBlocker':dict(collections.Counter(x['holdReasons'][0][0] for x in NN if len(x['holdReasons'])==1).most_common())}
o['nn']['publisherFilledFromEvidence']=sum(1 for x in NN if x.get('publisherFill'))
print(json.dumps(o,indent=1,ensure_ascii=False)); json.dump(o,open(f'{W}/nu/report-stats.json','w'),ensure_ascii=False)
