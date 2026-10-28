/* ==========================================================================
   Prototype logic. One class: state lives in this.state, renderVals() returns everything the template reads.
   All data below is sample data except the four held departments' totals (79,099 items).
   ========================================================================== */
const IN = (n) => Number(n).toLocaleString('en-IN');
const rupee = (n) => '₹' + IN(n);
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
// The four held departments' totals are the real figures (they add up to 79,099); the others are sample numbers for a larger plan.
const TOTAL = { Agriculture: 29366, 'Applied Mechanics': 4042, 'Applied Sciences': 17514, Architecture: 28177, Arts: 9840, Ayurveda: 3120, 'Bio Technology': 11260, 'Chemical Engineering': 8890, Chemistry: 14230, 'Civil / Construction Engineering': 12470, Commerce: 7650, 'Computer / IT': 31880, Dental: 2950, 'Education and Social Sciences': 16340, 'Electrical Engineering': 10920, 'Electronics & Telecommunication Engineering': 9410, Energy: 6180, Law: 8330, 'Life Sciences': 19760, Management: 13540, 'Material Science': 7020, 'Mechanical Engineering': 11890, 'Medical Sciences': 27640, Multidisciplinary: 5210, 'Nano Technology': 3870, Nursing: 4460, Pharmacy: 9120, Physiotherapy: 2380, Science: 15600 };
const NAV = [['overview', 'Dashboard Overview', 'grid'], ['users', 'User Management', 'users'], ['library', 'Content Library', 'book'], ['analytics', 'Learning Analytics', 'activity'], ['subs', 'Subscriptions', 'card']];
const NAV2 = [['profile', 'Institution Profile', 'building'], ['feedbacks', 'My Feedbacks', 'message']];
const TITLES = { overview: 'Dashboard', users: 'User Management', library: 'Content Library', analytics: 'Learning Analytics', subs: 'Subscriptions', profile: 'Institution Profile', feedbacks: 'My Feedbacks' };

const MEMBERS = [
  { id: 'm1', name: 'Ananya Rao', email: 'ananya.rao@example.edu', type: 'Faculty', desig: 'Lecturer', status: 'Reading', sessions: 14, last: '2 hours ago', rank: 1, items: ['Journal of Design Thinking', 'Animals and Zoonoses'] },
  { id: 'm2', name: 'Rohan Mehta', email: 'rohan.mehta@example.edu', type: 'Researcher', desig: 'Principal Investigator', status: 'Not started', sessions: 0, last: 'Never signed in', rank: 9, items: [] },
  { id: 'm3', name: 'Meera Iyer', email: 'meera.iyer@example.edu', type: 'Faculty', desig: 'Professor', status: 'Reading', sessions: 9, last: 'Yesterday', rank: 3, items: ['Agricultural Science and Technology'] },
  { id: 'm4', name: 'Karan Shah', email: 'karan.shah@example.edu', type: 'Student', desig: 'PhD Scholar', status: 'Reading', sessions: 6, last: '3 days ago', rank: 4, items: ['Journal of Design Thinking'] },
  { id: 'm5', name: 'Sana Qureshi', email: 'sana.qureshi@example.edu', type: 'Researcher', desig: 'Research Associate', status: 'Reading', sessions: 3, last: '5 days ago', rank: 5, items: ['Animals and Zoonoses'] },
  { id: 'm6', name: 'Vikram Nair', email: 'vikram.nair@example.edu', type: 'Student', desig: "Master's Student", status: 'Not started', sessions: 0, last: 'Never signed in', rank: 9, items: [] },
  { id: 'm7', name: 'Priya Das', email: 'priya.das@example.edu', type: 'Faculty', desig: 'Assistant Professor', status: 'Invited', sessions: 0, last: 'Invited today', rank: 8, items: [] },
  { id: 'm8', name: 'Dev Malhotra', email: 'dev.malhotra@example.edu', type: 'Student', desig: 'Undergraduate Student', status: 'Reading', sessions: 11, last: 'Today', rank: 0, items: ['Agricultural Science and Technology', 'Journal of Design Thinking'] },
];
const ACCT = {
  Faculty: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Faculty Member'],
  Researcher: ['Research Scientist', 'Research Associate', 'Research Fellow', 'Scientist', 'Principal Investigator'],
  Student: ['Undergraduate Student', "Master's Student", 'PhD Scholar'],
};
const NOTIFS = [
  { id: 'n1', title: 'Ananya Rao opened Journal of Design Thinking', when: '2 hours ago' },
  { id: 'n2', title: 'Rohan Mehta and Vikram Nair have not signed in yet', when: 'This week' },
  { id: 'n3', title: 'Your free-preview session clock resets when the countdown ends', when: 'Today' },
];
const UNFOUND = [['quantum sensing in agriculture', 6], ['bridge fatigue testing', 4], ['adaptive thermal comfort', 4], ['urban heat island mitigation', 3], ['soil carbon sequestration', 2]];
const NEWEST = [
  { title: 'Agricultural Science and Technology', dept: 'Agriculture', type: 'Journal', added: '2 days ago' },
  { title: 'Animals and Zoonoses', dept: 'Agriculture', type: 'Journal', added: '3 days ago' },
  { title: 'Journal of Design Thinking', dept: 'Applied Sciences', type: 'Journal', added: '5 days ago' },
  { title: 'Advances in Applied Mechanics', dept: 'Applied Mechanics', type: 'Book', added: '1 week ago' },
  { title: 'Architecture Research Letters', dept: 'Architecture', type: 'Article', added: '1 week ago' },
];
const SAMPLE_TITLES = { Agriculture: ['Agricultural Science and Technology', 'Animals and Zoonoses', 'Annals of Agriculture'], 'Applied Sciences': ['Journal of Design Thinking', 'Applied Sciences Research Letters', 'Advances in Applied Sciences'] };
const titlesOf = (d) => SAMPLE_TITLES[d] || ['Advances in ' + d, d + ' Research Letters', 'Annals of ' + d];
const splitOf = (d) => { const h = hash(d); const a = 58 + (h % 24), b = 14 + (h % 9); return [a, b, 100 - a - b]; };
const unitFor = (n) => (n >= 5 ? 7990 : ({ 1: 9990, 2: 9490, 3: 8990, 4: 8490 }[n] || 0));
const totalFor = (n) => { const sub = n * unitFor(n); return sub + Math.round(sub * 0.18); };

