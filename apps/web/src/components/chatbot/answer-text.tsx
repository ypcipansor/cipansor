import { Fragment } from "react";

/**
 * Renders the assistant's answer as formatted text instead of printing its
 * markup.
 *
 * The model writes markdown — that is how instruction-tuned models format a
 * list of fees or the steps of a registration — and the widget used to render
 * `{turn.content}` as a raw string, so visitors on the live site read
 * `**TK Qur'an**` with the asterisks. One real answer carried 22 of them.
 *
 * This is a deliberately small, hand-written subset rather than a markdown
 * library, for two reasons. The first is trust: this string comes from a
 * third-party inference endpoint, on a public page, and the safest way to be
 * sure it can never inject markup is to never parse markup — there is no
 * `dangerouslySetInnerHTML` here, only React elements built from matched
 * tokens, so anything unrecognised survives as text and nothing becomes HTML.
 * The second is weight: a markdown pipeline plus a sanitiser is a large
 * dependency to add to every public page for bold text and two kinds of list.
 *
 * Supported: paragraphs, `-`/`*`/`•` bullets, `1.` ordered lists, `#` headings,
 * `**bold**`, `*italic*`/`_italic_`, `` `code` `` and `[text](url)` links.
 * Anything else is left exactly as written, which is the right failure mode: an
 * unhandled construct reads as slightly noisy prose, never as a broken page.
 */

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+(.+)$/;
const ORDERED = /^\s*\d+[.)]\s+(.+)$/;
const HEADING = /^\s*#{1,6}\s+(.+)$/;

/**
 * Link schemes we will turn into an anchor.
 *
 * An allowlist, not a denylist: `javascript:` and `data:` are the obvious
 * attacks, but the guarantee we want is that a model — or text injected into
 * the corpus the model reads — cannot produce a clickable anything we did not
 * intend. A URL with any other scheme renders as its label plus the raw target,
 * so the visitor still sees what was written.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:|\/)/i;

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const line of source.split("\n")) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: heading[1].trim() });
      continue;
    }

    const ordered = ORDERED.exec(line);
    const bullet = ordered ? null : BULLET.exec(line);
    const item = ordered ?? bullet;
    if (item) {
      flushParagraph();
      const wantsOrdered = ordered !== null;
      // A list that changes marker mid-way is two lists, not one — otherwise
      // "1. 2. 3." followed by bullets would renumber the bullets.
      if (list && list.ordered !== wantsOrdered) flushList();
      list ??= { ordered: wantsOrdered, items: [] };
      list.items.push(item[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

/**
 * One regex, one pass. Alternation order matters: `**bold**` must be tried
 * before `*italic*`, or the italic branch would claim the first two asterisks
 * of every bold run and leave the rest stranded.
 */
const INLINE =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/;

export function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(INLINE);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    // `split` with a capturing group alternates plain/token, so odd indices are
    // the matched tokens. Testing the shape again would re-match substrings a
    // plain segment merely contains.
    if (index % 2 === 0) return <Fragment key={key}>{part}</Fragment>;

    if (part.startsWith("**") || part.startsWith("__")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-black/10 px-1 py-0.5 text-[0.9em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = LINK.exec(part);
    if (link) {
      const [, label, href] = link;
      if (!SAFE_SCHEME.test(href)) return <Fragment key={key}>{part}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          className="underline underline-offset-2"
          // The corpus is ours, but the string is the model's. Treat every link
          // it emits as external.
          rel="noopener noreferrer nofollow"
        >
          {label}
        </a>
      );
    }
    return <em key={key}>{part.slice(1, -1)}</em>;
  });
}

export function AnswerText({ children }: { children: string }) {
  const blocks = parseBlocks(children);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p key={index} className="font-semibold">
              {renderInline(block.text, `h${index}`)}
            </p>
          );
        }

        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={
                block.ordered
                  ? "list-decimal space-y-1 pl-5"
                  : "list-disc space-y-1 pl-5"
              }
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInline(item, `l${index}-${itemIndex}`)}
                </li>
              ))}
            </List>
          );
        }

        return <p key={index}>{renderInline(block.text, `p${index}`)}</p>;
      })}
    </div>
  );
}
