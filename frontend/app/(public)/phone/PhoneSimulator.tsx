"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { api, uuidv4 } from "../../../lib/api/client";
import type { SimMessage } from "../../../lib/api/types";
import { SMS_SHORT_CODE } from "../../../lib/config";
import { useLocale, useT } from "../../../lib/i18n/client";
import { formatWatTime } from "../../../ui/format";
import { Banner } from "../../../ui/Banner/Banner";
import { ListIcon, MessageIcon, PhoneIcon, SearchIcon, SignalIcon } from "../../../ui/icons";
import { CATEGORY_ROWS, USSD_SERVICE_CODE } from "../_lib/public";
import styles from "./phone.module.css";

type Message = SimMessage & { from: string; direction: "in" | "out" };

type View =
  | { name: "home" }
  | { name: "ussd"; sessionId: string; text: string }
  | { name: "ussdEnd"; text: string }
  | { name: "compose" }
  | { name: "inbox" }
  | { name: "message"; id: string };

export type PhoneSeed = {
  status: "loading" | "ready" | "disabled" | "unreachable";
  phoneLabel?: string;
  view?: View;
  messages?: Message[];
  draft?: string;
  notice?: string | null;
};

const KEYS: Array<{ key: string; letters?: string }> = [
  { key: "1" }, { key: "2", letters: "ABC" }, { key: "3", letters: "DEF" },
  { key: "4", letters: "GHI" }, { key: "5", letters: "JKL" }, { key: "6", letters: "MNO" },
  { key: "7", letters: "PQRS" }, { key: "8", letters: "TUV" }, { key: "9", letters: "WXYZ" },
  { key: "*" }, { key: "0", letters: "+" }, { key: "#" },
];

const SMS_MAX = 160;
const USSD_MAX = 140;

/**
 * P-07 on-screen basic phone (SIM-01). Drives the same SMS and USSD handlers as the
 * real gateway, so what a judge sees here is the production code path. Reports sent
 * from it carry `simulated: true` and never reach the public results.
 */
/** Where the phone opens: the dial pad (default), the USSD code already typed, or a new SMS. */
export type PhoneStart = "home" | "ussd" | "sms";

