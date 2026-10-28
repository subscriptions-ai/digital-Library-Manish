/* ==========================================================================
   Admin dashboard prototype — logic. Sample data throughout; totals follow the figures on the live admin dashboard
   (650 users, 327,980 content, 15 pending, 3,868 visits in 30 days, 647 users / 43 quotations / 19 contacts by state).
   ========================================================================== */
const IN = (n) => Number(n).toLocaleString('en-IN');
const rupee = (n) => '₹' + IN(n);
const kfmt = (n) => (n >= 100000 ? '₹' + (n / 100000).toFixed(1) + 'L' : n >= 1000 ? '₹' + (n / 1000).toFixed(1) + 'K' : '₹' + n);
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---- navigation: the live sidebar is one flat list of 30+ links; here it is grouped, searchable and collapsible ----
const NAV_GROUPS = [
  { id: 'content', label: 'Content', icon: 'book', items: [['books', 'Books', 'book'], ['periodicals', 'Periodicals', 'file'], ['magazines', 'Magazines', 'newspaper'], ['case-reports', 'Case Reports', 'file'], ['theses', 'Theses', 'graduation'], ['proceedings', 'Conference Proceedings', 'users'], ['videos', 'Educational Videos', 'video'], ['newsletters', 'Newsletters', 'mail'], ['media', 'Media', 'image'], ['extraction', 'AI Extractor', 'database'], ['review', 'Content Review', 'shield'], ['drafts', 'Drafts & Cleanup', 'trash'], ['journals', 'Journals', 'book'], ['publishers', 'Publishers', 'building'], ['blog', 'Blog', 'pen']] },
  { id: 'people', label: 'People & Sales', icon: 'users', items: [['users', 'Users', 'users'], ['create-user', 'Create User', 'userplus'], ['leads', 'Lead Master', 'users'], ['campaigns', 'Campaigns', 'megaphone'], ['sales-team', 'Sales Team', 'briefcase'], ['quotations', 'Quotations', 'file'], ['demos', 'Demo Requests', 'video'], ['agency', 'Agency Inquiries', 'briefcase'], ['contacts', 'Contact Inquiries', 'inbox'], ['feedbacks', 'User Feedbacks', 'heart']] },
  { id: 'billing', label: 'Billing', icon: 'card', items: [['subscriptions', 'Subscriptions', 'card'], ['sub-requests', 'Subscription Requests', 'inbox'], ['payments', 'Payments', 'rupee'], ['receipts', 'Receipts', 'receipt'], ['coupons', 'Coupons', 'tag'], ['pricing', 'Pricing Modules', 'tag']] },
  { id: 'system', label: 'System', icon: 'server', items: [['traffic', 'Traffic Analytics', 'activity'], ['ingestion', 'Data Ingestion', 'refresh'], ['validator', 'System Validator', 'shield'], ['emails', 'Emails', 'mail'], ['smtp', 'Email & SMTP', 'globe'], ['verifications', 'Email Verifications', 'check'], ['ai', 'AI Assistant', 'bot'], ['removal', 'Content Removal', 'flag']] },
];
const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items.map(([id, label, icon]) => ({ id, label, icon, group: g.id })));
const BADGE_OF = { 'sub-requests': 'subs', contacts: 'contact', demos: 'demo', removal: 'takedown' };

// ---- sample data ----
const PENDING0 = [
  ['subs', 'Subscription request', 'Riverbend College', '5 departments · annual', '2 hours ago'], ['subs', 'Subscription request', 'Northfield University', '3 departments · annual', '5 hours ago'],
  ['subs', 'Subscription request', 'Lakeshore Institute of Technology', '8 departments · annual', 'Yesterday'], ['subs', 'Subscription request', 'Maple Grove School of Nursing', '1 department · annual', 'Yesterday'],
  ['subs', 'Subscription request', 'Summit Polytechnic', '4 departments · annual', '2 days ago'], ['subs', 'Subscription request', 'Harborview Law College', '2 departments · annual', '3 days ago'],
  ['contact', 'Contact inquiry', 'Cedar Valley University', 'Asked about bulk student accounts', '1 hour ago'], ['contact', 'Contact inquiry', 'Brightwater Medical College', 'Needs an invoice copy', '4 hours ago'],
  ['contact', 'Contact inquiry', 'Oakridge Management Institute', 'Login issue for a faculty member', 'Yesterday'], ['contact', 'Contact inquiry', 'Pinecrest Pharmacy College', 'Wants to add departments', '2 days ago'],
  ['contact', 'Contact inquiry', 'Independent researcher', 'Question about Solo pricing', '3 days ago'], ['demo', 'Demo request', 'Greenfield Agricultural University', 'Preferred: this week', '3 hours ago'],
  ['demo', 'Demo request', 'Stonebridge School of Architecture', 'Preferred: next week', 'Yesterday'], ['demo', 'Demo request', 'Westgate Business School', 'Preferred: any day', '2 days ago'],
  ['takedown', 'Content removal request', 'Rights holder (sample)', 'One journal article, reason: copyright', '4 hours ago'],
].map(([kind, title, org, detail, age], i) => ({ id: 'p' + (i + 1), kind, title, org, detail, age }));
const KIND_LABEL = { subs: 'Subscriptions', contact: 'Contacts', demo: 'Demos', takedown: 'Removals' };
const KIND_ICON = { subs: 'card', contact: 'inbox', demo: 'video', takedown: 'flag' };

