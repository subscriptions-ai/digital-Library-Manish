"""
Tests for the Nursing coverage pipeline: parsing, ISSN validation, de-duplication / clustering, rename handling and count reconciliation.
Offline (reads cached raw files and the committed outputs when present).   python3 -m unittest scripts/nursing-coverage/test_coverage.py -v   (or: python3 scripts/nursing-coverage/test_coverage.py)
"""
import json,os,sys,unittest,collections
sys.path.insert(0,os.path.dirname(__file__))
from common import *
from parsers import *
def load(p,default=None):
    try:
        with open(p) as f: return json.load(f)
    except Exception: return default

class Issn(unittest.TestCase):
    def test_check_digit(self):
        for ok in ('0028-0836','1546-170X','2049-3630','0003-6951'): self.assertTrue(issn_ok(ok),ok)
        for bad in ('0028-0837','1234-5678','abcd-efgh','','0028083',None): self.assertFalse(issn_ok(bad),bad)
    def test_format(self):
        self.assertEqual(fmt_issn('00280836'),'0028-0836'); self.assertEqual(fmt_issn(' 1546-170x '),'1546-170X'); self.assertIsNone(fmt_issn('12345'))
class Titles(unittest.TestCase):
    def test_normalisation(self):
        self.assertEqual(norm('Nursing Open: Clinical & Practice!'),'nursing open clinical practice'); self.assertEqual(norm('Enfermería Clínica'),'enfermeria clinica')
    def test_base_title_strips_translation_and_edition(self):
        self.assertEqual(base('Enfermería Clínica (English Edition)'),base('Enfermería Clínica')); self.assertEqual(base('Nursing standard = Norme infirmière'),'nursing standard')
    def test_nursing_vocabulary_is_a_claim_not_evidence_alone(self):
        for t in ('Journal of Advanced Nursing','Revista de Enfermagem','Kango Kenkyu','Hebammenforum','Jurnal Keperawatan','한국간호과학회지'): self.assertTrue(NARROW.search(t),t)
        for t in ('Journal of Internal Medicine','Health Policy','Physical Therapy'): self.assertFalse(NARROW.search(t),t)
    def test_non_journal_screen_keeps_real_journals(self):
        for t in ('Nursing Reports','The Journal of Nursing Home Research Sciences','Case Reports in Nursing'): self.assertFalse(NONJ.search(t),t)
        for t in ('AACN News','Proceedings of the Nursing Congress','Directory of Nursing Homes','Anais da Mostra de Enfermagem'): self.assertTrue(NONJ.search(t),t)
class Clusters(unittest.TestCase):
    def test_print_electronic_and_issnl_are_one_journal(self):
        u=UF(); u.link(['1234-5679','2345-6780']); u.link(['2345-6780','0028-0836'])
        self.assertEqual(u.f('1234-5679'),u.f('0028-0836'))
    def test_koreamed_rename_links_old_and_new_issn(self):
        u=UF(); rec=parse_koreamed("""<ul class="journalList"><li><a href='/volumes/2058' class='title'><img src='/image/icon_lock.png' alt='Lock'>Allergy</a>&nbsp;<span class='issn'>Allergy&nbsp;<span>1015-6372</span></span> <a href='/search.php?id=2058'><img src='/image/icon_info.png' alt='Info'></a><br/><span class="fcPoint">- now published as</span> <a href='/volumes/2058' class='title'>Korean Journal of Asthma, Allergy and Clinical Immunology</a> <span class="issn"> Korean J Asthma Allergy Clin Immunol <span>1226-8739</span></span> <a href='/search.php?id=2058'><img src="/image/icon_info.png" alt="Info"></a></li>
<li><a href='/volumes/3045' class='title'><img src='/image/icon_unlock.png' alt='Lock'>Acute and Critical Care</a>&nbsp;<span class='issn'>Acute Crit Care&nbsp;<span>2586-6052</span></span></li></ul>""")
        self.assertEqual(len(rec),2); r=rec[0]; self.assertEqual(r['nowPublishedAs']['issn'],'1226-8739'); self.assertIsNone(rec[1]['nowPublishedAs'])
        u.link([r['issn'],r['nowPublishedAs']['issn']]); self.assertEqual(u.f('1015-6372'),u.f('1226-8739')); self.assertNotEqual(u.f('1015-6372'),u.f('2586-6052'))
