#!/usr/bin/env bash
#
# Turn a Google service-account JSON key into the three lines that go in .env.
#
# WHY THIS EXISTS. The private key is a multi-line PEM, and .env cannot hold
# real newlines — so it has to be written with literal \n. Copying it by hand
# from the JSON is where this goes wrong, and the failure is a confusing
# `invalid_grant` rather than anything that says "your key lost its newlines".
#
# It also prints the Unique ID (`client_id`), which is what the Workspace admin
# pastes into Admin console → Security → API controls → Domain-wide delegation.
# That is a different value from `client_email`, and mixing the two up produces
# `unauthorized_client`.
#
# Usage:
#   scripts/gmail-key-to-env.sh ~/Downloads/cipansor-mailer-abc123.json
#
# Nothing is written anywhere: the output goes to stdout for you to paste into
# .env yourself. Never commit the JSON file or the printed key.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <service-account-key.json>" >&2
  exit 64
fi

KEY_FILE="$1"

if [ ! -f "$KEY_FILE" ]; then
  echo "error: no such file: $KEY_FILE" >&2
  exit 66
fi

python3 - "$KEY_FILE" <<'PY'
import json
import sys

path = sys.argv[1]

try:
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
except json.JSONDecodeError as exc:
    sys.exit(f"error: {path} is not valid JSON ({exc})")

# The single most common mistake: creating an "OAuth 2.0 Client ID" instead of a
# service account. That download has client_id/client_secret and no private key,
# and it cannot do domain-wide delegation at all.
if data.get("type") != "service_account":
    sys.exit(
        "error: this is not a service-account key.\n"
        "       Its \"type\" is %r, expected \"service_account\".\n"
        "       An OAuth 2.0 Client ID download (client_id + client_secret) is a\n"
        "       different credential and will not work here. In Google Cloud\n"
        "       Console go to APIs & Services -> Credentials -> Service Accounts,\n"
        "       open the account, then Keys -> Add key -> Create new key -> JSON."
        % data.get("type")
    )

missing = [f for f in ("client_email", "private_key", "client_id") if not data.get(f)]
if missing:
    sys.exit(f"error: key file is missing: {', '.join(missing)}")

private_key = data["private_key"]
if "BEGIN PRIVATE KEY" not in private_key:
    sys.exit("error: private_key does not look like a PEM block")

escaped = private_key.replace("\n", "\\n")

print("# --- paste into .env on the production host ---")
print(f"GOOGLE_SERVICE_ACCOUNT_EMAIL={data['client_email']}")
print(f'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="{escaped}"')
print("GMAIL_SENDER=noreply@cipansor.or.id")
print()
print("# --- paste into Admin console -> domain-wide delegation ---")
print(f"# Client ID:    {data['client_id']}")
print("# OAuth scopes: https://www.googleapis.com/auth/gmail.send")
PY