const TYPES_C = [['Periodicals', 196402], ['Books', 61230], ['Theses', 21540], ['Conference Proceedings', 18944], ['Magazines', 11200], ['Case Reports', 9816], ['Educational Videos', 5218], ['Newsletters', 3630]];
const DOMAINS = [['Computer / IT', 31880], ['Agriculture', 29366], ['Architecture', 28177], ['Medical Sciences', 27640], ['Life Sciences', 19760], ['Applied Sciences', 17514], ['Education and Social Sciences', 16340], ['Science', 15600]];
const TOTAL_CONTENT = 327980, LIVE = 229435, DRAFT = 98545;
const PAGES_TOP = [['/home', 1563], ['/signup', 1351], ['/login', 1270], ['/admin', 521], ['/institution', 356], ['/admin/users', 313], ['/dashboard', 287], ['/institution/explore', 244], ['/for-institutions', 224], ['/digital-library', 184]];
const REV = [0, 0, 0, 0, 0, 0, 800, 0, 1200, 2400, 1800, 3200, 2400];   // 13 months, sums to 11,800
const USERS_M = [10, 14, 18, 22, 26, 30, 36, 42, 52, 62, 132, 167, 39];   // sums to 650; last two give the -76.7% month-on-month
// tile-grid map of India: [code, name, col, row, users, quotations, contacts]
const STATES = [
  ['JK', 'Jammu & Kashmir', 2, 0, 3, 0, 0], ['LA', 'Ladakh', 3, 0, 0, 0, 0], ['PB', 'Punjab', 1, 1, 16, 1, 0], ['HP', 'Himachal Pradesh', 2, 1, 4, 0, 0], ['UK', 'Uttarakhand', 3, 1, 9, 0, 0], ['SK', 'Sikkim', 6, 1, 1, 0, 0], ['AR', 'Arunachal Pradesh', 8, 1, 1, 0, 0],
  ['HR', 'Haryana', 1, 2, 29, 1, 1], ['DL', 'Delhi', 2, 2, 49, 7, 4], ['UP', 'Uttar Pradesh', 3, 2, 92, 6, 3], ['BR', 'Bihar', 4, 2, 19, 0, 0], ['AS', 'Assam', 7, 2, 5, 0, 0], ['NL', 'Nagaland', 8, 2, 1, 0, 0],
  ['RJ', 'Rajasthan', 1, 3, 36, 2, 1], ['MP', 'Madhya Pradesh', 2, 3, 24, 1, 0], ['CG', 'Chhattisgarh', 3, 3, 6, 0, 0], ['JH', 'Jharkhand', 4, 3, 7, 0, 0], ['WB', 'West Bengal', 5, 3, 33, 2, 1], ['ML', 'Meghalaya', 7, 3, 0, 0, 0], ['MN', 'Manipur', 8, 3, 0, 0, 0],
  ['GJ', 'Gujarat', 0, 4, 41, 3, 1], ['MH', 'Maharashtra', 2, 4, 82, 8, 3], ['TG', 'Telangana', 3, 4, 31, 2, 0], ['OD', 'Odisha', 4, 4, 13, 0, 0], ['TR', 'Tripura', 7, 4, 1, 0, 0], ['MZ', 'Mizoram', 8, 4, 0, 0, 0],
  ['GA', 'Goa', 1, 5, 0, 0, 0], ['KA', 'Karnataka', 2, 5, 52, 5, 2], ['AP', 'Andhra Pradesh', 3, 5, 12, 0, 0], ['KL', 'Kerala', 2, 6, 22, 1, 1], ['TN', 'Tamil Nadu', 3, 6, 58, 4, 2],
].map(([code, name, c, r, users, quotes, contacts]) => ({ code, name, c, r, users, quotes, contacts }));
const QUOTES = [['Riverbend College', 'Yearly · Applied Mechanics', 62950, 'Sent', '24 Oct'], ['Northfield University', 'Yearly · 3 departments', 26970, 'Accepted', '23 Oct'], ['Lakeshore Institute of Technology', 'Yearly · 8 departments', 63920, 'Draft', '22 Oct'], ['Maple Grove School of Nursing', 'Yearly · Nursing', 9990, 'Sent', '21 Oct'], ['Summit Polytechnic', 'Yearly · 4 departments', 33960, 'Sent', '19 Oct'], ['Harborview Law College', 'Yearly · Law', 19000, 'Expired', '12 Oct']];
const PAYMENTS = [['Northfield University', 'Razorpay', 31824, 'Success', '24 Oct'], ['Independent researcher', 'Razorpay', 4990, 'Success', '22 Oct'], ['Cedar Valley University', 'Bank transfer', 47190, 'Pending', '20 Oct'], ['Brightwater Medical College', 'Razorpay', 9990, 'Failed', '18 Oct'], ['Oakridge Management Institute', 'Bank transfer', 17980, 'Success', '15 Oct']];
const NEWUSERS = [['Asha Verma', 'Institution', 'Uttar Pradesh', 'Today'], ['Rahul Menon', 'Solo Learner', 'Kerala', 'Today'], ['Kavya Reddy', 'Solo Learner', 'Telangana', 'Yesterday'], ['Imran Sheikh', 'Corporate', 'Maharashtra', 'Yesterday'], ['Neha Joshi', 'Institution', 'Rajasthan', '2 days ago'], ['Dev Patel', 'Solo Learner', 'Gujarat', '3 days ago']];
const NOTIFS = [{ id: 'n1', title: 'New subscription request from Riverbend College', when: '2 hours ago' }, { id: 'n2', title: 'Payment failed for Brightwater Medical College', when: 'Yesterday' }, { id: 'n3', title: 'Content removal request needs review', when: '4 hours ago' }];

