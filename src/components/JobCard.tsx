import {
  Bookmark,
  Check,
  MapPin,
  Clock3,
  ArrowUpRight,
  BriefcaseBusiness,
} from "lucide-react";
import type { Job, PersonalEntry } from "../../shared/schema";
import { salaryLabel, timeAgo, isStale } from "../lib/filter";
export function JobCard({
  job: j,
  entry,
  onOpen,
  onSave,
  now,
}: {
  job: Job;
  entry?: PersonalEntry;
  onOpen: () => void;
  onSave: () => void;
  now: number;
}) {
  const initials = j.company
    .split(/\s/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
  const color = ["sage", "amber", "lavender", "blue", "rose"][
    j.company.length % 5
  ];
  const fresh = now - Date.parse(j.firstSeenAt) < 86400000;
  return (
    <article className="job-card">
      <div className="card-top">
        <div className={`company-mark ${color}`} aria-hidden="true">
          {initials}
        </div>
        <div className="card-identity">
          <div className="company-name">
            {j.company}
            {fresh && <span className="new-label">NEW</span>}
            {entry?.stage && entry.stage !== "none" && (
              <span className="stage-label">{entry.stage}</span>
            )}
          </div>
          <h3>
            <button onClick={onOpen}>{j.title}</button>
          </h3>
          <div className="job-meta">
            <span>
              <MapPin size={13} />
              {j.locations.map((l) => l.raw).join(" · ") ||
                "Location not listed"}
            </span>
            <span className={`workplace ${j.workplace}`}>
              {j.workplace === "onsite"
                ? "On-site"
                : j.workplace === "unknown"
                  ? "Workplace unknown"
                  : j.workplace}
            </span>
          </div>
        </div>
        <div
          className={`match-badge ${j.relevance.tier}`}
          title="Relevance heuristic, not a probability"
        >
          <Check size={12} />
          {j.relevance.score}
          <span> / 100 match</span>
        </div>
        <button
          className={`save-button icon-button ${entry?.saved ? "is-saved" : ""}`}
          onClick={onSave}
          aria-label={`${entry?.saved ? "Unsave" : "Save"} ${j.title}`}
          aria-pressed={entry?.saved ?? false}
        >
          <Bookmark size={19} fill={entry?.saved ? "currentColor" : "none"} />
        </button>
      </div>
      <p className="card-description">
        {j.excerpt ??
          j.relevance.reasons
            .filter((r) => r.points > 0)
            .map((r) => r.label)
            .slice(0, 2)
            .join(" · ")}
      </p>
      <div className="card-middle">
        <div className="tag-list">
          {j.tags.slice(0, 4).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <span className={`salary ${!j.salary ? "unknown" : ""}`}>
          {salaryLabel(j)}
        </span>
      </div>
      <div className="card-footer">
        <div>
          <span>
            <Clock3 size={12} /> First seen {timeAgo(j.firstSeenAt, now)}
          </span>
          <span className="source-dot">
            {j.observations[0].sourceId.replace("demo-", "")}
          </span>
          <span className="employment">
            <BriefcaseBusiness size={12} />
            {j.employmentType ?? "Type unknown"}
          </span>
          {isStale(j, now) && (
            <span className="stale-label">Needs verification</span>
          )}
          {j.status !== "active" && (
            <span className="stale-label">{j.status.replaceAll("_", " ")}</span>
          )}
        </div>
        <button className="text-button" onClick={onOpen}>
          View role <ArrowUpRight size={14} />
        </button>
      </div>
    </article>
  );
}
