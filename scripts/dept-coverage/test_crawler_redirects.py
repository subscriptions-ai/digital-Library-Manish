"""
The scope crawler must consult robots.txt before EVERY request, including each redirect hop, on any host or path, and must never request (or return content from) a disallowed URL.
Three local HTTP servers play three hosts: A (allows everything except /private), B (allows everything except /private), C (disallows everything).
  python3 scripts/dept-coverage/test_crawler_redirects.py
"""
import os,sys,threading,unittest,http.server,socketserver,collections
os.environ['STM_POLITE_SECONDS']='0'
sys.path.insert(0,os.path.dirname(__file__))
import aims_scope as A

REQ=collections.defaultdict(list)       # port -> paths actually requested (robots.txt excluded)
def make(port_holder,robots,routes):
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self,*a): pass
        def do_GET(self):
            if self.path=='/robots.txt':
                self.send_response(200); self.send_header('Content-Type','text/plain'); self.end_headers(); self.wfile.write(robots.encode()); return
            REQ[port_holder['port']].append(self.path)
            r=routes.get(self.path)
            if r is None: self.send_response(404); self.end_headers(); return
            if r[0] in (301,302,303,307,308): self.send_response(r[0]); self.send_header('Location',r[1](port_holder) if callable(r[1]) else r[1]); self.end_headers(); return
            self.send_response(200); self.send_header('Content-Type','text/html'); self.end_headers(); self.wfile.write(('<html><body>%s</body></html>'%r[1]).encode())
    srv=socketserver.TCPServer(('127.0.0.1',0),H); port_holder['port']=srv.server_address[1]
    threading.Thread(target=srv.serve_forever,daemon=True).start(); return srv
PA,PB,PC={},{},{}
def u(h,path): return f"http://127.0.0.1:{h['port']}{path}"
class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servers=[
         make(PA,'User-agent: *\nDisallow: /private\n',{
            '/ok':(200,'aims and scope of a journal'),
            '/to-b-ok':(302,lambda h:u(PB,'/fine')),
            '/to-b-private':(302,lambda h:u(PB,'/private/page')),
            '/to-c':(301,lambda h:u(PC,'/anything')),
            '/chain-ok-1':(307,'/chain-ok-2'),'/chain-ok-2':(308,lambda h:u(PB,'/fine')),
            '/chain-bad-1':(302,'/chain-bad-2'),'/chain-bad-2':(302,lambda h:u(PB,'/fine-then-private')),
            '/chain-allowed-allowed-disallowed':(302,lambda h:u(PB,'/hop')),
            '/same-host-private':(302,'/private/secret'),
            '/private/secret':(200,'SECRET'),
            '/loop':(302,'/loop'),
            '/h1':(302,'/h2'),'/h2':(302,'/h3'),'/h3':(302,'/h4'),'/h4':(302,'/h5'),'/h5':(302,'/h6'),'/h6':(302,'/h7'),'/h7':(200,'too far'),
            '/to-ftp':(302,'ftp://example.org/x'),
         }),
         make(PB,'User-agent: *\nDisallow: /private\n',{
            '/fine':(200,'fine page on B'),
            '/hop':(302,lambda h:u(PA,'/private/secret')),
            '/fine-then-private':(302,lambda h:u(PA,'/private/secret')),
            '/private/page':(200,'PRIVATE B'),
         }),
         make(PC,'User-agent: *\nDisallow: /\n',{'/anything':(200,'NO ENTRY')}),
        ]
    @classmethod
    def tearDownClass(cls):
        for s in cls.servers: s.shutdown()
    def setUp(self): REQ.clear(); A.robots.clear()
    def test_plain_page_is_read(self):
        x=A.get_ex(u(PA,'/ok')); self.assertEqual((x['status'],x['reason']),(200,'ok')); self.assertIn('aims and scope',x['html'])
    def test_allowed_redirect_to_allowed_host_is_followed(self):
        x=A.get_ex(u(PA,'/to-b-ok')); self.assertEqual(x['reason'],'ok'); self.assertIn('fine page on B',x['html']); self.assertEqual(len(x['chain']),2)
    def test_allowed_to_disallowed_path_on_another_host_is_never_requested(self):
        x=A.get_ex(u(PA,'/to-b-private')); self.assertIsNone(x['html']); self.assertEqual(x['reason'],'robots-disallowed (redirect destination)')
        self.assertNotIn('/private/page',REQ[PB['port']])
    def test_allowed_to_disallowed_host_is_never_requested(self):
        x=A.get_ex(u(PA,'/to-c')); self.assertIsNone(x['html']); self.assertEqual(x['reason'],'robots-disallowed (redirect destination)'); self.assertEqual(REQ[PC['port']],[])
    def test_redirect_chain_all_allowed(self):
        x=A.get_ex(u(PA,'/chain-ok-1')); self.assertEqual(x['reason'],'ok'); self.assertEqual(len(x['chain']),3)
    def test_chain_allowed_allowed_disallowed_stops_before_the_last_hop(self):
        x=A.get_ex(u(PA,'/chain-bad-1')); self.assertIsNone(x['html']); self.assertEqual(x['reason'],'robots-disallowed (redirect destination)')
        self.assertIn('/fine-then-private',REQ[PB['port']]); self.assertNotIn('/private/secret',REQ[PA['port']])
    def test_chain_across_two_hosts_ending_in_a_disallowed_path(self):
        x=A.get_ex(u(PA,'/chain-allowed-allowed-disallowed')); self.assertIsNone(x['html']); self.assertNotIn('/private/secret',REQ[PA['port']])
    def test_same_host_redirect_to_a_disallowed_path(self):
        x=A.get_ex(u(PA,'/same-host-private')); self.assertIsNone(x['html']); self.assertNotIn('/private/secret',REQ[PA['port']])
    def test_directly_disallowed_url_is_not_requested(self):
        x=A.get_ex(u(PA,'/private/secret')); self.assertEqual(x['reason'],'robots-disallowed'); self.assertEqual(REQ[PA['port']],[])
    def test_redirect_loop_and_long_chain_are_bounded(self):
        x=A.get_ex(u(PA,'/loop')); self.assertIsNone(x['html']); self.assertIn('redirects',x['reason']); self.assertLessEqual(len(REQ[PA['port']]),A.MAX_HOPS+1)
        REQ.clear(); y=A.get_ex(u(PA,'/h1')); self.assertIsNone(y['html']); self.assertIn('redirects',y['reason'])
    def test_redirect_to_a_non_http_scheme_is_not_followed(self):
        x=A.get_ex(u(PA,'/to-ftp')); self.assertIsNone(x['html']); self.assertEqual(x['reason'],'redirect to a non-http URL')
    def test_one_records_the_status_and_the_chain_without_content(self):
        k,o=A.one({'key':'k','homepage':u(PA,'/to-b-private')}); self.assertEqual(o['status'],'robots-disallowed (redirect destination)'); self.assertEqual(o['pages'],[]); self.assertEqual(o['hits'],{}); self.assertEqual(o['snippet'],'')
        self.assertEqual(len(o['chain']),2)
if __name__=='__main__': unittest.main(verbosity=1)
