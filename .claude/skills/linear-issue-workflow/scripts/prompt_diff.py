#!/usr/bin/env python3
"""Readable diff of the brain prompts changed on the current branch, as a PR comment.

GitHub shows an agent's `system` prompt as one giant JSON line, so a prompt change is
unreadable in the PR review. This extracts the `system` of every agent snapshot changed
between the base and HEAD, splits it one sentence per line, and renders a ```diff block
per agent.

Usage (from the repo root):
  python3 .claude/skills/linear-issue-workflow/scripts/prompt_diff.py            # print the markdown
  python3 .claude/skills/linear-issue-workflow/scripts/prompt_diff.py --post 62  # create or update the PR comment
Options: --base <ref> (default: main).
"""
import argparse
import difflib
import json
import re
import subprocess
import sys

AGENTS_DIR = "tooling/brain/snapshot/agents/"
MARKER = "<!-- prompt-diff -->"
# A sentence ends with . ! or ? followed by a space. A list marker such as "1. " is not
# a sentence end, nor is an abbreviation like "ex. " or "etc. ".
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
NOT_AN_END = re.compile(r"(^\s*\d+\.|\b(ex|etc|cf|p\.ex)\.)$")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def system_at(ref: str, path: str) -> tuple[str, str]:
    """Return (agent name, system prompt) of a snapshot at a ref, or ("", "") if absent."""
    try:
        agent = json.loads(git("show", f"{ref}:{path}"))
    except subprocess.CalledProcessError:
        return "", ""
    return agent.get("name", ""), agent.get("system") or ""


def one_sentence_per_line(text: str) -> list[str]:
    lines: list[str] = []
    for line in text.split("\n"):
        pieces = SENTENCE_END.split(line)
        current = pieces[0]
        for piece in pieces[1:]:
            if NOT_AN_END.search(current):
                current = f"{current} {piece}"
                continue
            lines.append(current)
            current = piece
        lines.append(current)
    return lines


def render(base: str) -> str:
    changed = [
        path
        for path in git("diff", "--name-only", f"{base}...HEAD", "--", AGENTS_DIR).split()
        if path.endswith(".json")
    ]
    sections: list[str] = []
    for path in changed:
        old_name, old = system_at(base, path)
        new_name, new = system_at("HEAD", path)
        if old == new:
            continue
        diff = difflib.unified_diff(
            one_sentence_per_line(old),
            one_sentence_per_line(new),
            fromfile=base,
            tofile="PR",
            lineterm="",
            n=2,
        )
        sections.append(
            f"### `{new_name or old_name}` (`{path.removeprefix(AGENTS_DIR)}`)\n\n"
            "```diff\n" + "\n".join(diff) + "\n```"
        )
    if not sections:
        return ""
    head = git("rev-parse", "--short", "HEAD").strip()
    return (
        f"{MARKER}\n## 📝 Prompts modifiés\n\n"
        f"Diff lisible, une phrase par ligne, du `system` de chaque agent modifié "
        f"(le diff GitHub du JSON est illisible). À jour au commit `{head}`.\n\n"
        + "\n\n".join(sections)
    )


def post(pr: str, body: str) -> None:
    repo = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    comments = json.loads(subprocess.run(
        ["gh", "api", "--paginate", f"repos/{repo}/issues/{pr}/comments"],
        check=True, capture_output=True, text=True,
    ).stdout)
    existing = next((c for c in comments if MARKER in c["body"]), None)
    if existing:
        cmd = ["gh", "api", "-X", "PATCH", f"repos/{repo}/issues/comments/{existing['id']}"]
    else:
        cmd = ["gh", "api", "-X", "POST", f"repos/{repo}/issues/{pr}/comments"]
    out = subprocess.run(
        [*cmd, "-F", "body=@-", "--jq", ".html_url"],
        input=body, check=True, capture_output=True, text=True,
    ).stdout.strip()
    print(("Updated " if existing else "Posted ") + out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="main")
    parser.add_argument("--post", metavar="PR", help="PR number to create or update the comment on")
    args = parser.parse_args()
    body = render(args.base)
    if not body:
        print("Aucun prompt d'agent modifié.", file=sys.stderr)
        return
    if args.post:
        post(args.post, body)
    else:
        print(body)


if __name__ == "__main__":
    main()
