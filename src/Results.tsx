import { useEffect, useState } from "react";
import {
  getSimulationSummary,
  listPersonaFeedback,
  listSimulations,
} from "./phase2Api";
import type { PersonaFeedback, Simulation, SimulationSummary } from "./types";

const labels = [
  "Not interesting",
  "For someone else",
  "For someone I know",
  "Different life stage",
  "Future interest",
  "Let me think",
  "Maybe info later",
  "Tell me more",
  "Sounds interesting",
  "Let’s talk",
  "OK, I am in",
];

export default function Results() {
  const [sims, setSims] = useState<Simulation[]>([]),
    [selected, setSelected] = useState(""),
    [summary, setSummary] = useState<SimulationSummary | null>(null),
    [personas, setPersonas] = useState<PersonaFeedback[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    listSimulations()
      .then((x) => {
        setSims(x);
        setSelected(x[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!selected) {
      setSummary(null);
      setPersonas([]);
      return;
    }
    Promise.all([getSimulationSummary(selected), listPersonaFeedback(selected)])
      .then(([s, p]) => {
        setSummary(s);
        setPersonas(p);
      })
      .catch((e) => setError(e.message));
  }, [selected]);
  const total = summary?.total_responses ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Results</h1>
          <p>Activation 7–10 is success. Everything below 7 is a loss.</p>
        </div>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {sims.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {!selected ? (
        <div className="empty">No simulations yet.</div>
      ) : !summary ? (
        <div className="empty">Loading…</div>
      ) : total === 0 ? (
        <div className="empty">This simulation has no responses yet.</div>
      ) : (
        <>
          <div className="cards result-cards">
            <Metric label="Audience tested" value={total} />
            <Metric label="Open rate" value={`${summary.open_rate}%`} />
            <Metric label="Read rate" value={`${summary.read_rate}%`} />
            <Metric
              label="Avg activation"
              value={`${summary.avg_activation}/10`}
            />
            <Metric
              label="Activation rate 7–10"
              value={`${summary.success_rate}%`}
            />
          </div>
          <div className="result-sections">
            <section>
              <h3>Belief</h3>
              <div className="cards">
                <Metric label="Belief shift" value={summary.avg_belief_shift} />
                <Metric label="Truth / trust" value={summary.avg_trust} />
                <Metric
                  label="Self-recognition"
                  value={summary.avg_self_recognition}
                />
              </div>
            </section>
            <section>
              <h3>Offer</h3>
              <div className="cards">
                <Metric label="Offer fit" value={summary.avg_offer_fit} />
                <Metric
                  label="Purchase intent"
                  value={summary.avg_purchase_intent}
                />
                <Metric
                  label="Referral intent"
                  value={summary.avg_referral_intent}
                />
              </div>
            </section>
            <section>
              <h3>Behaviour</h3>
              <div className="cards">
                <Metric label="Save" value={`${summary.save_rate}%`} />
                <Metric label="Forward" value={`${summary.forward_rate}%`} />
                <Metric label="Book" value={`${summary.book_rate}%`} />
                <Metric label="Purchase" value={`${summary.purchase_rate}%`} />
              </div>
            </section>
          </div>
          <div className="card activation-table">
            {labels.map((label, i) => {
              const n = summary[
                `level_${i}` as keyof SimulationSummary
              ] as number;
              return (
                <div
                  className={
                    i >= 7 ? "activation-row success-level" : "activation-row"
                  }
                  key={i}
                >
                  <b>{i}</b>
                  <span className="activation-label">{label}</span>
                  <div className="activation-bar">
                    <i style={{ width: `${pct(n)}%` }} />
                  </div>
                  <strong className="activation-pct">{pct(n)}%</strong>
                </div>
              );
            })}
          </div>
          <div className="cards">
            <Metric label="Interest" value={summary.avg_interest} />
            <Metric label="Credibility" value={summary.avg_credibility} />
            <Metric label="Relevance" value={summary.avg_relevance} />
            <Metric label="Novelty" value={summary.avg_novelty} />
            <Metric
              label="Emotional resonance"
              value={summary.avg_emotional_resonance}
            />
          </div>
          {personas.length > 0 && (
            <>
              <h3>Persona feedback</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Belief before → after</th>
                      <th>Shift</th>
                      <th>Trust</th>
                      <th>Offer fit</th>
                      <th>Intent</th>
                      <th>Behaviour</th>
                      <th>Reason / recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>
                            {p.lms_people?.first_name} {p.lms_people?.last_name}
                          </b>
                          <div className="muted">
                            {p.lms_people?.job_title ||
                              p.lms_people?.audience_segment}
                          </div>
                        </td>
                        <td>
                          {p.current_belief || "Not specified"}
                          <br />
                          <span className="muted">
                            → {p.belief_after || "No change"}
                          </span>
                        </td>
                        <td>{p.belief_shift}</td>
                        <td>{p.trust_score}</td>
                        <td>{p.offer_fit}</td>
                        <td>{p.purchase_intent}</td>
                        <td>{p.behavior}</td>
                        <td>
                          {p.primary_objection}
                          <div className="muted">{p.recommendation}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
