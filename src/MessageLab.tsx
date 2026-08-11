import "./messageLab.css";
import { useEffect, useMemo, useState } from "react";
import {
  analyzeMessage,
  createRevision,
  deleteMessage,
  getSemanticProfile,
  improveMessage,
  listMessages,
  listMotives,
  listOffers,
  saveMessage,
  saveSemanticProfile,
} from "./phase2Api";
import type { Message, Motive, Offer, SemanticProfile } from "./types";
import SemanticPanel from "./SemanticPanel";

export default function MessageLab() {
  const [offers, setOffers] = useState<Offer[]>([]),
    [motives, setMotives] = useState<Motive[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [selected, setSelected] = useState<Message | null>(null),
    [semantic, setSemantic] = useState<SemanticProfile | null>(null),
    [busy, setBusy] = useState(false),
    [improving, setImproving] = useState(false),
    [direction, setDirection] = useState(""),
    [note, setNote] = useState(""),
    [form, setForm] = useState({
      offer_id: "",
      motive_id: "",
      name: "",
      subject_line: "",
      body: "",
      ps: "",
    }),
    [error, setError] = useState("");
  const load = () =>
    Promise.all([listOffers(), listMotives(), listMessages()])
      .then(([o, m, x]) => {
        setOffers(o);
        setMotives(m);
        setMessages(x);
        if (!form.offer_id && o[0])
          setForm((f) => ({ ...f, offer_id: o[0].id }));
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const words = useMemo(
    () => (form.body.trim() ? form.body.trim().split(/\s+/).length : 0),
    [form.body],
  );

  async function open(m: Message) {
    setSelected(m);
    setNote("");
    setDirection("");
    setForm({
      offer_id: m.offer_id,
      motive_id: m.motive_id ?? "",
      name: m.name,
      subject_line: m.subject_line,
      body: m.body,
      ps: m.ps ?? "",
    });
    try {
      setSemantic(await getSemanticProfile(m.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    try {
      const m = await saveMessage({
        ...form,
        motive_id: form.motive_id || null,
      });
      setSelected(m);
      setSemantic(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function revise() {
    if (!selected) return;
    try {
      const r = await createRevision({
        ...selected,
        offer_id: form.offer_id,
        motive_id: form.motive_id || null,
        name: form.name,
        subject_line: form.subject_line,
        body: form.body,
      });
      await open(r);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function analyze() {
    if (!selected) {
      setError("Save the message before semantic analysis.");
      return;
    }
    try {
      setBusy(true);
      setSemantic(await analyzeMessage(selected.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function improve() {
    if (!semantic) {
      setError("Analyze the message before improving it.");
      return;
    }
    try {
      setImproving(true);
      setError("");
      const r = await improveMessage({
        ...form,
        motive_id: form.motive_id || null,
        direction,
        message_id: selected?.id ?? null,
      });
      setForm((f) => ({
        ...f,
        subject_line: r.subject_line,
        body: r.body,
        ps: r.ps ?? f.ps,
      }));
      setNote(
        r.note ?? "Improved draft loaded. Review, then save as a revision.",
      );
      setDirection("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImproving(false);
    }
  }
  async function saveSemantic(p: SemanticProfile) {
    try {
      setSemantic(
        await saveSemanticProfile({ ...p, analysis_source: "manual" }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeVersion(m: Message) {
    if (!window.confirm(`Delete ${m.name} · V${m.version_number}?`)) return;
    try {
      await deleteMessage(m.id);
      if (selected?.id === m.id) {
        setSelected(null);
        setSemantic(null);
        setForm((f) => ({
          ...f,
          name: "",
          subject_line: "",
          body: "",
          ps: "",
        }));
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Message Lab</h1>
          <p>
            Use a stored hypothesis, connect the offer, then assess how
            effectively the copy communicates both.
          </p>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="two-col message-lab">
        <section className="card form compact-form">
          <div className="step-kicker">STEP 2 · OFFER + COPY</div>
          <label>
            Stored hypothesis{" "}
            <span className="muted">
              selecting one skips hypothesis testing
            </span>
            <select
              value={form.motive_id}
              onChange={(e) => setForm({ ...form, motive_id: e.target.value })}
            >
              <option value="">Legacy message · no hypothesis</option>
              {motives.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.validation_status || "untested"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Offer
            <select
              value={form.offer_id}
              onChange={(e) => setForm({ ...form, offer_id: e.target.value })}
            >
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Subject line
            <input
              value={form.subject_line}
              onChange={(e) =>
                setForm({ ...form, subject_line: e.target.value })
              }
            />
          </label>
          <label>
            Body
            <textarea
              className="message-body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label>
            P.S. <span className="muted">optional</span>
            <textarea
              value={form.ps}
              onChange={(e) => setForm({ ...form, ps: e.target.value })}
            />
          </label>
          <div className="muted">
            {form.body.length} characters · {words} words{" "}
            {selected ? `· V${selected.version_number}` : ""}
          </div>
          <div className="actions">
            <button className="primary" onClick={save}>
              Save message
            </button>
            {selected && <button onClick={revise}>Create revision</button>}
          </div>
        </section>
        <section className="card versions-card">
          <h3>Versions</h3>
          {messages.length === 0 ? (
            <p className="muted">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div
                className={`version-row${selected?.id === m.id ? " active" : ""}`}
                key={m.id}
              >
                <button
                  className="list-item version-open"
                  onClick={() => open(m)}
                >
                  <b>{m.name}</b>
                  <span>
                    V{m.version_number} · {m.subject_line}
                  </span>
                </button>
                <button
                  className="version-delete"
                  title="Delete version"
                  aria-label={`Delete ${m.name} version ${m.version_number}`}
                  onClick={() => removeVersion(m)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </section>
      </div>
      {selected && (
        <>
          <SemanticPanel
            profile={semantic}
            onSave={saveSemantic}
            onAnalyze={analyze}
            busy={busy}
          />
          {semantic && (
            <section className="card improve-panel">
              <div className="step-kicker">STEP 3 · GUIDED IMPROVEMENT</div>
              <h3>Discuss the direction before rewriting</h3>
              <p className="muted">
                The analysis above remains the diagnosis. Tell the editor what
                you want to preserve or change.
              </p>
              <textarea
                placeholder="e.g. keep the anecdote, strengthen the evidence, and make the offer feel like the logical next step…"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              />
              <div className="ai-improve">
                <button
                  className="primary"
                  onClick={improve}
                  disabled={improving}
                >
                  {improving ? "Improving…" : "Create improved draft"}
                </button>
                {note && <span className="ai-note">{note}</span>}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
