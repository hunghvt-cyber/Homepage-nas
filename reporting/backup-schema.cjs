/* Shared source: upload as BackupSchema.gs. Public aggregate allowlist only. */
var BackupReportSchema=(function(){
 var repos={gdrive:'my-backup-gdrive-koofr',gphotos:'google-photos-koofr'};
 function check(ok){if(!ok)throw Error('INVALID_BACKUP_REPORT');}
 function keys(v,names){check(v&&typeof v==='object'&&!Array.isArray(v));check(Object.keys(v).sort().join('|')===names.split('|').sort().join('|'));}
 function stamp(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)&&Number.isFinite(Date.parse(v));}
 function count(v){return v===null||Number.isSafeInteger(v)&&v>=0;}
 function validate(d,source){
  check(Object.prototype.hasOwnProperty.call(repos,source));
  keys(d,'schema_version|source|run_id|run_number|run_attempt|run_url|status|started_at|finished_at|metrics|warnings');
  check(d.schema_version===1&&d.source===(source==='gdrive'?'gdrive-koofr':'gphotos-koofr'));
  ['run_id','run_number','run_attempt'].forEach(function(k){check(Number.isSafeInteger(d[k])&&d[k]>0);});
  check(d.run_url==='https://github.com/hunghvt-cyber/'+repos[source]+'/actions/runs/'+d.run_id);
  check(['success','paused','failure','unknown'].indexOf(d.status)>=0);
  check((d.started_at===null||stamp(d.started_at))&&stamp(d.finished_at));
  if(source==='gdrive'){
   keys(d.metrics,'transferred_gib|speed_mib_s|ignored_count|new_ignored_count');
   ['transferred_gib','speed_mib_s'].forEach(function(k){var n=d.metrics[k];check(n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER);});
   ['ignored_count','new_ignored_count'].forEach(function(k){check(count(d.metrics[k]));});
  }else{
   keys(d.metrics,'discovered|attempted|uploaded|skipped|errors|boundary_seen|bootstrap_complete');
   ['discovered','attempted','uploaded','skipped','errors'].forEach(function(k){check(count(d.metrics[k]));});
   check(count(d.metrics.boundary_seen)||typeof d.metrics.boundary_seen==='boolean');
   check(d.metrics.bootstrap_complete===null||typeof d.metrics.bootstrap_complete==='boolean');
  }
  var warnings=source==='gdrive'?['Có shortcut bị hỏng.']:['Backup chưa hoàn tất hoặc có lỗi; xem GitHub Actions.'];
  check(Array.isArray(d.warnings)&&d.warnings.length<=4&&d.warnings.every(function(x){return warnings.indexOf(x)>=0;}));
  check(JSON.stringify(d).length<=8192);return d;
 }
 return {validate:validate};
})();
if(typeof module!=='undefined')module.exports=BackupReportSchema;
