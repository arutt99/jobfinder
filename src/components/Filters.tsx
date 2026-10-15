import { SlidersHorizontal, RotateCcw, ChevronDown } from "lucide-react";
import type { Filters as FilterState } from "../lib/filter";
import type { Snapshot } from "../../shared/schema";
export function Filters({
  f,
  set,
  snapshot,
  reset,
}: {
  f: FilterState;
  set: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  snapshot: Snapshot;
  reset: () => void;
}) {
  const checks = (
    key:
      | "workplace"
      | "tiers"
      | "sources"
      | "employment"
      | "eligibility"
      | "lifecycle"
      | "countries",
    options: { value: string; label: string; count?: number }[],
  ) =>
    options.map((o) => (
      <label className="check-row" key={o.value}>
        <input
          type="checkbox"
          aria-label={o.label}
          checked={f[key].includes(o.value)}
          onChange={(e) =>
            set(
              key,
              e.target.checked
                ? [...f[key], o.value]
                : f[key].filter((v) => v !== o.value),
            )
          }
        />
        <span>{o.label}</span>
        {o.count !== undefined && <small>{o.count}</small>}
      </label>
    ));
  return (
    <aside className="filters-panel" aria-label="Job filters">
      <div className="filter-heading">
        <span>
          <SlidersHorizontal size={16} />
          Filters
        </span>
        <button className="text-button" onClick={reset}>
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
      <fieldset>
        <legend>Workplace</legend>
        {checks(
          "workplace",
          ["remote", "hybrid", "onsite", "unknown"].map((v) => ({
            value: v,
            label: v === "onsite" ? "On-site" : v[0].toUpperCase() + v.slice(1),
            count: snapshot.jobs.filter((j) => j.workplace === v).length,
          })),
        )}
      </fieldset>
      <fieldset>
        <legend>Relevance</legend>
        {checks("tiers", [
          {
            value: "strong",
            label: "Strong matches",
            count: snapshot.jobs.filter((j) => j.relevance.tier === "strong")
              .length,
          },
          {
            value: "related",
            label: "Related roles",
            count: snapshot.jobs.filter((j) => j.relevance.tier === "related")
              .length,
          },
          {
            value: "weak",
            label: "Other mentions",
            count: snapshot.jobs.filter((j) => j.relevance.tier === "weak")
              .length,
          },
        ])}
        <label className="small-field">
          Minimum score{" "}
          <input
            type="number"
            min="0"
            max="100"
            value={f.minScore}
            onChange={(e) => set("minScore", Number(e.target.value))}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Location</legend>
        <input
          aria-label="Country or location"
          placeholder="Country, city, or region"
          value={f.location}
          onChange={(e) => set("location", e.target.value)}
        />
        <label className="check-row">
          <input
            type="checkbox"
            checked={f.includeUnknownLocation}
            onChange={(e) => set("includeUnknownLocation", e.target.checked)}
          />
          <span>Include unknown</span>
        </label>
        <details>
          <summary>
            Countries / regions <ChevronDown size={12} />
          </summary>
          {checks(
            "countries",
            [
              ...new Set(
                snapshot.jobs.flatMap((j) =>
                  j.locations
                    .map((l) => l.country)
                    .filter((c): c is string => !!c),
                ),
              ),
            ]
              .sort()
              .map((v) => ({ value: v, label: v })),
          )}
        </details>
        <details>
          <summary>
            Remote eligibility <ChevronDown size={12} />
          </summary>
          {checks(
            "eligibility",
            [
              ...new Set(snapshot.jobs.flatMap((j) => j.remoteEligibility)),
              "Unknown",
            ].map((v) => ({ value: v, label: v })),
          )}
        </details>
      </fieldset>
      <fieldset>
        <legend>First seen</legend>
        <select
          aria-label="Recency"
          value={f.recency}
          onChange={(e) => set("recency", e.target.value)}
        >
          <option value="">Any time</option>
          {[1, 3, 7, 14, 30].map((n) => (
            <option key={n} value={n}>
              Last {n === 1 ? "24 hours" : `${n} days`}
            </option>
          ))}
        </select>
        <select
          aria-label="Recency date basis"
          value={f.dateBasis}
          onChange={(e) =>
            set("dateBasis", e.target.value as FilterState["dateBasis"])
          }
        >
          <option value="firstSeenAt">Date discovered</option>
          <option value="postedAt">Employer posting date</option>
        </select>
      </fieldset>
      <fieldset>
        <legend>Employment</legend>
        {checks(
          "employment",
          ["Full-time", "Part-time", "Contract", "Temporary", "Unknown"].map(
            (v) => ({ value: v, label: v }),
          ),
        )}
      </fieldset>
      <details className="advanced-filters">
        <summary>
          More filters <ChevronDown size={14} />
        </summary>
        <fieldset>
          <legend>Compensation</legend>
          <label className="small-field">
            Minimum advertised pay
            <input
              type="number"
              min="0"
              placeholder="No minimum"
              value={f.salary}
              onChange={(e) => set("salary", e.target.value)}
            />
          </label>
          <div className="field-pair">
            <select
              aria-label="Salary currency"
              value={f.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {["USD", "GBP", "EUR", "CAD", "AUD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Salary interval"
              value={f.interval}
              onChange={(e) => set("interval", e.target.value)}
            >
              <option value="year">Year</option>
              <option value="hour">Hour</option>
              <option value="month">Month</option>
            </select>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={f.includeUnknownSalary}
              onChange={(e) => set("includeUnknownSalary", e.target.checked)}
            />
            <span>Include unknown salary</span>
          </label>
          <p className="help">
            Only matching currencies and pay intervals are compared.
          </p>
        </fieldset>
        <fieldset>
          <legend>Sources</legend>
          {checks(
            "sources",
            snapshot.sources.map((s) => ({ value: s.id, label: s.name })),
          )}
        </fieldset>
        <fieldset>
          <legend>Job status</legend>
          {checks("lifecycle", [
            { value: "active", label: "Active" },
            { value: "possibly_closed", label: "Possibly closed" },
            { value: "closed", label: "Closed" },
            { value: "unknown", label: "Unknown" },
          ])}
          <label className="check-row">
            <input
              type="checkbox"
              checked={f.stale}
              onChange={(e) => set("stale", e.target.checked)}
            />
            <span>Include stale listings</span>
          </label>
        </fieldset>
        <label className="small-field">
          Personal tracking
          <select
            value={f.tracking}
            onChange={(e) => set("tracking", e.target.value)}
          >
            <option value="">All visible roles</option>
            {[
              "saved",
              "unsaved",
              "interested",
              "applied",
              "interviewing",
              "offer",
              "rejected",
              "withdrawn",
              "hidden",
            ].map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="small-field">
          Exclude words / employers
          <input
            placeholder="Comma-separated"
            value={f.excluded}
            onChange={(e) => set("excluded", e.target.value)}
          />
        </label>
        <label className="small-field">
          Keyword search mode
          <select
            value={f.keywordMode}
            onChange={(e) =>
              set("keywordMode", e.target.value as FilterState["keywordMode"])
            }
          >
            <option value="all">All words</option>
            <option value="any">Any word</option>
            <option value="phrase">Exact phrase</option>
          </select>
        </label>
      </details>
      <div className="filter-footnote">
        <span className="tiny-dot" />
        Made for your search.
        <br />
        <span>Filters stay in the page URL. Your tracking stays private.</span>
      </div>
    </aside>
  );
}