// 30 daily visits that add up to the live figure (3,868), with a few spikes
const DAILY = (() => {
  const raw = Array.from({ length: 30 }, (_, i) => 55 + 55 * rnd(i + 3) + ([5, 6].includes(i) ? 190 : 0) + (i === 9 ? 470 : 0) + (i === 10 ? 80 : 0) + (i === 13 ? 500 : 0) + (i === 15 ? 240 : 0) + (i === 21 ? 100 : 0) + (i === 23 ? 90 : 0) + (i > 27 ? -45 : 0));
  const f = 3868 / raw.reduce((a, b) => a + b, 0), v = raw.map((x) => Math.max(8, Math.round(x * f)));
  v[v.length - 1] += 3868 - v.reduce((a, b) => a + b, 0); return v;
})();
const WEEKLY = (() => { const out = []; for (let w = 0; w < 13; w++) out.push(w < 9 ? Math.round(180 + 160 * rnd(w + 40)) : DAILY.slice((w - 9) * 7, (w - 9) * 7 + 7).reduce((a, b) => a + b, 0)); return out; })();
const C8 = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

function smooth(p) {
  let d = 'M' + p[0][0].toFixed(1) + ',' + p[0][1].toFixed(1);
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ' C' + (b[0] + (c[0] - a[0]) / 6).toFixed(1) + ',' + (b[1] + (c[1] - a[1]) / 6).toFixed(1) + ' ' + (c[0] - (e[0] - b[0]) / 6).toFixed(1) + ',' + (c[1] - (e[1] - b[1]) / 6).toFixed(1) + ' ' + c[0].toFixed(1) + ',' + c[1].toFixed(1);
  }
  return d;
}
/** Values for one area chart (the template reads them as {{<prefix>Name}}). */
function area(p, vals, names, labels, hover, setHover, unit, color, key) {
  const n = vals.length, mx0 = Math.max(...vals), stepY = mx0 > 400 ? 200 : mx0 > 120 ? 50 : mx0 > 40 ? 20 : 10, max = Math.max(stepY * 2, Math.ceil(mx0 / stepY) * stepY), W = 600, H = 200, pad = 14;
  const pts = vals.map((x, i) => [((i + 0.5) / n) * W, H - pad - (x / max) * (H - pad * 2)]), line = smooth(pts), o = {};
  o[p + 'Key'] = key; o[p + 'Color'] = color; o[p + 'LineD'] = line; o[p + 'AreaD'] = line + ' L' + pts[n - 1][0].toFixed(1) + ',' + H + ' L' + pts[0][0].toFixed(1) + ',' + H + ' Z';
  o[p + 'Grid'] = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ style: 'top:' + ((H - pad - f * (H - pad * 2)) / H) * 100 + '%', label: IN(Math.round(max * f)) }));
  o[p + 'Hits'] = vals.map((x, i) => ({ style: 'left:' + (i / n) * 100 + '%;width:' + 100 / n + '%', enter: () => setHover(i), key: key + i, label: names[i] + ': ' + IN(x) + ' ' + unit }));
  o[p + 'XL'] = labels.map((l) => ({ l }));
  o[p + 'HasHover'] = hover != null && hover < n;
  if (o[p + 'HasHover']) { const hx = ((hover + 0.5) / n) * 100, hy = (pts[hover][1] / H) * 100; o[p + 'Cross'] = 'left:' + hx + '%'; o[p + 'Pt'] = 'left:' + hx + '%;top:' + hy + '%;border-color:' + color; o[p + 'TipPos'] = 'left:' + Math.min(Math.max(hx, 16), 84) + '%;top:' + hy + '%'; o[p + 'TipLabel'] = names[hover] + ' · ' + IN(vals[hover]) + ' ' + unit; }
  o[p + 'Leave'] = () => setHover(null);
  return o;
}

