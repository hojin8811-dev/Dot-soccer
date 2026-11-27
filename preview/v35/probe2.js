(async function () {
  var out = {};
  try { DS.game.act('kickoff'); } catch (e) { return 'ERR ' + e.message; }
  await new Promise(function (r) { setTimeout(r, 6000); });
  out.clock = DS.Match.clock;
  out.running = !!DS.Match.running;
  out.phase = DS.Match.phase;
  try { out.pr = DS.Match.probe(); } catch (e) { out.pr = null; }
  var pr = out.pr || {};
  out.ball = pr.ball;
  out.home = pr.home && pr.home.slice ? pr.home.slice(0, 11).map(function (q) {
    return { n: q.name, pos: q.pos, x: Math.round(q.x), y: Math.round(q.y), pose: q.pose, v: Math.round((q.speed || 0) * 10) / 10 };
  }) : null;
  try { out.v35 = DS.Match.v35(); } catch (e2) { out.v35 = 'ERR'; }
  out.errs = (window.__DS_ERRS || []).slice(0, 4);
  return JSON.stringify(out);
})()
