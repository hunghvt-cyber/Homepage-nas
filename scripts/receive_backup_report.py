"""Validate a report received from the backup workflow; never trust arbitrary payload HTML."""
import json, os, re
from datetime import datetime
from pathlib import Path
p=json.loads(os.environ["BACKUP_REPORT"])
url=p.get("run_url","")
assert isinstance(url,str) and re.fullmatch(r"https://github\.com/hunghvt-cyber/my-backup-gdrive-koofr/actions/runs/\d+",url)
run_id=int(p["run_id"])
assert run_id>0 and url.endswith("/"+str(run_id))
assert p["status"] in ("success","paused","failure")
def number(key,maximum):
    v=p.get(key)
    if v is None:return None
    assert type(v) in (int,float) and 0<=v<=maximum
    return round(v,3)
def count(key):
    v=p.get(key)
    if v is None:return None
    assert type(v)==int and 0<=v<=100000000
    return v
timestamp=p["finished_at"]
assert isinstance(timestamp,str) and len(timestamp)<50
datetime.fromisoformat(timestamp.replace("Z","+00:00"))
warning=p.get("warning","")
assert isinstance(warning,str) and len(warning)<500
out={"run_id":run_id,"run_url":url,"status":p["status"],
"transferred_gib":number("transferred_gib",1000000),
"speed_mib_s":number("speed_mib_s",100000),
"ignored_count":count("ignored_count"),
"new_ignored_count":count("new_ignored_count"),
"finished_at":timestamp,"warning":warning}
dest=Path("public/backup-latest.json")
old=json.loads(dest.read_text()) if dest.exists() else {}
if int(old.get("run_id",0))>=run_id:
    print("Old or duplicate report",run_id)
else:
    dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
    print("Saved report",run_id)
