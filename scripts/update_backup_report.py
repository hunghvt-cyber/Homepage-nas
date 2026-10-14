#!/usr/bin/env python3
"""Publish sanitized metrics from the latest completed backup run. Never publish logs or file paths."""
import json, os, re, urllib.request
from pathlib import Path

TOKEN=os.environ["BACKUP_READ_TOKEN"]
REPO="hunghvt-cyber/my-backup-gdrive-koofr"
DEST=Path("public/backup-latest.json")
def get(url):
    req=urllib.request.Request(url,headers={"Authorization":"Bearer "+TOKEN,"Accept":"application/vnd.github+json","User-Agent":"homepage-backup-summary","X-GitHub-Api-Version":"2022-11-28"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read()
runs=json.loads(get(f"https://api.github.com/repos/{REPO}/actions/workflows/bisync.yml/runs?per_page=15"))["workflow_runs"]
runs=[r for r in runs if r["status"]=="completed" and r["conclusion"] not in ("cancelled","skipped")]
if not runs: raise SystemExit("No completed backup runs")
run=runs[0]
existing=json.loads(DEST.read_text()) if DEST.exists() else {}
if existing.get("run_id")==run["id"]:
    print("Already current",run["id"])
    raise SystemExit(0)
jobs=json.loads(get(f"https://api.github.com/repos/{REPO}/actions/runs/{run['id']}/jobs?per_page=100"))["jobs"]
job=next((j for j in jobs if j["name"]=="run-bisync"),None)
if job is None: raise RuntimeError("Backup job not found")
log=get(f"https://api.github.com/repos/{REPO}/actions/jobs/{job['id']}/logs").decode("utf-8","replace")
def last(pattern):
    matches=re.findall(pattern,log,re.M|re.I)
    return matches[-1] if matches else None
# Prefer last rclone transfer progress, excluding workflow script echo lines.
stats=re.findall(r"^.*?INFO\s+:\s+([\d.]+)\s+GiB\s*/\s*([\d.]+)\s+GiB,\s*\d+%,\s*([\d.]+)\s+MiB/s",log,re.M)
progress=stats[-1] if stats else None
rc=last(r"^.*?Rclone exit code:\s*(\d+)\s*$")
ignored=last(r"^.*?Total ignored files\s*:\s*(\d+)\s*$")
new=last(r"^.*?New ignored files\s*:\s*(\d+)\s*$")
status="success" if rc=="0" and "Bisync successful" in log else ("paused" if rc=="124" else "failure")
warning="Các file bị bỏ qua không được backup."
if "Dangling shortcut" in log: warning="Có shortcut Google Drive bị hỏng. "+warning
report={"run_id":run["id"],"run_url":run["html_url"],"status":status,
"transferred_gib":float(progress[0]) if progress else None,
"speed_mib_s":float(progress[2]) if progress else None,
"ignored_count":int(ignored) if ignored is not None else None,
"new_ignored_count":int(new) if new is not None else None,
"finished_at":job.get("completed_at") or run.get("updated_at"),"warning":warning}
DEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("Updated sanitized backup summary",run["id"],status)