class Parsers(unittest.TestCase):
    def test_jstage_list_drops_contact_columns(self):
        hdr='CDJOURNAL\tJOURNALTITLE\tLANGUAGE\tPRINTISSN\tONLINEISSN\tISSN-L\tORGANIZATION\tADDRESS\tMAILADDRESS\tURL\tTELEPHONENUMBER\tFAXNUMBER\tRANGEOFSTORINGFROM\tRANGEOFSTORINGTO\tTOPURL\tFREE\tPUBLICATION TYPE\tJST MANAGE\tFIRST VOLUME\tLATEST VOLUME\tCURRENT PUBDATE\tTOTAL ARTICLES\tJ-STAGE Data\tPubMed\tDOAJ\tScopus\tSUSPENDED'
        row='jans\tJournal of Japan Academy of Nursing Science\tJapanese\t0287-5330\t2185-8888\t0287-5330\tJapan Academy of Nursing Science\tSecret street 1\tx@y.z\thttp://jans.example/\t03-1\t03-2\t1981\t2026\thttps://www.jstage.jst.go.jp/browse/jans\tFREE\tJournal\t1\tV1\tV46\t2026-10-24\t2000\t\t1\t1\t\t'
        up,out=parse_jstage_list('UPDATE:2026/10/29 03:45:00\t\n\n'+hdr+'\n'+row+'\n'); self.assertEqual(len(out),1); r=out[0]
        self.assertEqual((r['issn'],r['eissn'],r['currentPubdate'],r['suspended']),('0287-5330','2185-8888','2026-10-24',False)); self.assertNotIn('MAILADDRESS',r); self.assertFalse(any('Secret' in str(v) for v in r.values()))
    def test_ebsco_table(self):
        h='<table><tr><td>Coverage Policy</td><td>Source Type</td><td>ISSN / ISBN</td><td>Publication Name</td><td>Publisher</td></tr><tr><td>Core</td><td>Academic Journal</td><td>0138-645X</td><td>16 de Abril</td><td>Universidad</td></tr></table>'
        r=parse_ebsco_table(h); self.assertEqual(r[0]['Publication Name'],'16 de Abril'); self.assertEqual(r[0]['Source Type'],'Academic Journal')
    def test_kamje_marks_nursing_by_society(self):
        r=parse_kamje('<table><tr><td>Asian Nursing Research</td><td>한국간호과학회</td><td>CC-BY</td></tr><tr><td>Anatomy &amp; Cell Biology</td><td>대한해부학회</td><td>CC</td></tr></table>')
        self.assertTrue(any('간호' in (x['societyKo'] or '') for x in r if x['title']=='Asian Nursing Research')); self.assertFalse(any('간호' in (x['societyKo'] or '') for x in r if x['title'].startswith('Anatomy')))
    def test_cached_raw_files_parse_to_what_the_fetch_steps_stored(self):
        t=f'{RAW}/jstage/journals_list_en.txt'
        if not os.path.exists(t): self.skipTest('raw J-STAGE file not on disk')
        with open(t,encoding='utf8',errors='ignore') as h: up,out=parse_jstage_list(h.read())
        self.assertEqual(out,load(f'{RAW}/jstage-journals.json'))
        with open(f'{RAW}/kamje-members.html',encoding='utf8',errors='ignore') as h: self.assertEqual(parse_kamje(h.read()),load(f'{RAW}/kamje-members.json'))
    def test_cinahl_cached_lists_parse_to_the_stored_facts(self):
        f=f'{RAW}/cinahl/ccm-coverage.htm'
        if not os.path.exists(f): self.skipTest('raw CINAHL list not on disk')
        with open(f,encoding='utf8',errors='ignore') as h: rows=parse_ebsco_table(h.read())
        stored=load(f'{RAW}/cinahl/ccm-coverage.json'); self.assertEqual(len(rows),len(stored)); self.assertEqual([r['Publication Name'] for r in rows],[x['title'] for x in stored])
