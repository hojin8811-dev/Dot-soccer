(async function () {
  var out = {};
  try {
    DS.game.act('kickoff');
    out.started = true;
  } catch (e) { return 'ERR ' + e.message; }
  await new Promise(function (r) { setTimeout(r, 2500); });
  out.running = !!(DS.Match && DS.Match.running);
  out.errs = (window.__DS_ERRS || []).slice(0, 5);
  return JSON.stringify(out);
})()
