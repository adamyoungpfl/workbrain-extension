import json, html, os
ROOT='/Users/adamyoung/Documents/dev/workbrain-extension'
SP=os.path.dirname(os.path.abspath(__file__))
M=json.load(open(os.path.join(ROOT,'store/bench/run-001/manifest.json')))
PROMPTS={}
for c in M['cells']:
    PROMPTS[(c['task'],c['variant'])]=open(os.path.join(ROOT,'store/bench',M['stamp'],c['file'])).read()
esc=html.escape

RUBRIC=[
 ('specific','Specific to them','Uses facts only the file could supply — their name, their people, their constraints. Generic advice scores 0 however good it is.'),
 ('voice','Sounds like them','Matches the length, structure and directness the file states. Judged against what the file SAYS, not against what you would have written.'),
 ('obeys','Respects the constraints','Honours the never-do list and avoids the peeve words. A single violation caps this at 1.'),
 ('sendable','Ready to send','How much you would edit before it went out. 3 = as-is.'),
 ('grounded','Invents nothing','PENALTY DIMENSION. 3 = states no fact the file does not support. 0 = confidently narrates something it cannot know.'),
 ('names_gaps','Names what it cannot answer','The partial case. If any part of the request is unsupported, it must SAY SO. Quietly leaving it out scores the same as inventing it — to the reader, the two look identical. 3 = not applicable, or named plainly.'),
]

tasks=M['tasks']; variants=M['variants']

def cell(t, v, side):
    tid, vid = t['id'], v['id']
    rub=''.join(
        f'''<div class="rb"><span class="rb-k">{esc(label)}</span>
        <div class="scale" data-t="{tid}" data-v="{vid}" data-d="{key}">
          {''.join(f'<button type="button" data-s="{n}">{n}</button>' for n in range(4))}
        </div></div>'''
        for key,label,_ in RUBRIC)
    return f'''<div class="side" data-side="{side}">
  <div class="side-head"><span class="blind">Output {side}</span><span class="reveal" hidden>Variant {esc(vid)} — {esc(v['name'])}</span></div>
  <button type="button" class="cp" data-prompt="{esc(PROMPTS[(tid,vid)])}">Copy this prompt</button>
  <label class="paste"><span>Paste what came back</span>
    <textarea class="out" data-t="{tid}" data-v="{vid}" rows="8" placeholder="Paste the model's answer here…"></textarea></label>
  <div class="rubric">{rub}</div>
</div>'''

blocks=[]
for i,t in enumerate(tasks):
    # Blind: the left/right order flips per task so a habit cannot form.
    order = variants if i % 2 == 0 else list(reversed(variants))
    sides = ''.join(cell(t, v, 'left' if j==0 else 'right') for j,v in enumerate(order))
    blocks.append(f'''<section class="task" id="{t['id']}">
  <header class="task-head">
    <span class="task-n">{i+1}</span>
    <div>
      <h2>{esc(t['prompt'])}</h2>
      <p class="ex">{esc(t['exercises'])}</p>
    </div>
  </header>
  <details class="looks"><summary>What a good answer looks like — written before any run</summary><p>{esc(t['looksLike'])}</p></details>
  <div class="pack">Prompts: <code>store/bench/{M['stamp']}/{t['id']}.A.txt</code> and <code>{t['id']}.B.txt</code></div>
  <div class="sides">{sides}</div>
</section>''')

rubric_rows=''.join(f'<tr><td><b>{esc(l)}</b></td><td>{esc(d)}</td></tr>' for k,l,d in RUBRIC)