class Outputs(unittest.TestCase):
    """Invariants of the produced files; skipped before the pipeline has run."""
    @classmethod
    def setUpClass(cls):
        cls.rows=load(f'{WORK}/stage4.json'); cls.cat=load(f'{RAW}/catalogue-snapshot.json')
        if not cls.rows or not cls.cat: raise unittest.SkipTest('pipeline outputs not present')
    def test_no_candidate_is_already_in_the_catalogue(self):
        ids={i for j in self.cat['all'] for i in (j['issn'],j['eissn']) if i}
        self.assertEqual([r['key'] for r in self.rows if r['dedupe']=='net_new' and any(i in ids for i in r['issns'])],[])
    def test_every_candidate_has_exactly_one_primary_reason_or_none(self):
        for r in self.rows: self.assertEqual(r['primary'], r['holdReasons'][0][0] if r['holdReasons'] else None)
    def test_unique_primary_totals_reconcile(self):
        c=collections.Counter(r['primary'] or 'ELIGIBLE' for r in self.rows); self.assertEqual(sum(c.values()),len(self.rows))
    def test_candidate_keys_are_unique_and_clusters_do_not_overlap(self):
        self.assertEqual(len({r['key'] for r in self.rows}),len(self.rows)); seen=collections.Counter(i for r in self.rows for i in r['issns']); self.assertEqual([i for i,n in seen.items() if n>1],[])
    def test_renamed_pairs_never_become_two_new_journals(self):
        km=load(f'{RAW}/koreamed.json',[]); where={}
        for r in self.rows:
            for i in r['issns']: where[i]=r['key']
        for k in km:
            if k['nowPublishedAs'] and k['issn'] in where and k['nowPublishedAs']['issn'] in where: self.assertEqual(where[k['issn']],where[k['nowPublishedAs']['issn']])
    def test_eligible_rows_have_valid_issn_publisher_scope_and_current_evidence(self):
        for r in self.rows:
            if r.get('final')=='eligible':
                self.assertTrue(all(issn_ok(i) for i in r['issns'])); self.assertTrue((r['publisherResolved'] or '').strip()); self.assertEqual(r['scope']['tier'],'A'); self.assertEqual(r['publication']['status'],'current')

class FrozenSet(unittest.TestCase):
    """The frozen manifest of this run (docs/nursing-coverage-2026-10-29/manifest-frozen.json)."""
    @classmethod
    def setUpClass(cls):
        cls.fz=load(f'{OUT}/manifest-frozen.json'); cls.cat=load(f'{RAW}/catalogue-snapshot.json')
        if not cls.fz or not cls.cat: raise unittest.SkipTest('no frozen manifest')
    def test_no_frozen_issn_is_in_the_catalogue_snapshot_or_an_earlier_run(self):
        ids={i for j in self.cat['all'] for i in (j['issn'],j['eissn']) if i}
        for r in self.fz['rows']: self.assertFalse(r['issn'] in ids or (r['eissn'] in ids if r['eissn'] else False),r['title'])
        for f in ('docs/nursing-expansion-2026-10-28/manifest-frozen.json','docs/import-manifests/nlm-2026-10-28-247b5154/passed.json'):
            earlier=load(os.path.join(ROOT,f),{}).get('rows',[]); e={i for x in earlier for i in (x['issn'],x.get('eissn')) if i}
            self.assertEqual([r['title'] for r in self.fz['rows'] if r['issn'] in e or r['eissn'] in e],[])
    def test_every_frozen_row_meets_the_rules(self):
        t=collections.Counter(norm(r['title']) for r in self.fz['rows']); self.assertEqual([k for k,n in t.items() if n>1],[])
        for r in self.fz['rows']:
            self.assertTrue(issn_ok(r['issn']) and (not r['eissn'] or issn_ok(r['eissn']))); self.assertTrue((r['publisherName'] or '').strip()); self.assertEqual(r['domain'],'Nursing')
            ev=r['evidence']; self.assertEqual(ev['scope']['tier'],'A'); self.assertEqual(ev['publication']['status'],'current'); subj=[x for x in ev['scope']['signals'] if x!='TITLE']
            self.assertTrue(len(subj)>=2 or (len(subj)>=1 and 'TITLE' in ev['scope']['signals'])); self.assertTrue(ev['urls']); self.assertEqual(ev['verified'][:4],'2026')
    def test_hand_holds_are_not_in_the_frozen_set(self):
        hh=load(f'{OUT}/hand-holds.json',{}); self.assertEqual([r['title'] for r in self.fz['rows'] if r['issn'] in hh],[])
if __name__=='__main__': unittest.main(verbosity=2)