export function PhoneSimulator({ seed, start = "home" }: { seed?: PhoneSeed; start?: PhoneStart }) {
  const t = useT();
  const { locale } = useLocale();
  const preview = Boolean(seed);
  const [status, setStatus] = useState<PhoneSeed["status"]>(seed?.status ?? "loading");
  const [phoneLabel, setPhoneLabel] = useState(seed?.phoneLabel ?? "");
  const [view, setView] = useState<View>(seed?.view ?? (start === "sms" ? { name: "compose" } : { name: "home" }));
  const [dial, setDial] = useState(start === "ussd" ? USSD_SERVICE_CODE : "");
  const [reply, setReply] = useState("");
  const [draft, setDraft] = useState(seed?.draft ?? "");
  const [messages, setMessages] = useState<Message[]>(seed?.messages ?? []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(seed?.notice ?? null);
  const [unread, setUnread] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const lastId = useRef<string | undefined>(undefined);
  const timers = useRef<number[]>([]);

  const problem = useCallback(
    (result: { status: number; error: { code: string } }) => {
      if (result.status === 0) return t("p07.error.network");
      if (result.error.code === "rate_limited") return t("p07.error.tooMany");
      if (result.error.code === "validation_failed") return t("p07.error.invalid");
      return t("p07.error.server");
    },
    [t],
  );

  const known = useRef(new Set<string>((seed?.messages ?? []).map((m) => m.id)));
  const started = useRef(false);

  const refreshInbox = useCallback(async () => {
    const result = await api("SIM-01.inbox", { query: lastId.current ? { after: lastId.current } : undefined });
    if (!result.ok) {
      if (result.status === 404) setStatus("disabled");
      else if (!started.current) setStatus("unreachable");
      return;
    }
    started.current = true;
    setStatus("ready");
    setPhoneLabel(result.data.phone_label);
    const fresh = result.data.messages.filter((m) => !known.current.has(m.id));
    if (result.data.messages.length) lastId.current = result.data.messages[result.data.messages.length - 1].id;
    if (fresh.length) {
      fresh.forEach((m) => known.current.add(m.id));
      setUnread((count) => count + fresh.length);
      setMessages((current) => [...current, ...fresh.map((m) => ({ ...m, direction: "in" as const }))]);
    }
  }, []);

  useEffect(() => {
    if (preview) return;
    const first = window.setTimeout(() => void refreshInbox(), 0);
    const list = timers.current;
    return () => {
      window.clearTimeout(first);
      list.forEach((id) => window.clearTimeout(id));
    };
  }, [preview, refreshInbox]);

  /** Replies from the gateway job can arrive a few seconds after a USSD session ends. */
  function watchInbox() {
    if (preview) return;
    for (const delay of [1500, 5000, 12000]) timers.current.push(window.setTimeout(() => void refreshInbox(), delay));
  }

  /** Move focus with the view: into its field, or onto the screen when it has none (so Enter is OK). */
  const shownView = useRef(view.name);
  useEffect(() => {
    const changed = shownView.current !== view.name;
    shownView.current = view.name;
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
    else if (changed) screenRef.current?.focus({ preventScroll: true });
  }, [view.name]);

  function go(next: View) {
    setNotice(null);
    if (next.name === "inbox") setUnread(0);
    setView(next);
  }

  async function ussd(sessionId: string, input: string) {
    setBusy(true);
    setNotice(null);
    const result = await api("SIM-01.ussd", { body: { session_id: sessionId, service_code: USSD_SERVICE_CODE, input } });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 404) setStatus("disabled");
      else setNotice(problem(result));
      return;
    }
    setReply("");
    if (result.data.type === "END") {
      go({ name: "ussdEnd", text: result.data.text });
      watchInbox();
    } else {
      setView({ name: "ussd", sessionId, text: result.data.text });
    }
  }

  async function sendSms() {
    const text = draft.trim();
    if (!text) {
      setNotice(t("p07.sms.empty"));
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await api("SIM-01.sms", { body: { text } });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 404) setStatus("disabled");
      else setNotice(problem(result));
      return;
    }
    const now = new Date().toISOString();
    const replies = result.data.replies.filter((m) => !known.current.has(m.id));
    replies.forEach((m) => known.current.add(m.id));
    setMessages((current) => [
      ...current,
      { id: `out-${uuidv4()}`, text, received_at: now, from: phoneLabel, direction: "out" as const },
      ...replies.map((m) => ({ ...m, from: "ElectraGuard", direction: "in" as const })),
    ]);
    const last = result.data.replies[result.data.replies.length - 1];
    if (last) lastId.current = last.id;
    setDraft("");
    go({ name: "inbox" });
    watchInbox();
  }

  async function reset() {
    setBusy(true);
    const result = await api("SIM-01.reset", { body: {} });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 404) setStatus("disabled");
      else setNotice(problem(result));
      return;
    }
    lastId.current = undefined;
    known.current = new Set();
    setPhoneLabel(result.data.phone_label);
    setMessages([]);
    setUnread(0);
    setDial("");
    setDraft("");
    go({ name: "home" });
  }

  function call() {
    if (busy) return;
    if (view.name === "home") {
      const number = dial.replace(/\s/g, "");
      if (!number) {
        setNotice(t("p07.home.hint", { code: USSD_SERVICE_CODE }));
        return;
      }
      if (number !== USSD_SERVICE_CODE) {
        setNotice(t("p07.ussd.wrongCode", { code: USSD_SERVICE_CODE }));
        return;
      }
      setDial("");
      void ussd(uuidv4(), "");
    } else if (view.name === "ussd") {
      if (!reply.trim()) return;
      void ussd(view.sessionId, reply.trim());
    } else if (view.name === "compose") {
      void sendSms();
    }
  }

  function end() {
    if (view.name === "ussdEnd") watchInbox();
    setDial("");
    setReply("");
    go({ name: "home" });
  }

  function press(key: string) {
    setNotice(null);
    if (view.name === "home") setDial((value) => (value + key).slice(0, 20));
    else if (view.name === "ussd") setReply((value) => (value + key).slice(0, USSD_MAX));
    else if (view.name === "compose") setDraft((value) => (value + key).slice(0, SMS_MAX));
    inputRef.current?.focus({ preventScroll: true });
  }

  function backspace() {
    if (view.name === "home") setDial((value) => value.slice(0, -1));
    else if (view.name === "ussd") setReply((value) => value.slice(0, -1));
    else if (view.name === "compose") setDraft((value) => value.slice(0, -1));
  }

  /**
   * A physical keyboard works like the keypad: digits, * and # type, Enter is OK,
   * Escape is End and Backspace clears. Fields keep their own typing and Enter.
   */
  function onDeviceKey(event: KeyboardEvent<HTMLDivElement>) {
    if (status !== "ready" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      end();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (target.tagName === "BUTTON" && (event.key === "Enter" || event.key === " ")) return;
    const typing = view.name === "home" || view.name === "ussd" || view.name === "compose";
    if (typing && /^[0-9*#]$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
    } else if (event.key === "Backspace" && typing) {
      event.preventDefault();
      backspace();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (view.name === "ussdEnd") end();
      else call();
    }
  }

  function loadExample(text: string) {
    setDraft(text);
    go({ name: "compose" });
    document.getElementById("eg-phone")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* ---------- Soft keys per view ---------- */

  type Soft = { label: string; action: () => void; disabled?: boolean };
  let left: Soft;
  let right: Soft;
  switch (view.name) {
    case "home":
      left = { label: unread ? t("p07.key.messagesCount", { count: unread }) : t("p07.key.messages"), action: () => go({ name: "inbox" }) };
      right = { label: t("p07.key.clear"), action: backspace, disabled: !dial };
      break;
    case "ussd":
      left = { label: t("p07.key.send"), action: call, disabled: busy || !reply.trim() };
      right = { label: t("p07.key.clear"), action: backspace, disabled: !reply };
      break;
    case "ussdEnd":
      left = { label: t("p07.key.ok"), action: end };
      right = { label: t("p07.key.messages"), action: () => go({ name: "inbox" }) };
      break;
    case "compose":
      left = { label: t("p07.key.send"), action: call, disabled: busy };
      right = { label: t("p07.key.back"), action: () => go({ name: "inbox" }) };
      break;
    case "inbox":
      left = { label: t("p07.key.write"), action: () => go({ name: "compose" }) };
      right = { label: t("p07.key.back"), action: () => go({ name: "home" }) };
      break;
    case "message":
      left = { label: t("p07.key.write"), action: () => go({ name: "compose" }) };
      right = { label: t("p07.key.back"), action: () => go({ name: "inbox" }) };
      break;
  }

  /* ---------- Screen content ---------- */

  let screen: ReactNode;
  if (status === "loading") {
    screen = <p className={styles.center}>{t("p07.screen.starting")}</p>;
  } else if (status === "unreachable") {
    screen = (
      <div className={styles.center}>
        <p>{t("p07.error.network")}</p>
        <button type="button" className={styles.inline} onClick={() => { setStatus("loading"); void refreshInbox(); }}>
          {t("ui.retry")}
        </button>
      </div>
    );
  } else if (view.name === "home") {
    screen = (
      <form className={styles.dial} onSubmit={(event: FormEvent) => { event.preventDefault(); call(); }}>
        <label className={styles.screenLabel} htmlFor="eg-dial">{t("p07.home.label")}</label>
        <input
          id="eg-dial"
          ref={(node) => { inputRef.current = node; }}
          className={`${styles.dialInput} eg-tnum`}
          value={dial}
          onChange={(event) => setDial(event.target.value.replace(/[^0-9*#+]/g, "").slice(0, 20))}
          inputMode="tel"
          autoComplete="off"
          data-testid="phone-dial"
        />
        <p className={styles.hint}>{t("p07.home.hint", { code: USSD_SERVICE_CODE })}</p>
      </form>
    );
  } else if (view.name === "ussd") {
    screen = (
      <form className={styles.ussd} onSubmit={(event: FormEvent) => { event.preventDefault(); call(); }}>
        <p className={styles.ussdText} data-testid="phone-ussd-text">{view.text}</p>
        <label className={styles.screenLabel} htmlFor="eg-ussd-reply">{t("p07.ussd.reply")}</label>
        <input
          id="eg-ussd-reply"
          ref={(node) => { inputRef.current = node; }}
          className={styles.replyInput}
          value={reply}
          onChange={(event) => setReply(event.target.value.slice(0, USSD_MAX))}
          autoComplete="off"
          data-testid="phone-ussd-reply"
        />
      </form>
    );
  } else if (view.name === "ussdEnd") {
    screen = (
      <div className={styles.ussd}>
        <p className={styles.ussdText} data-testid="phone-ussd-end">{view.text}</p>
        <p className={styles.hint}>{t("p07.ussd.ended")}</p>
      </div>
    );
  } else if (view.name === "compose") {
    screen = (
      <form className={styles.compose} onSubmit={(event: FormEvent) => { event.preventDefault(); call(); }}>
        <p className={styles.to}>{t("p07.sms.to", { shortCode: SMS_SHORT_CODE })}</p>
        <label className={styles.screenLabel} htmlFor="eg-sms">{t("p07.sms.label")}</label>
        <textarea
          id="eg-sms"
          ref={(node) => { inputRef.current = node; }}
          className={styles.smsInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, SMS_MAX))}
          rows={4}
          data-testid="phone-sms"
        />
        <p className={`${styles.count} eg-tnum`}>{t("p07.sms.count", { count: [...draft].length, max: SMS_MAX })}</p>
      </form>
    );
  } else if (view.name === "inbox") {
    screen = messages.length === 0 ? (
      <p className={styles.center}>{t("p07.inbox.empty")}</p>
    ) : (
      <ul className={styles.inbox} aria-label={t("p07.inbox.title")} data-testid="phone-inbox">
        {[...messages].reverse().map((message) => (
          <li key={message.id}>
            <button type="button" onClick={() => go({ name: "message", id: message.id })}>
              <span className={styles.msgFrom}>
                {message.direction === "out" ? t("p07.inbox.you") : message.from}
                <span className="eg-tnum">{formatWatTime(message.received_at, locale)}</span>
              </span>
              <span className={styles.msgText}>{message.text}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  } else {
    const message = messages.find((m) => m.id === view.id);
    screen = message ? (
      <div className={styles.message}>
        <p className={styles.msgFrom}>
          {message.direction === "out" ? t("p07.inbox.you") : message.from}
          <span className="eg-tnum">{formatWatTime(message.received_at, locale)}</span>
        </p>
        <p className={styles.messageText}>{message.text}</p>
      </div>
    ) : (
      <p className={styles.center}>{t("p07.inbox.empty")}</p>
    );
  }

  if (status === "disabled") {
    return (
      <div className={styles.disabled} data-testid="phone-disabled">
        <p className={styles.disabledTitle}>{t("p07.disabled.title")}</p>
        <p>{t("p07.disabled.body")}</p>
      </div>
    );
  }

  const ready = status === "ready";
  const viewTitle =
    view.name === "inbox" || view.name === "message" ? t("p07.inbox.title")
      : view.name === "compose" ? t("p07.sms.title")
        : view.name === "ussd" || view.name === "ussdEnd" ? USSD_SERVICE_CODE
          : t("p07.home.title");

  return (
    <div className={styles.wrap}>
      <Banner tone="info" title={t("p07.banner")} data-testid="phone-banner" />
      <div className={styles.layout}>
        <div
          className={styles.device}
          id="eg-phone"
          role="group"
          aria-label={t("p07.deviceLabel")}
          aria-describedby="p07-keyboard"
          onKeyDown={onDeviceKey}
          data-testid="phone"
        >
          <div className={styles.speaker} aria-hidden="true" />
          <section
            ref={screenRef}
            tabIndex={-1}
            className={styles.screen}
            aria-label={t("p07.screenLabel")}
            aria-busy={busy || undefined}
          >
            <div className={styles.statusBar}>
              <SignalIcon size={16} />
              <span className="eg-tnum">{phoneLabel || "..."}</span>
            </div>
            <p className={styles.viewTitle}>{viewTitle}</p>
            <div className={styles.content} aria-live="polite">
              {busy ? <p className={styles.center}>{t("p07.screen.wait")}</p> : screen}
            </div>
            {notice ? <p className={styles.notice} role="alert">{notice}</p> : null}
            <div className={styles.softLabels} aria-hidden="true">
              <span>{ready ? left.label : ""}</span>
              <span>{ready ? right.label : ""}</span>
            </div>
          </section>

          <div className={styles.keys} role="group" aria-label={t("p07.keypadLabel")}>
            <div className={styles.softRow}>
              <button type="button" className={styles.soft} onClick={left.action} disabled={!ready || left.disabled} data-testid="phone-soft-left">
                {left.label}
              </button>
              <button type="button" className={styles.soft} onClick={right.action} disabled={!ready || right.disabled} data-testid="phone-soft-right">
                {right.label}
              </button>
            </div>
            <div className={styles.callRow}>
              <button type="button" className={styles.call} onClick={call} disabled={!ready || busy} data-testid="phone-call">
                <PhoneIcon size={20} />
                {view.name === "compose" || view.name === "ussd" ? t("p07.key.send") : t("p07.key.call")}
              </button>
              <button type="button" className={styles.end} onClick={end} disabled={!ready} data-testid="phone-end">
                {t("p07.key.end")}
              </button>
            </div>
            <div className={styles.pad}>
              {KEYS.map(({ key, letters }) => (
                <button
                  key={key}
                  type="button"
                  className={styles.key}
                  onClick={() => press(key)}
                  disabled={!ready || busy || !(view.name === "home" || view.name === "ussd" || view.name === "compose")}
                  aria-label={key === "*" ? t("p07.key.star") : key === "#" ? t("p07.key.hash") : key}
                  data-testid={`phone-key-${key === "*" ? "star" : key === "#" ? "hash" : key}`}
                >
                  <span className={styles.digit} aria-hidden="true">{key}</span>
                  {letters ? <span className={styles.letters} aria-hidden="true">{letters}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className={styles.guide} aria-labelledby="p07-try">
          <h2 id="p07-try" className={styles.guideTitle}>{t("p07.how.title")}</h2>
          <p id="p07-keyboard" className={styles.more}>{t("p07.keyboard")}</p>
          <ol className={styles.tries}>
            <li className={styles.try}>
              <span className={styles.disc} aria-hidden="true"><PhoneIcon size={20} /></span>
              <div className={styles.tryBody}>
                <p>{t("p07.how.ussd", { code: USSD_SERVICE_CODE })}</p>
                <p className={`${styles.command} eg-tnum`}>{USSD_SERVICE_CODE}</p>
              </div>
            </li>
            <li className={styles.try}>
              <span className={styles.disc} aria-hidden="true"><MessageIcon size={20} /></span>
              <div className={styles.tryBody}>
                <p>{t("p07.how.report")}</p>
                <p className={`${styles.command} eg-tnum`}>{t("p07.how.reportExample")}</p>
                <button type="button" className={styles.example} onClick={() => loadExample(t("p07.how.reportExample"))} disabled={!ready} data-testid="phone-example-report">
                  {t("p07.example")}
                </button>
              </div>
            </li>
            <li className={styles.try}>
              <span className={styles.disc} aria-hidden="true"><SearchIcon size={20} /></span>
              <div className={styles.tryBody}>
                <p>{t("p07.how.status")}</p>
                <p className={`${styles.command} eg-tnum`}>STATUS EG-XXXX-XXXX</p>
                <button type="button" className={styles.example} onClick={() => loadExample("STATUS ")} disabled={!ready} data-testid="phone-example-status">
                  {t("p07.startMessage")}
                </button>
              </div>
            </li>
          </ol>

          <section className={styles.card} aria-labelledby="p07-more">
            <h3 id="p07-more" className={styles.cardTitle}>{t("p07.more.title")}</h3>
            <div className={styles.moreRow}>
              <p>{t("p07.how.reply")}</p>
              <p className={`${styles.command} eg-tnum`}>REPLY EG-XXXX-XXXX</p>
            </div>
            <div className={styles.moreRow}>
              <p>{t("p07.how.lang")}</p>
              <p className={`${styles.command} eg-tnum`}>LANG PCM</p>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="p07-cats">
            <h3 id="p07-cats" className={styles.cardTitle}>
              <span className={styles.discSmall} aria-hidden="true"><ListIcon size={18} /></span>
              {t("p07.categories.title")}
            </h3>
            <dl className={styles.cats}>
              {[...CATEGORY_ROWS.slice(0, 9), CATEGORY_ROWS[9]].map((cat) => (
                <div key={cat.value}>
                  <dt className="eg-tnum">{cat.number}</dt>
                  <dd>{t(cat.key)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className={styles.number}>
            <p>{t("p07.simulated", { number: phoneLabel || "..." })}</p>
            <button type="button" className={styles.example} onClick={() => void reset()} disabled={!ready || busy} data-testid="phone-reset">
              {t("p07.reset")}
            </button>
            <p className={styles.small}>{t("p07.resetHint")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