// ---- library catalogue (sample): content types per department, subject areas, and a deterministic list of sample titles ----
const TYPES = ['Books', 'Periodicals', 'Theses'];
const TYPE_INFO = { Books: ['book', 'Monographs, textbooks and edited volumes'], Periodicals: ['file', 'Journals, magazines and serial articles'], Theses: ['layers', 'Doctoral and masters research'] };
const typeCounts = (d) => {
  if (d === 'Agriculture') return { Books: 8936, Periodicals: 20067, Theses: 363 };   // the real split for Agriculture (adds up to 29,366)
  const t = TOTAL[d], h = hash(d), th = Math.round(t * (0.008 + (h % 7) / 1000)), b = Math.round(t * (0.16 + (h % 13) / 100));
  return { Books: b, Periodicals: t - b - th, Theses: th };
};
const GENERIC_SUBJECTS = ['Fundamentals', 'Research methods', 'Case studies', 'Applications', 'Education and training', 'Policy and practice', 'Emerging topics', 'Reviews and surveys'];
const SUBJECTS = {
  Agriculture: ['Agricultural engineering and machinery', 'Agricultural science', 'Agriculture and farming', 'Agronomy and crop production', 'Apiculture (beekeeping)', 'Aquaculture and fish-farming', 'Animal husbandry', 'Horticulture', 'Soil science', 'Plant protection'],
  'Applied Mechanics': ['Fluid mechanics', 'Solid mechanics', 'Vibrations and dynamics', 'Fracture and fatigue', 'Computational mechanics', 'Biomechanics', 'Structural analysis'],
  'Applied Sciences': ['Design thinking', 'Materials and applications', 'Measurement and instrumentation', 'Environmental science', 'Industrial processes', 'Computational methods', 'Applied physics'],
  Architecture: ['Architectural design', 'Urban planning', 'Sustainable building', 'Building materials', 'Heritage and conservation', 'Landscape architecture', 'Housing and community'],
};
const subjectsOf = (d) => SUBJECTS[d] || GENERIC_SUBJECTS;
const FIRST = ['A.', 'R.', 'S.', 'M.', 'K.', 'P.', 'N.', 'V.', 'D.', 'L.', 'T.', 'J.'], LAST = ['Kumar', 'Sharma', 'Iyer', 'Mehta', 'Rao', 'Qureshi', 'Nair', 'Das', 'Malhotra', 'Singh', 'Verma', 'Gupta', 'Bose', 'Chandra', 'Fernandes', 'Haldar', 'Joshi', 'Menon'];
const TITLE_PATTERNS = {
  Books: (s) => [`Principles of ${s}`, `${s}: A Practical Handbook`, `Advances in ${s}`, `Introduction to ${s}`, `${s} in Practice`, `Foundations of ${s}`],
  Periodicals: (s) => [`Adoption of Modern Methods in ${s}: A Case Study`, `Effect of Management Practices on ${s} Outcomes`, `A Review of Recent Trends in ${s}`, `Challenges and Opportunities in ${s}`, `Comparative Study of Approaches to ${s}`, `${s}: Evidence from Field Studies`],
  Theses: (s) => [`Studies on ${s}: A Doctoral Thesis`, `Investigations into ${s}`, `${s}: A Comparative Analysis`],
};
const catCache = {};
function catalog(dept, type) {
  const key = dept + '|' + type; if (catCache[key]) return catCache[key];
  const subs = subjectsOf(dept), out = [];
  for (let i = 0; i < 40; i++) {
    const h = hash(key + i), s = subs[(i + (h % 3)) % subs.length], pats = TITLE_PATTERNS[type](s), n = 1 + (h % 3) % 2 + (h % 7 === 0 ? 1 : 0);
    const authors = Array.from({ length: n }, (_, k) => FIRST[(h >> k) % FIRST.length] + ' ' + LAST[(h + k * 5) % LAST.length]).join(', ');
    out.push({ id: key + '|' + i, title: pats[h % pats.length], author: authors, year: 2016 + (h % 10), subject: s, type, dept, pop: h % 1000, pages: 8 + (h % 22) });
  }
  return (catCache[key] = out);
}
const SIZES = ['Under 500', '500 – 2,000', '2,000 – 5,000', '5,000 – 15,000', 'Over 15,000'];

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
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

class Component extends DCLogic {
  constructor(props) { super(props); this.state = this.initial(); }

  initial() {
    return {
      page: 'overview', dark: false, collapsed: false, navOpen: false, vw: window.innerWidth,
      p: 0, sec: 857, tick: 0, loading: true, premium: false, epoch: 0,
      metric: 'sessions', range: '7d', hover: null, donutHover: -1, dismissed: false,
      feed: [{ id: -20, who: 'Ananya Rao', title: 'Journal of Design Thinking' }, { id: -45, who: 'Meera Iyer', title: 'Agricultural Science and Technology' }], feedOn: true,
      members: MEMBERS.map((m) => ({ ...m })), mq: '', mType: 'all', mEng: 'all', msort: 'name', msel: [], mopen: null,
      layer: null, fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, acct: 'Faculty', desig: '', ferr: {},
      lq: '', lview: 'grid', lsort: 'az', panel: null,
      libView: 'depts', libDept: null, gq: '', dq: '', exDept: 'all', exType: 'all', exSubjects: [], exSubQ: '', exQ: '', exSort: 'az', exShown: 12, exFilters: false, reader: null, readerPage: 1, saved: [], peek: false, heat: 'Hover or focus a block to see the numbers',
      held: [...HELD0], sel: [...HELD0], sq: '', sgroup: 'all', step: 1, processing: false, paid: null, shownTotal: totalFor(4), target: 0,
      prof: { contact: 'Digital Marketing', phone: '', city: 'Uttar Pradesh', website: '', address: '', courses: '', totalCourses: '', size: '' }, profSaved: null,
      feedbacks: [], fbRating: 0, fbCat: 'General', fbMsg: '', fbErr: {},
      palette: false, pq: '', pidx: 0, notif: false, notifRead: false, ctl: false, toast: '', toastLabel: '', toastAct: null, tip: null,
    };
  }