class Component extends DCLogic {
  constructor(props) { super(props); this.state = this.initial(); }
  initial() {
    return {
      page: 'dashboard', dark: false, collapsed: false, navOpen: false, vw: window.innerWidth, navq: '', open: { content: true, people: false, billing: false, system: false },
      p: 0, loading: true, epoch: 0, tick: 0, refreshing: false, refreshedAt: Date.now(),
      range: '30d', hoverT: null, hoverU: null, hoverR: null, donutHover: -1, domHover: -1,
      mapMetric: 'users', mapSel: 'UP', actTab: 'quotations',
      sys: { email: true, stealth: false }, sysOpen: false, confirm: null,
      pending: PENDING0.map((x) => ({ ...x })), drawer: false, pTab: 'all',
      palette: false, pq: '', pidx: 0, notif: false, notifRead: false, toast: '', toastLabel: '', toastAct: null, tip: null,
    };
  }
  componentDidMount() {
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.afterLoad(800);
    this.timer = setInterval(() => this.setState((s) => ({ tick: s.tick + 1 })), 30000);
    this.onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); this.openLayer({ palette: true, pq: '', pidx: 0, notif: false, sysOpen: false }); }
      else if (e.key === 'Escape') this.closeLayers();
    };
    this.onResize = () => { cancelAnimationFrame(this.rz); this.rz = requestAnimationFrame(() => { const vw = window.innerWidth; if (vw !== this.state.vw) this.setState({ vw, navOpen: vw >= 1100 ? false : this.state.navOpen }); }); };
    window.addEventListener('keydown', this.onKey); window.addEventListener('resize', this.onResize);
  }
  componentWillUnmount() { clearInterval(this.timer); cancelAnimationFrame(this.raf); cancelAnimationFrame(this.rz); clearTimeout(this.lt); clearTimeout(this.tt); window.removeEventListener('keydown', this.onKey); window.removeEventListener('resize', this.onResize); }

  afterLoad(ms) { clearTimeout(this.lt); this.setState({ loading: true, p: 0 }); this.lt = setTimeout(() => { this.setState({ loading: false }); this.startCount(); }, this.reduce ? 0 : ms); }
  startCount() {
    cancelAnimationFrame(this.raf);
    if (this.reduce) { this.setState({ p: 1 }); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1100); this.setState({ p: k }); if (k < 1) this.raf = requestAnimationFrame(step); };
    this.setState({ p: 0 }); this.raf = requestAnimationFrame(step);
  }
  go(page) { this.setState({ page, drawer: false, palette: false, notif: false, sysOpen: false, navOpen: false, tip: null }); this.afterLoad(380); window.scrollTo(0, 0); setTimeout(() => { const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }, 0); }
  openLayer(extra) { this.opener = document.activeElement; this.setState(extra); }
  closeLayers() {
    const s = this.state;
    if (!(s.palette || s.drawer || s.confirm || s.navOpen || s.notif || s.sysOpen)) return;
    const had = s.palette || s.drawer || s.confirm || s.navOpen;
    this.setState({ palette: false, drawer: false, confirm: null, navOpen: false, notif: false, sysOpen: false });
    const o = this.opener; this.opener = null;
    if (had && o) setTimeout(() => { if (document.body.contains(o)) o.focus(); }, 0);
  }
  openNavDrawer() { this.openLayer({ navOpen: true, tip: null }); setTimeout(() => { const b = document.querySelector('aside .side-head button'); if (b) b.focus(); }, 60); }
  trap(ev) {
    if (ev.key === 'Escape') { ev.stopPropagation(); this.closeLayers(); return; }
    if (ev.key !== 'Tab') return;
    const list = [...ev.currentTarget.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); } else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
  say(msg, label, act) { this.setState({ toast: msg, toastLabel: label || '', toastAct: act || null }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: '', toastAct: null }), act ? 5200 : 2600); }
  showTip(text, ev) { const r = ev.currentTarget.getBoundingClientRect(); this.setState({ tip: { text, y: Math.round(r.top + r.height / 2) } }); }
  refresh() { if (this.state.refreshing) return; this.setState({ refreshing: true }); setTimeout(() => { this.setState({ refreshing: false, refreshedAt: Date.now() }); this.startCount(); this.say('Dashboard refreshed'); }, this.reduce ? 0 : 900); }
  handle(id) {
    const s = this.state, i = s.pending.findIndex((x) => x.id === id), item = s.pending[i];
    this.setState({ pending: s.pending.filter((x) => x.id !== id) });
    this.say('Marked as handled: ' + item.org, 'Undo', () => { const l = [...this.state.pending]; l.splice(i, 0, item); this.setState({ pending: l, toast: '' }); });
  }
  setSys(key, val) { this.setState((s) => ({ sys: { ...s.sys, [key]: val }, confirm: null })); this.say(key === 'email' ? 'Email verification ' + (val ? 'enabled' : 'disabled (OTP bypassed)') : 'Stealth mode ' + (val ? 'ON: commercial pages hidden' : 'OFF')); }
  askSys(key) {
    const v = !this.state.sys[key];
    if ((key === 'stealth' && v) || (key === 'email' && !v)) this.openLayer({ confirm: { key, v }, sysOpen: false }); else this.setSys(key, v);
  }

  renderVals() {
    const s = this.state, e = 1 - Math.pow(1 - s.p, 3), page = s.page, ready = !s.loading;
    const mode = s.vw >= 1100 ? 'desktop' : s.vw >= 768 ? 'rail' : 'mobile';
    const narrow = (mode === 'desktop' && s.collapsed) || (mode === 'rail' && !s.navOpen);
    const pend = s.pending, cnt = (k) => pend.filter((x) => x.kind === k).length;
    const navq = s.navq.trim().toLowerCase();
    const badgeFor = (id) => (BADGE_OF[id] ? cnt(BADGE_OF[id]) : 0);
    const title = page === 'dashboard' ? 'Dashboard' : (ALL_NAV.find((n) => n.id === page) || {}).label || 'Page';
    const item = (id, label, icon) => ({ id, label, icon, cls: 'nav' + (page === id ? ' active' : ''), cur: page === id ? 'page' : undefined, go: () => this.go(id), badge: badgeFor(id), hasBadge: badgeFor(id) > 0,
      enter: (ev) => { if (narrow) this.showTip(label, ev); }, leave: () => this.setState({ tip: null }) });
    const v = {
      themeCls: s.dark ? 'dark' : '', isDark: s.dark, mw: mode === 'desktop' ? (s.collapsed ? 72 : 256) : mode === 'rail' ? 72 : 0,
      sideCls: 'side admin ' + mode + (narrow ? ' narrow' : '') + (s.navOpen ? ' open' : ''), sideHidden: mode === 'mobile' && !s.navOpen, showSideScrim: s.navOpen && mode !== 'desktop',
      sideToggleLabel: mode === 'desktop' ? (s.collapsed ? 'Expand the sidebar' : 'Collapse the sidebar') : (s.navOpen ? 'Close the menu' : 'Open the menu'), sideToggleIcon: mode === 'desktop' ? (s.collapsed ? 'chevr' : 'chevl') : (s.navOpen ? 'x' : 'menu'),
      toggleSide: () => { if (mode === 'desktop') this.setState({ collapsed: !s.collapsed, tip: null }); else if (s.navOpen) this.closeLayers(); else this.openNavDrawer(); },
      sideKey: (ev) => { if (mode !== 'desktop' && s.navOpen) this.trap(ev); }, openNav: () => this.openNavDrawer(), closeNav: () => this.closeLayers(),
      tip: !!s.tip && narrow, tipStyle: s.tip ? 'top:' + s.tip.y + 'px' : '', tipText: s.tip ? s.tip.text : '',
      pageTitle: title, page, isLoading: s.loading, isDash: page === 'dashboard' && ready, isOther: page !== 'dashboard' && ready, epochKey: 'e' + s.epoch + page,
      dashItem: item('dashboard', 'Dashboard', 'grid'), navq: s.navq, setNavq: (ev) => this.setState({ navq: ev.target.value }), showNavSearch: !narrow, clearNavq: () => this.setState({ navq: '' }), hasNavq: !!navq,
      myAccount: item('account', 'My Account', 'key'), signOut: () => this.say('Prototype: sign out is not connected'),
      signEnter: (ev) => { if (narrow) this.showTip('Sign Out', ev); }, signLeave: () => this.setState({ tip: null }),
      toggleTheme: () => this.setState({ dark: !s.dark }), themeLabel: s.dark ? 'Switch to light mode' : 'Switch to dark mode', themeIcon: s.dark ? 'sun' : 'moon',
      toast: s.toast, toastLabel: s.toastLabel, hasToastAct: !!s.toastAct, toastAct: () => { const f = s.toastAct; if (f) f(); },
      palette: s.palette, openPalette: () => this.openLayer({ palette: true, pq: '', pidx: 0, notif: false, sysOpen: false }), closePalette: () => this.closeLayers(),
      notif: s.notif, unread: !s.notifRead, toggleNotif: () => this.setState({ notif: !s.notif, sysOpen: false, notifRead: true }), markRead: () => this.setState({ notifRead: true, notif: false }),
      notifs: NOTIFS, popsOpen: s.notif || s.sysOpen, closePops: () => this.setState({ notif: false, sysOpen: false }),
      sysOpen: s.sysOpen, toggleSys: () => this.setState({ sysOpen: !s.sysOpen, notif: false }),
      sysEmail: s.sys.email, sysStealth: s.sys.stealth, emailCls: 'switch' + (s.sys.email ? ' on' : ''), stealthCls: 'switch amber' + (s.sys.stealth ? ' on' : ''),
      emailText: s.sys.email ? 'Active' : 'Bypassed (off)', stealthText: s.sys.stealth ? 'ON: commercial pages hidden' : 'Off', toggleEmail: () => this.askSys('email'), toggleStealth: () => this.askSys('stealth'),
      sysDot: s.sys.stealth || !s.sys.email, sysBtnLabel: s.sys.stealth ? 'Stealth ON' : 'Switches',
      hasConfirm: !!s.confirm, confirmTitle: s.confirm ? (s.confirm.key === 'stealth' ? 'Turn Stealth Mode ON?' : 'Turn email verification OFF?') : '',
      confirmBody: s.confirm ? (s.confirm.key === 'stealth' ? 'This hides search, quotation, plans, FAQ, agency and demo pages from every visitor until you turn it off again.' : 'New sign-ups will skip the one-time code. Only do this while testing.') : '',
      confirmWord: s.confirm ? (s.confirm.v ? 'on' : 'off') : '', confirmYes: () => this.setSys(s.confirm.key, s.confirm.v), confirmNo: () => this.closeLayers(), trap: (ev) => this.trap(ev),
      pendingTotal: pend.length, openPending: () => this.openLayer({ drawer: true, pTab: 'all' }), closeDrawer: () => this.closeLayers(), hasDrawer: s.drawer,
      refresh: () => this.refresh(), refreshing: s.refreshing, refreshCls: 'iconbtn' + (s.refreshing ? ' spinning' : ''), updated: 'Updated ' + (Math.max(0, Math.round((Date.now() - s.refreshedAt) / 60000)) <= 0 ? 'just now' : Math.round((Date.now() - s.refreshedAt) / 60000) + ' min ago'),
      ctlReplay: () => { this.setState({ epoch: s.epoch + 1 }); this.afterLoad(600); },
      navGroups: NAV_GROUPS.map((g) => {
        const matches = g.items.filter(([id, label]) => !navq || label.toLowerCase().includes(navq));
        const open = navq ? matches.length > 0 : !!s.open[g.id] || g.items.some(([id]) => id === page);
        const gb = g.items.reduce((a, [id]) => a + badgeFor(id), 0);
        return { id: g.id, label: g.label, icon: g.icon, show: !navq || matches.length > 0, open, chev: open ? 'chevd' : 'chevr', active: g.items.some(([id]) => id === page), badge: gb, hasBadge: gb > 0 && (!open || narrow),
          cls: 'nav grp' + (g.items.some(([id]) => id === page) ? ' has-active' : ''),
          toggle: () => { if (narrow) { if (mode === 'desktop') this.setState({ collapsed: false, open: { ...s.open, [g.id]: true } }); else this.openNavDrawer(); } else this.setState({ open: { ...s.open, [g.id]: !open } }); },
          enter: (ev) => { if (narrow) this.showTip(g.label, ev); }, leave: () => this.setState({ tip: null }),
          items: matches.map(([id, label, icon]) => ({ ...item(id, label, icon), cls: 'nav sub' + (page === id ? ' active' : '') })) };
      }).filter((g) => g.show),
    };
    // ---- palette ----
    if (s.palette) {
      const q = s.pq.trim().toLowerCase(), items = [
        { kind: 'Page', label: 'Dashboard', sub: 'Open the analytics dashboard', run: () => this.go('dashboard') },
        ...ALL_NAV.map((n) => ({ kind: 'Page', label: n.label, sub: 'Open ' + n.label.toLowerCase(), run: () => this.go(n.id) })),
        { kind: 'Action', label: 'Review pending requests', sub: pend.length + ' waiting', run: () => { this.closeLayers(); this.go('dashboard'); setTimeout(() => this.setState({ drawer: true, pTab: 'all' }), 600); } },
        { kind: 'Action', label: s.dark ? 'Switch to light mode' : 'Switch to dark mode', sub: 'Change the theme', run: () => { this.closeLayers(); this.setState({ dark: !s.dark }); } },
        { kind: 'Action', label: 'Refresh dashboard', sub: 'Reload the figures', run: () => { this.closeLayers(); this.go('dashboard'); setTimeout(() => this.refresh(), 700); } },
      ];
      const found = (q ? items.filter((i) => (i.label + ' ' + i.sub).toLowerCase().includes(q)) : items.slice(0, 8)).slice(0, 9), idx = Math.min(s.pidx, Math.max(found.length - 1, 0));
      v.pq = s.pq; v.setPq = (ev) => this.setState({ pq: ev.target.value, pidx: 0 });
      v.palItems = found.map((it, i) => ({ ...it, key: it.kind + it.label, id: 'pal-' + i, sel: i === idx, cls: 'pal-item' + (i === idx ? ' on' : ''), pick: () => it.run(), hover: () => this.setState({ pidx: i }) }));
      v.palEmpty = found.length === 0; v.palActive = found.length ? 'pal-' + idx : undefined;
      v.palKey = (ev) => { if (ev.key === 'ArrowDown') { ev.preventDefault(); this.setState({ pidx: Math.min(idx + 1, found.length - 1) }); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.setState({ pidx: Math.max(idx - 1, 0) }); } else if (ev.key === 'Enter' && found[idx]) { ev.preventDefault(); found[idx].run(); } else this.trap(ev); };
    }
    // ---- pending drawer ----
    if (s.drawer) {
      const kinds = ['all', 'subs', 'contact', 'demo', 'takedown'], list = s.pTab === 'all' ? pend : pend.filter((x) => x.kind === s.pTab);
      v.pTabs = kinds.map((k) => ({ k, l: k === 'all' ? 'All' : KIND_LABEL[k], n: k === 'all' ? pend.length : cnt(k), cls: s.pTab === k ? 'on' : '', on: s.pTab === k, pick: () => this.setState({ pTab: k }) }));
      v.pList = list.map((x) => ({ ...x, icon: KIND_ICON[x.kind], review: () => this.say('Prototype: ' + x.title.toLowerCase() + ' would open'), done: () => this.handle(x.id) }));
      v.pEmpty = list.length === 0;
    }
    if (!ready || page !== 'dashboard') return v;

    // ---- dashboard ----
    const upd = (k) => (i) => this.setState({ [k]: i });
    const spark = (seed) => { const pts = Array.from({ length: 12 }, (_, i) => 14 + 10 * Math.sin(i / 1.7 + seed) + 6 * rnd(i + seed * 7) - i * 0.5), mn = Math.min(...pts), mx = Math.max(...pts); return smooth(pts.map((y, i) => [(i / 11) * 120, 30 - ((y - mn) / (mx - mn || 1)) * 24 - 3])); };
    v.updatedText = v.updated;
    v.kpis = [
      { k: 'rev', label: 'Total Revenue', icon: 'rupee', cls: 'kpi k-blue', big: kfmt(Math.round(11800 * e)), sub: '₹2.4K this month', delta: '−25% vs ' + MON[(new Date().getMonth() + 11) % 12], dTone: 'down', dIcon: 'down', spark: spark(1) },
      { k: 'subs', label: 'Active Subscriptions', icon: 'card', cls: 'kpi k-indigo', big: String(Math.round(5 * e)), sub: '2 renew within 30 days', delta: '+1 this month', dTone: 'up', dIcon: 'up', spark: spark(2) },
      { k: 'users', label: 'Total Users', icon: 'users', cls: 'kpi k-green', big: IN(Math.round(650 * e)), sub: '39 new this month', delta: '76.7% vs ' + MON[(new Date().getMonth() + 11) % 12], dTone: 'down', dIcon: 'down', spark: spark(3) },
      { k: 'content', label: 'Total Content', icon: 'layers', cls: 'kpi k-amber', big: IN(Math.round(TOTAL_CONTENT * e)), sub: IN(LIVE) + ' live · ' + IN(DRAFT) + ' draft', split: true, live: 'width:' + (LIVE / TOTAL_CONTENT) * 100 * e + '%', spark: spark(4) },
      { k: 'pending', label: 'Pending Requests', icon: 'clock', cls: 'kpi k-rose', big: String(Math.round(pend.length * e)), sub: cnt('subs') + ' subscriptions · ' + cnt('contact') + ' contacts · ' + cnt('demo') + ' demos', action: true, spark: spark(5) },
    ].map((x, i) => ({ ...x, delay: 'animation-delay:' + i * 45 + 'ms', open: x.k === 'pending' ? () => this.openLayer({ drawer: true, pTab: 'all' }) : () => this.say('Prototype: ' + x.label + ' details would open') }));
    v.attention = pend.length > 0; v.attnText = pend.length + (pend.length === 1 ? ' request needs' : ' requests need') + ' a decision'; v.attnSub = cnt('subs') + ' subscriptions · ' + cnt('contact') + ' contacts · ' + cnt('demo') + ' demos · ' + cnt('takedown') + ' removal';
    // traffic
    const dailyDates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86400000));
    const tv = s.range === '7d' ? DAILY.slice(-7) : s.range === '30d' ? DAILY : WEEKLY;
    const tn = s.range === '90d' ? WEEKLY.map((_, i) => 'Week of ' + new Date(Date.now() - (12 - i) * 7 * 86400000).getDate() + ' ' + MON[new Date(Date.now() - (12 - i) * 7 * 86400000).getMonth()]) : (s.range === '7d' ? dailyDates.slice(-7) : dailyDates).map((d) => DAY[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()]);
    const tl = s.range === '90d' ? tn.map((x, i) => (i % 2 === 0 ? x.replace('Week of ', '') : '')) : (s.range === '7d' ? dailyDates.slice(-7) : dailyDates).map((d, i) => (s.range === '7d' || i % 4 === 0 ? d.getDate() + ' ' + MON[d.getMonth()] : ''));
    Object.assign(v, area('t', tv, tn, tl, s.hoverT, upd('hoverT'), 'visits', 'var(--blue)', 'T' + s.range + s.epoch));
    v.tTotal = IN(tv.reduce((a, b) => a + b, 0)); v.tTotalLabel = s.range === '7d' ? 'visits in the last 7 days' : s.range === '30d' ? 'unique visitor sessions in the last 30 days' : 'visits in the last 13 weeks';
    v.tPeak = IN(Math.max(...tv)) + ' peak'; v.ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']].map(([k, l]) => ({ l, cls: s.range === k ? 'on' : '', on: s.range === k, pick: () => this.setState({ range: k, hoverT: null }) }));
    const maxP = PAGES_TOP[0][1]; v.topPages = PAGES_TOP.map(([url, n], i) => ({ url, n: IN(n), no: i + 1, style: 'width:' + (n / maxP) * 100 * e + '%', delay: 'animation-delay:' + i * 40 + 'ms', open: () => this.say('Prototype: ' + url + ' analytics would open') }));
    // content by domain + types
    const maxD = DOMAINS[0][1]; v.domains = DOMAINS.map(([name, n], i) => ({ name, n: IN(n), pct: Math.round((n / TOTAL_CONTENT) * 1000) / 10 + '%', style: 'width:' + (n / maxD) * 100 + '%;animation-delay:' + i * 50 + 'ms', cls: 'dom' + (s.domHover === i ? ' hot' : ''), enter: () => this.setState({ domHover: i }), leave: () => this.setState({ domHover: -1 }) }));
    v.domOther = IN(TOTAL_CONTENT - DOMAINS.reduce((a, b) => a + b[1], 0));
    const C = 314.16; let cum = 0;
    v.types = TYPES_C.map(([name, n], i) => { const len = Math.max(0, (n / TOTAL_CONTENT) * C - 2), off = -cum; cum += (n / TOTAL_CONTENT) * C; return { name, n: IN(n), pct: (n / TOTAL_CONTENT * 100).toFixed(1) + '%', color: C8[i], dot: 'background:' + C8[i], da: (len * e).toFixed(1) + ' ' + C, off: off.toFixed(1), cls: 'donut' + (s.donutHover >= 0 && s.donutHover !== i ? ' dim' : ''), enter: () => this.setState({ donutHover: i }), leave: () => this.setState({ donutHover: -1 }) }; });
    v.typeBig = s.donutHover >= 0 ? IN(TYPES_C[s.donutHover][1]) : IN(Math.round(TOTAL_CONTENT * e)); v.typeSmall = s.donutHover >= 0 ? TYPES_C[s.donutHover][0] : 'total items';
    // revenue (bars) + user acquisition (area)
    const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (12 - i)); return d; });
    const maxR = Math.max(...REV);
    v.revBars = REV.map((x, i) => ({ h: 'height:' + Math.max(x ? 4 : 1.5, (x / maxR) * 100 * e) + '%', tip: MON[months[i].getMonth()] + ' ' + months[i].getFullYear() + ' · ' + rupee(x), label: MON[months[i].getMonth()], on: s.hoverR === i, cls: 'rbar' + (x === 0 ? ' zero' : '') + (s.hoverR === i ? ' hot' : ''), enter: () => this.setState({ hoverR: i }), key: 'r' + i + s.epoch, value: x ? kfmt(x) : '' }));
    v.revHover = s.hoverR != null ? v.revBars[s.hoverR].tip : 'Hover or focus a month for the amount'; v.revLeave = () => this.setState({ hoverR: null }); v.revTotal = rupee(REV.reduce((a, b) => a + b, 0));
    Object.assign(v, area('u', USERS_M, months.map((d) => MON[d.getMonth()] + ' ' + d.getFullYear()), months.map((d, i) => (i % 2 === 0 ? MON[d.getMonth()] : '')), s.hoverU, upd('hoverU'), 'new users', 'var(--c2)', 'U' + s.epoch));
    // India
    const metric = s.mapMetric, mkey = { users: 'users', quotes: 'quotes', contacts: 'contacts' }[metric], mx = Math.max(...STATES.map((x) => x[mkey]));
    v.mapStats = [['users', IN(Math.round(647 * e)), 'Total users', 'users'], ['subs', '5', 'Active subs', 'card'], ['quotes', IN(Math.round(43 * e)), 'Quotations', 'file'], ['contacts', IN(Math.round(19 * e)), 'Contacts', 'inbox']].map(([k, n, l, ic]) => ({ k, n, l, ic, on: metric === k, interactive: k !== 'subs', cls: 'mstat' + (metric === k ? ' on' : ''), pick: () => (k === 'subs' ? this.say('Active subscriptions are not tracked per state') : this.setState({ mapMetric: k })) }));
    v.tiles = STATES.map((x) => { const val = x[mkey], b = val ? Math.min(4, Math.floor((val / mx) * 5 - 0.0001)) : -1, pct = [14, 30, 48, 75, 92][Math.max(b, 0)]; return { key: x.code, code: x.code, style: 'grid-column:' + (x.c + 1) + ';grid-row:' + (x.r + 1) + ';' + (val ? 'background:color-mix(in srgb,var(--tile) ' + pct + '%,var(--surface-2));color:' + (b >= 3 ? '#fff' : 'var(--ink)') : 'background:var(--surface-2);color:var(--muted)') + ';animation-delay:' + (x.r * 40 + x.c * 20) + 'ms', cls: 'tile' + (s.mapSel === x.code ? ' sel' : ''), pressed: s.mapSel === x.code, label: x.name + ': ' + val + ' ' + metric, pick: () => this.setState({ mapSel: x.code }) }; });
    const sel = STATES.find((x) => x.code === s.mapSel) || STATES[9];
    v.sel = { name: sel.name, users: IN(sel.users), quotes: IN(sel.quotes), contacts: IN(sel.contacts), share: Math.round((sel.users / 647) * 1000) / 10 + '%' };
    const board = STATES.slice().sort((a, b) => b[mkey] - a[mkey] || b.users - a.users).filter((x) => x[mkey] > 0).slice(0, 6), bm = board[0] ? board[0][mkey] : 1;
    v.board = board.map((x, i) => ({ key: x.code + metric, no: i + 1, name: x.name, val: IN(x[mkey]), style: 'width:' + (x[mkey] / bm) * 100 + '%;animation-delay:' + i * 40 + 'ms', sub: x.users + ' users · ' + x.quotes + ' quotes · ' + x.contacts + ' contacts', pick: () => this.setState({ mapSel: x.code }) }));
    v.mapMetricLabel = { users: 'users', quotes: 'quotations', contacts: 'contacts' }[metric]; v.mapRevenue = '₹11.8K';
    v.legendLow = '0'; v.legendHigh = String(mx);
    // recent activity
    v.tabs = [['quotations', 'Recent Quotations', 'file'], ['payments', 'Payments', 'rupee'], ['users', 'New Users', 'users']].map(([k, l, ic]) => ({ k, l, ic, cls: s.actTab === k ? 'on' : '', on: s.actTab === k, pick: () => this.setState({ actTab: k }) }));
    const tone = (st) => ({ Sent: 'info', Accepted: 'ok', Draft: 'mute', Expired: 'warn', Success: 'ok', Pending: 'warn', Failed: 'bad' }[st] || 'mute');
    const mkRows = (rows) => rows.map((r, i) => ({ a: r[0], b: r[1], c: typeof r[2] === 'number' ? rupee(r[2]) : r[2], st: r[3], tone: 'tag ' + tone(r[3]), d: r[4], delay: 'animation-delay:' + i * 35 + 'ms', key: s.actTab + i }));
    v.actQ = s.actTab === 'quotations'; v.actP = s.actTab === 'payments'; v.actU = s.actTab === 'users';
    v.rowsQ = mkRows(QUOTES); v.rowsP = mkRows(PAYMENTS); v.rowsU = NEWUSERS.map((r, i) => ({ a: r[0], b: r[1], c: r[2], d: r[3], delay: 'animation-delay:' + i * 35 + 'ms', key: 'u' + i }));
    v.viewAll = () => this.say('Prototype: the full list would open');
    return v;
  }
}
