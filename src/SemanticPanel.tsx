import { useEffect, useState } from "react";
import type { SemanticProfile } from "./types";
const groups: { title: string; fields: [keyof SemanticProfile, string][] }[] = [
  {
    title: "Belief",
    fields: [
      ["current_belief_alignment", "Current belief"],
      ["insight_novelty", "Insight novelty"],
      ["perceived_truth", "Truth score"],
      ["worldview_shift", "Belief shift"],
      ["identity_compatibility", "Identity compatibility"],
      ["evidence_strength", "Evidence strength"],
    ],
  },
  {
    title: "Offer",
    fields: [
      ["offer_fit", "Offer fit"],
      ["offer_clarity", "Clarity"],
      ["offer_desirability", "Desirability"],
      ["offer_credibility", "Trust"],
      ["offer_roi", "ROI"],
      ["offer_risk", "Risk"],
      ["cta_strength", "CTA strength"],
    ],
  },
  {
    title: "Copy",
    fields: [
      ["copy_subject", "Subject"],
      ["hook_strength", "Hook"],
      ["readability", "Readability"],
      ["emotional_resonance", "Emotion"],
      ["authenticity", "Authenticity"],
      ["story_flow", "Story"],
      ["sales_smell", "Sales smell"],
    ],
  },
];
export default function SemanticPanel({
  profile,
  onSave,
  onAnalyze,
  busy,
}: {
  profile: SemanticProfile | null;
  onSave: (p: SemanticProfile) => Promise<void>;
  onAnalyze: () => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<SemanticProfile | null>(profile);
  useEffect(() => setDraft(profile), [profile]);
  if (!draft)
    return (
      <section className="card semantic">
        <div className="step-kicker">STEP 2 · ANALYSIS</div>
        <h3>Belief, offer and copy assessment</h3>
        <p className="muted">
          Analyze the saved message once. The simulator keeps the three causes
          separate before calculating behaviour.
        </p>
        <button className="primary" disabled={busy} onClick={onAnalyze}>
          {busy ? "Analyzing…" : "Analyze message"}
        </button>
      </section>
    );
  return (
    <section className="card semantic">
      <div className="semantic-head">
        <div>
          <div className="step-kicker">STEP 2 · ANALYSIS</div>
          <h3>Belief, offer and copy assessment</h3>
          <p className="muted">
            {draft.analysis_source} · {draft.model_name ?? "manual"}
          </p>
        </div>
        <button disabled={busy} onClick={onAnalyze}>
          Re-analyze
        </button>
      </div>
      <p className="semantic-summary">{draft.summary}</p>
      {draft.diagnosis && <div className="diagnosis">{draft.diagnosis}</div>}
      <div className="evaluation-groups">
        {groups.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <div className="semantic-grid">
              {group.fields.map(([key, label]) => (
                <label key={String(key)}>
                  {label}
                  <div className="semantic-input">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Number(draft[key] ?? 0)}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: Number(e.target.value) })
                      }
                    />
                    <b>{Number(draft[key] ?? 0)}</b>
                  </div>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      <label>
        Summary
        <textarea
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
      </label>
      <label>
        Key themes
        <input
          value={draft.key_themes.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              key_themes: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <div className="actions">
        <button className="primary" onClick={() => onSave(draft)}>
          Save assessment
        </button>
      </div>
    </section>
  );
}
