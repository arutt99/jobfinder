import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Bookmark,
  BriefcaseBusiness,
  Radio,
  Settings2,
  ArrowUpRight,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Download,
  ArrowRight,
  ShieldCheck,
  Sprout,
  FlaskConical,
  ChevronRight,
  Globe2,
  LayoutList,
  Table2,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Clock3,
  ExternalLink,
} from "lucide-react";
import type {
  Snapshot,
  Job,
  PersonalEntry,
  PersonalState,
} from "../shared/schema";
import { loadSnapshot } from "./lib/load";
import {
  defaults,
  loadFilters,
  filterQuery,
  filterJobs,
  isStale,
  salaryLabel,
  timeAgo,
  type Filters as FilterState,
} from "./lib/filter";
import {
  readPersonal,
  savePersonal,
  entryFor,
  download,
  csv,
  mergePersonal,
} from "./lib/storage";
import { JobCard } from "./components/JobCard";
import { Filters } from "./components/Filters";
import { Details } from "./components/Details";
import { Settings } from "./components/Settings";
const roles = [
  "All roles",
  "Jira admin",
  "Atlassian admin",
  "JSM",
  "Engineering",
  "Consulting",
];
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const initial = readPersonal(browserStorage());
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PersonalState>(initial.state);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [filters, setFilters] = useState(() => loadFilters(location.search));
  const [view, setView] = useState("discover");
  const [settings, setSettings] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [layout, setLayout] = useState("cards");
  const [now, setNow] = useState(Date.now());
  const [limit, setLimit] = useState(20);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      const s = await loadSnapshot();
      setSnapshot(s);
      setState((old) => {
        const merged = mergePersonal(
          old,
          { schemaVersion: 1, entries: {}, manual: [] },
          s.aliases,
        );
        return JSON.stringify(old) === JSON.stringify(merged) ? old : merged;
      });
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (initial.warning && state === initial.state) return;
    if (!savePersonal(state, browserStorage()))
      setStorageWarning(
        "Changes are kept in memory because browser storage is unavailable or full. Export a personal backup before leaving.",
      );
  }, [state]);
  useEffect(() => {
    const q = filterQuery(filters);
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}`);
    setLimit(20);
  }, [filters]);
  useEffect(() => {
    const handler = () => setFilters(loadFilters(location.search));
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
      ) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".search-box input")?.focus();
      }
    };
    addEventListener("keydown", shortcut);
    return () => removeEventListener("keydown", shortcut);
  }, []);
  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function reset() {
    setFilters({ ...defaults });
  }
  function navigate(next: string) {
    setView(next);
    reset();
    if (next !== "discover")
      setFilters((f) => ({ ...f, tiers: [], lifecycle: [] }));
  }
  function update(job: Job, change: Partial<PersonalEntry>) {
    setState((s) => ({
      ...s,
      entries: {
        ...s.entries,
        [job.id]: {
          ...entryFor(job),
          ...s.entries[job.id],
          ...change,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }
  const jobs = useMemo(
    () => [...(snapshot?.jobs ?? []), ...state.manual],
    [snapshot, state.manual],
  );
  const visible = useMemo(
    () => filterJobs(jobs, filters, state, now, view),
    [jobs, filters, state, now, view],
  );
  const saved = Object.values(state.entries).filter((s) => s.saved).length;
  const applications = Object.values(state.entries).filter(
    (s) => !["none", "interested"].includes(s.stage),
  ).length;
  const strong = jobs.filter(
    (j) => j.relevance.tier === "strong" && j.status === "active",
  ).length;
  const added = jobs.filter(
    (j) => now - Date.parse(j.firstSeenAt) < 86400000,
  ).length;
  const working =
    snapshot?.sources.filter((s) => ["success", "partial"].includes(s.status))
      .length ?? 0;
  const degraded = snapshot?.sources.some((s) =>
    ["failed", "partial", "quarantined", "blocked"].includes(s.status),
  );
  const overdue =
    snapshot?.manifest.lastSuccessfulCollectionAt &&
    now - Date.parse(snapshot.manifest.lastSuccessfulCollectionAt) >
      8 * 3600000;
  const activeKeys = (Object.keys(defaults) as (keyof FilterState)[]).filter(
    (k) => JSON.stringify(filters[k]) !== JSON.stringify(defaults[k]),
  );
  const archived = Object.entries(state.entries).filter(
    ([id, e]) =>
      !jobs.some((j) => j.id === id) &&
      ((view === "saved" && e.saved) ||
        (view === "applications" && !["none", "interested"].includes(e.stage))),
  );
  const title =
    view === "saved"
      ? "Good roles. Kept close."
      : view === "applications"
        ? "Make your next move."
        : view === "sources"
          ? "Know where you’re looking."
          : "Find your next Atlassian role.";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to roles
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            e.preventDefault();
            navigate("discover");
          }}
        >
          <span className="brand-icon">
            <Compass size={25} strokeWidth={1.6} />
          </span>
          <span>
            JobScout<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR CAREER WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            aria-label="Discover roles"
            className={view === "discover" ? "active" : ""}
            onClick={() => navigate("discover")}
          >
            <Compass size={18} />
            <span>Discover roles</span>
            <small>
              {snapshot
                ? snapshot.jobs.filter((j) => j.relevance.tier !== "weak")
                    .length
                : "—"}
            </small>
          </button>
          <button
            aria-label="Saved roles"
            className={view === "saved" ? "active" : ""}
            onClick={() => navigate("saved")}
          >
            <Bookmark size={18} />
            <span>Saved roles</span>
            <small>{saved}</small>
          </button>
          <button
            aria-label="Applications"
            className={view === "applications" ? "active" : ""}
            onClick={() => navigate("applications")}
          >
            <BriefcaseBusiness size={18} />
            <span>Applications</span>
            {applications > 0 && <small>{applications}</small>}
          </button>
          <div className="nav-separator" />
          <button
            aria-label="Source coverage"
            className={view === "sources" ? "active" : ""}
            onClick={() => navigate("sources")}
          >
            <Radio size={18} />
            <span>Source coverage</span>
            <span className={`status-dot ${degraded ? "amber-dot" : ""}`} />
          </button>
          <button
            aria-label="Settings & backup"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={18} />
            <span>Settings & backup</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="plant-illustration">
              <Sprout size={38} strokeWidth={1.3} />
              <span />
              <span />
            </span>
            <h3>
              A more focused
              <br />
              way forward.
            </h3>
            <p>
              Less searching.
              <br />
              More of what fits.
            </p>
            <button onClick={() => navigate("sources")}>
              Explore your sources <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="local-label">
            <ShieldCheck size={15} />
            <div>
              Personal by design<small>Your tracking stays with you.</small>
            </div>
          </div>
          <p className="independent-label">
            Independent tool. Not affiliated with Atlassian.
          </p>
        </div>
      </aside>
      <main id="main" className="main-area">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={13} />
            <strong>
              {view === "discover"
                ? "Discover"
                : view === "saved"
                  ? "Saved roles"
                  : view === "applications"
                    ? "Applications"
                    : "Source coverage"}
            </strong>
          </div>
          <span>
            <span className="tiny-dot" />
            Your next chapter, in focus <span className="avatar">Y</span>
          </span>
        </header>
        <div className="main-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                A LITTLE DIRECTION. A LOT OF POSSIBILITY.
              </p>
              <h1>{title}</h1>
              <p>
                {view === "discover"
                  ? "Jira, JSM, and Atlassian opportunities. The relevant ones, all in one place."
                  : view === "saved"
                    ? "A shortlist with potential. Keep your favorites and take the next step."
                    : view === "applications"
                      ? "Keep your progress, follow-ups, and possibilities in one place."
                      : "A curated view of your configured employer boards. Clear coverage, honest limits."}
              </p>
            </div>
            <button
              className="secondary-button reload-button"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "spinning" : ""} />
              {loading ? "Loading…" : "Reload data"}
            </button>
          </section>
          {snapshot?.manifest.mode === "fixture" && (
            <div className="demo-banner">
              <span>
                <FlaskConical size={16} />
                <strong>You’re exploring the demo.</strong> Every role is
                synthetic. No live employer boards are connected.
              </span>
              <button onClick={() => navigate("sources")}>
                Set up sources <ArrowRight size={14} />
              </button>
            </div>
          )}
          {storageWarning && (
            <div className="notice warning" role="status">
              {storageWarning}{" "}
              <button className="text-button" onClick={() => setSettings(true)}>
                Open backup
              </button>
            </div>
          )}
          {error && (
            <div className="load-error" role="alert">
              <AlertCircle size={20} />
              <div>
                <strong>
                  {snapshot
                    ? "Unable to reload; showing the last loaded data."
                    : "Your workspace is ready for data."}
                </strong>
                <p>{error}</p>
                <button
                  className="secondary-button"
                  onClick={() => void reload()}
                >
                  Retry loading
                </button>
              </div>
            </div>
          )}
          {snapshot && (degraded || overdue) && (
            <div className="notice warning">
              <AlertCircle size={16} />
              {degraded
                ? "Some sources need attention. Prior listings have been retained where permitted."
                : "The scheduled refresh is overdue. Listings may have changed."}{" "}
              <button
                className="text-button"
                onClick={() => navigate("sources")}
              >
                Review source health
              </button>
            </div>
          )}
          {snapshot && (
            <>
              <section
                className="stats-grid"
                aria-label="Overall workspace counts"
              >
                <button
                  onClick={() => {
                    navigate("discover");
                    set("tiers", ["strong"]);
                  }}
                >
                  <span className="stat-icon green">
                    <Compass size={19} />
                  </span>
                  <div>
                    <span>Strong matches</span>
                    <strong>
                      {strong}
                      <small>roles that fit the focus</small>
                    </strong>
                  </div>
                  <ArrowUpRight size={14} />
                </button>
                <button
                  onClick={() => {
                    navigate("discover");
                    set("recency", "1");
                  }}
                >
                  <span className="stat-icon yellow">
                    <Plus size={20} />
                  </span>
                  <div>
                    <span>Discovered in 24h</span>
                    <strong>
                      {added}
                      <small>new possibilities</small>
                    </strong>
                  </div>
                  <span className="mini-pill">New</span>
                </button>
                <button onClick={() => navigate("saved")}>
                  <span className="stat-icon purple">
                    <Bookmark size={19} />
                  </span>
                  <div>
                    <span>Saved for later</span>
                    <strong>
                      {saved}
                      <small>on your shortlist</small>
                    </strong>
                  </div>
                  <ArrowUpRight size={14} />
                </button>
                <button onClick={() => navigate("sources")}>
                  <span className="stat-icon blue">
                    <Radio size={19} />
                  </span>
                  <div>
                    <span>
                      {snapshot.manifest.mode === "fixture"
                        ? "Demo sources"
                        : "Healthy sources"}
                    </span>
                    <strong>
                      {working}
                      <small>
                        {snapshot.manifest.mode === "fixture"
                          ? "fixture adapters only"
                          : `of ${snapshot.sources.length} configured`}
                      </small>
                    </strong>
                  </div>
                  <span className="status-dot" />
                </button>
              </section>
              {view === "sources" ? (
                <section className="sources-view">
                  <div className="section-heading">
                    <h2>Your source coverage</h2>
                    <span className="soft-badge">
                      {snapshot.manifest.mode === "fixture"
                        ? "Demo mode"
                        : "Live configuration"}
                    </span>
                  </div>
                  <p>
                    JobScout enumerates configured, approved boards. It does not
                    search every employer or verify your personal eligibility.
                    Google, LinkedIn, and Indeed are manual search shortcuts.
                  </p>
                  {snapshot.sources.length === 0 && (
                    <div className="empty-state">
                      <Radio size={32} />
                      <h3>No approved sources connected</h3>
                      <p>
                        Complete a source approval record in
                        config/sources.json, then run the live collector. The
                        README includes the onboarding steps.
                      </p>
                    </div>
                  )}
                  {snapshot.sources.map((s) => (
                    <article key={s.id} className="source-card">
                      <div className="source-card-title">
                        <span className="stat-icon green">
                          <Radio size={19} />
                        </span>
                        <div>
                          <h3>{s.name}</h3>
                          <span>
                            {s.type} ·{" "}
                            {s.coverage === "exhaustive"
                              ? "Full configured-board enumeration"
                              : s.coverage === "search"
                                ? "Limited query / feed window"
                                : "Not collected"}
                          </span>
                        </div>
                        <span
                          className={`soft-badge ${s.status === "success" ? "" : "amber-badge"}`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <p>{s.message}</p>
                      <div className="source-times">
                        <span>
                          Last attempt:{" "}
                          {s.attemptedAt
                            ? new Date(s.attemptedAt).toLocaleString()
                            : "Never"}
                        </span>
                        <span>
                          Last success:{" "}
                          {s.lastSuccessAt
                            ? new Date(s.lastSuccessAt).toLocaleString()
                            : "Never"}
                        </span>
                        <span>
                          {s.count} observations ·{" "}
                          {s.complete
                            ? "Complete"
                            : "Incomplete / not attempted"}
                        </span>
                      </div>
                      <p className="help">{s.attribution}</p>
                      {s.manualUrl && (
                        <a
                          href={s.manualUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-button"
                        >
                          Open career page <ExternalLink size={13} />
                        </a>
                      )}
                    </article>
                  ))}
                  <div className="setup-guide">
                    <h3>Connect your first real board</h3>
                    <ol>
                      <li>
                        Identify an employer and its documented board
                        identifier.
                      </li>
                      <li>
                        Record access, public display, attribution, and
                        Git-history permission in the source registry.
                      </li>
                      <li>
                        Run adapter tests, enable the source, and perform a
                        bounded live collection.
                      </li>
                      <li>
                        Review the snapshot, then refresh through GitHub
                        Actions.
                      </li>
                    </ol>
                    <p className="help">
                      No live sources are enabled in the supplied registry.
                      Licensed aggregators remain optional and disabled.
                    </p>
                  </div>
                  <h3 className="external-heading">
                    Widen your search, on your terms <ArrowUpRight size={16} />
                  </h3>
                  <div className="external-searches">
                    {[
                      ["Google", "https://www.google.com/search?q="],
                      [
                        "LinkedIn",
                        "https://www.linkedin.com/jobs/search/?keywords=",
                      ],
                      ["Indeed", "https://www.indeed.com/jobs?q="],
                    ].map(([label, url]) => (
                      <a
                        key={label}
                        href={`${url}${encodeURIComponent('Jira Administrator OR Atlassian Administrator OR "Jira Service Management"')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Globe2 size={18} />
                        <strong>{label}</strong>
                        <span>Open external search</span>
                        <ArrowUpRight size={16} />
                      </a>
                    ))}
                  </div>
                  <div className="manifest-details">
                    <span>Data version: {snapshot.manifest.dataVersion}</span>
                    <span>
                      Source revision: {snapshot.manifest.sourceCommit}
                    </span>
                    <span>Data revision: {snapshot.manifest.dataCommit}</span>
                    <span>
                      Snapshot generated:{" "}
                      {new Date(snapshot.manifest.generatedAt).toLocaleString()}
                    </span>
                    <span>
                      Last complete refresh:{" "}
                      {snapshot.manifest.lastCompleteRefreshAt
                        ? new Date(
                            snapshot.manifest.lastCompleteRefreshAt,
                          ).toLocaleString()
                        : "None"}
                    </span>
                  </div>
                </section>
              ) : (
                <>
                  <div className="search-toolbar">
                    <label className="search-box">
                      <Search size={19} />
                      <input
                        aria-label="Search roles"
                        value={filters.q}
                        onChange={(e) => set("q", e.target.value)}
                        placeholder="Search by job title, company, or skill…"
                      />
                      <kbd>/</kbd>
                    </label>
                    <button
                      className={`secondary-button filter-toggle ${mobileFilters ? "is-active" : ""}`}
                      onClick={() => setMobileFilters(!mobileFilters)}
                      aria-expanded={mobileFilters}
                    >
                      <SlidersHorizontal size={16} />
                      Filters
                      {activeKeys.length > 0 && (
                        <span>{activeKeys.length}</span>
                      )}
                    </button>
                    <button
                      className="secondary-button csv-button"
                      aria-label="Export CSV"
                      onClick={() =>
                        download(
                          "jobscout-roles.csv",
                          csv(visible),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      <Download size={15} />
                      <span>Export CSV</span>
                    </button>
                  </div>
                  <div className="role-tabs" aria-label="Role families">
                    {roles.map((r) => (
                      <button
                        key={r}
                        className={
                          (
                            r === "All roles"
                              ? !filters.roles.length
                              : filters.roles.includes(r)
                          )
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          set(
                            "roles",
                            r === "All roles"
                              ? []
                              : filters.roles.includes(r)
                                ? filters.roles.filter((x) => x !== r)
                                : [...filters.roles, r],
                          )
                        }
                      >
                        {r}
                        {r === "All roles" && <span>{jobs.length}</span>}
                      </button>
                    ))}
                  </div>
                  {activeKeys.length > 0 && (
                    <div className="active-filters" aria-label="Active filters">
                      {activeKeys.map((k) => (
                        <button key={k} onClick={() => set(k, defaults[k])}>
                          {k}:{" "}
                          {Array.isArray(filters[k])
                            ? (filters[k] as string[]).join(", ") || "any"
                            : String(filters[k])}
                          <X size={11} />
                        </button>
                      ))}
                      <button className="text-button" onClick={reset}>
                        Clear all
                      </button>
                    </div>
                  )}
                  <div
                    className={`results-layout ${mobileFilters ? "filters-open" : ""}`}
                  >
                    <Filters
                      f={filters}
                      set={set}
                      snapshot={snapshot}
                      reset={reset}
                    />
                    <section className="results" aria-label="Job results">
                      <div className="results-heading">
                        <div>
                          <h2>
                            {view === "saved"
                              ? "Your shortlist"
                              : view === "applications"
                                ? "Your applications"
                                : `${visible.length} ${visible.length === 1 ? "role" : "roles"} to explore`}
                            <span className="result-dot">.</span>
                          </h2>
                          <p>
                            {view === "discover"
                              ? `${jobs.length} total listings · ${jobs.filter((j) => isStale(j, now)).length} need verification`
                              : "Every next step starts with a possibility."}
                          </p>
                        </div>
                        <div className="results-controls">
                          <label>
                            Sort by
                            <select
                              aria-label="Sort roles"
                              value={filters.sort}
                              onChange={(e) => set("sort", e.target.value)}
                            >
                              <option value="relevance">Best match</option>
                              <option value="discovered">
                                Newest discovered
                              </option>
                              <option value="posted">Newest posted</option>
                              <option value="company">Company A–Z</option>
                              <option value="salary">
                                Salary ({filters.currency}/{filters.interval})
                              </option>
                            </select>
                          </label>
                          <div className="layout-toggle">
                            <button
                              aria-label="Card view"
                              aria-pressed={layout === "cards"}
                              onClick={() => setLayout("cards")}
                            >
                              <LayoutList size={16} />
                            </button>
                            <button
                              aria-label="Table view"
                              aria-pressed={layout === "table"}
                              onClick={() => setLayout("table")}
                            >
                              <Table2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                      {visible.length === 0 && (
                        <div className="empty-state">
                          <Search size={32} />
                          <h3>
                            {view === "saved"
                              ? "Build your shortlist."
                              : view === "applications"
                                ? "A fresh start."
                                : snapshot.jobs.length === 0
                                  ? "Ready for your first discovery."
                                  : "No roles match these filters."}
                          </h3>
                          <p>
                            {view === "saved"
                              ? "Save a role with the bookmark button to keep it here."
                              : view === "applications"
                                ? "Open a role and update its application stage to track your progress."
                                : snapshot.jobs.length === 0
                                  ? "Connect an approved employer board or explore a local fixture demo."
                                  : "Try a broader search, include related roles, or reset your filters."}
                          </p>
                          <button className="secondary-button" onClick={reset}>
                            Reset filters
                          </button>
                        </div>
                      )}
                      {layout === "cards"
                        ? visible.slice(0, limit).map((j) => (
                            <JobCard
                              key={j.id}
                              job={j}
                              entry={state.entries[j.id]}
                              onOpen={() => setSelected(j)}
                              onSave={() =>
                                update(j, {
                                  saved: !state.entries[j.id]?.saved,
                                })
                              }
                              now={now}
                            />
                          ))
                        : visible.length > 0 && (
                            <div className="table-wrapper">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Role / company</th>
                                    <th>Workplace</th>
                                    <th>Pay</th>
                                    <th>Score</th>
                                    <th>Save</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visible.slice(0, limit).map((j) => (
                                    <tr key={j.id}>
                                      <td>
                                        <button
                                          className="table-role"
                                          onClick={() => setSelected(j)}
                                        >
                                          {j.title}
                                        </button>
                                        <small>{j.company}</small>
                                      </td>
                                      <td>{j.workplace}</td>
                                      <td>{salaryLabel(j)}</td>
                                      <td>{j.relevance.score}</td>
                                      <td>
                                        <button
                                          className="icon-button"
                                          aria-label={`${state.entries[j.id]?.saved ? "Unsave" : "Save"} ${j.title}`}
                                          onClick={() =>
                                            update(j, {
                                              saved:
                                                !state.entries[j.id]?.saved,
                                            })
                                          }
                                        >
                                          <Bookmark
                                            size={16}
                                            fill={
                                              state.entries[j.id]?.saved
                                                ? "currentColor"
                                                : "none"
                                            }
                                          />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                      {archived.length > 0 && (
                        <section className="archived-roles">
                          <h3>From your local history</h3>
                          <p className="help">
                            These roles have left the public dataset. Your
                            tracking is preserved.
                          </p>
                          {archived.map(([id, e]) => (
                            <article className="job-card" key={id}>
                              <h3>{e.snapshot.title}</h3>
                              <p>
                                {e.snapshot.company} · {e.stage}
                              </p>
                              <p>{e.note}</p>
                              <a
                                className="text-button"
                                href={e.snapshot.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Original link <ExternalLink size={13} />
                              </a>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setState((s) => ({
                                    ...s,
                                    entries: {
                                      ...s.entries,
                                      [id]: {
                                        ...e,
                                        saved: !e.saved,
                                        updatedAt: new Date().toISOString(),
                                      },
                                    },
                                  }))
                                }
                              >
                                {e.saved ? "Unsave" : "Save"}
                              </button>
                            </article>
                          ))}
                        </section>
                      )}
                      {visible.length > limit && (
                        <button
                          className="secondary-button load-more"
                          onClick={() => setLimit((n) => n + 20)}
                        >
                          Show more roles
                        </button>
                      )}
                      <div className="end-of-results">
                        <span />
                        <Sprout size={16} />
                        <span />
                      </div>
                      <p className="end-note">
                        The right role is worth a closer look.
                      </p>
                      <div className="manual-prompt">
                        <span>Found something elsewhere?</span>
                        <button
                          className="text-button"
                          onClick={() => setSettings(true)}
                        >
                          Add a role manually <Plus size={13} />
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              )}
              <footer className="page-footer">
                <span>
                  <CheckCircle2 size={12} />
                  {snapshot.manifest.mode === "fixture"
                    ? "Synthetic demo data"
                    : "Public job metadata only"}
                </span>
                <span>
                  <Clock3 size={12} />
                  Last successful collection:{" "}
                  {snapshot.manifest.lastSuccessfulCollectionAt
                    ? `${timeAgo(snapshot.manifest.lastSuccessfulCollectionAt, now)} · ${new Date(snapshot.manifest.lastSuccessfulCollectionAt).toLocaleString()}`
                    : "Never"}
                  <span className="footer-divider">·</span>Reloading does not
                  run collection.
                </span>
              </footer>
            </>
          )}
          {!snapshot && !loading && (
            <div className="setup-guide">
              <h2>Get started locally</h2>
              <p>
                Run <code>npm run demo</code> for a clearly labeled synthetic
                dataset, then reload. Live discovery requires approved sources
                and the scheduled collection workflow.
              </p>
            </div>
          )}
        </div>
      </main>
      {selected && (
        <Details
          job={selected}
          entry={state.entries[selected.id] ?? entryFor(selected)}
          update={(change) => update(selected, change)}
          close={() => setSelected(null)}
        />
      )}{" "}
      {settings && (
        <Settings
          state={state}
          setState={setState}
          aliases={snapshot?.aliases ?? {}}
          close={() => setSettings(false)}
        />
      )}
    </div>
  );
}