  componentDidMount() {
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.setState((s) => ({ profSaved: { ...s.prof } }));
    this.afterLoad(800);
    this.timer = setInterval(() => this.setState((s) => {
      const tick = s.tick + 1; let feed = s.feed;
      if (s.feedOn && tick % 8 === 0) { const r = MEMBERS.filter((m) => m.items.length), m = r[tick % r.length]; feed = [{ id: tick, who: m.name, title: m.items[tick % m.items.length] }, ...s.feed].slice(0, 5); }
      return { tick, feed, sec: s.premium ? s.sec : (s.sec > 0 ? s.sec - 1 : 1800) };
    }), 1000);
    this.onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); this.openLayer({ palette: true, pq: '', pidx: 0, notif: false, ctl: false }); }
      else if (e.key === 'Escape') this.closeLayers();
    };
    this.onResize = () => { cancelAnimationFrame(this.rz); this.rz = requestAnimationFrame(() => { const vw = window.innerWidth; if (vw !== this.state.vw) this.setState({ vw, navOpen: vw >= 1100 ? false : this.state.navOpen }); }); };
    window.addEventListener('keydown', this.onKey); window.addEventListener('resize', this.onResize);
  }
  componentWillUnmount() { clearInterval(this.timer); cancelAnimationFrame(this.raf); cancelAnimationFrame(this.raf2); cancelAnimationFrame(this.rz); clearTimeout(this.lt); clearTimeout(this.tt); window.removeEventListener('keydown', this.onKey); window.removeEventListener('resize', this.onResize); }

  // ---- motion helpers (everything plays once; reduced motion skips it) ----
  afterLoad(ms) { clearTimeout(this.lt); this.setState({ loading: true, p: 0 }); this.lt = setTimeout(() => { this.setState({ loading: false }); this.startCount(); }, this.reduce ? 0 : ms); }
  startCount() {
    cancelAnimationFrame(this.raf);
    if (this.reduce) { this.setState({ p: 1 }); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1100); this.setState({ p: k }); if (k < 1) this.raf = requestAnimationFrame(step); };
    this.setState({ p: 0 }); this.raf = requestAnimationFrame(step);
  }
  tweenTotal(target) {
    cancelAnimationFrame(this.raf2);
    const from = this.state.shownTotal;
    if (this.reduce) { this.setState({ shownTotal: target }); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 500), e = 1 - Math.pow(1 - k, 3); this.setState({ shownTotal: Math.round(from + (target - from) * e) }); if (k < 1) this.raf2 = requestAnimationFrame(step); };
    this.raf2 = requestAnimationFrame(step);
  }

  // ---- library navigation: departments -> a department's content types -> filtered results -> reader ----
  libNav(extra) { this.setState({ panel: null, reader: null, ...extra }); this.afterLoad(320); window.scrollTo(0, 0); setTimeout(() => { const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }, 0); }
  openDept(d) { this.libNav({ libView: 'dept', libDept: d, dq: '' }); }
  browse(d, type, extra) { this.libNav({ libView: 'explore', exDept: d, exType: type || 'all', exSubjects: [], exSubQ: '', exQ: '', exSort: 'az', exShown: 12, exFilters: false, ...(extra || {}) }); }
  openReader(item) { this.opener = document.activeElement; this.setState({ reader: item, readerPage: 1 }); }

  // ---- navigation, layers, focus ----
  go(page, extra) {
    this.setState({ page, layer: null, panel: null, reader: null, palette: false, notif: false, ctl: false, navOpen: false, tip: null, ...(page === 'library' ? { libView: 'depts', libDept: null } : {}), ...(extra || {}) });
    this.afterLoad(450);
    window.scrollTo(0, 0);
    setTimeout(() => { const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }, 0);
  }
  openLayer(extra) { this.opener = document.activeElement; this.setState(extra); }
  closeLayers() {
    const s = this.state;
    if (!(s.palette || s.layer || s.panel || s.reader || s.navOpen || s.notif || s.ctl)) return;
    const had = s.palette || s.layer || s.panel || s.reader || s.navOpen;
    this.setState({ palette: false, layer: null, panel: null, reader: null, navOpen: false, notif: false, ctl: false });
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
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
  say(msg, label, act) { this.setState({ toast: msg, toastLabel: label || '', toastAct: act || null }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: '', toastAct: null }), act ? 5200 : 2600); }
  showTip(text, ev) { const r = ev.currentTarget.getBoundingClientRect(); this.setState({ tip: { text, y: Math.round(r.top + r.height / 2) } }); }

  // ---- members ----
  remind(ids) {
    let n = 0;
    const members = this.state.members.map((m) => { if (ids.includes(m.id) && m.status !== 'Reading' && !m.reminded) { n++; return { ...m, reminded: true }; } return m; });
    this.setState({ members, msel: [] });
    this.say(n ? 'Reminder sent to ' + n + (n === 1 ? ' member' : ' members') : 'They have all been reminded already');
  }
  removeIds(ids) {
    const removed = this.state.members.map((m, i) => ({ m, i })).filter((x) => ids.includes(x.m.id));
    this.setState({ members: this.state.members.filter((m) => !ids.includes(m.id)), msel: [], mopen: null });
    this.say(removed.length === 1 ? removed[0].m.name + ' was removed' : removed.length + ' members were removed', 'Undo', () => {
      const list = [...this.state.members]; removed.forEach((x) => list.splice(x.i, 0, x.m)); this.setState({ members: list, toast: '' });
    });
  }
  submitUser() {
    const s = this.state, ferr = {};
    if (!s.fName.trim()) ferr.name = 'Please enter the full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.fEmail.trim())) ferr.email = 'Please enter a valid email address.';
    else if (s.members.some((m) => m.email.toLowerCase() === s.fEmail.trim().toLowerCase())) ferr.email = 'This email is already a member.';
    if (s.fMobile.trim() && !/^\+?[\d\s()-]{8,16}$/.test(s.fMobile.trim())) ferr.mobile = 'Please enter a valid mobile number.';
    if (!s.desig) ferr.desig = 'Please choose a professional designation.';
    if (s.fPass.length < 8) ferr.pass = 'The temporary password needs at least 8 characters.';
    if (Object.keys(ferr).length) { this.setState({ ferr }); const first = document.querySelector('.drawer .field.err .inp'); if (first) first.focus(); return; }
    const m = { id: 'n' + Date.now(), name: s.fName.trim(), email: s.fEmail.trim(), type: s.acct, desig: s.desig, mobile: s.fMobile.trim(), branch: s.fBranch.trim(), dept: s.fDept.trim(), status: 'Invited', sessions: 0, last: 'Invited just now', rank: 7, items: [], fresh: true };
    this.setState({ members: [m, ...s.members], ferr: {}, mq: '', mType: 'all', mEng: 'all' });
    this.closeLayers(); this.go('users'); this.say(m.name + ' was invited');
    setTimeout(() => this.setState((st) => ({ members: st.members.map((x) => ({ ...x, fresh: false })) })), 2600);
  }
  submitFeedback() {
    const s = this.state, fbErr = {};
    if (!s.fbRating) fbErr.rating = 'Please choose a rating.';
    if (s.fbMsg.trim().length < 10) fbErr.msg = 'Please write at least a short sentence (10 characters).';
    if (Object.keys(fbErr).length) { this.setState({ fbErr }); return; }
    const d = new Date();
    this.setState({ feedbacks: [{ id: 'f' + Date.now(), rating: s.fbRating, cat: s.fbCat, msg: s.fbMsg.trim(), date: d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() }, ...s.feedbacks], fbErr: {} });
    this.closeLayers(); this.say('Thank you. Your feedback was saved.');
  }

  // ---- subscription ----
  toggleDept(name) { const sel = this.state.sel.includes(name) ? this.state.sel.filter((d) => d !== name) : [...this.state.sel, name]; this.setState({ sel }); this.tweenTotal(totalFor(sel.length)); }
  toggleGroup(names) { const all = names.every((n) => this.state.sel.includes(n)); const sel = all ? this.state.sel.filter((d) => !names.includes(d)) : [...new Set([...this.state.sel, ...names])]; this.setState({ sel }); this.tweenTotal(totalFor(sel.length)); }
  pay() { const n = this.state.sel.length; this.setState({ processing: true, step: 3 }); setTimeout(() => this.setState({ processing: false, premium: true, held: [...this.state.sel], paid: { n, total: totalFor(n) } }), this.reduce ? 0 : 1500); }
  resetAll() { this.setState({ ...this.initial(), profSaved: { ...this.initial().prof }, epoch: this.state.epoch + 1, dark: this.state.dark, collapsed: this.state.collapsed }); this.afterLoad(700); this.say('Prototype reset'); }

  renderVals() {
    const s = this.state, e = 1 - Math.pow(1 - s.p, 3), page = s.page, ready = !s.loading;
    const mode = s.vw >= 1100 ? 'desktop' : s.vw >= 768 ? 'rail' : 'mobile';
    const narrow = (mode === 'desktop' && s.collapsed) || (mode === 'rail' && !s.navOpen);
    const clock = String(Math.floor(s.sec / 60)).padStart(2, '0') + ':' + String(s.sec % 60).padStart(2, '0');
    const readN = s.members.filter((m) => m.status === 'Reading').length;
    const pending = s.members.filter((m) => m.status !== 'Reading' && !m.reminded).length, reminded = s.members.filter((m) => m.status !== 'Reading' && m.reminded).length;
    const notStarted = s.members.filter((m) => m.status === 'Not started').length, invited = s.members.filter((m) => m.status === 'Invited').length;
    const yetToStart = s.members.length - readN;
    const heldTotal = s.held.reduce((a, d) => a + TOTAL[d], 0);
    const renewal = (() => { const d = new Date(); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + (d.getFullYear() + 1); })();
    const navItem = ([k, l, ic]) => ({ k, label: l, icon: ic, cls: 'nav' + (page === k ? ' active' : ''), cur: page === k ? 'page' : undefined, go: () => this.go(k), hasBadge: k === 'users' && pending > 0, badge: pending,
      enter: (ev) => { if (narrow) this.showTip(l, ev); }, leave: () => this.setState({ tip: null }) });
    const v = {
      themeCls: s.dark ? 'dark' : '', isDark: s.dark, isLight: !s.dark, mw: mode === 'desktop' ? (s.collapsed ? 72 : 240) : mode === 'rail' ? 72 : 0,
      sideCls: 'side ' + mode + (narrow ? ' narrow' : '') + (s.collapsed && mode === 'desktop' ? ' collapsed' : '') + (s.navOpen ? ' open' : ''),
      isMobile: mode === 'mobile', sideHidden: mode === 'mobile' && !s.navOpen, showSideScrim: s.navOpen && mode !== 'desktop',
      toggleSide: () => { if (mode === 'desktop') this.setState({ collapsed: !s.collapsed, tip: null }); else if (s.navOpen) this.closeLayers(); else this.openNavDrawer(); },
      sideToggleLabel: mode === 'desktop' ? (s.collapsed ? 'Expand the sidebar' : 'Collapse the sidebar') : (s.navOpen ? 'Close the menu' : 'Open the menu'),
      sideToggleIcon: mode === 'desktop' ? (s.collapsed ? 'chevr' : 'chevl') : (s.navOpen ? 'x' : 'menu'),
      openNav: () => this.openNavDrawer(), closeNav: () => this.closeLayers(),
      navMain: NAV.map(navItem), navAcct: NAV2.map(navItem), signOut: () => this.say('Prototype: sign out is not connected'),
      tip: !!s.tip && narrow, tipStyle: s.tip ? 'top:' + s.tip.y + 'px' : '', tipText: s.tip ? s.tip.text : '',
      pageTitle: TITLES[page], page, clock, premium: s.premium, free: !s.premium, isLoading: s.loading, epochKey: 'e' + s.epoch + page, renewal,
      planChip: s.premium ? 'Premium Institutional Access' : 'Free Institutional Preview',
      sideKey: (ev) => { if (mode !== 'desktop' && s.navOpen) this.trap(ev); },
      signEnter: (ev) => { if (narrow) this.showTip('Sign Out', ev); }, signLeave: () => this.setState({ tip: null }),
      isOverview: page === 'overview' && ready, isUsers: page === 'users' && ready, isLibrary: page === 'library' && ready, isAnalytics: page === 'analytics' && ready, isSubs: page === 'subs' && ready, isProfile: page === 'profile' && ready, isFeedbacks: page === 'feedbacks' && ready,
      toggleTheme: () => this.setState({ dark: !s.dark }), themeLabel: s.dark ? 'Switch to light mode' : 'Switch to dark mode', themeIcon: s.dark ? 'sun' : 'moon',
      goOverview: () => this.go('overview'), goUsers: () => this.go('users'), goAnalytics: () => this.go('analytics'), goLibrary: () => this.go('library'), goSubs: () => this.go('subs'), goProfile: () => this.go('profile'), goFeedbacks: () => this.go('feedbacks'),
      // layers
      toast: s.toast, toastLabel: s.toastLabel, hasToastAct: !!s.toastAct, toastAct: () => { const f = s.toastAct; if (f) f(); },
      palette: s.palette, openPalette: () => this.openLayer({ palette: true, pq: '', pidx: 0, notif: false, ctl: false }), closePalette: () => this.closeLayers(),
      notif: s.notif, unread: !s.notifRead, toggleNotif: () => this.setState({ notif: !s.notif, ctl: false, notifRead: true }), markRead: () => this.setState({ notifRead: true, notif: false }),
      notifs: NOTIFS.map((n) => ({ ...n, cls: s.notifRead ? 'sub' : '' })), popsOpen: s.notif || s.ctl, closePops: () => this.setState({ notif: false, ctl: false }),
      ctl: s.ctl, toggleCtl: () => this.setState({ ctl: !s.ctl, notif: false }),
      ctlPremium: () => this.setState({ premium: !s.premium, ctl: false }), ctlPremiumLabel: s.premium ? 'Switch to Free Preview' : 'Switch to Premium', ctlPremiumNow: s.premium ? 'Premium active' : 'Free Preview active',
      ctlReplay: () => { this.setState({ epoch: s.epoch + 1, ctl: false }); this.afterLoad(600); }, ctlReset: () => { this.resetAll(); this.setState({ ctl: false }); },
      ctlFeed: () => this.setState({ feedOn: !s.feedOn }), feedOn: s.feedOn, feedSwitchCls: 'switch' + (s.feedOn ? ' on' : ''),
      drawerUser: s.layer === 'user', drawerFeedback: s.layer === 'feedback', hasDrawer: !!s.layer, closeDrawer: () => this.closeLayers(), trap: (ev) => this.trap(ev),
      openAddUser: () => this.openLayer({ layer: 'user', fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, desig: '', acct: 'Faculty', ferr: {} }),
      openAddFeedback: () => this.openLayer({ layer: 'feedback', fbRating: 0, fbCat: 'General', fbMsg: '', fbErr: {} }),
    };

    // ---- command palette ----
    if (s.palette) {
      const q = s.pq.trim().toLowerCase(), items = [];
      [...NAV, ...NAV2].forEach(([k, l]) => items.push({ kind: 'Page', label: l, sub: 'Open ' + l.toLowerCase(), run: () => this.go(k) }));
      s.held.forEach((d) => items.push({ kind: 'Department', label: d, sub: IN(TOTAL[d]) + ' resources', run: () => this.go('library', { libView: 'dept', libDept: d }) }));
      s.members.forEach((m) => items.push({ kind: 'Member', label: m.name, sub: m.email, run: () => this.go('users', { mq: m.name, mType: 'all', mEng: 'all' }) }));
      const found = (q ? items.filter((i) => (i.label + ' ' + i.sub).toLowerCase().includes(q)) : items.slice(0, 9)).slice(0, 9);
      const idx = Math.min(s.pidx, Math.max(found.length - 1, 0));
      v.pq = s.pq; v.setPq = (ev) => this.setState({ pq: ev.target.value, pidx: 0 });
      v.palItems = found.map((it, i) => ({ ...it, key: it.kind + it.label, id: 'pal-' + i, sel: i === idx, cls: 'pal-item' + (i === idx ? ' on' : ''), pick: () => it.run(), hover: () => this.setState({ pidx: i }) }));
      v.palEmpty = found.length === 0; v.palActive = found.length ? 'pal-' + idx : undefined;
      v.palKey = (ev) => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); this.setState({ pidx: Math.min(idx + 1, found.length - 1) }); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.setState({ pidx: Math.max(idx - 1, 0) }); }
        else if (ev.key === 'Enter' && found[idx]) { ev.preventDefault(); found[idx].run(); }
        else this.trap(ev);
      };
    }

    if (!ready) return v;

    // ---- shared chart (overview and analytics) ----
    const chart = () => {
      const ser = series(s.metric, s.range), vals = ser.vals, n = vals.length, m0 = Math.max(...vals);
      const stepY = m0 > 40 ? 10 : m0 > 20 ? 5 : 2, max = Math.max(4, Math.ceil(m0 / stepY) * stepY), W = 600, H = 200, pad = 14;
      const pts = vals.map((x, i) => [((i + 0.5) / n) * W, H - pad - (x / max) * (H - pad * 2)]), lineD = smooth(pts);
      const unit = s.metric === 'sessions' ? 'sessions' : s.metric === 'hours' ? 'hours' : 'active readers', sum = vals.reduce((a, b) => a + b, 0);
      v.lineD = lineD; v.areaD = lineD + ' L' + pts[n - 1][0].toFixed(1) + ',' + H + ' L' + pts[0][0].toFixed(1) + ',' + H + ' Z'; v.chartKey = s.metric + s.range + s.epoch + page;
      v.chartTotal = s.metric === 'readers' ? 'Peak ' + Math.max(...vals) + ' readers' : (Math.round(sum * 10) / 10) + ' ' + unit + ' in total';
      v.chartAvg = 'avg ' + (Math.round((sum / n) * 10) / 10) + ' per ' + (s.range === '90d' ? 'week' : 'day');
      v.grid = [0, 0.25, 0.5, 0.75, 1].map((f) => { const top = ((H - pad - f * (H - pad * 2)) / H) * 100; return { style: 'top:' + top + '%', label: String(Math.round(max * f * 10) / 10) }; });
      v.hits = vals.map((x, i) => ({ style: 'left:' + (i / n) * 100 + '%;width:' + 100 / n + '%', enter: () => this.setState({ hover: i }), key: v.chartKey + i, label: ser.names[i] + ': ' + x + ' ' + unit }));
      v.xlabels = ser.labels.map((l) => ({ l }));
      v.hasHover = s.hover != null && s.hover < n;
      if (v.hasHover) { const hx = ((s.hover + 0.5) / n) * 100, hy = (pts[s.hover][1] / H) * 100; v.crossStyle = 'left:' + hx + '%'; v.ptStyle = 'left:' + hx + '%;top:' + hy + '%'; v.tipPos = 'left:' + Math.min(Math.max(hx, 14), 86) + '%;top:' + hy + '%'; v.tipLabel = ser.names[s.hover] + ' · ' + vals[s.hover] + ' ' + unit; }
      v.clearHover = () => this.setState({ hover: null });
      v.metrics = [['sessions', 'Sessions'], ['hours', 'Reading time'], ['readers', 'Readers']].map(([k, l]) => ({ l, cls: s.metric === k ? 'on' : '', on: s.metric === k, pick: () => this.setState({ metric: k, hover: null }) }));
      v.ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']].map(([k, l]) => ({ l, cls: s.range === k ? 'on' : '', on: s.range === k, pick: () => this.setState({ range: k, hover: null }) }));
    };
    const donut = () => {
      const cnt = [s.members.filter((m) => m.sessions >= 8).length, s.members.filter((m) => m.sessions > 0 && m.sessions < 8).length, s.members.filter((m) => m.sessions === 0).length];
      const tot = Math.max(1, cnt[0] + cnt[1] + cnt[2]), C = 314.16; let cum = 0;
      const dn = [['Active', 'var(--s1)', 'reading', 'Read 8 or more sessions this month'], ['Occasional', 'var(--s3)', 'reading', 'Read 1 to 7 sessions this month'], ['Not started', 'var(--line-2)', 'notstarted', 'Have not opened the library']];
      v.donut = dn.map(([label, color, f, desc], i) => {
        const len = Math.max(0, (cnt[i] / tot) * C - (cnt[i] > 0 ? 4 : 0)), off = -cum; cum += (cnt[i] / tot) * C;
        return { label, color, desc, count: cnt[i], da: (len * e).toFixed(1) + ' ' + C, off: off.toFixed(1), cls: 'donut' + (s.donutHover >= 0 && s.donutHover !== i ? ' dim' : ''),
          enter: () => this.setState({ donutHover: i }), leave: () => this.setState({ donutHover: -1 }), pick: () => this.go('users', { mEng: f }), dot: 'background:' + color };
      });
      const hv = s.donutHover;
      v.donutBig = hv >= 0 ? String(cnt[hv]) : String(Math.round((readN / Math.max(1, s.members.length)) * 100 * e)) + '%';
      v.donutSmall = hv >= 0 ? dn[hv][0].toLowerCase() : 'reading';
    };

    // ---- overview ----
    if (page === 'overview') {
      const done = [true, true, s.members.length > 0, s.premium], nDone = done.filter(Boolean).length;
      v.kItems = IN(Math.round(heldTotal * e)); v.kDepts = String(Math.round(s.held.length * e)); v.kMembers = String(Math.round(s.members.length * e));
      v.itemsStatic = IN(heldTotal); v.deptsStatic = String(s.held.length);
      v.membersLine = readN + ' reading · ' + yetToStart + ' yet to start';
      v.setupCount = nDone + ' / 4 complete'; v.setupPct = 'width:' + (nDone / 4) * 100 * e + '%';
      v.steps = [['Departments selected', () => this.go('library')], ['Institution profile completed', () => this.go('profile')], ['Members added', () => this.go('users')], ['Upgrade to Premium', () => this.go('subs')]].map(([label, go], i) => ({ label, go, done: done[i], cls: 'step' + (done[i] ? ' done' : ''), status: done[i] ? 'Complete' : 'To do' }));
      v.bannerWarn = !s.dismissed && pending > 0; v.bannerSent = !s.dismissed && pending === 0 && reminded > 0;
      v.pendingText = pending + (pending === 1 ? ' member has' : ' members have') + ' not opened the library yet.';
      v.sendReminders = () => this.remind(s.members.map((m) => m.id)); v.dismissBanner = () => this.setState({ dismissed: true });
      v.pips = [0, 1, 2, 3].map((i) => ({ cls: i < 1 ? 'on' : '' }));
      v.sessionsLine = '1 of 4 sessions used today';
      chart(); donut();
      v.quick = [['Manage users', 'Add, remind and organise members', 'users', () => this.go('users')], ['Browse library', 'Open the departments you hold', 'book', () => this.go('library')], ['View analytics', 'See who reads and when', 'activity', () => this.go('analytics')], ['Manage subscription', 'Plan, departments and pricing', 'card', () => this.go('subs')]].map(([t, d, ic, go], i) => ({ t, d, ic, go, delay: 'animation-delay:' + i * 40 + 'ms' }));
      v.newest = NEWEST.filter((n) => s.held.includes(n.dept)).concat(NEWEST.filter((n) => !s.held.includes(n.dept))).slice(0, 5).map((n, i) => ({ ...n, key: n.title, delay: 'animation-delay:' + i * 40 + 'ms', open: () => this.say('Prototype: "' + n.title + '" would open in the reader') }));
    }

    // ---- users ----
    if (page === 'users') {
      const q = s.mq.trim().toLowerCase(), key = (m) => (m.status === 'Reading' ? 'reading' : m.status === 'Invited' ? 'invited' : 'notstarted');
      let list = s.members.filter((m) => (s.mType === 'all' || m.type === s.mType) && (s.mEng === 'all' || key(m) === s.mEng) && (!q || (m.name + ' ' + m.email + ' ' + m.desig).toLowerCase().includes(q)));
      list = list.slice().sort((a, b) => (s.msort === 'name' ? a.name.localeCompare(b.name) : s.msort === 'active' ? a.rank - b.rank : b.sessions - a.sessions));
      v.mq = s.mq; v.setMq = (ev) => this.setState({ mq: ev.target.value });
      v.mType = s.mType; v.setMType = (ev) => this.setState({ mType: ev.target.value });
      v.mEng = s.mEng; v.setMEng = (ev) => this.setState({ mEng: ev.target.value });
      v.msort = s.msort; v.setMSort = (ev) => this.setState({ msort: ev.target.value });
      const stat = (label, n, f, tone) => ({ label, n: String(Math.round(n * e)), tone, on: s.mEng === f && s.mType === 'all', pick: () => this.setState({ mEng: f, mType: 'all' }) });
      v.stats = [stat('Total Members', s.members.length, 'all', ''), stat('Active Readers', readN, 'reading', 'teal'), stat('Not Started', notStarted, 'notstarted', 'warn'), stat('Invited', invited, 'invited', 'info')].map((x, i) => ({ ...x, cls: 'card mini-stat rise' + (x.on ? ' on' : ''), delay: 'animation-delay:' + i * 40 + 'ms' }));
      const allSel = list.length > 0 && list.every((m) => s.msel.includes(m.id));
      v.allCls = 'cb' + (allSel ? ' on' : ''); v.allOn = allSel;
      v.toggleAll = () => this.setState({ msel: allSel ? s.msel.filter((id) => !list.some((m) => m.id === id)) : [...new Set([...s.msel, ...list.map((m) => m.id)])] });
      v.members = list.map((m, i) => {
        const sel = s.msel.includes(m.id), open = s.mopen === m.id, st = m.status === 'Reading' ? 'Reading' : m.reminded ? 'Reminded' : m.status;
        return {
          ...m, key: m.id, ini: m.name.split(' ').map((w) => w[0]).slice(0, 2).join(''), eng: st, engCls: 'tag ' + (st === 'Reading' ? 'teal' : st === 'Reminded' ? 'info' : st === 'Invited' ? 'info' : 'warn'),
          engIcon: st === 'Reading' ? 'check' : st === 'Not started' ? 'clock' : 'mail',
          rowStyle: 'animation-delay:' + Math.min(i, 6) * 30 + 'ms' + (m.fresh ? ';background:var(--blue-soft)' : ''), cbCls: 'cb' + (sel ? ' on' : ''), sel,
          toggle: () => this.setState({ msel: sel ? s.msel.filter((x) => x !== m.id) : [...s.msel, m.id] }), open, expand: () => this.setState({ mopen: open ? null : m.id }),
          chev: open ? 'chevd' : 'chevr', canRemind: m.status !== 'Reading', remindLabel: m.reminded ? 'Reminded' : m.status === 'Invited' ? 'Resend invite' : 'Remind', remindOff: !!m.reminded,
          remind: () => this.remind([m.id]), remove: () => this.removeIds([m.id]), hasContact: !!(m.mobile || m.branch || m.dept), contactLine: [m.mobile, m.branch, m.dept].filter(Boolean).join(' · '),
          itemList: m.items.length ? m.items : ['Nothing opened yet'],
        };
      });
      v.noMembers = list.length === 0; v.selCount = s.msel.length; v.hasSel = s.msel.length > 0; v.shownCount = list.length + ' of ' + s.members.length + ' members';
      v.remindSel = () => this.remind(s.msel); v.removeSel = () => this.removeIds(s.msel); v.clearSel = () => this.setState({ msel: [] });
      v.clearFilters = () => this.setState({ mq: '', mType: 'all', mEng: 'all' });
      v.toastImport = () => this.say('Prototype: import opens a file picker');
    }

    // ---- library: three views of one section ----
    if (page === 'library') {
      v.isLibDepts = s.libView === 'depts'; v.isLibDept = s.libView === 'dept'; v.isLibExplore = s.libView === 'explore';
      v.goLibDepts = () => this.libNav({ libView: 'depts', libDept: null });
      const typeLabel = (t) => (t === 'all' ? 'All content' : t);
      // ---- 1. departments ----
      if (s.libView === 'depts') {
        const q = s.lq.trim().toLowerCase();
        let list = s.held.filter((d) => !q || d.toLowerCase().includes(q));
        list = list.slice().sort((a, b) => (s.lsort === 'az' ? a.localeCompare(b) : TOTAL[b] - TOTAL[a]));
        v.lq = s.lq; v.setLq = (ev) => this.setState({ lq: ev.target.value }); v.lsort = s.lsort; v.setLSort = (ev) => this.setState({ lsort: ev.target.value });
        v.views = [['grid', 'Grid'], ['list', 'List']].map(([k, l]) => ({ l, cls: s.lview === k ? 'on' : '', on: s.lview === k, pick: () => this.setState({ lview: k }) }));
        v.isGrid = s.lview === 'grid'; v.isList = s.lview === 'list';
        v.libStats = [[IN(Math.round(s.held.length * e)), 'Departments'], [IN(Math.round(heldTotal * e)), 'Resources'], ['3', 'Content types'], [s.premium ? 'Full' : 'Preview', 'Access']].map(([n, l]) => ({ n, l }));
        v.gq = s.gq; v.setGq = (ev) => this.setState({ gq: ev.target.value });
        v.gSearch = () => this.browse('all', 'all', { exQ: s.gq.trim() });
        v.gKey = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); this.browse('all', 'all', { exQ: s.gq.trim() }); } };
        v.libDepts = list.map((d, i) => { const tc = typeCounts(d); return { key: d + s.lsort, name: d, total: IN(TOTAL[d]), delay: 'animation-delay:' + i * 40 + 'ms', open: () => this.openDept(d), quick: () => this.openLayer({ panel: d }),
          types: TYPES.map((t) => ({ t, n: IN(tc[t]), style: 'width:' + Math.max(3, (tc[t] / TOTAL[d]) * 100) + '%', dot: 'background:var(--' + ['s1', 's2', 's3'][TYPES.indexOf(t)] + ')' })),
          bar: TYPES.map((t, k) => ({ style: 'width:' + (tc[t] / TOTAL[d]) * 100 + '%;background:var(--' + ['s1', 's2', 's3'][k] + ')' })) }; });
        v.noLib = list.length === 0; v.libCount = list.length + (list.length === 1 ? ' department' : ' departments') + ' · ' + IN(list.reduce((a, d) => a + TOTAL[d], 0)) + ' resources';
      }
      // ---- 2. one department: its content types ----
      if (s.libView === 'dept' && s.libDept) {
        const d = s.libDept, tc = typeCounts(d);
        v.dName = d; v.dTotal = IN(TOTAL[d]); v.dUnlocked = '3 of 3 content types unlocked';
        v.dTypes = TYPES.map((t, i) => ({ t, icon: TYPE_INFO[t][0], desc: TYPE_INFO[t][1], n: IN(tc[t]), pct: Math.round((tc[t] / TOTAL[d]) * 100) + '% of this department', delay: 'animation-delay:' + i * 50 + 'ms', browse: () => this.browse(d, t) }));
        v.dq = s.dq; v.setDq = (ev) => this.setState({ dq: ev.target.value });
        v.dSearch = () => this.browse(d, 'all', { exQ: s.dq.trim() });
        v.dKey = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); this.browse(d, 'all', { exQ: s.dq.trim() }); } };
        v.browseAll = () => this.browse(d, 'all');
        v.dLatest = catalog(d, 'Periodicals').slice(0, 3).concat(catalog(d, 'Books').slice(0, 2)).map((it, i) => ({ ...it, key: it.id, delay: 'animation-delay:' + (80 + i * 40) + 'ms', open: () => this.openReader(it) }));
      }
      // ---- 3. results with filters ----
      if (s.libView === 'explore') {
        const depts = s.exDept === 'all' ? s.held : [s.exDept], types = s.exType === 'all' ? TYPES : [s.exType];
        const sample = depts.flatMap((d) => types.flatMap((t) => catalog(d, t)));
        const grand = depts.reduce((a, d) => a + types.reduce((b, t) => b + typeCounts(d)[t], 0), 0);
        const q = s.exQ.trim().toLowerCase();
        let rows = sample.filter((it) => (!s.exSubjects.length || s.exSubjects.includes(it.subject)) && (!q || (it.title + ' ' + it.author).toLowerCase().includes(q)));
        rows = rows.slice().sort((a, b) => (s.exSort === 'az' ? a.title.localeCompare(b.title) : s.exSort === 'new' ? b.year - a.year || a.title.localeCompare(b.title) : b.pop - a.pop));
        const est = rows.length === sample.length ? grand : rows.length ? Math.max(rows.length, Math.round((grand * rows.length) / sample.length)) : 0;
        v.exCount = IN(est); v.exNone = rows.length === 0; v.exShownText = 'Showing ' + Math.min(s.exShown, rows.length) + ' of ' + IN(est);
        v.exTitle = s.exDept === 'all' ? 'All departments' : s.exDept; v.exTypeLabel = typeLabel(s.exType);
        v.exHeading = (s.exType === 'all' ? (s.exQ.trim() && s.exDept === 'all' ? 'Search results' : 'All content') : s.exType) + (s.exDept === 'all' ? (s.exQ.trim() && s.exType === 'all' ? ' across your library' : ' across all departments') : ' in ' + s.exDept);
        v.exDept = s.exDept; v.setExDept = (ev) => this.setState({ exDept: ev.target.value, exSubjects: [], exShown: 12 });
        v.exType = s.exType; v.setExType = (ev) => this.setState({ exType: ev.target.value, exShown: 12 });
        v.exSort = s.exSort; v.setExSort = (ev) => this.setState({ exSort: ev.target.value });
        v.exDeptOpts = [{ v: 'all', l: 'All departments' }, ...s.held.map((d) => ({ v: d, l: d }))];
        v.exTypeOpts = [{ v: 'all', l: 'All content types' }, ...TYPES.map((t) => ({ v: t, l: t }))];
        v.exQ = s.exQ; v.setExQ = (ev) => this.setState({ exQ: ev.target.value, exShown: 12 });
        const allSubs = [...new Set(depts.flatMap(subjectsOf))].sort((a, b) => a.localeCompare(b)), sq = s.exSubQ.trim().toLowerCase();
        v.exSubQ = s.exSubQ; v.setExSubQ = (ev) => this.setState({ exSubQ: ev.target.value });
        v.subjects = allSubs.filter((x) => !sq || x.toLowerCase().includes(sq)).map((x) => { const on = s.exSubjects.includes(x); return { key: x, name: x, on, cls: 'cb' + (on ? ' on' : ''), toggle: () => this.setState({ exSubjects: on ? s.exSubjects.filter((y) => y !== x) : [...s.exSubjects, x], exShown: 12 }) }; });
        v.noSubjects = v.subjects.length === 0;
        const chips = [];
        if (s.exDept !== 'all') chips.push({ k: 'd', l: s.exDept, rm: () => this.setState({ exDept: 'all', exSubjects: [], exShown: 12 }) });
        if (s.exType !== 'all') chips.push({ k: 't', l: s.exType, rm: () => this.setState({ exType: 'all', exShown: 12 }) });
        s.exSubjects.forEach((x) => chips.push({ k: 's' + x, l: x, rm: () => this.setState({ exSubjects: s.exSubjects.filter((y) => y !== x) }) }));
        if (q) chips.push({ k: 'q', l: '“' + s.exQ.trim() + '”', rm: () => this.setState({ exQ: '' }) });
        v.chips = chips; v.hasChips = chips.length > 0; v.filterCount = chips.length;
        v.clearAll = () => this.setState({ exDept: 'all', exType: 'all', exSubjects: [], exSubQ: '', exQ: '', exShown: 12 });
        v.results = rows.slice(0, s.exShown).map((it, i) => { const sv = s.saved.includes(it.id); return { ...it, key: it.id, no: i + 1, delay: 'animation-delay:' + Math.min(i, 11) * 25 + 'ms', typeOne: it.type === 'Books' ? 'Book' : it.type === 'Theses' ? 'Thesis' : 'Article', read: () => this.openReader(it), saved: sv, starStyle: sv ? 'fill:currentColor;color:var(--gold)' : 'fill:none;color:var(--muted)', saveLabel: (sv ? 'Remove from collection: ' : 'Save to collection: ') + it.title, save: () => this.setState({ saved: sv ? s.saved.filter((x) => x !== it.id) : [...s.saved, it.id] }) }; });
        v.hasMore = rows.length > s.exShown; v.more = () => this.setState({ exShown: s.exShown + 12 }); v.moreText = 'Show ' + Math.min(12, rows.length - s.exShown) + ' more results';
        v.exFiltersOpen = s.exFilters; v.toggleFilters = () => this.setState({ exFilters: !s.exFilters }); v.filtersCls = 'filters card' + (s.exFilters ? ' open' : '');
        v.backFromExplore = () => (s.exDept === 'all' ? this.libNav({ libView: 'depts', libDept: null }) : this.openDept(s.exDept));
        v.backLabel = s.exDept === 'all' ? 'Back to departments' : 'Back to ' + s.exDept;
        v.crumbDept = s.exDept !== 'all'; v.goDeptCrumb = () => this.openDept(s.exDept);
      }
      if (s.panel) {
        const sp = splitOf(s.panel), tot = TOTAL[s.panel];
        v.pName = s.panel; v.pTotal = IN(tot);
        v.pTypes = ['Articles', 'Books', 'Other'].map((l, k) => ({ l, n: IN(Math.round((tot * sp[k]) / 100)), pct: sp[k], style: 'width:' + sp[k] + '%;background:var(--' + ['s1', 's2', 's3'][k] + ');animation-delay:' + k * 80 + 'ms' }));
        v.pTitles = catalog(s.panel, 'Periodicals').slice(0, 3).map((it, i) => ({ t: it.title, kind: 'Article', delay: 'animation-delay:' + (100 + i * 50) + 'ms', open: () => { this.closeLayers(); this.openReader(it); } }));
        v.openInLibrary = () => { const d = s.panel; this.closeLayers(); this.openDept(d); };
      }
    }
    v.hasPanel = !!s.panel && page === 'library' && ready; v.closePanel = () => this.closeLayers();

    // ---- analytics ----
    if (page === 'analytics') {
      const unlocked = s.premium || s.peek;
      v.unlocked = unlocked; v.locked = !unlocked; v.peek = s.peek; v.togglePeek = () => this.setState({ peek: !s.peek });
      v.blurCls = 'stack' + (unlocked ? '' : ' lock-preview');
      v.aKpis = [['Active Readers', String(Math.round(readN * e)), 'Read this month'], ['Reading Sessions', String(Math.round(120 * e)), 'Last 7 days'], ['Reading Time', Math.round(78 * e) + ' h', 'Last 7 days'], ['Searches Without Results', String(Math.round(UNFOUND.reduce((a, x) => a + x[1], 0) * e)), 'Last 30 days']].map(([l, n, d], i) => ({ l, n, d, delay: 'animation-delay:' + i * 40 + 'ms' }));
      chart(); donut();
      const hours = ['6–8', '8–10', '10–12', '12–14', '14–16', '16–18', '18–20', '20–22'], days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      v.heatRows = days.map((d, r) => ({ d, cells: hours.map((h, c) => {
        const x = Math.sin(((c + 0.6) / hours.length) * Math.PI) * (r < 5 ? 1 : 0.45) * (0.55 + 0.45 * rnd(r * 9 + c)), n = Math.round(x * 9), txt = d + ' ' + h + ' h · ' + n + (n === 1 ? ' session' : ' sessions');
        return { style: 'background:color-mix(in srgb,var(--s1) ' + Math.round(8 + x * 88) + '%,var(--surface-2))', enter: () => this.setState({ heat: txt }), key: d + h, label: txt };
      }) }));
      v.heatHours = hours; v.heatText = s.heat;
      v.topRead = s.held.slice(0, 5).map((d, i) => ({ name: titlesOf(d)[0], dept: d, n: [38, 27, 19, 12, 9][i] || 5, style: 'width:' + ([38, 27, 19, 12, 9][i] || 5) * 2.4 + '%;background:var(--s1);animation-delay:' + i * 70 + 'ms' }));
      const dsum = s.held.reduce((a, d) => a + TOTAL[d], 0);
      v.deptAct = s.held.slice().sort((a, b) => TOTAL[b] - TOTAL[a]).slice(0, 5).map((d, i) => ({ name: d, pct: Math.round((TOTAL[d] / dsum) * 100), style: 'width:' + Math.round((TOTAL[d] / dsum) * 100) * 2 + '%;background:var(--blue);animation-delay:' + i * 70 + 'ms' }));
      v.unfound = UNFOUND.map(([q, n]) => ({ q, n }));
      v.feed = s.feed.map((f) => { const ago = s.tick - f.id; return { ...f, key: 'f' + f.id, ini: f.who.split(' ').map((w) => w[0]).join(''), when: f.id < 0 ? Math.round(-f.id / 20 * 3) + ' min ago' : ago < 5 ? 'just now' : ago < 60 ? ago + 's ago' : Math.floor(ago / 60) + ' min ago' }; });
      v.exportReport = () => this.say('Prototype: the report would download as PDF');
    }

    // ---- subscriptions ----
    if (page === 'subs') {
      const n = s.sel.length, unit = unitFor(n), sub = n * unit, gst = Math.round(sub * 0.18), q = s.sq.trim().toLowerCase();
      v.step1 = s.step === 1; v.step2 = s.step === 2; v.processing = s.processing; v.step3 = s.step === 3 && !s.processing && !!s.paid;
      v.stepper = ['Choose Departments', 'Review Order', 'Done'].map((l, i) => { const done = s.step > i + 1 || (!!s.paid && !s.processing); return { l, num: i + 1, cls: 'st' + (s.step === i + 1 ? ' on' : '') + (done ? ' done' : ''), done, notDone: !done, line: 'transform:scaleX(' + (s.step > i + 1 ? 1 : 0) + ')', showLine: i < 2, cur: s.step === i + 1 ? 'step' : undefined }; });
      v.sq = s.sq; v.setSq = (ev) => this.setState({ sq: ev.target.value });
      v.gtabs = [['all', 'All'], ...GROUPS.slice(0, 6).map(([g]) => [g, g.split(' & ')[0].split(',')[0]])].map(([k, l]) => ({ l, cls: 'chip sm' + (s.sgroup === k ? ' on' : ''), pressed: s.sgroup === k, pick: () => this.setState({ sgroup: k }) }));
      v.groups = GROUPS.filter(([g]) => s.sgroup === 'all' || s.sgroup === g).map(([g, ds]) => {
        const shown = ds.filter((d) => !q || d.toLowerCase().includes(q)), allOn = ds.every((d) => s.sel.includes(d)), c = ds.filter((d) => s.sel.includes(d)).length;
        return { key: g, g, count: c + ' of ' + ds.length, allLabel: allOn ? 'Clear group' : 'Select all', toggle: () => this.toggleGroup(ds), show: shown.length > 0,
          chips: shown.map((d) => ({ key: d, name: d, cls: 'chip' + (s.sel.includes(d) ? ' on' : ''), pressed: s.sel.includes(d), toggle: () => this.toggleDept(d) })) };
      }).filter((g) => g.show);
      v.noMatch = v.groups.length === 0;
      v.selCount = String(n); v.selWord = n === 1 ? 'department' : 'departments';
      const tiers = [[1, '1 Department', 9990], [2, '2 Departments', 9490], [3, '3 Departments', 8990], [4, '4 Departments', 8490], [5, '5+ Departments', 7990]];
      v.tiers = tiers.map(([k, l, p]) => ({ l, price: rupee(p), on: n > 0 && Math.min(n, 5) === k, cls: 'tier' + (n > 0 && Math.min(n, 5) === k ? ' on' : ''), cur: n > 0 && Math.min(n, 5) === k ? 'true' : undefined, pick: () => { this.setState({ target: k }); this.say(k === 5 ? 'Choose 5 or more departments for ' + rupee(7990) + ' each' : 'Choose ' + k + ' ' + (k === 1 ? 'department' : 'departments') + ' for ' + rupee(p) + ' each'); } }));
      v.unitPrice = n ? rupee(unit) : '—'; v.subtotal = rupee(sub); v.gst = rupee(gst); v.totalShown = rupee(s.shownTotal);
      const goal = s.target || 5;
      v.meterStyle = 'width:' + Math.min(100, (n / goal) * 100) + '%';
      v.nudge = n === 0 ? 'Choose at least one department to see your price.' : n < 5 ? 'Add ' + (5 - n) + ' more to reach the 5+ rate: ' + rupee(7990) + ' per department instead of ' + rupee(unit) + '.' : '5+ rate applied: ' + rupee(unitFor(1) - 7990) + ' less per department than a single one.';
      v.canContinue = n > 0; v.cantContinue = n === 0;
      v.tray = s.sel.map((d) => ({ key: d, name: d, remove: () => this.toggleDept(d) })); v.hasTray = n > 0;
      v.clearSel2 = () => { this.setState({ sel: [] }); this.tweenTotal(0); };
      v.toReview = () => this.setState({ step: 2 }); v.toChoose = () => this.setState({ step: 1 }); v.pay = () => this.pay();
      v.reviewRows = s.sel.map((d, i) => ({ key: d, name: d, price: rupee(unit), delay: 'animation-delay:' + Math.min(i, 8) * 30 + 'ms' }));
      v.confetti = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2, r = 90 + rnd(i) * 110; return { key: 'c' + i, style: '--cx:' + Math.round(Math.cos(a) * r) + 'px;--cy:' + Math.round(Math.sin(a) * r - 30) + 'px;--cr:' + Math.round(rnd(i + 3) * 540) + 'deg;background:' + ['var(--s1)', 'var(--blue)', 'var(--s3)', 'var(--gold)'][i % 4] + ';animation-delay:' + Math.round(rnd(i + 9) * 120) + 'ms' }; });
      v.paidText = s.paid ? s.paid.n + (s.paid.n === 1 ? ' department' : ' departments') + ' · ' + rupee(s.paid.total) + ' incl. GST' : '';
      v.talk = () => this.say('Prototype: this would open a contact form');
    }

    // ---- profile ----
    if (page === 'profile') {
      const f = (k) => ({ val: s.prof[k], set: (ev) => this.setState({ prof: { ...s.prof, [k]: ev.target.value } }) });
      v.pf = { contact: f('contact'), phone: f('phone'), city: f('city'), website: f('website'), address: f('address'), courses: f('courses'), totalCourses: f('totalCourses'), size: f('size') };
      const dirty = JSON.stringify(s.prof) !== JSON.stringify(s.profSaved);
      v.dirty = dirty; v.clean = !dirty; v.saveProfile = () => { this.setState({ profSaved: { ...s.prof } }); this.say('Institution profile saved'); };
      v.discardProfile = () => this.setState({ prof: { ...s.profSaved } });
      v.sizes = SIZES.map((x) => ({ x })); v.heldChips = s.held.map((d) => ({ d }));
    }

    // ---- feedbacks ----
    if (page === 'feedbacks') {
      v.fbList = s.feedbacks.map((f) => ({ ...f, stars: [1, 2, 3, 4, 5].map((n) => ({ n, style: n <= f.rating ? 'color:var(--gold)' : 'color:var(--line-2)' })), label: f.rating + ' out of 5' }));
      v.fbEmpty = s.feedbacks.length === 0; v.fbAny = s.feedbacks.length > 0;
    }

    // ---- drawers ----
    if (s.layer === 'user') {
      const clr = (k) => ({ ...s.ferr, [k]: undefined });
      v.fName = s.fName; v.fEmail = s.fEmail; v.fMobile = s.fMobile; v.fBranch = s.fBranch; v.fDept = s.fDept; v.fPass = s.fPass;
      v.setName = (ev) => this.setState({ fName: ev.target.value, ferr: clr('name') }); v.setEmail = (ev) => this.setState({ fEmail: ev.target.value, ferr: clr('email') });
      v.setMobile = (ev) => this.setState({ fMobile: ev.target.value, ferr: clr('mobile') }); v.setBranch = (ev) => this.setState({ fBranch: ev.target.value }); v.setDept = (ev) => this.setState({ fDept: ev.target.value });
      v.setPass = (ev) => this.setState({ fPass: ev.target.value, ferr: clr('pass') });
      v.showPass = s.showPass; v.hidePass = !s.showPass; v.passType = s.showPass ? 'text' : 'password'; v.passLabel = s.showPass ? 'Hide the password' : 'Show the password'; v.togglePass = () => this.setState({ showPass: !s.showPass });
      v.errName = s.ferr.name; v.errEmail = s.ferr.email; v.errMobile = s.ferr.mobile; v.errDesig = s.ferr.desig; v.errPass = s.ferr.pass;
      v.nameCls = 'field' + (s.ferr.name ? ' err' : ''); v.emailCls = 'field' + (s.ferr.email ? ' err' : ''); v.mobileCls = 'field' + (s.ferr.mobile ? ' err' : ''); v.passCls = 'field' + (s.ferr.pass ? ' err' : '');
      v.acctOpts = Object.keys(ACCT).map((name) => { const locked = name === 'Student' && !s.premium; return { name, locked, pressed: s.acct === name, cls: (s.acct === name ? 'on' : '') + (locked ? ' locked' : ''), pick: () => (locked ? this.say('Student accounts are part of Premium') : this.setState({ acct: name, desig: '', ferr: clr('desig') })) }; });
      v.desigOpts = ACCT[s.acct].map((name) => ({ name, pressed: s.desig === name, cls: 'chip' + (s.desig === name ? ' on' : ''), pick: () => this.setState({ desig: name, ferr: clr('desig') }) }));
      v.submitUser = () => this.submitUser();
    }
    if (s.layer === 'feedback') {
      v.stars = [1, 2, 3, 4, 5].map((n) => ({ n, first: n === 1, cls: n <= s.fbRating ? 'on' : '', label: n + (n === 1 ? ' star' : ' stars'), pressed: n === s.fbRating, pick: () => this.setState({ fbRating: n, fbErr: { ...s.fbErr, rating: undefined } }) }));
      v.fbCat = s.fbCat; v.setFbCat = (ev) => this.setState({ fbCat: ev.target.value });
      v.fbMsg = s.fbMsg; v.setFbMsg = (ev) => this.setState({ fbMsg: ev.target.value, fbErr: { ...s.fbErr, msg: undefined } });
      v.errRating = s.fbErr.rating; v.errMsg = s.fbErr.msg; v.msgCls = 'field' + (s.fbErr.msg ? ' err' : ''); v.submitFeedback = () => this.submitFeedback();
    }

    // ---- reader (the secure viewer) ----
    if (s.reader) {
      const it = s.reader, pages = it.pages, pg = Math.min(s.readerPage, pages);
      v.hasReader = true; v.rTitle = it.title; v.rMeta = it.author + ' · ' + it.year + ' · ' + it.dept; v.rType = it.type === 'Books' ? 'Book' : it.type === 'Theses' ? 'Thesis' : 'Article';
      v.rPage = pg; v.rPages = pages; v.rPageText = 'Page ' + pg + ' of ' + pages; v.rFirst = pg <= 1; v.rLast = pg >= pages;
      v.rPrev = () => this.setState({ readerPage: Math.max(1, pg - 1) }); v.rNext = () => this.setState({ readerPage: Math.min(pages, pg + 1) });
      v.rProgress = 'width:' + (pg / pages) * 100 + '%'; v.rKey = (ev) => { if (ev.key === 'ArrowRight') { ev.preventDefault(); this.setState({ readerPage: Math.min(pages, pg + 1) }); } else if (ev.key === 'ArrowLeft') { ev.preventDefault(); this.setState({ readerPage: Math.max(1, pg - 1) }); } else this.trap(ev); };
      let lines = []; for (let i = 0; i < 26; i++) { const r = rnd(pg * 97 + i + hash(it.id) % 50); lines.push({ key: pg + '-' + i, style: 'width:' + (i % 7 === 6 ? 38 + Math.round(r * 30) : 86 + Math.round(r * 14)) + '%', gap: i % 7 === 6 ? 'margin-bottom:22px' : '' }); }
      v.rLines = lines; v.rFirstPage = pg === 1;
      const sv = s.saved.includes(it.id); v.rSaved = sv; v.rStar = sv ? 'fill:currentColor;color:var(--gold)' : 'fill:none'; v.rSaveLabel = sv ? 'Saved' : 'Save'; v.rSave = () => this.setState({ saved: sv ? s.saved.filter((x) => x !== it.id) : [...s.saved, it.id] });
      v.rSession = s.premium ? 'Unlimited reading' : 'Session time left ' + clock; v.rClose = () => this.closeLayers();
    }
    return v;
  }
}
