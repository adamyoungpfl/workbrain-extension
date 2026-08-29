import json, html, os
ROOT = '/Users/adamyoung/Documents/dev/workbrain-extension'
SP = os.path.dirname(os.path.abspath(__file__))
Q = {e['id']: e for e in json.load(open(os.path.join(ROOT, 'store/script/questions.json')))}
esc = html.escape

PICK = ['preferred_name', 'audiences_list', 'voice_directness', 'role_names', 'entities_gate', 'initiatives_gate']

# Concept 4 needs a headline per question. [DRAFT] — mine, for Adam's pass.
HEADLINE = {
    'preferred_name': 'What should AI call you?',
    'audiences_list': 'Who do you write to?',
    'voice_directness': 'How direct should AI be?',
    'role_names': 'What are your roles?',
    'entities_gate': 'Anyone AI should know by name?',
    'initiatives_gate': 'Any projects AI should know?',
}

data = []
for qid in PICK:
    e = Q[qid]
    data.append({
        'id': qid,
        'q': e['question'],
        'words': len(e['question'].split()),
        'hint': e['hint'] or '',
        'kind': e['kind'],
        'options': e['options'][:4],
        'rephrasings': len(e['rephrasings']),
        'headline': HEADLINE[qid],
        'placeholder': e['placeholder'] or '',
    })

CONCEPTS = [
    {
        'n': 1, 'name': 'The Fixed Stage', 'tag': 'Discipline',
        'thesis': 'The question gets a box of one fixed height, and never more. Short questions sit in air; long ones step down a size to fit. The answer starts at the same pixel on all thirty-four screens.',
        'keeps': 'The two-zone layout, the cluster, the drawer, the narrator. Nothing about the flow moves.',
        'costs': 'Two questions still will not fit at 18px and want rewriting. The air above a five-word question is real and has to be designed, not left over.',
        'answers': 'Rhythm, absolutely. Rephrase pinned to the stage corner and present on every screen.',
    },
    {
        'n': 2, 'name': 'The Conversation', 'tag': 'Warmth',
        'thesis': 'The question is a spoken turn, not a heading. A mark, a bubble, and your reply underneath it. Length variance stops being a defect the moment the form is one that is supposed to vary.',
        'keeps': 'Everything functional. This is a re-skin of the question zone and nothing else.',
        'costs': 'A bubble at 400px eats horizontal room to its own padding. The narrator becomes load-bearing — a conversation you cannot hear is a strange conversation.',
        'answers': 'Length, by absorbing it. Rephrase is “say that another way”, which a speaker can always do — so it is on every screen without an exception to explain.',
    },
    {
        'n': 3, 'name': 'Type as the Art', 'tag': 'Typographic',
        'thesis': 'Stop fighting the length and spend it. Size is a function of word count: five words get 34px, thirty get 19px. Every question occupies the same area and none of them sound the same.',
        'keeps': 'Every measurement in the census except the one that was already constant. The zone height, the cluster, the drawer.',
        'costs': 'It breaks the one thing that IS consistent today. A person who reads three questions in a row at three sizes may read it as instability rather than as voice.',
        'answers': 'Both, and it is the riskiest of the four. Short questions become punchy; long ones become considered.',
    },
    {
        'n': 4, 'name': 'The Headline', 'tag': 'Editorial',
        'thesis': 'Every screen is one bold line of eight words or fewer, with the full wording underneath it, quieter. The four long questions get authored headlines rather than a smaller size.',
        'keeps': 'The layout entirely. This is a content change wearing a type change.',
        'costs': 'Thirty-four headlines have to be written and they have to be right. A headline that is not quite the question is worse than a long question.',
        'answers': 'Rhythm, completely — one line, always. And the seven screens with no rephrasing are visible as a design problem rather than hidden as an absence.',
    },
]

def concept_frame(c):
    return f'''<article class="frame" data-c="{c['n']}">
  <header class="frame-head">
    <span class="frame-n">{c['n']}</span>
    <div class="frame-id">
      <h2>{esc(c['name'])}</h2>
      <span class="frame-tag">{esc(c['tag'])}</span>
    </div>
  </header>
  <p class="thesis">{esc(c['thesis'])}</p>
  <div class="panel-wrap"><div class="panel" data-concept="{c['n']}"></div></div>
  <dl class="notes">
    <dt>Keeps</dt><dd>{esc(c['keeps'])}</dd>
    <dt>Costs</dt><dd>{esc(c['costs'])}</dd>
    <dt>Answers</dt><dd>{esc(c['answers'])}</dd>
  </dl>
</article>'''

