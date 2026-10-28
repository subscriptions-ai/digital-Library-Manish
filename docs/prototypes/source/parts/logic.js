const IN = (n) => Number(n).toLocaleString('en-IN');
const rupee = (n) => '₹' + IN(n);
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

const GROUPS = [
  ['Engineering & Technology', ['Applied Mechanics', 'Chemical Engineering', 'Civil / Construction Engineering', 'Computer / IT', 'Electrical Engineering', 'Electronics & Telecommunication Engineering', 'Energy', 'Material Science', 'Mechanical Engineering', 'Nano Technology']],
  ['Medical & Health Sciences', ['Ayurveda', 'Dental', 'Medical Sciences', 'Nursing', 'Pharmacy', 'Physiotherapy']],
  ['Life Sciences & Biotechnology', ['Bio Technology', 'Life Sciences']],
  ['Science & Applied Sciences', ['Applied Sciences', 'Chemistry', 'Science']],
  ['Business & Management', ['Commerce', 'Management']],
  ['Social Sciences, Education & Humanities', ['Arts', 'Education and Social Sciences', 'Law']],
  ['Agriculture & Allied Sciences', ['Agriculture']],
  ['Architecture & Built Environment', ['Architecture']],
  ['Multidisciplinary', ['Multidisciplinary']],
];
const HELD0 = ['Agriculture', 'Applied Mechanics', 'Applied Sciences', 'Architecture'];
// The first four are the figures on the real dashboard (they add up to 79,099); the rest are sample numbers so a bigger plan has something to show.
const TOTAL = { Agriculture: 29366, 'Applied Mechanics': 4042, 'Applied Sciences': 17514, Architecture: 28177, Arts: 9840, Ayurveda: 3120, 'Bio Technology': 11260, 'Chemical Engineering': 8890, Chemistry: 14230, 'Civil / Construction Engineering': 12470, Commerce: 7650, 'Computer / IT': 31880, Dental: 2950, 'Education and Social Sciences': 16340, 'Electrical Engineering': 10920, 'Electronics & Telecommunication Engineering': 9410, Energy: 6180, Law: 8330, 'Life Sciences': 19760, Management: 13540, 'Material Science': 7020, 'Mechanical Engineering': 11890, 'Medical Sciences': 27640, Multidisciplinary: 5210, 'Nano Technology': 3870, Nursing: 4460, Pharmacy: 9120, Physiotherapy: 2380, Science: 15600 };
const PAGES = [['overview', 'Dashboard overview'], ['users', 'User management'], ['analytics', 'Learning analytics'], ['library', 'Content library'], ['subs', 'Subscriptions']];
const TITLES = { overview: 'Dashboard', users: 'User management', library: 'Content library', analytics: 'Learning analytics', subs: 'Subscriptions' };

