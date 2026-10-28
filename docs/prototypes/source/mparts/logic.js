class Component extends DCLogic {
  constructor(props) { super(props); this.state = this.initial(); }
  initial() {
    return {
      tab: 'home', dark: false, p: 0, sec: 857, tick: 0, loading: true, premium: false, epoch: 0, metric: 'sessions', hover: null,
      feed: [{ id: -20, who: 'Ananya Rao', title: 'Journal of Design Thinking' }, { id: -45, who: 'Meera Iyer', title: 'Agricultural Science and Technology' }],
      members: MEMBERS.map((m) => ({ ...m })), mq: '', mfilter: 'all', lq: '', dismissed: false,
      sheet: null, panel: null, fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, acct: 'Faculty', desig: '', ferr: {},
      held: [...HELD0], sel: [...HELD0], sgroup: 'all', paid: null, shownTotal: totalFor(4),
      toast: '', toastLabel: '', toastAct: null,
    };
  }
  componentDidMount() {
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.afterLoad(700);
    this.timer = setInterval(() => this.setState((s) => {
      const tick = s.tick + 1; let feed = s.feed;
      if (tick % 7 === 0) { const r = MEMBERS.filter((m) => m.items.length), m = r[tick % r.length]; feed = [{ id: tick, who: m.name, title: m.items[tick % m.items.length] }, ...s.feed].slice(0, 4); }
      return { tick, feed, sec: s.premium ? s.sec : (s.sec > 0 ? s.sec - 1 : 1800) };
    }), 1000);
  }
  componentWillUnmount() { clearInterval(this.timer); cancelAnimationFrame(this.raf); cancelAnimationFrame(this.raf2); clearTimeout(this.lt); clearTimeout(this.tt); }
  afterLoad(ms) { clearTimeout(this.lt); this.setState({ loading: true, p: 0 }); this.lt = setTimeout(() => { this.setState({ loading: false }); this.startCount(); }, this.reduce ? 0 : ms); }
  startCount() {
    cancelAnimationFrame(this.raf);
    if (this.reduce) { this.setState({ p: 1 }); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1300); this.setState({ p: k }); if (k < 1) this.raf = requestAnimationFrame(step); };
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
  go(tab, extra) { this.setState({ tab, sheet: null, ...(extra || {}) }); this.afterLoad(450); }
  say(msg, label, act) { this.setState({ toast: msg, toastLabel: label || '', toastAct: act || null }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: '', toastAct: null }), act ? 5200 : 2600); }
  remind(ids) {
    let n = 0;
    const members = this.state.members.map((m) => { if (ids.includes(m.id) && m.status !== 'Reading' && !m.reminded) { n++; return { ...m, reminded: true }; } return m; });
    this.setState({ members }); this.say(n ? 'Reminder sent to ' + n + (n === 1 ? ' member' : ' members') : 'They have all been reminded');
  }
  removeOne(id) {
    const i = this.state.members.findIndex((m) => m.id === id), m = this.state.members[i];
    this.setState({ members: this.state.members.filter((x) => x.id !== id) });
    this.say(m.name + ' was removed', 'Undo', () => { const l = [...this.state.members]; l.splice(i, 0, m); this.setState({ members: l, toast: '' }); });
  }
  submitUser() {
    const s = this.state, ferr = {};
    if (!s.fName.trim()) ferr.name = 'Please enter the full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.fEmail.trim())) ferr.email = 'Please enter a valid email address.';
    if (s.fMobile.trim() && !/^\+?[\d\s()-]{8,16}$/.test(s.fMobile.trim())) ferr.mobile = 'Please enter a valid mobile number.';
    if (!s.desig) ferr.desig = 'Please choose a designation.';
    if (s.fPass.length < 8) ferr.pass = 'The temporary password needs at least 8 characters.';
    if (Object.keys(ferr).length) { this.setState({ ferr }); return; }
    const m = { id: 'n' + Date.now(), name: s.fName.trim(), email: s.fEmail.trim(), type: s.acct, desig: s.desig, mobile: s.fMobile.trim(), branch: s.fBranch.trim(), dept: s.fDept.trim(), status: 'Invited', sessions: 0, last: 'Invited just now', items: [], fresh: true };
    this.setState({ members: [m, ...s.members], sheet: null, ferr: {}, mq: '', mfilter: 'all', tab: 'members' }); this.afterLoad(450); this.say(m.name + ' was invited');
  }
  toggleDept(name) { const sel = this.state.sel.includes(name) ? this.state.sel.filter((d) => d !== name) : [...this.state.sel, name]; this.setState({ sel }); this.tweenTotal(totalFor(sel.length)); }
  toggleGroup(names) { const all = names.every((n) => this.state.sel.includes(n)); const sel = all ? this.state.sel.filter((d) => !names.includes(d)) : [...new Set([...this.state.sel, ...names])]; this.setState({ sel }); this.tweenTotal(totalFor(sel.length)); }
  pay() { const n = this.state.sel.length; this.setState({ sheet: 'busy' }); setTimeout(() => this.setState({ sheet: 'done', premium: true, held: [...this.state.sel], paid: { n, total: totalFor(n) } }), this.reduce ? 0 : 1600); }

  renderVals() {
    const s = this.state, e = 1 - Math.pow(1 - s.p, 3), tab = s.tab, ready = !s.loading;
    const clock = String(Math.floor(s.sec / 60)).padStart(2, '0') + ':' + String(s.sec % 60).padStart(2, '0');
    const readN = s.members.filter((m) => m.status === 'Reading').length, pending = s.members.filter((m) => m.status !== 'Reading' && !m.reminded).length, reminded = s.members.filter((m) => m.status !== 'Reading' && m.reminded).length;
    const heldTotal = s.held.reduce((a, d) => a + TOTAL[d], 0), hr = new Date().getHours();
    const titles = { home: 'Dashboard', members: 'Members', library: 'Content library', plan: 'Subscription' };
    const v = {
      themeCls: s.dark ? 'dark' : '', isDark: s.dark, isLight: !s.dark, toggleTheme: () => this.setState({ dark: !s.dark }),
      tabTitle: titles[tab], clock, free: !s.premium, premium: s.premium, isLoading: s.loading, tabKey: 'k' + s.epoch + tab,
      tabs: { home: 'tab' + (tab === 'home' ? ' on' : ''), members: 'tab' + (tab === 'members' ? ' on' : ''), library: 'tab' + (tab === 'library' ? ' on' : ''), plan: 'tab' + (tab === 'plan' ? ' on' : '') },
      goHome: () => this.go('home'), goMembers: () => this.go('members'), goLibrary: () => this.go('library'), goPlan: () => this.go('plan'),
      hasBadge: pending > 0, pendingBadge: pending, renewal: (() => { const d = new Date(); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + (d.getFullYear() + 1); })(),
      premiumLabel: s.premium ? 'Premium is on' : 'Free preview',
      isHome: tab === 'home' && ready, isMembers: tab === 'members' && ready, isLibrary: tab === 'library' && ready, isPlan: tab === 'plan' && ready,
      toast: s.toast, toastLabel: s.toastLabel, hasToastAct: !!s.toastAct, toastAct: () => { const f = s.toastAct; if (f) f(); },
      hasSheet: !!s.sheet || !!s.panel, closeSheet: () => this.setState({ sheet: null, panel: null }),
      sheetDept: !!s.panel && !s.sheet, sheetAdd: s.sheet === 'add', sheetReview: s.sheet === 'review', sheetBusy: s.sheet === 'busy', sheetDone: s.sheet === 'done',
      openAdd: () => this.setState({ sheet: 'add', fName: '', fEmail: '', fMobile: '', fBranch: '', fDept: '', fPass: '', showPass: false, desig: '', acct: 'Faculty', ferr: {} }),
    };
    if (!ready) return v;
    if (tab === 'home') {
      const done = [true, s.members.length > 0, pending === 0 && s.members.length > 0, s.premium], frac = done.filter(Boolean).length / 4;
      v.greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      v.kItems = IN(Math.round(heldTotal * e)); v.kDepts = String(Math.round(s.held.length * e)); v.kMembers = String(Math.round(s.members.length * e)); v.kRead = String(Math.round(readN * e));
      v.stepCount = done.filter(Boolean).length + '/4'; v.heroOff = (301.6 * (1 - frac * e)).toFixed(1);
      v.nextStep = !done[2] ? 'Next: get them reading.' : !done[3] ? 'Next: go Premium.' : 'All set.';
      v.bannerWarn = !s.dismissed && pending > 0; v.bannerSent = !s.dismissed && pending === 0 && reminded > 0;
      v.pendingShort = pending + (pending === 1 ? ' member has' : ' members have') + ' not opened the library yet.';
      v.sendReminders = () => this.remind(s.members.map((m) => m.id));
      const ser = series(s.metric, '7d'), vals = ser.vals, n = vals.length, m0 = Math.max(...vals), stepY = m0 > 20 ? 5 : 2, max = Math.max(4, Math.ceil(m0 / stepY) * stepY), W = 600, H = 200, pad = 14;
      const pts = vals.map((x, i) => [((i + 0.5) / n) * W, H - pad - (x / max) * (H - pad * 2)]), lineD = smooth(pts), unit = s.metric === 'sessions' ? 'sessions' : s.metric === 'hours' ? 'hours' : 'readers';
      v.lineD = lineD; v.areaD = lineD + ' L' + pts[n - 1][0].toFixed(1) + ',' + H + ' L' + pts[0][0].toFixed(1) + ',' + H + ' Z'; v.chartKey = s.metric + s.epoch;
      v.chartNote = 'Last 7 days · tap a day for the number';
      v.grid = [0, 0.5, 1].map((f) => ({ style: 'top:' + ((H - pad - f * (H - pad * 2)) / H) * 100 + '%', lstyle: 'top:' + ((H - pad - f * (H - pad * 2)) / H) * 100 + '%', label: String(Math.round(max * f * 10) / 10) }));
      v.hits = vals.map((x, i) => ({ style: 'left:' + (i / n) * 100 + '%;width:' + 100 / n + '%', enter: () => this.setState({ hover: s.hover === i ? null : i }), key: v.chartKey + i, label: ser.names[i] + ': ' + x + ' ' + unit }));
      v.xlabels = ser.labels.map((l) => ({ l, style: 'flex:1;min-width:0;text-align:center;font-size:11px;color:var(--muted);white-space:nowrap' }));
      v.hasHover = s.hover != null && s.hover < n;
      if (v.hasHover) { const hx = ((s.hover + 0.5) / n) * 100, hy = (pts[s.hover][1] / H) * 100; v.crossStyle = 'left:' + hx + '%'; v.ptStyle = 'left:' + hx + '%;top:' + hy + '%'; v.tipStyle = 'left:' + Math.min(Math.max(hx, 22), 78) + '%;top:' + hy + '%'; v.tipText = ser.names[s.hover] + ' · ' + vals[s.hover] + ' ' + unit; }
      v.metrics = [['sessions', 'Sessions'], ['hours', 'Hours']].map(([k, l]) => ({ l, cls: s.metric === k ? 'on' : '', on: s.metric === k, pick: () => this.setState({ metric: k, hover: null }) }));
      v.feed = s.feed.map((f) => { const ago = s.tick - f.id; return { ...f, key: 'f' + f.id, ini: f.who.split(' ').map((w) => w[0]).join(''), when: f.id < 0 ? Math.round(-f.id / 20 * 3) + ' min ago' : ago < 5 ? 'just now' : ago < 60 ? ago + 's ago' : Math.floor(ago / 60) + ' min ago' }; });
    }
    if (tab === 'members') {
      const q = s.mq.trim().toLowerCase(), key = (m) => (m.status === 'Reading' ? 'reading' : m.status === 'Invited' ? 'invited' : 'notstarted');
      const list = s.members.filter((m) => (s.mfilter === 'all' || key(m) === s.mfilter) && (!q || (m.name + ' ' + m.email + ' ' + m.desig).toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
      const count = (f) => s.members.filter((m) => f === 'all' || key(m) === f).length;
      v.mq = s.mq; v.setMq = (ev) => this.setState({ mq: ev.target.value });
      v.filters = [['all', 'All'], ['reading', 'Reading'], ['notstarted', 'Not started'], ['invited', 'Invited']].map(([k, l]) => ({ l, n: count(k), cls: 'chip' + (s.mfilter === k ? ' on' : ''), pressed: s.mfilter === k, pick: () => this.setState({ mfilter: k }) }));
      v.members = list.map((m, i) => { const st = m.status === 'Reading' ? 'Reading' : m.reminded ? 'Reminded' : m.status; return { ...m, key: m.id, ini: m.name.split(' ').map((w) => w[0]).slice(0, 2).join(''), status: st, statusCls: 'tag ' + (st === 'Reading' ? 'ok' : st === 'Reminded' ? 'fac' : 'wait'), rowStyle: 'animation-delay:' + Math.min(i, 6) * 40 + 'ms' + (m.fresh ? ';border-color:var(--accent)' : ''), canRemind: m.status !== 'Reading', remindLabel: m.reminded ? 'Reminded' : m.status === 'Invited' ? 'Resend invite' : 'Send reminder', remindOff: !!m.reminded, remind: () => this.remind([m.id]), remove: () => this.removeOne(m.id) }; });
      v.noMembers = list.length === 0;
    }
    if (tab === 'library') {
      const q = s.lq.trim().toLowerCase(), list = s.held.filter((d) => !q || d.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
      v.lq = s.lq; v.setLq = (ev) => this.setState({ lq: ev.target.value });
      v.libCount = list.length + ' departments · ' + IN(list.reduce((a, d) => a + TOTAL[d], 0)) + ' items';
      v.libDepts = list.map((d, i) => { const sp = splitOf(d); return { key: d, name: d, total: IN(TOTAL[d]), delay: 'animation-delay:' + i * 50 + 'ms', open: () => this.setState({ panel: d }), barA: 'width:' + sp[0] + '%;background:var(--s1)', barB: 'width:' + sp[1] + '%;background:var(--s2)', barC: 'width:' + sp[2] + '%;background:var(--s3)' }; });
      v.noLib = list.length === 0;
    }
    if (s.panel) {
      const sp = splitOf(s.panel), tot = TOTAL[s.panel];
      v.pName = s.panel; v.pTotal = IN(tot);
      v.pTypes = ['Articles', 'Books', 'Other'].map((l, k) => ({ l, n: IN(Math.round((tot * sp[k]) / 100)), pct: sp[k], style: 'width:' + sp[k] + '%;background:var(--' + ['s1', 's2', 's3'][k] + ');animation-delay:' + k * 90 + 'ms' }));
      v.pTitles = titlesOf(s.panel).map((t, i) => ({ t, delay: 'animation-delay:' + (150 + i * 70) + 'ms', open: () => this.say('Prototype: "' + t + '" would open in the reader') }));
    }
    if (tab === 'plan' || s.sheet === 'review') {
      const n = s.sel.length, unit = unitFor(n), sub = n * unit, gst = Math.round(sub * 0.18);
      v.gtabs = [['all', 'All'], ...GROUPS.slice(0, 6).map(([g]) => [g, g.split(' & ')[0].split(',')[0]])].map(([k, l]) => ({ l, cls: 'chip' + (s.sgroup === k ? ' on' : ''), pressed: s.sgroup === k, pick: () => this.setState({ sgroup: k }) }));
      v.groups = GROUPS.filter(([g]) => s.sgroup === 'all' || s.sgroup === g).map(([g, ds]) => { const allOn = ds.every((d) => s.sel.includes(d)), c = ds.filter((d) => s.sel.includes(d)).length; return { key: g, g, count: c + '/' + ds.length, allLabel: allOn ? 'Clear' : 'Select all', toggle: () => this.toggleGroup(ds), chips: ds.map((d) => ({ key: d, name: d, cls: 'chip' + (s.sel.includes(d) ? ' on' : ''), pressed: s.sel.includes(d), toggle: () => this.toggleDept(d) })) }; });
      v.selCount = String(n); v.totalShown = rupee(s.shownTotal); v.subtotal = rupee(sub); v.gst = rupee(gst); v.cantContinue = n === 0;
      v.nudgeShort = n === 0 ? 'choose one' : n < 5 ? (5 - n) + ' more for ₹7,990 each' : '5+ rate applied';
      v.openReview = () => this.setState({ sheet: 'review' }); v.pay = () => this.pay();
      v.reviewRows = s.sel.map((d) => ({ key: d, name: d, price: rupee(unit) }));
      v.confetti = Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * Math.PI * 2, r = 90 + rnd(i) * 110; return { key: 'c' + i, style: '--cx:' + Math.round(Math.cos(a) * r) + 'px;--cy:' + Math.round(Math.sin(a) * r - 20) + 'px;--cr:' + Math.round(rnd(i + 3) * 720) + 'deg;top:70px;background:' + ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--amber)'][i % 4] + ';animation-delay:' + Math.round(rnd(i + 9) * 160) + 'ms' }; });
      v.paidText = s.paid ? s.paid.n + ' departments · ' + rupee(s.paid.total) + ' incl. GST' : '';
      v.doneHome = () => this.go('home');
    }
    if (s.sheet === 'add') {
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
    return v;
  }
}
