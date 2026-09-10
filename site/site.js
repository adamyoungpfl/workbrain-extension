/* myworkbrain.org — router, scroll field, white-paper cover, Proving Grounds.
   No dependencies, no build step. Loaded with a plain <script defer>. */
(function () {
  'use strict';

  /* ══ Routing ═══════════════════════════════════════════════════════════
     The slugs are a CONTRACT with the extension: the panel deep-links to
     myworkbrain.org/#library and friends. Renaming one breaks a button in
     shipped software, so add rather than rename. */
  var ROUTES = [
    'home',
    'how-it-works',
    'white-paper',
    'library',
    'proving-grounds',
    'workbrain-plus',
    'services',
    'civic',
    'roadmap',
    'good',
    'download',
    'privacy',
  ];

  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function currentRoute() {
    var slug = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (slug === 'civics-accelerator') slug = 'civic'; /* retired anchor — the
      client-side 301 (fragments never reach a server) */
    if (ROUTES.indexOf(slug) > -1) return slug;
    /* Grant applications cite myworkbrain.org/civic as a real URL; vercel.json
       rewrites those paths here, and the hash (set by any later click) wins. */
    var path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (ROUTES.indexOf(path) > -1) return path;
    return 'home';
  }

  function show(route) {
    var pages = document.querySelectorAll('[data-page]');
    for (var i = 0; i < pages.length; i++) {
      pages[i].hidden = pages[i].getAttribute('data-page') !== route;
    }
    var navs = document.querySelectorAll('[data-goto]');
    for (var j = 0; j < navs.length; j++) {
      var target = navs[j].getAttribute('data-goto');
      if (navs[j].classList.contains('nav-btn')) {
        if (target === route) navs[j].setAttribute('aria-current', 'page');
        else navs[j].removeAttribute('aria-current');
      }
    }
    document.title =
      route === 'home'
        ? 'Workbrain — a context file for your AI'
        : route === 'civic'
          ? 'Workbrain Civic Accelerator'
          : route === 'good'
            ? 'Workbrain — Good, defined'
            : 'Workbrain — ' + route.replace(/-/g, ' ');
    sizeCover();
    drawCover(performance.now() / 1000);
  }

  function navigate(route) {
    var slug = route === 'home' ? '' : route;
    if ((window.location.hash || '').replace(/^#\/?/, '') !== slug) {
      window.location.hash = slug;
    } else {
      show(route);
    }
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-goto]');
    if (!el) return;
    e.preventDefault();
    navigate(el.getAttribute('data-goto'));
  });

  /* In-page hops for the Civics page's own CTAs — plain scroll, never a
     hash (the router would read it as a route). */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-scroll]');
    if (!el) return;
    var target = document.getElementById(el.getAttribute('data-scroll'));
    if (!target) return;
    target.scrollIntoView(reduced ? { block: 'start' } : { behavior: 'smooth', block: 'start' });
  });

  window.addEventListener('hashchange', function () {
    show(currentRoute());
    window.scrollTo(0, 0);
  });

  /* ══ The icosahedron ═══════════════════════════════════════════════════
     Ported from the extension's src/core/geometry/icosahedron.ts: twelve
     vertices from the golden ratio, and the thirty pairs at the
     construction's edge length of 2. Same solid as the app's brand mark, so
     the site and the panel are drawing one object. */
  var PHI = (1 + Math.sqrt(5)) / 2;

  var V = (function () {
    var v = [];
    [-1, 1].forEach(function (s) {
      [-1, 1].forEach(function (t) {
        v.push({ x: 0, y: s, z: t * PHI });
        v.push({ x: s, y: t * PHI, z: 0 });
        v.push({ x: s * PHI, y: 0, z: t });
      });
    });
    return v;
  })();

  var E = (function () {
    var e = [];
    for (var i = 0; i < V.length; i++) {
      for (var j = i + 1; j < V.length; j++) {
        var d = Math.hypot(V[i].x - V[j].x, V[i].y - V[j].y, V[i].z - V[j].z);
        if (Math.abs(d - 2) < 1e-6) e.push([i, j]);
      }
    }
    return e;
  })();

  var RADIUS = Math.hypot(1, PHI);
  /* tokens.json `brand` — the flat mark's five gradient starts, for the light
     ground. */
  var NODE = ['#2F5FE6', '#14B8C4', '#6366F1', '#3D74E5', '#4968BA'];
  /* tokens.json `globe` *-solid — the dark stage's lit palette. */
  var GLOBE = ['#5A93FF', '#2ED6F0', '#8A8CFF', '#4FB6FF', '#93A9FF'];

  function project(cx, cy, rad, ang, tilt) {
    var ca = Math.cos(ang);
    var sa = Math.sin(ang);
    var ct = Math.cos(tilt);
    var st = Math.sin(tilt);
    return V.map(function (v) {
      var x1 = v.x * ca - v.z * sa;
      var z1 = v.x * sa + v.z * ca;
      var y2 = v.y * ct - z1 * st;
      var z2 = v.y * st + z1 * ct;
      return {
        x: cx + (x1 / RADIUS) * rad,
        y: cy - (y2 / RADIUS) * rad,
        d: (z2 / RADIUS + 1) / 2,
      };
    });
  }

  /* ══ The scroll field ══════════════════════════════════════════════════
     Scroll pulls the camera BACKWARD through a field of lattices: the hero
     sits inside one, and by the last section you are looking at the same
     faint far field the panel uses as its own background.

     Lateral spread is ABSOLUTE rather than scaled by depth. That is what
     makes the effect read as "these few are part of many": up close only a
     narrow cone is on screen, and pulling back widens the visible window.
     Count rises with distance² while each lattice shrinks as 1/distance, so
     the ink on screen stays level instead of thinning to white. */
  var CONFIG = { travel: 5, density: 8, exposure: 1 };

  var field = null;
  var canvas = document.getElementById('field');
  var W = 0;
  var H = 0;

  function mulberry(seed) {
    var a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fixed seed: the same universe every load, like the app's own. */
  function build() {
    var n = Math.round(CONFIG.density) * 14;
    var rnd = mulberry(20260909);
    field = [];
    for (var i = 0; i < n; i++) {
      var z = 0.6 + rnd() * 13;
      field.push({
        z: z,
        x: (rnd() - 0.5) * 64,
        y: (rnd() - 0.5) * 44,
        r: 0.22 + rnd() * 0.22,
        spin: rnd() * Math.PI * 2,
        pace: (rnd() < 0.5 ? -1 : 1) * (0.018 + rnd() * 0.03),
        tilt: (rnd() - 0.5) * 0.9,
      });
    }
  }

  function sizeField() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function progress() {
    var el = document.scrollingElement || document.documentElement;
    var span = el.scrollHeight - el.clientHeight;
    return span > 0 ? Math.min(1, Math.max(0, el.scrollTop / span)) : 0;
  }

  function lattice(ctx, o, t) {
    var pts = project(o.sx, o.sy, o.rad, o.L.spin + t * o.L.pace, o.L.tilt);
    ctx.lineCap = 'round';
    for (var k = 0; k < E.length; k++) {
      var i = E[k][0];
      var j = E[k][1];
      var dep = (pts[i].d + pts[j].d) / 2;
      ctx.strokeStyle = '#5B7FD8';
      ctx.globalAlpha = o.a * (0.3 + dep * 0.75);
      ctx.lineWidth = Math.max(0.7, o.rad * (0.008 + dep * 0.012));
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
    }
    var order = pts
      .map(function (p, i2) {
        return { p: p, i: i2 };
      })
      .sort(function (a, b) {
        return a.p.d - b.p.d;
      });
    for (var m = 0; m < order.length; m++) {
      var p = order[m].p;
      ctx.fillStyle = NODE[order[m].i % NODE.length];
      ctx.globalAlpha = Math.min(0.8, o.a * (0.55 + p.d * 1.5));
      var r = Math.max(1, o.rad * (0.026 + p.d * 0.024));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawField(p, now) {
    if (!canvas || !W || !field) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    var eased = p * p * (3 - 2 * p);
    var cam = 0.34 - eased * CONFIG.travel;
    var f = Math.min(W, H) * 0.92;
    var cx = W / 2;
    var cy = H * (0.46 - eased * 0.06);
    var t = now / 1000;

    var drawn = [];
    for (var i = 0; i < field.length; i++) {
      var L = field[i];
      var d = L.z - cam;
      if (d < 0.22) continue;
      var k = f / d;
      var sx = cx + L.x * k * 0.16;
      var sy = cy + L.y * k * 0.16;
      var rad = L.r * k;
      if (rad < 2.5) continue;
      if (sx + rad < -160 || sx - rad > W + 160) continue;
      if (sy + rad < -160 || sy - rad > H + 160) continue;
      var a =
        d < 1.5
          ? 0.05 + (d / 1.5) * 0.12
          : Math.max(0.075, Math.min(0.2, 0.26 * (2.2 / d)));
      drawn.push({ L: L, d: d, sx: sx, sy: sy, rad: rad, a: a * CONFIG.exposure });
    }
    drawn.sort(function (m, n) {
      return n.d - m.d;
    });
    for (var q = 0; q < drawn.length; q++) lattice(ctx, drawn[q], t);
  }

  /* ══ The white paper's cover ═══════════════════════════════════════════
     The same solid, on the globe's dark field, LIT rather than traced —
     bloomed nodes in the globe palette with one shared specular dot, near
     edges bright and far edges sunk to the deep blue. */
  var cover = document.getElementById('cover');
  var CW = 0;
  var CH = 0;

  function sizeCover() {
    if (!cover) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    CW = cover.clientWidth;
    CH = cover.clientHeight;
    if (!CW || !CH) return;
    cover.width = Math.round(CW * dpr);
    cover.height = Math.round(CH * dpr);
    cover.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function solid(ctx, cx, cy, rad, ang, tilt, alpha) {
    var pts = project(cx, cy, rad, ang, tilt);
    ctx.lineCap = 'round';
    for (var k = 0; k < E.length; k++) {
      var i = E[k][0];
      var j = E[k][1];
      var dep = (pts[i].d + pts[j].d) / 2;
      ctx.strokeStyle = dep > 0.5 ? '#7396E4' : '#2C3B70';
      ctx.globalAlpha = alpha * (0.22 + dep * 0.7);
      ctx.lineWidth = Math.max(0.7, rad * (0.005 + dep * 0.014));
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
    }
    var order = pts
      .map(function (p, i2) {
        return { p: p, i: i2 };
      })
      .sort(function (a, b) {
        return a.p.d - b.p.d;
      });
    for (var m = 0; m < order.length; m++) {
      var p = order[m].p;
      var col = GLOBE[order[m].i % GLOBE.length];
      var r = rad * (0.035 + p.d * 0.045);
      ctx.globalAlpha = alpha * (0.4 + p.d * 0.6);
      ctx.shadowColor = col;
      ctx.shadowBlur = rad * (0.1 + p.d * 0.22);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * (0.25 + p.d * 0.7);
      ctx.fillStyle = '#EDF3FF';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.32, p.y - r * 0.4, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawCover(t) {
    if (!cover) return;
    if (cover.clientWidth && (CW !== cover.clientWidth || CH !== cover.clientHeight)) {
      sizeCover();
    }
    if (!CW || !CH) return;
    var ctx = cover.getContext('2d');
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#070A12';
    ctx.fillRect(0, 0, CW, CH);

    var g = ctx.createRadialGradient(CW * 0.5, CH * 0.44, 0, CW * 0.5, CH * 0.44, CW * 0.78);
    g.addColorStop(0, 'rgba(99,200,245,0.3)');
    g.addColorStop(0.45, 'rgba(42,79,203,0.15)');
    g.addColorStop(1, 'rgba(7,10,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);

    var base = Math.min(CW, CH);
    solid(ctx, CW * 0.5, CH * 0.42, base * 0.36, t * 0.1, 0.28, 1);
    solid(ctx, CW * 0.13, CH * 0.2, base * 0.12, -t * 0.15, -0.5, 0.55);
    solid(ctx, CW * 0.88, CH * 0.68, base * 0.1, t * 0.18, 0.7, 0.45);
  }

  /* ══ Proving Grounds ═══════════════════════════════════════════════════
     Two proofs, and they are different arguments. CONTEXT compares the
     baseline the app captured before the file existed with the file now.
     SKILLS scores one skill against the objective its author stated while
     building it. BOTH runs the file first, because a skill on a thin file
     fails for the file's reasons rather than its own.

     PROOFS is sample data. Wire it to the real run endpoint when the
     hosted environment lands; the shapes are what the UI expects. */
  var PROOFS = [
    {
      name: 'Weekly update',
      size: '1.2 KB',
      tag: 'Objective recorded 4 Sept · 3 criteria',
      objective:
        'Turn my week into six lines my lead can read in thirty seconds, ending with the one thing I need from her.',
      meta: 'Captured while building the skill · 4 Sept',
      output:
        '“Reporting platform is ahead of plan. Leadership dashboard shipped Tuesday. IT response held inside four hours for a third week. Northwind renewal moved to the 24th. Calder pilot is waiting on their security review. I need a decision on the second analyst by Friday.”',
      criteria: [
        { text: 'Six lines or fewer', ok: true },
        { text: 'Ends with a single, specific ask', ok: true },
        { text: 'Names the quarter goal each line serves', ok: false },
      ],
      fix: 'Add “tie each line to its quarter goal” to the objective, then re-run — the model will not infer a rule you did not write.',
    },
    {
      name: 'Ticket triage',
      size: '0.9 KB',
      tag: 'Objective recorded 4 Sept · 3 criteria',
      objective:
        'Rank the queue by how much damage each ticket is doing right now, and say which two I should personally touch.',
      meta: 'Captured while building the skill · 4 Sept',
      output:
        '“Highest impact: the billing export failure — it blocks month-end for the whole finance team. Next: SSO timeouts affecting the Northwind pilot. The remaining nine are single-user issues and can wait for the queue.”',
      criteria: [
        { text: 'Ranked by present damage, not age', ok: true },
        { text: 'Names exactly two for you personally', ok: false },
        { text: 'States what it does not know', ok: false },
      ],
      fix: 'The file has no list of your accounts, so “damage” is being guessed. Name your two biggest clients in Context.md and re-run.',
    },
    {
      name: 'Meeting recap',
      size: '0.7 KB',
      tag: 'Objective recorded 6 Sept · 3 criteria',
      objective:
        'Decisions, owners and dates only. If something was discussed but not decided, say so in one line and stop.',
      meta: 'Captured while building the skill · 6 Sept',
      output:
        '“Decided: ship the dashboard Tuesday (Priya, 16 Sept). Decided: pause the Calder pilot until security clears it (you, no date set). Discussed but not decided: whether the second analyst comes from budget or backfill.”',
      criteria: [
        { text: 'Only decisions, owners and dates', ok: true },
        { text: 'Undecided items flagged in one line', ok: true },
        { text: 'No summary paragraph appended', ok: true },
      ],
      fix: 'Nothing to fix. Consider marking this one certified so the library can offer it.',
    },
  ];

  var mode = 'context';
  var picked = 0;
  var ran = false;

  function el(id) {
    return document.getElementById(id);
  }

  function renderGrounds() {
    ['context', 'skills', 'both'].forEach(function (m) {
      var panel = el('mode-' + m);
      if (panel) panel.hidden = mode !== m;
      var btn = document.querySelector('[data-mode="' + m + '"]');
      if (btn) btn.setAttribute('aria-pressed', String(mode === m));
    });

    ['context', 'skills', 'both'].forEach(function (m) {
      var res = el('result-' + m);
      if (res) res.hidden = !(ran && mode === m);
    });

    var proof = PROOFS[picked];

    var picks = document.querySelectorAll('[data-pick]');
    for (var i = 0; i < picks.length; i++) {
      picks[i].setAttribute(
        'aria-pressed',
        String(Number(picks[i].getAttribute('data-pick')) === picked)
      );
    }

    var set = function (id, text) {
      var node = el(id);
      if (node) node.textContent = text;
    };
    set('objective', '“' + proof.objective + '”');
    set('objective-meta', proof.meta);
    set('skill-name', proof.name + ' · run 4');
    set('skill-output', proof.output);
    set('skill-fix', proof.fix);
    set(
      'met-count',
      String(
        proof.criteria.filter(function (c) {
          return c.ok;
        }).length
      )
    );
    set('crit-count', 'of ' + proof.criteria.length + ' criteria met');

    var list = el('criteria');
    if (list) {
      list.innerHTML = '';
      proof.criteria.forEach(function (c) {
        var row = document.createElement('span');
        row.className = 'crit ' + (c.ok ? 'crit--ok' : 'crit--no');
        var badge = document.createElement('span');
        badge.className = 'crit-badge';
        badge.textContent = c.ok ? '✓' : '·';
        var text = document.createElement('span');
        text.textContent = c.text;
        row.appendChild(badge);
        row.appendChild(text);
        list.appendChild(row);
      });
    }
  }

  document.addEventListener('click', function (e) {
    var modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      mode = modeBtn.getAttribute('data-mode');
      ran = false;
      renderGrounds();
      return;
    }
    var pickBtn = e.target.closest('[data-pick]');
    if (pickBtn) {
      picked = Number(pickBtn.getAttribute('data-pick'));
      ran = false;
      renderGrounds();
      return;
    }
    if (e.target.closest('[data-run]')) {
      ran = true;
      renderGrounds();
      return;
    }
    if (e.target.closest('[data-reset]')) {
      ran = false;
      renderGrounds();
      return;
    }
    /* Booking slots and library filters are single-select display state. */
    var slot = e.target.closest('.slot:not(:disabled), .filter');
    if (slot) {
      var group = slot.parentElement.querySelectorAll(
        slot.classList.contains('slot') ? '.slot' : '.filter'
      );
      for (var i = 0; i < group.length; i++) group[i].setAttribute('aria-pressed', 'false');
      slot.setAttribute('aria-pressed', 'true');
    }
  });

  /* ══ Boot ══════════════════════════════════════════════════════════════ */

  function onResize() {
    sizeField();
    sizeCover();
    if (reduced) {
      drawField(progress(), performance.now());
      drawCover(0);
    }
  }

  build();
  sizeField();
  sizeCover();
  show(currentRoute());
  renderGrounds();
  /* Paint synchronously, so a throttled or hidden first frame never leaves a
     blank ground. */
  drawField(reduced ? 0 : progress(), performance.now());
  drawCover(reduced ? 0 : performance.now() / 1000);

  window.addEventListener('resize', onResize, { passive: true });
  if (typeof ResizeObserver === 'function' && canvas) {
    new ResizeObserver(onResize).observe(canvas);
  }

  if (!reduced) {
    (function loop() {
      try {
        if (
          canvas &&
          (W !== (canvas.clientWidth || window.innerWidth) ||
            H !== (canvas.clientHeight || window.innerHeight))
        ) {
          sizeField();
        }
        drawField(progress(), performance.now());
        drawCover(performance.now() / 1000);
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame(loop);
    })();
  }
})();

/* ── The file table's accordion (How it works, 2026-09-09) ── */
document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-acc]');
  if (!row) return;
  const open = row.getAttribute('aria-expanded') === 'true';
  row.parentElement.querySelectorAll('[data-acc]').forEach((r) => r.setAttribute('aria-expanded', 'false'));
  row.setAttribute('aria-expanded', String(!open));
});

/* ── The live Proving Grounds, Context mode (pass 5j; Adam's OPEN #9
   ruling). Everything stays in sessionStorage, gone when the tab closes;
   nothing here fetches, posts, or measures. The bundle format is the
   contract with src/core/proof/bundle.ts. ── */
(() => {
  const HEAD = '===WORKBRAIN PROOF BUNDLE v1===';
  const F = { p: '===PROMPT===', b: '===BASELINE ANSWER===', f: '===CONTEXT FILE===', e: '===END===' };
  const $ = (id) => document.getElementById(id);
  const KEY = 'wbpg:v1';

  const parseBundle = (text) => {
    const t = String(text ?? '').trim();
    if (!t.startsWith(HEAD)) return null;
    const ip = t.indexOf(F.p), ib = t.indexOf(F.b), if_ = t.indexOf(F.f), ie = t.lastIndexOf(F.e);
    if (ip < 0 || ib < ip || if_ < ib || ie < if_) return null;
    const cut = (from, fence, to) => t.slice(from + fence.length, to).replace(/^\n/, '').replace(/\n$/, '');
    return { task: cut(ip, F.p, ib), answer: cut(ib, F.b, if_), file: cut(if_, F.f, ie) };
  };
  const looksLikeFile = (text) => /^#{1,2} /m.test(String(text ?? ''));

  const state = () => {
    try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  };
  const hold = (s) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* a private window still works, unheld */ }
  };
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

  const render = () => {
    const s = state();
    const baseCard = $('pg-baseline-card');
    if (!baseCard) return;
    show(baseCard.querySelector("[data-pg='intake']"), !s);
    show(baseCard.querySelector("[data-pg='baseline']"), !!(s && s.task));
    show(baseCard.querySelector("[data-pg='fileonly']"), !!(s && !s.task));
    show(document.querySelector("#pg-file-card [data-pg='nofile']"), !s);
    show(document.querySelector("#pg-file-card [data-pg='file']"), !!s);
    if (s) {
      if (s.task) {
        $('pg-task').textContent = '\u201c' + s.task + '\u201d';
        $('pg-answer').textContent = s.answer;
      }
      const kb = (new TextEncoder().encode(s.file).length / 1024).toFixed(1);
      const sections = (s.file.match(/^## /gm) ?? []).length;
      $('pg-filemeta').textContent = kb + ' KB \u00b7 ' + sections + ' section' + (sections === 1 ? '' : 's');
      $('pg-compare').disabled = !s.task;
    }
    if (!s) { show($('pg-run'), false); show($('pg-result'), false); }
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === 'pg-load') {
      const raw = $('pg-paste').value;
      const b = parseBundle(raw);
      const note = $('pg-parse-note');
      if (b) { hold(b); note.style.display = 'none'; render(); }
      else if (looksLikeFile(raw)) { hold({ task: '', answer: '', file: raw.trim() }); note.style.display = 'none'; render(); }
      else { note.style.display = ''; }
    }
    if (t.id === 'pg-clear') { sessionStorage.removeItem(KEY); $('pg-paste').value = ''; render(); }
    if (t.id === 'pg-compare') {
      const s = state();
      if (!s) return;
      $('pg-prompt').textContent = s.file + '\n\n---\n\n' + (s.task || 'Your ask, word for word.');
      show($('pg-run'), true);
      $('pg-run').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (t.id === 'pg-copyprompt') {
      navigator.clipboard?.writeText($('pg-prompt').textContent).then(() => {
        t.textContent = 'Copied';
        setTimeout(() => { t.textContent = 'Copy the with-file prompt'; }, 1600);
      }, () => {});
    }
    if (t.id === 'pg-sidebyside') {
      const s = state();
      const withAnswer = $('pg-response').value.trim();
      if (!s || !withAnswer) return;
      $('pg-col-base').textContent = s.answer || '(no baseline in this tab)';
      $('pg-col-with').textContent = withAnswer;
      const fileWords = new Set((s.file.toLowerCase().match(/[a-z][a-z0-9'-]{4,}/g) ?? []));
      const lines = withAnswer.split('\n').filter((l) => l.trim());
      const grounded = lines.filter((l) => {
        const ws = l.toLowerCase().match(/[a-z][a-z0-9'-]{4,}/g) ?? [];
        return ws.some((w) => fileWords.has(w));
      }).length;
      $('pg-count').textContent = grounded + ' of ' + lines.length + ' lines use words that appear in your file.';
      show($('pg-result'), true);
      $('pg-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  render();
})();
