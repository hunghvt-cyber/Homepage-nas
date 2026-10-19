/* Shared by Node and Apps Script. Upload to GAS as Schema.gs. */
var NasReportSchema = (function () {
  function check(ok) { if (!ok) throw new Error('INVALID_SNAPSHOT'); }
  function keys(value, expected) {
    check(value && typeof value === 'object' && !Array.isArray(value));
    check(Object.keys(value).sort().join('|') === expected.split('|').sort().join('|'));
  }
  function stamp(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)); }
  function integer(v) { return v === null || Number.isSafeInteger(v) && v >= 0; }
  function validate(d) {
    keys(d,'schema|updated_at|cam1|cam2|nas|health|maintenance|retention');
    check(d.schema === 1 && (d.updated_at === null || stamp(d.updated_at)));
    ['cam1','cam2','nas','maintenance','retention'].forEach(function(k) {
      keys(d[k],k === 'maintenance' || k === 'retention' ? 'state|measured_at' : 'state');
      check(['ok','pass','warn','fail','unknown'].indexOf(d[k].state) >= 0);
      if (k === 'maintenance' || k === 'retention') check(d[k].measured_at === null || stamp(d[k].measured_at));
    });
    keys(d.health,'root|vol1|ram|swap');
    ['root','vol1'].forEach(function(k) {
      keys(d.health[k],'used_percent|available_bytes'); var p=d.health[k].used_percent;
      check(p === null || typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100);
      check(integer(d.health[k].available_bytes));
    });
    keys(d.health.ram,'available_bytes'); check(integer(d.health.ram.available_bytes));
    keys(d.health.swap,'used_bytes|total_bytes'); var s=d.health.swap;
    check(integer(s.used_bytes) && integer(s.total_bytes));
    check((s.used_bytes === null) === (s.total_bytes === null));
    check(s.total_bytes === null || s.total_bytes > 0 && s.used_bytes <= s.total_bytes);
    check(JSON.stringify(d).length <= 2048); return d;
  }
  return {validate:validate};
})();
if (typeof module !== 'undefined') module.exports = NasReportSchema;