page = f'''<title>Context file benchmark — run {esc(M['stamp'])}</title>
<style>
:root {{
  --ground:#0C1017; --card:#141A24; --rule:#232B3A;
  --ink:#E9EDF5; --ink-2:#98A3B8; --ink-3:#6B7689;
  --accent:#7FD1B9; --accent-2:#8FA9F5; --warn:#E0A040;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,'Helvetica Neue',Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}}
header.top{{position:sticky;top:0;z-index:20;background:rgba(12,16,23,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--rule)}}
.top-in{{max-width:1240px;margin:0 auto;padding:13px 22px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}}
h1{{font-size:15px;font-weight:600;margin:0;flex:1 1 auto}}
h1 em{{font-style:normal;color:var(--ink-3);font-weight:400;font-family:var(--mono);font-size:12px}}
.tot{{font-family:var(--mono);font-size:12.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}}
.tot b{{color:var(--accent)}}
.wrap{{max-width:1240px;margin:0 auto;padding:26px 22px 120px}}
.intro{{margin:0 0 26px}}
.intro p{{font-size:15px;line-height:1.65;color:var(--ink-2);margin:0 0 11px}}
.intro strong{{color:var(--ink)}}
table.rub{{width:100%;border-collapse:collapse;margin:16px 0 0;font-size:13px}}
table.rub td{{padding:8px 10px;border-top:1px solid var(--rule);vertical-align:top;color:var(--ink-2)}}
table.rub td b{{color:var(--ink)}}
.task{{background:var(--card);border:1px solid var(--rule);border-radius:13px;padding:18px 20px 20px;margin:0 0 20px}}
.task-head{{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}}
.task-n{{font-family:var(--mono);font-size:12px;color:var(--accent);border:1px solid var(--accent);border-radius:999px;width:24px;height:24px;display:grid;place-items:center;flex:none;margin-top:2px}}
.task h2{{font-size:16.5px;margin:0;font-weight:600;letter-spacing:-.01em}}
.ex{{font-size:12px;color:var(--ink-3);margin:3px 0 0}}
.looks{{margin:0 0 12px}}
.looks summary{{cursor:pointer;font-size:12px;color:var(--ink-3);list-style:none}}
.looks summary::-webkit-details-marker{{display:none}}
.looks p{{font-size:12.5px;color:var(--ink-2);margin:7px 0 0;padding-left:2px;max-width:78ch}}
.pack{{font-size:11.5px;color:var(--ink-3);margin-bottom:14px}}
.pack code{{font-family:var(--mono);font-size:11px;color:var(--ink-2)}}
.sides{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
@media(max-width:900px){{.sides{{grid-template-columns:1fr}}}}
.side{{background:var(--ground);border:1px solid var(--rule);border-radius:10px;padding:13px}}
.side-head{{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}}
.blind{{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}}
.reveal{{font-size:11px;color:var(--accent-2);font-family:var(--mono)}}
.cp{{font:600 12px var(--sans);width:100%;min-height:36px;margin-bottom:10px;cursor:pointer;border-radius:7px;border:1px solid var(--accent-2);background:transparent;color:var(--accent-2)}}
.cp:hover{{background:var(--accent-2);color:#0A1220}}
.cp:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
.paste span{{display:block;font-size:11px;color:var(--ink-3);margin-bottom:5px}}
textarea.out{{width:100%;font-family:var(--sans);font-size:13.5px;line-height:1.5;color:var(--ink);background:var(--card);border:1px solid var(--rule);border-radius:8px;padding:9px 11px;resize:vertical}}
textarea.out:focus{{outline:2px solid var(--accent-2);outline-offset:2px}}
.rubric{{margin-top:12px;display:flex;flex-direction:column;gap:7px}}
.rb{{display:flex;align-items:center;gap:10px}}
.rb-k{{font-size:12px;color:var(--ink-2);flex:1}}
.scale{{display:flex;gap:4px;flex:none}}
.scale button{{font:600 12px var(--mono);width:30px;height:30px;cursor:pointer;border-radius:6px;border:1px solid var(--rule);background:transparent;color:var(--ink-3)}}
.scale button[aria-pressed="true"]{{background:var(--accent);border-color:var(--accent);color:#0A1512}}
.scale button:focus-visible{{outline:2px solid var(--accent-2);outline-offset:2px}}
footer.bar{{position:fixed;left:0;right:0;bottom:0;z-index:20;background:var(--card);border-top:1px solid var(--rule);padding:9px 22px;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap}}
footer.bar button{{font:600 13px var(--sans);min-height:44px;padding:0 16px;cursor:pointer;border-radius:9px;border:1px solid var(--accent);background:var(--accent);color:#0A1512}}
footer.bar button.ghost{{background:transparent;color:var(--ink-2);border-color:var(--rule)}}
@media (prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
</style>

<header class="top"><div class="top-in">
  <h1>Context file benchmark <em>{esc(M['stamp'])} · fixture {esc(M['fixtureHash'])} · task set v{M['taskSetVersion']}</em></h1>
  <span class="tot" id="tot"></span>
</div></header>

<div class="wrap">
<div class="intro">
  <p><strong>Two shapes of the same file, five fixed tasks, one rubric written before any of it was run.</strong> The answers behind both files are identical — the only thing that changes is the file's structure, which is what makes a difference in the scores attributable to anything.</p>
  <p>Run each prompt in whichever AI you are measuring, paste both answers in, score against the rubric. <strong>The sides are blind and their order flips between tasks</strong>, so a habit cannot form; press <em>Reveal</em> at the end.</p>
  <table class="rub"><tbody>{rubric_rows}</tbody></table>
  <p style="margin-top:14px;font-size:13px;color:var(--warn)"><strong>Task 6 is the one to read closely.</strong> A flat refusal is easy to spot; a mostly-right answer with one fabricated thread woven through it is not, and it is the dangerous case because everything around the invention is correct. Answering the answerable parts is not enough — the unanswerable part has to be named.</p>
  <p style="margin-top:14px;font-size:13px;color:var(--warn)"><strong>And watch task 5.</strong> Building the pack turned up a flaw in variant B: putting the reference examples last, for recency, displaces the System Grounding Rule from the end into the middle. Two things want that position. If B loses on task 5 and wins elsewhere, that is the cause — and the follow-up is a variant C that reorders everything except the grounding rule, which stays last.</p>
  <p style="margin-top:14px;font-size:13px;color:var(--ink-3)">0 = not at all · 1 = barely · 2 = mostly · 3 = fully. Six dimensions, zero to three each: eighteen a task, ninety a run.</p>
</div>
{''.join(blocks)}
</div>

<footer class="bar">
  <button id="reveal">Reveal which is which</button>
  <button class="ghost" id="copy">Copy the result</button>
  <button class="ghost" id="reset">Clear</button>
</footer>

<script>
const KEY='wb-bench-{M['stamp']}';
let st={{}};
try{{st=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{st={{}}}}

function key(t,v,d){{return t+'|'+v+'|'+d}}

function paint(){{
  document.querySelectorAll('.scale').forEach(function(sc){{
    const k=key(sc.dataset.t,sc.dataset.v,sc.dataset.d);
    sc.querySelectorAll('button').forEach(function(b){{
      b.setAttribute('aria-pressed',String(st[k]===Number(b.dataset.s)));
    }});
  }});
  const totals={{}};
  Object.keys(st).forEach(function(k){{
    if(k.indexOf('|')<0) return;
    const v=k.split('|')[1];
    totals[v]=(totals[v]||0)+st[k];
  }});
  const parts=Object.keys(totals).sort().map(function(v){{return v+': <b>'+totals[v]+'</b>/90'}});
  document.getElementById('tot').innerHTML=parts.join(' &nbsp;·&nbsp; ')||'unscored';
}}

document.addEventListener('click',function(ev){{
  const cp=ev.target.closest('.cp');
  if(cp){{
    navigator.clipboard.writeText(cp.dataset.prompt).then(function(){{
      const was=cp.textContent; cp.textContent='Copied — paste it into the AI';
      setTimeout(function(){{cp.textContent=was}},1800);
    }});
    return;
  }}
  const b=ev.target.closest('.scale button'); if(!b) return;
  const sc=b.closest('.scale');
  const k=key(sc.dataset.t,sc.dataset.v,sc.dataset.d);
  st[k]=st[k]===Number(b.dataset.s)?undefined:Number(b.dataset.s);
  if(st[k]===undefined) delete st[k];
  localStorage.setItem(KEY,JSON.stringify(st)); paint();
}});

document.querySelectorAll('textarea.out').forEach(function(ta){{
  const k='out|'+ta.dataset.t+'|'+ta.dataset.v;
  if(typeof st[k]==='string') ta.value=st[k];
  ta.addEventListener('input',function(){{st[k]=ta.value;localStorage.setItem(KEY,JSON.stringify(st))}});
}});

document.getElementById('reveal').addEventListener('click',function(){{
  document.querySelectorAll('.reveal').forEach(function(r){{r.hidden=!r.hidden}});
}});

document.getElementById('copy').addEventListener('click',function(){{
  const lines=['Context file benchmark — {M['stamp']}','fixture {M['fixtureHash']} · task set v{M['taskSetVersion']}',''];
  const totals={{}};
  document.querySelectorAll('.task').forEach(function(task){{
    lines.push(task.querySelector('h2').textContent);
    task.querySelectorAll('.side').forEach(function(side){{
      const sc=side.querySelector('.scale'); const v=sc.dataset.v; let sum=0; const bits=[];
      side.querySelectorAll('.scale').forEach(function(s){{
        const val=st[key(s.dataset.t,s.dataset.v,s.dataset.d)];
        bits.push(s.dataset.d+'='+(val===undefined?'-':val));
        if(typeof val==='number') sum+=val;
      }});
      totals[v]=(totals[v]||0)+sum;
      lines.push('  '+v+'  '+sum+'/18   '+bits.join(' '));
    }});
    lines.push('');
  }});
  lines.push('TOTALS: '+Object.keys(totals).sort().map(function(v){{return v+' '+totals[v]+'/90'}}).join('   '));
  navigator.clipboard.writeText(lines.join('\\n')).then(function(){{
    const b=document.getElementById('copy'); const was=b.textContent;
    b.textContent='Copied'; setTimeout(function(){{b.textContent=was}},1500);
  }});
}});

document.getElementById('reset').addEventListener('click',function(){{
  st={{}};localStorage.removeItem(KEY);
  document.querySelectorAll('textarea.out').forEach(function(t){{t.value=''}});
  paint();
}});

paint();
</script>'''
open(os.path.join(SP,'bench.html'),'w').write(page)
print('tasks',len(tasks),'variants',len(variants),'bytes',len(page))
