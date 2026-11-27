(async function () {
  var out = { t0: DS.Match.clock, sim0: null };
  await new Promise(function (r) { setTimeout(r, 3000); });
  out.t1 = DS.Match.clock;
  out.running = !!DS.Match.running;
  out.paused = !!DS.Match.paused;
  out.speed = DS.Match.speed;
  out.errs = (window.__DS_ERRS || []).slice(0, 4);
  try { out.probe = DS.Match.probe ? Object.keys(DS.Match.probe()) : null; } catch (e) { out.probe = 'ERR'; }
  try {
    var pr = DS.Match.probe();
    out.players = pr.players ? pr.players.slice(0, 3) : null;
  } catch (e2) {}
  try { out.v35 = DS.Match.v35(); } catch (e3) { out.v35 = 'ERR ' + e3.message; }
  return JSON.stringify(out);
})()
