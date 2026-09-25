#!/usr/bin/env python3
"""Refuse operational secrets and infrastructure detail in committed records.

The repository is public until release, and git history keeps everything
forever. Project memory (`.claude/memory/`) and the docs are written by agents
as they work, so this is the mechanical backstop for the rule in AGENTS.md
("Where things live"): what an attacker could use — keys, tokens, connection
strings, cloud resource identifiers, IP addresses, this VM's paths — stays in
the machine-local memory under ~/.claude, never in the repo.

It cannot judge meaning. "Production still has X open" is sensitive and no
pattern catches it; that part of the rule is on whoever writes the note.

Usage:
  check-sensitive.py <path>...        scan files / directories (CI)
  check-sensitive.py --stdin <name>   scan text on stdin, reported as <name>
                                      (the Claude PreToolUse hook)
  check-sensitive.py --self-test      the cases below; CI runs it first
Exit 1 and one line per finding when anything matches, else exit 0.
"""
import os
import re
import sys

PATTERNS = [
    # A real key body follows the header; a documentation example is cut short
    # ("MIIEvQIBADANBg…") and is not a leak.
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----(\\n|\s)*[A-Za-z0-9+/=]{64,}")),
    ("GitHub token", re.compile(r"\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}")),
    ("Anthropic/OpenAI key", re.compile(r"\bsk-(ant-)?[A-Za-z0-9_-]{24,}")),
    ("AWS key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("Azure subscription/tenant id", re.compile(r"/subscriptions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)),
    # Not `<app>.azurewebsites.net`: the app names are in the deploy workflows
    # anyway, and both apps admit only Cloudflare's ranges (checked 2026-09-25).
    # A vault, a storage account or the database server has no reason to be
    # named in the repo.
    (
        "Azure resource hostname",
        re.compile(
            r"\b[a-z0-9-]+\.(vault\.azure\.net|blob\.core\.windows\.net|file\.core\.windows\.net"
            r"|postgres\.database\.azure\.com|scm\.azurewebsites\.net)\b",
            re.I,
        ),
    ),
    ("this VM's home path", re.compile(r"/home/cipansoradm\b")),
]

# scheme://user:password@host — reported unless the password is a placeholder
# or the host is local, which is how every example in the docs is written.
CONN = re.compile(r"\b[a-z][a-z0-9+.-]*://([^\s/:@]+):([^\s/@]+)@([^\s/:?\"'`]+)", re.I)
PLACEHOLDER_PW = re.compile(r"^(\*+|x+|\.+|…|password|pass|pw|postgres|secret|changeme|<[^>]*>|\$\{?\w+\}?)$", re.I)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "host", "db", "postgres", "example.com", "0.0.0.0"}

IPV4 = re.compile(r"(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])")
# Loopback, "any", the documentation ranges (RFC 5737) and the stock example
# 1.2.3.4 are not infrastructure detail.
IP_ALLOWED = ("127.", "0.0.0.0", "192.0.2.", "198.51.100.", "203.0.113.", "255.255.255.", "1.2.3.4")


def is_real_ip(m: re.Match) -> bool:
    octets = [int(x) for x in m.groups()]
    if any(o > 255 for o in octets):
        return False  # a version string or a date, not an address
    return not m.group(0).startswith(IP_ALLOWED)


def scan_text(name: str, text: str) -> list[str]:
    found = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for label, pat in PATTERNS:
            if pat.search(line):
                found.append(f"{name}:{lineno}: {label}")
        for m in CONN.finditer(line):
            pw, host = m.group(2), m.group(3).lower()
            if not PLACEHOLDER_PW.match(pw) and host not in LOCAL_HOSTS:
                found.append(f"{name}:{lineno}: connection string with credentials")
                break
        for m in IPV4.finditer(line):
            if is_real_ip(m):
                found.append(f"{name}:{lineno}: IP address")
                break
    return found


def iter_files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                for f in sorted(files):
                    if f.endswith((".md", ".txt", ".json", ".yml", ".yaml")):
                        yield os.path.join(root, f)
        elif os.path.isfile(p):
            yield p


# What must be caught, and the documentation idioms that must pass. Run by CI
# before the scan (`--self-test`), so a pattern edit that stops catching a real
# leak — or starts flagging every example in the docs — fails there first.
MUST_FLAG = [
    "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
    "token ghp_0123456789abcdefghijklmnopqrstuvwxyz",
    "DATABASE_URL=postgresql://app:Sup3rS3cret@pg-prod.internal:5432/db",
    "/subscriptions/12345678-1234-1234-1234-1234567890ab/resourceGroups/x",
    "vault example-kv.vault.azure.net",
    "the server at 10.1.2.3",
    "copied to /home/cipansoradm/cipansor-deploy",
]
MUST_PASS = [
    'DATABASE_URL="postgresql://user:password@host:5432/cipansor"',
    "postgresql://postgres:postgres@localhost:5432/test",
    "postgresql://user:***@db.example:5432/x",
    '"private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg…\\n-----END PRIVATE KEY-----"',
    "a forged CF-Connecting-IP: 1.2.3.4 from 127.0.0.1",
    "client 203.0.113.7, version 10.32.7, date 2026.09.25.1",
    "CNAME to <app>.azurewebsites.net",
    "~/cipansor-deploy/backups",
]


def self_test() -> int:
    bad = [t for t in MUST_FLAG if not scan_text("t", t)]
    bad += [t for t in MUST_PASS if scan_text("t", t)]
    for t in bad:
        print(f"self-test: wrong verdict for {t!r}")
    return 1 if bad else 0


def main(argv: list[str]) -> int:
    if argv[:1] == ["--self-test"]:
        return self_test()
    if len(argv) >= 2 and argv[0] == "--stdin":
        found = scan_text(argv[1], sys.stdin.read())
    else:
        found = []
        for f in iter_files(argv):
            with open(f, encoding="utf-8", errors="replace") as fh:
                found += scan_text(f, fh.read())
    for line in found:
        print(line)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
