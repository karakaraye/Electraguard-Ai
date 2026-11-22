/**
 * A small ICU-style message formatter.
 *
 * Supported syntax:
 *   "Hello {name}"
 *   "{count, plural, =0 {No reports} one {# report} other {# reports}}"
 *   "{kind, select, photo {Photo} video {Video} other {File}}"
 * Inside a plural branch, # is the number formatted for the locale.
 * Literal braces are not supported in messages.
 */

export type MessageVars = Record<string, string | number | undefined | null>;

type Node =
  | { type: "text"; value: string }
  | { type: "var"; name: string }
  | { type: "hash" }
  | { type: "plural"; name: string; offset: number; branches: Record<string, Node[]> }
  | { type: "select"; name: string; branches: Record<string, Node[]> };

const astCache = new Map<string, Node[]>();

function parse(message: string): Node[] {
  const cached = astCache.get(message);
  if (cached) return cached;
  let pos = 0;

  function parseNodes(inPlural: boolean, stopAtBrace: boolean): Node[] {
    const nodes: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) nodes.push({ type: "text", value: text });
      text = "";
    };
    while (pos < message.length) {
      const ch = message[pos];
      if (ch === "}" && stopAtBrace) break;
      if (ch === "{") {
        flush();
        nodes.push(parseArgument());
        continue;
      }
      if (ch === "#" && inPlural) {
        flush();
        nodes.push({ type: "hash" });
        pos++;
        continue;
      }
      text += ch;
      pos++;
    }
    flush();
    return nodes;
  }

  function readUntil(stops: string): string {
    let out = "";
    while (pos < message.length && !stops.includes(message[pos])) out += message[pos++];
    return out.trim();
  }

  function skipSpace() {
    while (pos < message.length && /\s/.test(message[pos])) pos++;
  }

  function parseArgument(): Node {
    pos++; // {
    const name = readUntil(",}");
    if (message[pos] === "}") {
      pos++;
      return { type: "var", name };
    }
    pos++; // ,
    const kind = readUntil(",}");
    if (message[pos] === "}") {
      pos++;
      return { type: "var", name };
    }
    pos++; // ,
    let offset = 0;
    const branches: Record<string, Node[]> = {};
    for (;;) {
      skipSpace();
      if (pos >= message.length || message[pos] === "}") break;
      const selector = readUntil("{ ");
      skipSpace();
      if (selector.startsWith("offset:")) {
        offset = Number(selector.slice(7)) || 0;
        continue;
      }
      if (message[pos] !== "{") break;
      pos++; // {
      branches[selector] = parseNodes(kind === "plural", true);
      pos++; // }
    }
    pos++; // closing }
    if (kind === "plural") return { type: "plural", name, offset, branches };
    return { type: "select", name, branches };
  }

  const nodes = parseNodes(false, false);
  astCache.set(message, nodes);
  return nodes;
}

const pluralCache = new Map<string, Intl.PluralRules>();
const numberCache = new Map<string, Intl.NumberFormat>();

function pluralRules(tag: string): Intl.PluralRules {
  let rules = pluralCache.get(tag);
  if (!rules) {
    const supported = Intl.PluralRules.supportedLocalesOf([tag]);
    // Nigerian Pidgin follows the English one/other rule when a runtime lacks its data.
    rules = new Intl.PluralRules(supported.length ? tag : "en");
    pluralCache.set(tag, rules);
  }
  return rules;
}

export function formatNumber(value: number, tag: string): string {
  let format = numberCache.get(tag);
  if (!format) {
    const supported = Intl.NumberFormat.supportedLocalesOf([tag]);
    format = new Intl.NumberFormat(supported.length ? tag : "en-NG");
    numberCache.set(tag, format);
  }
  return format.format(value);
}

function render(nodes: Node[], vars: MessageVars, tag: string, hashValue?: number): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += node.value;
        break;
      case "hash":
        out += hashValue === undefined ? "#" : formatNumber(hashValue, tag);
        break;
      case "var": {
        const value = vars[node.name];
        out +=
          value === undefined || value === null
            ? `{${node.name}}`
            : typeof value === "number"
              ? formatNumber(value, tag)
              : value;
        break;
      }
      case "plural": {
        const raw = Number(vars[node.name] ?? 0);
        const exact = node.branches[`=${raw}`];
        const value = raw - node.offset;
        const branch = exact ?? node.branches[pluralRules(tag).select(value)] ?? node.branches.other ?? [];
        out += render(branch, vars, tag, value);
        break;
      }
      case "select": {
        const key = String(vars[node.name] ?? "other");
        out += render(node.branches[key] ?? node.branches.other ?? [], vars, tag, hashValue);
        break;
      }
    }
  }
  return out;
}

export function formatMessage(message: string, vars: MessageVars = {}, tag = "en"): string {
  if (!message.includes("{")) return message;
  return render(parse(message), vars, tag);
}
