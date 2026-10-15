import {
  Bookmark,
  ExternalLink,
  MapPin,
  Check,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import type { Job, PersonalEntry } from "../../shared/schema";
import { Dialog } from "./Dialog";
import { salaryLabel, isStale } from "../lib/filter";
export function Details({
  job: j,
  entry,
  update,
  close,
}: {
  job: Job;
  entry: PersonalEntry;
  update: (change: Partial<PersonalEntry>) => void;
  close: () => void;
}) {
  return (
    <Dialog title="Role details" onClose={close} wide>
      <div className="detail-content">
        <p className="eyebrow">{j.company}</p>
        <h2>{j.title}</h2>
        <div className="detail-location">
          <MapPin size={15} />
          {j.locations.map((l) => l.raw).join(" · ") || "Location unknown"}
        </div>
        {j.synthetic && (
          <div className="notice">
            Synthetic example · this is not an open vacancy.
          </div>
        )}
        {isStale(j) && (
          <div className="notice warning">
            Verification is over 48 hours old. Check the original posting.
          </div>
        )}
        <div className="detail-actions">
          <button
            className={`primary-button ${entry.saved ? "saved" : ""}`}
            onClick={() => update({ saved: !entry.saved })}
          >
            <Bookmark size={16} />
            {entry.saved ? "Saved to your list" : "Save role"}
          </button>
          <button
            className="secondary-button"
            onClick={() => update({ hidden: !entry.hidden })}
          >
            <EyeOff size={15} />
            {entry.hidden ? "Unhide" : "Hide role"}
          </button>
        </div>
        <section className="match-explanation">
          <div>
            <ShieldCheck size={20} />
            <h3>Why this matched</h3>
            <strong>
              {j.relevance.score}
              <small> / 100</small>
            </strong>
          </div>
          <p>
            Role relevance · {j.relevance.tier} match · rules v
            {j.relevance.ruleVersion}
          </p>
          <ul>
            {j.relevance.reasons.map((r, i) => (
              <li key={`${r.ruleId}-${i}`}>
                <Check size={14} />
                <span>{r.label}</span>
                <small>
                  {r.points > 0 ? "+" : ""}
                  {r.points}
                </small>
              </li>
            ))}
          </ul>
          <p className="help">
            A deterministic ranking score, not a probability or assessment of
            your qualifications.
          </p>
        </section>
        <section>
          <h3>At a glance</h3>
          <dl className="facts">
            <div>
              <dt>Workplace</dt>
              <dd>{j.workplace}</dd>
            </div>
            <div>
              <dt>Remote eligibility</dt>
              <dd>
                {j.remoteEligibility.join(" · ") ||
                  "Not specified — remote does not imply worldwide"}
              </dd>
            </div>
            <div>
              <dt>Employment</dt>
              <dd>{j.employmentType ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Compensation</dt>
              <dd>{salaryLabel(j)}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>{j.status.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Employer posted</dt>
              <dd>
                {j.postedAt ? new Date(j.postedAt).toLocaleString() : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>First discovered</dt>
              <dd>{new Date(j.firstSeenAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Last verified</dt>
              <dd>
                {j.lastVerifiedAt
                  ? new Date(j.lastVerifiedAt).toLocaleString()
                  : "Unknown"}
              </dd>
            </div>
          </dl>
        </section>
        {j.excerpt && (
          <section>
            <h3>Role overview</h3>
            <p className="detail-excerpt">{j.excerpt}</p>
            <div className="tag-list">
              {j.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </section>
        )}
        <section className="tracking-section">
          <h3>Your progress</h3>
          <p className="help">
            Stored in this browser only. Included in your personal backup.
          </p>
          <label className="small-field">
            Application stage
            <select
              value={entry.stage}
              onChange={(e) =>
                update({ stage: e.target.value as PersonalEntry["stage"] })
              }
            >
              {[
                "none",
                "interested",
                "applied",
                "interviewing",
                "offer",
                "rejected",
                "withdrawn",
              ].map((s) => (
                <option key={s} value={s}>
                  {s === "none"
                    ? "Not started"
                    : s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="small-field">
            Private notes
            <textarea
              placeholder="What stands out? Anything to follow up on?"
              rows={4}
              value={entry.note}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
        </section>
        <section>
          <h3>Source & provenance</h3>
          {j.observations.map((o) => (
            <p className="provenance" key={`${o.sourceId}-${o.sourceJobId}`}>
              {o.sourceId} · reference {o.sourceJobId}
              <br />
              Last observed {new Date(o.lastSeenAt).toLocaleString()} ·{" "}
              {o.status.replaceAll("_", " ")}
            </p>
          ))}
          <p className="help">{j.attribution}</p>
          {j.possibleDuplicateIds.length > 0 && (
            <div className="notice">
              Possible similar listing. Separate requisitions have been kept
              separate.
            </div>
          )}
        </section>
        <div className="detail-link-bar">
          {j.synthetic ? (
            <span className="help">
              Application links are unavailable for synthetic examples.
            </span>
          ) : (
            <>
              <a
                className="secondary-button"
                href={j.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Original posting <ExternalLink size={14} />
              </a>
              <a
                className="primary-button"
                href={j.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Apply on employer site <ExternalLink size={14} />
              </a>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
