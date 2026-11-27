(async function () {
  DS.game.act('kickoff');
  await new Promise(function (r) { setTimeout(r, 3000); });
  DS.Match.setSpeed(window.__SPD || 1);
  await new Promise(function (r) { setTimeout(r, (window.__WAIT || 20000)); });
  var out = { clock: Math.round(DS.Match.clock * 10) / 10, phase: DS.Match.phase, errs: window.__DS_ERRS };
  try { out.v35 = DS.Match.v35(); } catch (e) {}
  return JSON.stringify(out);
})()
