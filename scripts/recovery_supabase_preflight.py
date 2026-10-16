#!/usr/bin/env python3
"""Report whether this checkout contains a runnable isolated Supabase test stack."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path


SPECS = {
    "public": {
        "functions": ["public-write-gateway", "public-evidence-upload"],
        "tables": ["complaints", "complaint_evidence", "complaint_responses", "segments", "subcategories", "site_banners"],
        "rpcs": [
            "submit_public_complaint_v2",
            "register_public_complaint_evidence",
            "get_public_home_feed",
            "get_public_published_reports",
            "get_public_published_responses",
            "get_public_site_banners",
        ],
        "storage": True,
    },
    "admin": {
        "functions": ["admin-create-user", "admin-delete-user", "admin-system-health", "news-intake-scan", "news-intake-fetch"],
        "tables": ["complaints", "complaint_evidence", "complaint_responses", "segments", "subcategories", "site_banners"],
        "rpcs": [
            "admin_get_news_intake_automation_dashboard",
            "admin_get_news_intake_scan_sources",
            "admin_get_news_intake_taxonomy",
            "admin_preview_sourced_report_intake",
            "admin_create_sourced_report_from_intake",
            "admin_complete_news_intake_item_review",
            "admin_get_site_banners",
            "admin_save_banner_draft",
            "admin_publish_banner",
        ],
        "storage": False,
    },
}


def main() -> int:
    kind = sys.argv[1] if len(sys.argv) > 1 else ""
    if kind not in SPECS:
        print("usage: recovery_supabase_preflight.py public|admin", file=sys.stderr)
        return 2

    spec = SPECS[kind]
    root = Path.cwd()
    missing: list[str] = []
    migrations_dir = root / "supabase" / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))
    migration_sql = "\n".join(path.read_text(errors="replace") for path in migration_files)

    for path in [
        "supabase/config.toml",
        "supabase/seed.sql",
        "supabase/tests/recovery_security.sql",
        "tests/recovery-isolated/runner.mjs",
    ]:
        if not (root / path).is_file():
            missing.append(f"Required file absent: {path}")

    package_json = root / "package.json"
    if not package_json.is_file():
        missing.append("Required file absent: package.json")
    else:
        try:
            scripts = json.loads(package_json.read_text()).get("scripts", {})
        except (json.JSONDecodeError, OSError):
            scripts = {}
        if "test:recovery:integration" not in scripts:
            missing.append("Required integration harness script absent: package.json#scripts.test:recovery:integration")

    if not migration_files:
        missing.append("No ordered SQL migrations under supabase/migrations/")

    table_pattern = lambda table: re.compile(
        rf"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.{re.escape(table)}\b",
        re.IGNORECASE,
    )
    for table in spec["tables"]:
        if not table_pattern(table).search(migration_sql):
            missing.append(f"No core table-creation migration found for public.{table}")

    for function in spec["functions"]:
        if not (root / "supabase" / "functions" / function / "index.ts").is_file():
            missing.append(f"Required Edge Function source absent: supabase/functions/{function}/index.ts")

    for rpc in spec["rpcs"]:
        rpc_pattern = re.compile(
            rf"\bcreate\s+(?:or\s+replace\s+)?function\s+public\.{re.escape(rpc)}\s*\(",
            re.IGNORECASE,
        )
        if not rpc_pattern.search(migration_sql):
            missing.append(f"No ordered migration definition found for public.{rpc}(...)")

    if spec["storage"]:
        if "storage.buckets" not in migration_sql.lower():
            missing.append("No migration configures the evidence storage bucket in storage.buckets")
        if "storage.objects" not in migration_sql.lower():
            missing.append("No migration configures evidence-object RLS in storage.objects")

    ready = not missing
    status = "READY" if ready else "BLOCKED"
    print(f"{status}: {kind} application-local stack preflight")
    print(f"Found {len(migration_files)} ordered SQL migration(s) in supabase/migrations/.")
    for issue in missing:
        print(f"- {issue}")
    if ready:
        print("All required project files and integration entry points are present.")
    else:
        print("The blank runner smoke is not application integration acceptance.")
        print("Do not start or link an application stack until these verified files are recovered.")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as output:
            output.write(f"stack_ready={'true' if ready else 'false'}\n")

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write(f"## {status}: {kind.title()} application-local Supabase preflight\n\n")
            summary.write("The runner smoke uses only a blank disposable local Supabase project. It does not link to any hosted project.\n\n")
            if missing:
                summary.write("Missing verified recovery inputs:\n")
                summary.writelines(f"- `{issue}`\n" for issue in missing)
                summary.write("\nNo application migrations, Auth fixtures, Edge Functions, or workflow journeys were executed.\n")
            else:
                summary.write("All required inputs are present; the separate gated application integration job may run.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