const MEMBERS = [
  { id: 'm1', name: 'Ananya Rao', email: 'ananya.rao@example.edu', type: 'Faculty', desig: 'Lecturer', status: 'Reading', sessions: 14, last: '2 hours ago', items: ['Journal of Design Thinking', 'Animals and Zoonoses'] },
  { id: 'm2', name: 'Rohan Mehta', email: 'rohan.mehta@example.edu', type: 'Researcher', desig: 'Associate Professor', status: 'Not started', sessions: 0, last: 'Never signed in', items: [] },
  { id: 'm3', name: 'Meera Iyer', email: 'meera.iyer@example.edu', type: 'Faculty', desig: 'Professor', status: 'Reading', sessions: 9, last: 'Yesterday', items: ['Agricultural Science and Technology'] },
  { id: 'm4', name: 'Karan Shah', email: 'karan.shah@example.edu', type: 'Student', desig: 'PhD Scholar', status: 'Reading', sessions: 6, last: '3 days ago', items: ['Journal of Design Thinking'] },
  { id: 'm5', name: 'Sana Qureshi', email: 'sana.qureshi@example.edu', type: 'Researcher', desig: 'Research Associate', status: 'Reading', sessions: 3, last: '5 days ago', items: ['Animals and Zoonoses'] },
  { id: 'm6', name: 'Vikram Nair', email: 'vikram.nair@example.edu', type: 'Student', desig: "Master's Student", status: 'Not started', sessions: 0, last: 'Never signed in', items: [] },
  { id: 'm7', name: 'Priya Das', email: 'priya.das@example.edu', type: 'Faculty', desig: 'Assistant Professor', status: 'Invited', sessions: 0, last: 'Invited today', items: [] },
  { id: 'm8', name: 'Dev Malhotra', email: 'dev.malhotra@example.edu', type: 'Student', desig: 'Undergraduate Student', status: 'Reading', sessions: 11, last: 'Today', items: ['Agricultural Science and Technology', 'Journal of Design Thinking'] },
];
const ACCT = { Faculty: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer'], Researcher: ['Research Scientist', 'Research Associate', 'Research Fellow', 'Scientist'], Student: ['Undergraduate Student', "Master's Student", 'PhD Scholar'] };
const NOTIFS = [
  { id: 'n1', title: 'Ananya Rao opened Journal of Design Thinking', when: '2 hours ago' },
  { id: 'n2', title: 'Rohan Mehta and Vikram Nair have not signed in yet', when: 'This week' },
  { id: 'n3', title: 'Your free-preview session clock resets when the countdown ends', when: 'Today' },
];
const UNFOUND = [['quantum sensing in agriculture', 6], ['bridge fatigue testing', 4], ['adaptive thermal comfort', 4], ['urban heat island mitigation', 3], ['soil carbon sequestration', 2]];
const SAMPLE_TITLES = { Agriculture: ['Agricultural Science and Technology', 'Animals and Zoonoses', 'Annals of Agriculture'], 'Applied Sciences': ['Journal of Design Thinking', 'Applied Sciences Research Letters', 'Advances in Applied Sciences'] };
const titlesOf = (d) => SAMPLE_TITLES[d] || ['Advances in ' + d, d + ' Research Letters', 'Annals of ' + d];
const splitOf = (d) => { const h = hash(d); const a = 58 + (h % 24), b = 14 + (h % 9); return [a, b, 100 - a - b]; };
const unitFor = (n) => (n >= 5 ? 7990 : ({ 1: 9990, 2: 9490, 3: 8990, 4: 8490 }[n] || 0));
const totalFor = (n) => { const sub = n * unitFor(n); return sub + Math.round(sub * 0.18); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function series(metric, range) {
  const N = { '7d': 7, '30d': 30, '90d': 13 }[range], now = Date.now(), vals = [], labels = [], names = [];
  for (let i = 0; i < N; i++) {
    const w = range === '7d' ? [14, 22, 9, 31, 26, 6, 12][i] : Math.max(3, Math.round(15 + 9 * Math.sin(i / (range === '90d' ? 1.6 : 2.3)) + 5 * Math.cos(i / 1.4) + (range === '30d' && i % 7 >= 5 ? -8 : 0) + (range === '90d' ? i * 0.9 : 0)));
    vals.push(metric === 'sessions' ? w : metric === 'hours' ? Math.round(w * 6.5) / 10 : Math.max(1, Math.min(8, Math.round(w / 4))));
    const d = new Date(now - (range === '90d' ? (N - 1 - i) * 7 : N - 1 - i) * 86400000);
    names.push(range === '90d' ? 'Week of ' + d.getDate() + ' ' + MON[d.getMonth()] : DAY[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()]);
    labels.push(range === '7d' ? DAY[d.getDay()] : range === '90d' ? (i % 2 === 0 ? d.getDate() + ' ' + MON[d.getMonth()] : '') : (i % 5 === 0 ? d.getDate() + ' ' + MON[d.getMonth()] : ''));
  }
  return { vals, labels, names };
}
function smooth(p) {
  let d = 'M' + p[0][0].toFixed(1) + ',' + p[0][1].toFixed(1);
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ' C' + (b[0] + (c[0] - a[0]) / 6).toFixed(1) + ',' + (b[1] + (c[1] - a[1]) / 6).toFixed(1) + ' ' + (c[0] - (e[0] - b[0]) / 6).toFixed(1) + ',' + (c[1] - (e[1] - b[1]) / 6).toFixed(1) + ' ' + c[0].toFixed(1) + ',' + c[1].toFixed(1);
  }
  return d;
}

class Component extends DCLogic {
  constructor(props) { super(props); this.state = this.initial(); }

  initial() {
    return {
      page: 'overview', dark: false, collapsed: false, p: 0, sec: 857, tick: 0, loading: true, premium: false, epoch: 0,
      metric: 'sessions', range: '7d', hover: null, hide: { articles: false, books: false, other: false }, depHover: '', donutHover: -1, dismissed: false,
      feed: [{ id: -20, who: 'Ananya Rao', title: 'Journal of Design Thinking' }, { id: -45, who: 'Meera Iyer', title: 'Agricultural Science and Technology' }], feedPaused: false, shelf: 'All',
      members: MEMBERS.map((m) => ({ ...m })), mq: '', mfilter: 'all', msort: 'name', msel: [], mopen: null,
      drawer: false, fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, acct: 'Faculty', desig: '', ferr: {},
      lq: '', lview: 'grid', lsort: 'az', panel: null,
      peek: false, heat: 'Hover a block to see the numbers',
      held: [...HELD0], sel: [...HELD0], sq: '', sgroup: 'all', step: 1, processing: false, paid: null, shownTotal: totalFor(4),
      palette: false, pq: '', pidx: 0, notif: false, notifRead: false, menu: false, toast: '', toastLabel: '', toastAct: null,
    };
  }

  componentDidMount() {
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.afterLoad(900);
    this.timer = setInterval(() => this.setState((s) => {
      const tick = s.tick + 1; let feed = s.feed;
      if (!s.feedPaused && tick % 7 === 0) {
        const readers = MEMBERS.filter((m) => m.items.length), m = readers[tick % readers.length];
        feed = [{ id: tick, who: m.name, title: m.items[tick % m.items.length] }, ...s.feed].slice(0, 5);
      }
      return { tick, feed, sec: s.premium ? s.sec : (s.sec > 0 ? s.sec - 1 : 1800) };
    }), 1000);
    this.onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); this.setState({ palette: true, pq: '', pidx: 0, notif: false, menu: false }); }
      else if (e.key === 'Escape') this.setState({ palette: false, drawer: false, panel: null, notif: false, menu: false });
    };
    window.addEventListener('keydown', this.onKey);
  }
  componentWillUnmount() { clearInterval(this.timer); cancelAnimationFrame(this.raf); cancelAnimationFrame(this.raf2); clearTimeout(this.lt); clearTimeout(this.tt); window.removeEventListener('keydown', this.onKey); }

  afterLoad(ms) {
    clearTimeout(this.lt);
    this.setState({ loading: true, p: 0 });
    this.lt = setTimeout(() => { this.setState({ loading: false }); this.startCount(); }, this.reduce ? 0 : ms);
  }
  startCount() {
    cancelAnimationFrame(this.raf);
    if (this.reduce) { this.setState({ p: 1 }); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1400); this.setState({ p: k }); if (k < 1) this.raf = requestAnimationFrame(step); };
    this.setState({ p: 0 }); this.raf = requestAnimationFrame(step);
  }
  tweenTotal(target) {
    cancelAnimationFrame(this.raf2);
    const from = this.state.shownTotal;
    if (this.reduce) { this.setState({ shownTotal: target }); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3); this.setState({ shownTotal: Math.round(from + (target - from) * e) }); if (k < 1) this.raf2 = requestAnimationFrame(step); };
    this.raf2 = requestAnimationFrame(step);
  }
  go(page, extra) {
    this.setState({ page, drawer: false, panel: null, palette: false, notif: false, menu: false, ...(extra || {}) });
    this.afterLoad(550);
  }
  say(msg, label, act) {
    this.setState({ toast: msg, toastLabel: label || '', toastAct: act || null });
    clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: '', toastAct: null }), act ? 5200 : 2600);
  }

  // ---- members ----
  remind(ids) {
    let n = 0;
    const members = this.state.members.map((m) => { if (ids.includes(m.id) && m.status !== 'Reading' && !m.reminded) { n++; return { ...m, reminded: true }; } return m; });
    this.setState({ members, msel: [] });
    this.say(n ? 'Reminder sent to ' + n + (n === 1 ? ' member' : ' members') : 'Nothing to send: they have all been reminded');
  }
  removeIds(ids) {
    const removed = this.state.members.map((m, i) => ({ m, i })).filter((x) => ids.includes(x.m.id));
    this.setState({ members: this.state.members.filter((m) => !ids.includes(m.id)), msel: [], mopen: null });
    this.say(removed.length === 1 ? removed[0].m.name + ' was removed' : removed.length + ' members were removed', 'Undo', () => {
      const list = [...this.state.members];
      removed.forEach((x) => list.splice(x.i, 0, x.m));
      this.setState({ members: list, toast: '' });
    });
  }
  submitUser() {
    const s = this.state, ferr = {};
    if (!s.fName.trim()) ferr.name = 'Please enter the full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.fEmail.trim())) ferr.email = 'Please enter a valid email address.';
    else if (s.members.some((m) => m.email.toLowerCase() === s.fEmail.trim().toLowerCase())) ferr.email = 'This email is already a member.';
    if (s.fMobile.trim() && !/^\+?[\d\s()-]{8,16}$/.test(s.fMobile.trim())) ferr.mobile = 'Please enter a valid mobile number.';
    if (!s.desig) ferr.desig = 'Please choose a designation.';
    if (s.fPass.length < 8) ferr.pass = 'The temporary password needs at least 8 characters.';
    if (Object.keys(ferr).length) { this.setState({ ferr }); return; }
    const m = { id: 'n' + Date.now(), name: s.fName.trim(), email: s.fEmail.trim(), type: s.acct, desig: s.desig, mobile: s.fMobile.trim(), branch: s.fBranch.trim(), dept: s.fDept.trim(), status: 'Invited', sessions: 0, last: 'Invited just now', items: [], fresh: true };
    this.setState({ members: [m, ...s.members], drawer: false, ferr: {}, mq: '', mfilter: 'all' });
    this.go('users');
    this.say(m.name + ' was invited');
    setTimeout(() => this.setState((st) => ({ members: st.members.map((x) => ({ ...x, fresh: false })) })), 2600);
  }

  // ---- subscription ----
  toggleDept(name) {
    const sel = this.state.sel.includes(name) ? this.state.sel.filter((d) => d !== name) : [...this.state.sel, name];
    this.setState({ sel }); this.tweenTotal(totalFor(sel.length));
  }
  toggleGroup(names) {
    const all = names.every((n) => this.state.sel.includes(n));
    const sel = all ? this.state.sel.filter((d) => !names.includes(d)) : [...new Set([...this.state.sel, ...names])];
    this.setState({ sel }); this.tweenTotal(totalFor(sel.length));
  }
  pay() {
    const n = this.state.sel.length; this.setState({ processing: true, step: 3 });
    setTimeout(() => this.setState({ processing: false, premium: true, held: [...this.state.sel], paid: { n, total: totalFor(n) } }), this.reduce ? 0 : 1700);
  }
  resetAll() { this.setState({ ...this.initial(), epoch: this.state.epoch + 1, dark: this.state.dark, collapsed: this.state.collapsed }); this.afterLoad(900); this.say('Prototype reset'); }

  renderVals() {
    const s = this.state, e = 1 - Math.pow(1 - s.p, 3), page = s.page, ready = !s.loading;
    const clock = String(Math.floor(s.sec / 60)).padStart(2, '0') + ':' + String(s.sec % 60).padStart(2, '0');
    const readN = s.members.filter((m) => m.status === 'Reading').length;
    const pending = s.members.filter((m) => m.status !== 'Reading' && !m.reminded).length;
    const reminded = s.members.filter((m) => m.status !== 'Reading' && m.reminded).length;
    const heldTotal = s.held.reduce((a, d) => a + TOTAL[d], 0);
    const hr = new Date().getHours();
    const v = {
      themeCls: s.dark ? 'dark' : '', isDark: s.dark, isLight: !s.dark, epochKey: 'e' + s.epoch + page,
      sideCls: s.collapsed ? 'collapsed' : '', sbW: s.collapsed ? 76 : 256, chevStyle: 'transition:transform .3s;transform:rotate(' + (s.collapsed ? 180 : 0) + 'deg)',
      toggleSide: () => this.setState({ collapsed: !s.collapsed }), toggleTheme: () => this.setState({ dark: !s.dark }),
      nav: Object.fromEntries(PAGES.map(([k]) => [k, 'nav' + (page === k ? ' active' : '')])), cur: Object.fromEntries(PAGES.map(([k]) => [k, page === k ? 'page' : undefined])),
      goOverview: () => this.go('overview'), goUsers: () => this.go('users'), goAnalytics: () => this.go('analytics'), goLibrary: () => this.go('library'), goSubs: () => this.go('subs'),
      pendingBadge: pending, hasBadge: pending > 0, closePops: () => this.setState({ menu: false, notif: false }), popsOpen: s.menu || s.notif,
      pageTitle: TITLES[page], clock, premium: s.premium, free: !s.premium, isLoading: s.loading,
      isOverview: page === 'overview' && ready, isUsers: page === 'users' && ready, isLibrary: page === 'library' && ready, isAnalytics: page === 'analytics' && ready, isSubs: page === 'subs' && ready,
      noop: () => this.say('Prototype: sign out is not connected'),
      renewal: (() => { const d = new Date(); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + (d.getFullYear() + 1); })(),
      // overlays and popovers
      toast: s.toast, toastLabel: s.toastLabel, hasToastAct: !!s.toastAct, toastAct: () => { const f = s.toastAct; if (f) f(); },
      openPalette: () => this.setState({ palette: true, pq: '', pidx: 0, notif: false, menu: false }), closePalette: () => this.setState({ palette: false }),
      palette: s.palette,
      toggleNotif: () => this.setState({ notif: !s.notif, menu: false, notifRead: true }), notif: s.notif, unread: !s.notifRead,
      notifs: NOTIFS.map((n) => ({ ...n, tone: s.notifRead ? 'color:var(--muted)' : 'font-weight:600' })), markRead: () => this.setState({ notifRead: true, notif: false }),
      toggleMenu: () => this.setState({ menu: !s.menu, notif: false }), menu: s.menu,
      protoReset: () => { this.resetAll(); this.setState({ menu: false }); },
      protoPremium: () => this.setState({ premium: !s.premium, menu: false }), protoPremiumLabel: s.premium ? 'Back to the free preview' : 'Preview the Premium state',
      protoReplay: () => { this.setState({ epoch: s.epoch + 1, menu: false }); this.afterLoad(700); },
      premiumLabel: s.premium ? 'Premium is on' : 'Free preview',
    };

    // ---- palette ----
    if (s.palette) {
      const q = s.pq.trim().toLowerCase(), items = [];
      PAGES.forEach(([k, l]) => items.push({ kind: 'Page', label: l, sub: 'Open ' + l.toLowerCase(), run: () => this.go(k) }));
      s.held.forEach((d) => items.push({ kind: 'Department', label: d, sub: IN(TOTAL[d]) + ' items', run: () => { this.go('library'); setTimeout(() => this.setState({ panel: d }), 700); } }));
      s.members.forEach((m) => items.push({ kind: 'Member', label: m.name, sub: m.email, run: () => this.go('users', { mq: m.name, mfilter: 'all' }) }));
      const found = (q ? items.filter((i) => (i.label + ' ' + i.sub).toLowerCase().includes(q)) : items.slice(0, 9)).slice(0, 9);
      const idx = Math.min(s.pidx, Math.max(found.length - 1, 0));
      v.pq = s.pq; v.setPq = (ev) => this.setState({ pq: ev.target.value, pidx: 0 });
      v.palItems = found.map((it, i) => ({ ...it, key: it.kind + it.label, cls: 'pal-item' + (i === idx ? ' on' : ''), pick: () => it.run(), hover: () => this.setState({ pidx: i }) }));
      v.palEmpty = found.length === 0;
      v.palKey = (ev) => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); this.setState({ pidx: Math.min(idx + 1, found.length - 1) }); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.setState({ pidx: Math.max(idx - 1, 0) }); }
        else if (ev.key === 'Enter' && found[idx]) { ev.preventDefault(); found[idx].run(); }
      };
    }

    if (!ready) return v;

    // ---- overview ----
    if (page === 'overview') {
      const done = [true, s.members.length > 0, pending === 0 && s.members.length > 0, s.premium];
      const frac = done.filter(Boolean).length / 4;
      v.greeting = (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening');
      v.kItems = IN(Math.round(heldTotal * e)); v.kDepts = String(Math.round(s.held.length * e)); v.kMembers = String(Math.round(s.members.length * e)); v.kRead = String(Math.round(readN * e));
      v.stepCount = done.filter(Boolean).length + '/4'; v.heroOff = (301.6 * (1 - frac * e)).toFixed(1);
      const stepGo = [() => this.go('library'), () => this.go('users'), () => (pending ? this.remind(s.members.map((m) => m.id)) : this.go('users')), () => this.go('subs')];
      v.steps = ['Choose departments', 'Add your first users', 'Get them reading', 'Go Premium'].map((label, i) => ({
        label, done: done[i], go: stepGo[i], cls: 'stp' + (done[i] ? ' done' : ''),
        boxStyle: 'width:20px;height:20px;border-radius:50%;display:grid;place-items:center;flex:none;transition:all .35s;' + (done[i] ? 'background:var(--accent);color:var(--btn-ink)' : 'border:2px solid var(--rule-2)'),
        textStyle: done[i] ? 'color:var(--muted);text-decoration:line-through' : 'font-weight:600;color:var(--ink)',
      }));
      v.bannerWarn = !s.dismissed && pending > 0; v.bannerSent = !s.dismissed && pending === 0 && reminded > 0;
      v.pendingText = pending + (pending === 1 ? ' member has' : ' members have') + ' not opened the library yet. A short reminder usually brings them in.';
      v.sentText = 'Reminder sent to ' + reminded + (reminded === 1 ? ' member.' : ' members.') + ' They will see it the next time they sign in.';
      v.sendReminders = () => this.remind(s.members.map((m) => m.id)); v.dismissBanner = () => this.setState({ dismissed: true });
      v.pips = [0, 1, 2, 3].map((i) => ({ style: 'height:8px;flex:1;border-radius:99px;background:' + (i < 1 ? 'var(--accent)' : 'var(--surface-2)') + ';transition:background .4s' }));
      // reading chart
      const ser = series(s.metric, s.range), vals = ser.vals, n = vals.length, m0 = Math.max(...vals);
      const stepY = m0 > 40 ? 10 : m0 > 20 ? 5 : 2, max = Math.max(4, Math.ceil(m0 / stepY) * stepY), W = 600, H = 200, pad = 14;
      const pts = vals.map((x, i) => [((i + 0.5) / n) * W, H - pad - (x / max) * (H - pad * 2)]);
      const lineD = smooth(pts);
      v.lineD = lineD; v.areaD = lineD + ' L' + pts[n - 1][0].toFixed(1) + ',' + H + ' L' + pts[0][0].toFixed(1) + ',' + H + ' Z';
      const unit = s.metric === 'sessions' ? 'sessions' : s.metric === 'hours' ? 'hours' : 'active readers';
      const sum = vals.reduce((a, b) => a + b, 0);
      v.chartKey = s.metric + s.range + s.epoch;
      v.chartTotal = s.metric === 'readers' ? 'Peak ' + Math.max(...vals) + ' readers' : (Math.round(sum * 10) / 10) + ' ' + unit + ' in total';
      v.chartAvg = 'avg ' + (Math.round((sum / n) * 10) / 10) + ' per ' + (s.range === '90d' ? 'week' : 'day');
      v.grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ top: ((H - pad - f * (H - pad * 2)) / H) * 100, label: String(Math.round(max * f * 10) / 10) })).map((g) => ({ style: 'top:' + g.top + '%', lstyle: 'top:' + g.top + '%', label: g.label }));
      v.hits = vals.map((x, i) => ({ style: 'left:' + (i / n) * 100 + '%;width:' + 100 / n + '%', enter: () => this.setState({ hover: i }), key: v.chartKey + i }));
      v.xlabels = ser.labels.map((l, i) => ({ l, style: 'flex:1;min-width:0;text-align:center;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:visible' }));
      v.hasHover = s.hover != null && s.hover < n;
      if (v.hasHover) {
        const hx = ((s.hover + 0.5) / n) * 100, hy = (pts[s.hover][1] / H) * 100;
        v.crossStyle = 'left:' + hx + '%'; v.ptStyle = 'left:' + hx + '%;top:' + hy + '%'; v.tipStyle = 'left:' + Math.min(Math.max(hx, 12), 88) + '%;top:' + hy + '%';
        v.tipText = ser.names[s.hover] + ' · ' + vals[s.hover] + ' ' + unit;
      }
      v.clearHover = () => this.setState({ hover: null });
      v.metrics = [['sessions', 'Sessions'], ['hours', 'Hours'], ['readers', 'Readers']].map(([k, l]) => ({ l, cls: s.metric === k ? 'on' : '', on: s.metric === k, pick: () => this.setState({ metric: k, hover: null }) }));
      v.ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']].map(([k, l]) => ({ l, cls: s.range === k ? 'on' : '', on: s.range === k, pick: () => this.setState({ range: k, hover: null }) }));
      // donut
      const cnt = [s.members.filter((m) => m.sessions >= 8).length, s.members.filter((m) => m.sessions > 0 && m.sessions < 8).length, s.members.filter((m) => m.sessions === 0).length];
      const tot = Math.max(1, cnt[0] + cnt[1] + cnt[2]), C = 314.16; let cum = 0;
      const dn = [['Active', 'var(--s1)', 'reading'], ['Occasional', 'var(--s3)', 'reading'], ['Not started', 'var(--rule-2)', 'notstarted']];
      v.donut = dn.map(([label, color, f], i) => {
        const len = Math.max(0, (cnt[i] / tot) * C - (cnt[i] > 0 ? 4 : 0)), off = -cum; cum += (cnt[i] / tot) * C;
        return { label, color, count: cnt[i], da: (len * e).toFixed(1) + ' ' + C, off: off.toFixed(1), cls: 'donut' + (s.donutHover >= 0 && s.donutHover !== i ? ' dim' : ''),
          enter: () => this.setState({ donutHover: i }), leave: () => this.setState({ donutHover: -1 }), pick: () => this.go('users', { mfilter: f }),
          legendStyle: 'width:10px;height:10px;border-radius:3px;display:inline-block;background:' + color };
      });
      const hv = s.donutHover >= 0 ? s.donutHover : -1;
      v.donutBig = hv >= 0 ? String(cnt[hv]) : String(Math.round((readN / Math.max(1, s.members.length)) * 100 * e)) + '%';
      v.donutSmall = hv >= 0 ? dn[hv][0].toLowerCase() : 'reading';
      // session card
      v.sessionOff = ((1 - Math.min(s.sec, 1800) / 1800) * 0).toFixed(1);
      v.feed = s.feed.map((f) => { const ago = s.tick - f.id; return { ...f, key: 'f' + f.id, ini: f.who.split(' ').map((w) => w[0]).join(''), when: f.id < 0 ? Math.round(-f.id / 20 * 3) + ' min ago' : ago < 5 ? 'just now' : ago < 60 ? ago + 's ago' : Math.floor(ago / 60) + ' min ago' }; });
      v.feedLabel = s.feedPaused ? 'Paused' : 'Live'; v.feedPill = s.feedPaused ? 'sample' : 'green'; v.feedDot = s.feedPaused ? '' : 'live'; v.feedLive = !s.feedPaused; v.toggleFeed = () => this.setState({ feedPaused: !s.feedPaused }); v.feedBtn = s.feedPaused ? 'Resume' : 'Pause';
      // depth bars
      const maxAll = Math.max(...s.held.map((d) => TOTAL[d]));
      const names = ['Articles', 'Books', 'Other'], cols = ['s1', 's2', 's3'], keys = ['articles', 'books', 'other'];
      v.deep = s.held.slice().sort((a, b) => TOTAL[b] - TOTAL[a]).slice(0, 6).map((d, r) => {
        const sp = splitOf(d), w = (TOTAL[d] / maxAll) * 100;
        const segs = [0, 1, 2].map((k) => ({
          style: 'width:' + (s.hide[keys[k]] ? 0 : (w * sp[k]) / 100) + '%;background:var(--' + cols[k] + ');animation-delay:' + (r * 80 + k * 60) + 'ms',
          enter: () => this.setState({ depHover: d + ' · ' + names[k] + ' · ' + IN(Math.round((TOTAL[d] * sp[k]) / 100)) + ' (' + sp[k] + '%)' }), leave: () => this.setState({ depHover: '' }),
        }));
        return { name: d, total: IN(TOTAL[d]), a: segs[0], b: segs[1], c: segs[2], open: () => this.go('library', { panel: d }) };
      });
      v.legends = names.map((nm, k) => ({ nm, cls: 'legend' + (s.hide[keys[k]] ? ' off' : ''), on: !s.hide[keys[k]], style: 'background:var(--' + cols[k] + ')', toggle: () => this.setState({ hide: { ...s.hide, [keys[k]]: !s.hide[keys[k]] } }) }));
      v.depHover = s.depHover || 'Hover a segment for the exact count. Click a department to open it.';
      v.hasDeep = s.held.length > 0;
      // subjects
      const subj = s.held.slice(0, 4).map((d, i) => [d, Math.round(([46, 27, 19, 8][i] || 6))]);
      v.subjects = subj.map(([name, pct], i) => ({ name, pct, style: 'width:' + pct + '%;background:var(--s1);animation-delay:' + i * 90 + 'ms' }));
      // shelves
      const tabs = ['All', ...s.held.slice(0, 4)];
      v.shelfTabs = tabs.map((t) => ({ t, cls: 'chip' + (s.shelf === t ? ' on' : ''), pressed: s.shelf === t, pick: () => this.setState({ shelf: t }) }));
      const f = s.shelf === 'All' || !s.held.includes(s.shelf) ? null : s.shelf;
      v.shelves = (f ? titlesOf(f).map((t) => ({ title: t, meta: f })) : s.held.slice(0, 4).map((d) => ({ title: titlesOf(d)[0], meta: d }))).map((t, i) => ({ ...t, key: s.shelf + i, delay: 'animation-delay:' + i * 60 + 'ms', open: () => this.say('Prototype: "' + t.title + '" would open in the reader') }));
    }

    // ---- users ----
    if (page === 'users') {
      const q = s.mq.trim().toLowerCase();
      const key = (m) => (m.status === 'Reading' ? 'reading' : m.status === 'Invited' ? 'invited' : 'notstarted');
      let list = s.members.filter((m) => (s.mfilter === 'all' || key(m) === s.mfilter) && (!q || (m.name + ' ' + m.email + ' ' + m.desig).toLowerCase().includes(q)));
      list = list.slice().sort((a, b) => (s.msort === 'name' ? a.name.localeCompare(b.name) : b.sessions - a.sessions));
      const count = (f) => s.members.filter((m) => f === 'all' || key(m) === f).length;
      v.mq = s.mq; v.setMq = (ev) => this.setState({ mq: ev.target.value });
      v.stats = [['all', 'Enrolled'], ['reading', 'Reading'], ['notstarted', 'Not started'], ['invited', 'Invited']].map(([k, l], i) => ({
        l, n: String(Math.round(count(k) * e)), cls: 'card lift rise stat' + (s.mfilter === k ? ' on' : ''), pressed: s.mfilter === k, delay: 'animation-delay:' + i * 60 + 'ms', pick: () => this.setState({ mfilter: k }),
      }));
      v.sorts = [['name', 'Name'], ['active', 'Most active']].map(([k, l]) => ({ l, cls: s.msort === k ? 'on' : '', on: s.msort === k, pick: () => this.setState({ msort: k }) }));
      const allSel = list.length > 0 && list.every((m) => s.msel.includes(m.id));
      v.allCls = 'cb' + (allSel ? ' on' : ''); v.allOn = allSel;
      v.toggleAll = () => this.setState({ msel: allSel ? s.msel.filter((id) => !list.some((m) => m.id === id)) : [...new Set([...s.msel, ...list.map((m) => m.id)])] });
      v.members = list.map((m, i) => {
        const sel = s.msel.includes(m.id), open = s.mopen === m.id, st = m.status === 'Reading' ? 'Reading' : m.reminded ? 'Reminded' : m.status;
        return {
          ...m, key: m.id, ini: m.name.split(' ').map((w) => w[0]).slice(0, 2).join(''), statusCls: 'tag ' + (st === 'Reading' ? 'ok' : st === 'Reminded' ? 'fac' : 'wait'), status: st,
          rowStyle: 'animation-delay:' + Math.min(i, 8) * 40 + 'ms' + (m.fresh ? ';background:var(--accent-soft)' : ''), cbCls: 'cb' + (sel ? ' on' : ''), sel,
          toggle: () => this.setState({ msel: sel ? s.msel.filter((x) => x !== m.id) : [...s.msel, m.id] }), open, expand: () => this.setState({ mopen: open ? null : m.id }),
          chev: 'transition:transform .25s;transform:rotate(' + (open ? 180 : 0) + 'deg)',
          canRemind: m.status !== 'Reading', remindLabel: m.reminded ? 'Reminded' : m.status === 'Invited' ? 'Resend invite' : 'Send reminder', remindOff: !!m.reminded,
          remind: () => this.remind([m.id]), remove: () => this.removeIds([m.id]),
          hasContact: !!(m.mobile || m.branch || m.dept), contactLine: [m.mobile, m.branch, m.dept].filter(Boolean).join(' · '), hasItems: m.items.length > 0, itemList: m.items.length ? m.items : ['Nothing opened yet'],
        };
      });
      v.noMembers = list.length === 0; v.selCount = s.msel.length; v.hasSel = s.msel.length > 0;
      v.remindSel = () => this.remind(s.msel); v.removeSel = () => this.removeIds(s.msel); v.clearSel = () => this.setState({ msel: [] });
      v.clearFilters = () => this.setState({ mq: '', mfilter: 'all' });
      v.shownCount = list.length + ' of ' + s.members.length;
      v.openDrawer = () => this.setState({ drawer: true, fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, desig: '', acct: 'Faculty', ferr: {} });
      v.toastImport = () => this.say('Prototype: import opens a file picker');
      v.exportCsv = () => this.say('Prototype: the member list would download as CSV');
    }

    // ---- library ----
    if (page === 'library') {
      const q = s.lq.trim().toLowerCase();
      let list = s.held.filter((d) => !q || d.toLowerCase().includes(q));
      list = list.slice().sort((a, b) => (s.lsort === 'az' ? a.localeCompare(b) : TOTAL[b] - TOTAL[a]));
      v.lq = s.lq; v.setLq = (ev) => this.setState({ lq: ev.target.value });
      v.views = [['grid', 'Grid'], ['list', 'List']].map(([k, l]) => ({ l, cls: s.lview === k ? 'on' : '', on: s.lview === k, pick: () => this.setState({ lview: k }) }));
      v.lsorts = [['az', 'A–Z'], ['size', 'Largest']].map(([k, l]) => ({ l, cls: s.lsort === k ? 'on' : '', on: s.lsort === k, pick: () => this.setState({ lsort: k }) }));
      v.isGrid = s.lview === 'grid'; v.isList = s.lview === 'list';
      v.libDepts = list.map((d, i) => { const sp = splitOf(d); return { key: d + s.lsort, name: d, total: IN(TOTAL[d]), delay: 'animation-delay:' + i * 60 + 'ms', open: () => this.setState({ panel: d }),
        barA: 'width:' + sp[0] + '%;background:var(--s1)', barB: 'width:' + sp[1] + '%;background:var(--s2)', barC: 'width:' + sp[2] + '%;background:var(--s3)' }; });
      v.noLib = list.length === 0; v.libCount = list.length + (list.length === 1 ? ' department' : ' departments') + ' · ' + IN(list.reduce((a, d) => a + TOTAL[d], 0)) + ' items';
      if (s.panel) {
        const sp = splitOf(s.panel), tot = TOTAL[s.panel];
        v.pName = s.panel; v.pTotal = IN(tot);
        v.pTypes = ['Articles', 'Books', 'Other'].map((l, k) => ({ l, n: IN(Math.round((tot * sp[k]) / 100)), pct: sp[k], style: 'width:' + sp[k] + '%;background:var(--' + ['s1', 's2', 's3'][k] + ');animation-delay:' + k * 90 + 'ms' }));
        v.pTitles = titlesOf(s.panel).map((t, i) => ({ t, delay: 'animation-delay:' + (150 + i * 70) + 'ms', open: () => this.say('Prototype: "' + t + '" would open in the reader') }));
        v.closePanel = () => this.setState({ panel: null });
      }
      v.hasPanel = !!s.panel;
    }

    // ---- analytics ----
    if (page === 'analytics') {
      const unlocked = s.premium || s.peek;
      v.unlocked = unlocked; v.locked = !unlocked; v.peek = s.peek; v.peekLabel = s.peek ? 'Hide the sample' : 'Peek with sample data';
      v.togglePeek = () => this.setState({ peek: !s.peek });
      v.blurCls = 'card' + (unlocked ? '' : ' lock-preview');
      v.aKpis = [['Active readers', String(Math.round(readN * e))], ['Hours read', String(Math.round(412 * e))], ['Searches not found', String(Math.round(UNFOUND.reduce((a, x) => a + x[1], 0) * e))], ['Most read', s.held[0] || '—']].map(([l, n], i) => ({ l, n, delay: 'animation-delay:' + i * 70 + 'ms' }));
      const hours = ['6–8', '8–10', '10–12', '12–14', '14–16', '16–18', '18–20', '20–22'];
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      v.heatRows = days.map((d, r) => ({ d, cells: hours.map((h, c) => {
        const x = Math.sin(((c + 0.6) / hours.length) * Math.PI) * (r < 5 ? 1 : 0.45) * (0.55 + 0.45 * rnd(r * 9 + c)), n = Math.round(x * 9);
        return { style: 'background:color-mix(in srgb,var(--s1) ' + Math.round(8 + x * 88) + '%,var(--surface-2));animation-delay:' + (r * 30 + c * 20) + 'ms', enter: () => this.setState({ heat: d + ' ' + h + ' h · ' + n + (n === 1 ? ' session' : ' sessions') }), key: d + h };
      }) }));
      v.heatHours = hours; v.heatText = s.heat;
      v.topRead = s.held.slice(0, 4).map((d, i) => ({ name: titlesOf(d)[0], dept: d, n: [38, 27, 19, 9][i] || 5, style: 'width:' + ([38, 27, 19, 9][i] || 5) * 2.4 + '%;background:var(--s1);animation-delay:' + i * 90 + 'ms' }));
      v.unfound = UNFOUND.map(([q, n]) => ({ q, n }));
      v.exportReport = () => this.say('Prototype: the report would download as PDF');
    }

    // ---- subscriptions ----
    if (page === 'subs') {
      const n = s.sel.length, unit = unitFor(n), sub = n * unit, gst = Math.round(sub * 0.18);
      const q = s.sq.trim().toLowerCase();
      v.step = s.step; v.step1 = s.step === 1; v.step2 = s.step === 2; v.step3 = s.step === 3 && !s.processing && !!s.paid; v.processing = s.processing;
      v.stepper = ['Choose departments', 'Review', 'Done'].map((l, i) => ({ l, num: i + 1, cls: 'st' + (s.step === i + 1 ? ' on' : '') + (s.step > i + 1 || (s.paid && !s.processing) ? ' done' : ''), done: s.step > i + 1 || (!!s.paid && !s.processing), notDone: !(s.step > i + 1 || (!!s.paid && !s.processing)), line: 'transform:scaleX(' + (s.step > i + 1 ? 1 : 0) + ')', showLine: i < 2 }));
      v.sq = s.sq; v.setSq = (ev) => this.setState({ sq: ev.target.value });
      v.gtabs = [['all', 'All'], ...GROUPS.slice(0, 6).map(([g]) => [g, g.split(' & ')[0].split(',')[0]])].map(([k, l]) => ({ l, cls: 'chip' + (s.sgroup === k ? ' on' : ''), pressed: s.sgroup === k, pick: () => this.setState({ sgroup: k }) }));
      v.groups = GROUPS.filter(([g]) => s.sgroup === 'all' || s.sgroup === g).map(([g, ds]) => {
        const shown = ds.filter((d) => !q || d.toLowerCase().includes(q)), allOn = ds.every((d) => s.sel.includes(d)), c = ds.filter((d) => s.sel.includes(d)).length;
        return { key: g, g, count: c + '/' + ds.length, allLabel: allOn ? 'Clear group' : 'Select all', toggle: () => this.toggleGroup(ds), show: shown.length > 0,
          chips: shown.map((d) => ({ key: d, name: d, cls: 'chip' + (s.sel.includes(d) ? ' on' : ''), pressed: s.sel.includes(d), toggle: () => this.toggleDept(d) })) };
      }).filter((g) => g.show);
      v.noMatch = v.groups.length === 0;
      v.tray = s.sel.map((d) => ({ key: d, name: d, remove: () => this.toggleDept(d) })); v.hasTray = n > 0;
      v.selCount = String(n);
      v.tiers = [[1, '1 dept', 9990], [2, '2 depts', 9490], [3, '3 depts', 8990], [4, '4 depts', 8490], [5, '5+ depts', 7990]].map(([k, l, p]) => ({ l, price: rupee(p), cls: 'tier' + (n > 0 && Math.min(n, 5) === k ? ' on' : '') }));
      v.unitPrice = n ? rupee(unit) : '—'; v.subtotal = rupee(sub); v.gst = rupee(gst); v.totalShown = rupee(s.shownTotal);
      v.meterStyle = 'width:' + Math.min(100, (n / 5) * 100) + '%';
      v.nudge = n === 0 ? 'Choose at least one department to see your price.' : n < 5 ? 'Add ' + (5 - n) + ' more to reach the 5+ rate: ' + rupee(7990) + ' per department instead of ' + rupee(unit) + '.' : '5+ rate applied: ' + rupee(unitFor(1) - 7990) + ' less per department than a single one.';
      v.canContinue = n > 0; v.cantContinue = n === 0;
      v.toReview = () => this.setState({ step: 2 }); v.toChoose = () => this.setState({ step: 1 }); v.pay = () => this.pay();
      v.reviewRows = s.sel.map((d, i) => ({ key: d, name: d, price: rupee(unit), delay: 'animation-delay:' + i * 45 + 'ms' }));
      v.confetti = Array.from({ length: 26 }, (_, i) => { const a = (i / 26) * Math.PI * 2, r = 110 + rnd(i) * 150; return { key: 'c' + i, style: '--cx:' + Math.round(Math.cos(a) * r) + 'px;--cy:' + Math.round(Math.sin(a) * r - 40) + 'px;--cr:' + Math.round(rnd(i + 3) * 720) + 'deg;background:' + ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--amber)'][i % 4] + ';animation-delay:' + Math.round(rnd(i + 9) * 160) + 'ms' }; });
      v.paidText = s.paid ? s.paid.n + (s.paid.n === 1 ? ' department' : ' departments') + ' · ' + rupee(s.paid.total) + ' incl. GST' : '';
      v.toastTalk = () => this.say('Prototype: this would open a contact form');
    }

    // ---- drawer (users page and overview quick-add) ----
    if (s.drawer) {
      v.fName = s.fName; v.fEmail = s.fEmail; v.fMobile = s.fMobile; v.fBranch = s.fBranch; v.fDept = s.fDept; v.fPass = s.fPass;
      const clr = (k) => ({ ...s.ferr, [k]: undefined });
      v.setName = (ev) => this.setState({ fName: ev.target.value, ferr: clr('name') }); v.setEmail = (ev) => this.setState({ fEmail: ev.target.value, ferr: clr('email') });
      v.setMobile = (ev) => this.setState({ fMobile: ev.target.value, ferr: clr('mobile') }); v.setBranch = (ev) => this.setState({ fBranch: ev.target.value }); v.setDept = (ev) => this.setState({ fDept: ev.target.value });
      v.setPass = (ev) => this.setState({ fPass: ev.target.value, ferr: clr('pass') });
      v.showPass = s.showPass; v.hidePass = !s.showPass; v.passType = s.showPass ? 'text' : 'password'; v.passLabel = s.showPass ? 'Hide the password' : 'Show the password'; v.togglePass = () => this.setState({ showPass: !s.showPass });
      v.errName = s.ferr.name; v.errEmail = s.ferr.email; v.errMobile = s.ferr.mobile; v.errDesig = s.ferr.desig; v.errPass = s.ferr.pass;
      v.nameCls = 'field' + (s.ferr.name ? ' err' : ''); v.emailCls = 'field' + (s.ferr.email ? ' err' : ''); v.mobileCls = 'field' + (s.ferr.mobile ? ' err' : ''); v.passCls = 'field' + (s.ferr.pass ? ' err' : '');
      v.acctOpts = Object.keys(ACCT).map((name) => { const locked = name === 'Student' && !s.premium; return { name, locked, pressed: s.acct === name, cls: (s.acct === name ? 'on' : '') + (locked ? ' locked' : ''), pick: () => (locked ? this.say('Student accounts are part of Premium') : this.setState({ acct: name, desig: '', ferr: clr('desig') })) }; });
      v.desigOpts = ACCT[s.acct].map((name) => ({ name, pressed: s.desig === name, cls: 'chip' + (s.desig === name ? ' on' : ''), pick: () => this.setState({ desig: name, ferr: clr('desig') }) }));
      v.submitUser = () => this.submitUser(); v.closeDrawer = () => this.setState({ drawer: false });
      v.drawerKey = (ev) => { if (ev.key === 'Escape') this.setState({ drawer: false }); };
    }
    v.drawer = s.drawer; v.openDrawer = v.openDrawer || (() => this.setState({ drawer: true, fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, desig: '', acct: 'Faculty', ferr: {} }));
    return v;
  }
}
