import { useEffect, useState } from "react";
import {
  analyzeMotive,
  archive,
  improveMotive,
  listMotives,
  saveMotive,
} from "./phase2Api";
import type { Motive } from "./types";

const blank: Partial<Motive> = {
  name: "",
  description: "",
  hypothesis: "",
  current_belief: "",
  desired_belief: "",
  core_insight: "",
  evidence: [],
  target_segments: [],
  status: "draft",
  validation_status: "untested",
};
const scores: [keyof Motive, string][] = [
  ["audience_fit", "Audience fit"],
  ["current_belief_alignment", "Current belief"],
  ["insight_novelty", "Insight novelty"],
  ["perceived_truth", "Truth score"],
  ["worldview_shift", "Belief-shift potential"],
  ["identity_compatibility", "Identity compatibility"],
  ["evidence_strength", "Evidence strength"],
];
const segments = [
  ["cxo", "CXO"],
  ["consultant", "Consultant"],
  ["corporate_refugee", "Corporate Refugee"],
];

export default function HypothesisLab() {
  const [rows, setRows] = useState<Motive[]>([]),
    [draft, setDraft] = useState<Partial<Motive> | null>(null),
    [busy, setBusy] = useState(false),
    [direction, setDirection] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    listMotives()
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function save() {
    if (!draft) return;
    try {
      await saveMotive({ ...draft, evidence: draft.evidence ?? [] });
      setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function test() {
    if (!draft?.id) {
      setError("Save the hypothesis before testing it.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const tested = await analyzeMotive(draft.id);
      setDraft(tested);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function improve() {
    if (!draft?.id) return;
    try {
      setBusy(true);
      const r = await improveMotive(draft.id, direction);
      setDraft({
        ...draft,
        current_belief: r.current_belief,
        desired_belief: r.desired_belief,
        core_insight: r.core_insight,
        evidence: r.evidence,
        validation_status: "untested",
      });
      setNote(r.note);
      setDirection("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doArchive(id: string) {
    await archive("lms_motives", id);
    if (draft?.id === id) setDraft(null);
    await load();
  }
  const evidence = (draft?.evidence ?? []).join("\n");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hypothesis Lab</h1>
          <p>
            Validate the audience motive before spending time perfecting the
            message.
          </p>
        </div>
        <button className="primary" onClick={() => setDraft({ ...blank })}>
          New hypothesis
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="belief-layout">
        <section className="card hypothesis-list">
          <h3>Stored hypotheses</h3>
          {rows.length === 0 ? (
            <p className="muted">No stored hypotheses yet.</p>
          ) : (
            rows.map((x) => (
              <button
                className={`hypothesis-item${draft?.id === x.id ? " active" : ""}`}
                key={x.id}
                onClick={() => {
                  setDraft({ ...x });
                  setNote("");
                }}
              >
                <b>{x.name}</b>
                <span>
                  {x.validation_status || "untested"}
                  {x.audience_fit != null ? ` · fit ${x.audience_fit}` : ""}
                </span>
              </button>
            ))
          )}
        </section>
        <section className="card form hypothesis-editor">
          {!draft ? (
            <div className="empty compact-empty">
              Choose a stored hypothesis or create a new one.
            </div>
          ) : (
            <>
              <div className="step-kicker">STEP 1 · HYPOTHESIS</div>
              <label>
                Name
                <input
                  value={draft.name ?? ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <fieldset className="segment-picker">
                <legend>Audience</legend>
                {segments.map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={(draft.target_segments ?? []).includes(value)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          target_segments: e.target.checked
                            ? [...(draft.target_segments ?? []), value]
                            : (draft.target_segments ?? []).filter(
                                (x) => x !== value,
                              ),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label>
                Audience hypothesis
                <textarea
                  value={draft.hypothesis ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, hypothesis: e.target.value })
                  }
                />
              </label>
              <label>
                What does the audience believe now?
                <textarea
                  value={draft.current_belief ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, current_belief: e.target.value })
                  }
                />
              </label>
              <label>
                What should they believe afterwards?
                <textarea
                  value={draft.desired_belief ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, desired_belief: e.target.value })
                  }
                />
              </label>
              <label>
                Core insight
                <textarea
                  value={draft.core_insight ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, core_insight: e.target.value })
                  }
                />
              </label>
              <label>
                Evidence <span className="muted">one item per line</span>
                <textarea
                  value={evidence}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      evidence: e.target.value
                        .split("\n")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <div className="actions">
                <button onClick={() => setDraft(null)}>Close</button>
                {draft.id && (
                  <button onClick={() => doArchive(draft.id!)}>Archive</button>
                )}
                <button className="primary" onClick={save}>
                  Save
                </button>
              </div>
              {draft.id && (
                <section className="analysis-block">
                  <div className="analysis-head">
                    <div>
                      <h3>Hypothesis assessment</h3>
                      <p className="muted">
                        {draft.validation_status || "untested"}
                        {draft.model_name ? ` · ${draft.model_name}` : ""}
                      </p>
                    </div>
                    <button className="primary" disabled={busy} onClick={test}>
                      {busy ? "Testing…" : "Test hypothesis"}
                    </button>
                  </div>
                  {draft.analysis_summary ? (
                    <>
                      <p>{draft.analysis_summary}</p>
                      <div className="score-grid">
                        {scores.map(([key, label]) => (
                          <div className="mini-score" key={String(key)}>
                            <span>{label}</span>
                            <b>{draft[key] as number}/100</b>
                          </div>
                        ))}
                      </div>
                      <div className="diagnosis">{draft.recommendation}</div>
                      <label>
                        Discuss improvement direction
                        <input
                          placeholder="e.g. make the insight more specific, strengthen the evidence…"
                          value={direction}
                          onChange={(e) => setDirection(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy || !direction.trim()}
                        onClick={improve}
                      >
                        Propose improved hypothesis
                      </button>
                      {note && <p className="muted">{note}</p>}
                    </>
                  ) : (
                    <p className="muted">
                      Test this hypothesis before using it in Message Lab. You
                      can still select an existing hypothesis there and skip
                      retesting it.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