page = f'''<title>Four ways the interview canvas could go</title>
<style>
:root {{
  --ground:#0B0E14; --ground-2:#12161F; --rule:#212836;
  --ink:#E8ECF4; --ink-2:#98A2B6; --ink-3:#6C778C;
  --accent:#9B87F0; --accent-2:#63C8F5;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,'Helvetica Neue',Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;
  /* The panel's own tokens, so what is inside the frames is honest. */
  --p-canvas:#FFFFFF; --p-ground:#F6F7F9; --p-sunken:#EDEFF3;
  --p-ink:#15181D; --p-ink-2:#525A67; --p-ink-3:#646C7B;
  --p-divider:#E2E5EA; --p-border:#D4D8E0; --p-border-i:#8A92A0;
  --p-primary:#2A4FCB; --p-primary-tint:#EAEEFB; --p-violet:#6A3FD1;
  --p-dock:#0F1730;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--ground); color:var(--ink); font-family:var(--sans); line-height:1.5; -webkit-font-smoothing:antialiased; }}

header.top {{ position:sticky; top:0; z-index:20; background:rgba(11,14,20,.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--rule); }}
.top-in {{ max-width:1500px; margin:0 auto; padding:14px 24px 12px; display:flex; gap:18px; align-items:center; flex-wrap:wrap; }}
h1 {{ font-size:15px; font-weight:600; margin:0; letter-spacing:.005em; }}
h1 em {{ font-style:normal; color:var(--ink-3); font-weight:400; }}
.picker {{ display:flex; gap:5px; flex-wrap:wrap; margin-left:auto; }}
.picker button {{
  font:500 12px var(--sans); padding:7px 11px; min-height:34px; cursor:pointer; border-radius:7px;
  border:1px solid var(--rule); background:transparent; color:var(--ink-2);
}}
.picker button[aria-pressed="true"] {{ background:var(--accent); border-color:var(--accent); color:#12101E; font-weight:650; }}
.picker button:focus-visible {{ outline:2px solid var(--accent-2); outline-offset:2px; }}
.picker .lines {{ font-family:var(--mono); font-size:10px; opacity:.7; margin-left:5px; }}

.lede {{ max-width:1500px; margin:0 auto; padding:30px 24px 6px; }}
.lede p {{ font-size:17px; line-height:1.6; color:var(--ink-2); margin:0 0 12px; max-width:none; }}
.lede p strong {{ color:var(--ink); font-weight:600; }}
.lede .measured {{ display:flex; gap:26px; flex-wrap:wrap; margin:20px 0 0; padding:16px 0 0; border-top:1px solid var(--rule); }}
.measured div {{ }}
.measured b {{ display:block; font-family:var(--mono); font-size:21px; color:var(--accent-2); font-weight:500; }}
.measured span {{ font-size:12.5px; color:var(--ink-3); }}

.gallery {{ max-width:1500px; margin:0 auto; padding:34px 24px 90px; display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:28px; align-items:start; }}
.frame {{ background:var(--ground-2); border:1px solid var(--rule); border-radius:14px; padding:20px 20px 8px; }}
.frame-head {{ display:flex; gap:12px; align-items:baseline; margin-bottom:10px; }}
.frame-n {{ font-family:var(--mono); font-size:12px; color:var(--accent); border:1px solid var(--accent); border-radius:999px; width:24px; height:24px; display:grid; place-items:center; flex:none; }}
.frame-id h2 {{ font-size:19px; margin:0; letter-spacing:-.015em; font-weight:640; }}
.frame-tag {{ font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3); }}
.thesis {{ font-size:13.5px; line-height:1.6; color:var(--ink-2); margin:0 0 16px; }}

.panel-wrap {{ display:flex; justify-content:center; }}
.panel {{
  width:400px; height:760px; flex:none; transform-origin:top center;
  background:var(--p-ground); color:var(--p-ink); border-radius:12px; overflow:hidden;
  box-shadow:0 18px 44px rgba(0,0,0,.5); position:relative; display:flex; flex-direction:column;
}}
@media (max-width:1500px) {{ .panel {{ transform:scale(.82); margin-bottom:-137px; }} }}
@media (max-width:1100px) {{ .panel {{ transform:scale(.9); margin-bottom:-76px; }} }}
@media (max-width:820px)  {{ .panel {{ transform:scale(1); margin-bottom:0; }} }}

.notes {{ margin:18px 0 0; display:grid; grid-template-columns:auto 1fr; gap:5px 12px; font-size:12.5px; }}
.notes dt {{ font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3); padding-top:2px; }}
.notes dd {{ margin:0; color:var(--ink-2); line-height:1.55; }}

/* ── inside the panels ──────────────────────────────────────────────── */
.p-chrome {{ height:30px; flex:none; display:flex; align-items:center; justify-content:space-between; padding:0 16px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--p-ink-3); }}
.p-bar {{ height:3px; margin:0 16px; background:var(--p-sunken); border-radius:2px; position:relative; flex:none; }}
.p-bar i {{ position:absolute; inset:0 55% 0 0; background:var(--p-ink-3); border-radius:2px; }}
.p-body {{ flex:1; padding:14px 16px 0; display:flex; flex-direction:column; min-height:0; }}
.p-dock {{ height:186px; flex:none; background:var(--p-dock); margin-top:auto; }}
.p-dock-in {{ padding:16px; color:#8FA4D8; font-size:11px; letter-spacing:.07em; text-transform:uppercase; }}
.p-foot {{ flex:none; display:flex; align-items:center; gap:10px; padding:0 16px 12px; }}
.p-next {{ background:var(--p-primary); color:#fff; border-radius:999px; padding:7px 16px; font-size:14px; font-weight:700; flex:1; text-align:center; }}
.p-quiet {{ font-size:14px; color:var(--p-ink-3); }}
.p-save {{ flex:none; text-align:center; font-size:11px; color:var(--p-ink-3); padding:0 0 10px; }}
.p-hint {{ font-size:12.5px; line-height:1.5; color:var(--p-ink-2); margin:8px 0 0; }}
.p-field {{ border:1px solid var(--p-border-i); border-radius:9px; background:var(--p-canvas); padding:12px 14px; font-size:15px; color:var(--p-ink-3); box-shadow:inset 1px -1px 2px rgba(21,24,29,.06); }}
.p-chips {{ display:flex; gap:7px; flex-wrap:wrap; }}
.p-chip {{ border:1px solid var(--p-border-i); border-radius:999px; padding:8px 13px; font-size:14px; color:var(--p-ink-2); background:var(--p-canvas); }}
.p-reph {{ display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--p-ink-3); }}
.p-reph b {{ display:grid; place-items:center; width:20px; height:20px; border-radius:999px; border:1.4px solid currentColor; font-size:11px; font-weight:600; }}

/* 1 — the fixed stage */
.c1 .stage {{ height:100px; flex:none; display:flex; align-items:center; gap:8px; border-left:2px solid var(--p-primary); padding-left:12px; }}
.c1 .q {{ font-size:22px; line-height:1.22; font-weight:640; letter-spacing:-.02em; margin:0; }}
.c1 .q[data-fit="down"] {{ font-size:18px; }}
.c1 .q[data-fit="tiny"] {{ font-size:16px; }}
.c1 .corner {{ margin-left:auto; align-self:flex-start; flex:none; }}

/* 2 — the conversation */
.c2 .turn {{ display:flex; gap:9px; align-items:flex-start; }}
.c2 .mark {{ width:26px; height:26px; border-radius:999px; background:linear-gradient(140deg,#3E77E8,#16A5BE); flex:none; margin-top:2px; }}
.c2 .bubble {{ background:var(--p-canvas); border:1px solid var(--p-divider); border-radius:4px 14px 14px 14px; padding:12px 14px; }}
.c2 .q {{ font-size:18px; line-height:1.4; font-weight:520; margin:0; letter-spacing:-.005em; }}
.c2 .say {{ margin:7px 0 0; }}
.c2 .reply {{ margin-top:14px; padding-left:35px; }}

/* 3 — type as the art */
.c3 .q {{ margin:0; font-weight:700; letter-spacing:-.03em; line-height:1.08; }}
.c3 .q[data-w="s"] {{ font-size:34px; }}
.c3 .q[data-w="m"] {{ font-size:26px; line-height:1.16; }}
.c3 .q[data-w="l"] {{ font-size:19px; line-height:1.34; letter-spacing:-.01em; font-weight:600; }}
.c3 .slot {{ height:22px; flex:none; display:flex; align-items:center; margin-bottom:4px; }}

/* 4 — the headline */
.c4 .head {{ font-size:30px; line-height:1.1; font-weight:700; letter-spacing:-.03em; margin:0; }}
.c4 .full {{ font-size:13px; line-height:1.5; color:var(--p-ink-3); margin:9px 0 0; }}
.c4 .slot {{ height:22px; flex:none; display:flex; align-items:center; margin-bottom:4px; }}

.answer {{ margin-top:16px; }}
@media (prefers-reduced-motion: reduce) {{ * {{ transition:none !important; }} }}
</style>

<header class="top"><div class="top-in">
  <h1>Four ways the interview canvas could go <em>— same question, four treatments</em></h1>
  <div class="picker" id="picker"></div>
</div></header>

<div class="lede">
  <p><strong>The census re-aimed the brief.</strong> Type size is already constant at 22px on all thirty-four questions, and the rephrase control is already pinned at 54px from the top — it does not drift as a question grows. What varies is the question's <strong>height</strong>: one to six visual lines, a six-fold swing, with two thirds of the flow sitting quietly at two or three and four questions carrying the whole tail. At the drawer's ceiling those four leave the answer exactly 44 pixels — the accessibility floor, nothing spare.</p>
  <p>So none of these four is about letter sizes. Each one is an answer to <em>length</em>, and each pays for it somewhere different. Switch the question above and watch what each direction does when it meets the thirty-word one.</p>
  <div class="measured">
    <div><b>22px</b><span>type size, every question — already constant</span></div>
    <div><b>1–6</b><span>visual lines the question takes</span></div>
    <div><b>27/34</b><span>questions that offer a rephrasing</span></div>
    <div><b>44px</b><span>answer room left on the two longest</span></div>
  </div>
</div>

<div class="gallery">
{''.join(concept_frame(c) for c in CONCEPTS)}
</div>

<script>
const DATA = {json.dumps(data)};
let at = 0;

const picker = document.getElementById('picker');
DATA.forEach(function (d, i) {{
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-pressed', String(i === 0));
  b.innerHTML = d.words + ' words <span class="lines">' + d.id + '</span>';
  b.addEventListener('click', function () {{
    at = i;
    picker.querySelectorAll('button').forEach(function (x, j) {{ x.setAttribute('aria-pressed', String(i === j)); }});
    render();
  }});
  picker.appendChild(b);
}});

function esc(t) {{ const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }}

function reph(d) {{
  return d.rephrasings
    ? '<span class="p-reph"><b>?</b> Reword</span>'
    : '<span class="p-reph" style="opacity:.35"><b>?</b> Reword</span>';
}}

function answerFor(d) {{
  if (d.kind === 'yesno') return '<div class="p-chips"><span class="p-chip">Yes</span><span class="p-chip">No</span></div>';
  if (d.options.length) return '<div class="p-chips">' + d.options.map(function (o) {{ return '<span class="p-chip">' + esc(o) + '</span>'; }}).join('') + '</div>';
  return '<div class="p-field">' + esc(d.placeholder || 'Type your answer…') + '</div>';
}}

function shell(inner, cls) {{
  return '<div class="p-chrome"><span>About Me</span><span>Read aloud</span></div>'
    + '<div class="p-bar"><i></i></div>'
    + '<div class="p-body ' + cls + '">' + inner + '</div>'
    + '<div class="p-foot"><span class="p-quiet">Back</span><span class="p-next">Next ›</span><span class="p-quiet">Skip</span></div>'
    + '<div class="p-save">Saved on this device</div>'
    + '<div class="p-dock"><div class="p-dock-in">Work brain › Context.md › About Me</div></div>';
}}

function render() {{
  const d = DATA[at];
  const hint = d.hint ? '<p class="p-hint">' + esc(d.hint) + '</p>' : '';

  // 1 — fixed stage: the box never changes height, the type steps to fit.
  const fit = d.words > 22 ? 'tiny' : d.words > 14 ? 'down' : 'up';
  document.querySelector('.panel[data-concept="1"]').innerHTML = shell(
    '<div class="stage"><p class="q" data-fit="' + fit + '">' + esc(d.q) + '</p>'
      + '<span class="corner">' + reph(d) + '</span></div>'
      + hint + '<div class="answer">' + answerFor(d) + '</div>',
    'c1',
  );

  // 2 — the conversation: a turn, then a reply.
  document.querySelector('.panel[data-concept="2"]').innerHTML = shell(
    '<div class="turn"><span class="mark"></span><div><div class="bubble"><p class="q">' + esc(d.q) + '</p></div>'
      + '<div class="say">' + reph(d) + '</div></div></div>'
      + '<div class="reply">' + hint + '<div class="answer">' + answerFor(d) + '</div></div>',
    'c2',
  );

  // 3 — type as the art: size is a function of word count.
  const w = d.words <= 8 ? 's' : d.words <= 16 ? 'm' : 'l';
  document.querySelector('.panel[data-concept="3"]').innerHTML = shell(
    '<div class="slot">' + reph(d) + '</div><p class="q" data-w="' + w + '">' + esc(d.q) + '</p>'
      + hint + '<div class="answer">' + answerFor(d) + '</div>',
    'c3',
  );

  // 4 — the headline: one bold line, the full wording quietly beneath.
  document.querySelector('.panel[data-concept="4"]').innerHTML = shell(
    '<div class="slot">' + reph(d) + '</div><p class="head">' + esc(d.headline) + '</p>'
      + (d.headline !== d.q ? '<p class="full">' + esc(d.q) + '</p>' : '')
      + '<div class="answer">' + answerFor(d) + '</div>',
    'c4',
  );
}}

render();
</script>'''

open(os.path.join(SP, 'canvas-concepts.html'), 'w').write(page)
print('concepts 4 | questions', len(data))
