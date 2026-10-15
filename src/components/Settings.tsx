import { useState } from "react";
import { Download, Upload, Plus, ShieldCheck } from "lucide-react";
import {
  personalSchema,
  type PersonalState,
  type Job,
} from "../../shared/schema";
import { Dialog } from "./Dialog";
import { download, mergePersonal, storageKey } from "../lib/storage";
import { canonicalUrl, hash } from "../../shared/normalize";
import { match } from "../../shared/matching";
export function Settings({
  state,
  setState,
  aliases,
  close,
}: {
  state: PersonalState;
  setState: (state: PersonalState) => void;
  aliases: Record<string, string>;
  close: () => void;
}) {
  const [pending, setPending] = useState<PersonalState | null>(null);
  const [message, setMessage] = useState("");
  function exportRecovery() {
    try {
      const raw =
        localStorage.getItem(`${storageKey}.recovery`) ??
        localStorage.getItem(storageKey);
      if (raw) {
        download("jobscout-original-storage.json", raw, "application/json");
        setMessage("Original browser storage exported.");
      } else setMessage("No stored recovery copy is available.");
    } catch {
      setMessage("Browser storage is unavailable.");
    }
  }
  const backup = () =>
    download(
      `jobscout-personal-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(state, null, 2),
      "application/json",
    );
  async function read(file?: File) {
    if (!file) return;
    if (file.size > 5000000) {
      setMessage("Backup exceeds the 5 MB limit.");
      return;
    }
    try {
      const p = personalSchema.parse(JSON.parse(await file.text()));
      setPending(p);
      setMessage("");
    } catch {
      setMessage(
        "This file is not a valid JobScout personal backup. Your current data has not changed.",
      );
    }
  }
  function manual(data: FormData) {
    try {
      const url = canonicalUrl(String(data.get("url")));
      const title = String(data.get("title")).trim();
      const company = String(data.get("company")).trim();
      if (!title || !company) throw new Error("Enter a title and company");
      const now = new Date().toISOString();
      const j: Job = {
        id: `manual-${hash(url)}`,
        identityVersion: 1,
        title,
        company,
        companyKey: company.toLowerCase(),
        ...match(title),
        locations: [],
        workplace: "unknown",
        remoteEligibility: [],
        employmentType: null,
        seniority: null,
        salary: null,
        postedAt: null,
        postedAtBasis: "unknown",
        sourceUpdatedAt: null,
        validThrough: null,
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: null,
        missingSince: null,
        status: "active",
        stale: false,
        canonicalUrl: url,
        applyUrl: url,
        excerpt: null,
        observations: [
          {
            sourceId: "manual-local",
            sourceJobId: hash(url),
            sourceUrl: url,
            firstSeenAt: now,
            lastSeenAt: now,
            consecutiveMissing: 0,
            status: "active",
            stale: false,
          },
        ],
        contentHash: hash(url),
        synthetic: false,
        attribution:
          "Added manually in this browser. Not collected or verified.",
        possibleDuplicateIds: [],
      };
      setState({
        ...state,
        manual: [...state.manual.filter((x) => x.id !== j.id), j],
        entries: {
          ...state.entries,
          [j.id]: {
            saved: true,
            hidden: false,
            stage: "interested",
            note: "",
            updatedAt: now,
            snapshot: { title, company, url },
          },
        },
      });
      setMessage(
        "Manual role saved. Find it in Saved roles; enable related or other mentions if needed.",
      );
    } catch {
      setMessage("Enter a valid HTTP(S) URL, title, and company.");
    }
  }
  return (
    <Dialog title="Your workspace settings" onClose={close}>
      <div className="settings-content">
        <div className="settings-intro">
          <ShieldCheck size={28} />
          <h2>Your search. Your data.</h2>
          <p>
            Saved roles, notes, and application stages live in this browser.
            Back them up to take them with you.
          </p>
        </div>
        <section>
          <h3>Personal backup</h3>
          <p className="help">
            Private JSON file · {Object.keys(state.entries).length} tracked
            roles · {state.manual.length} manual entries
          </p>
          <div className="settings-buttons">
            <button className="primary-button" onClick={backup}>
              <Download size={16} />
              Export personal JSON
            </button>
            <label className="secondary-button upload-label">
              <Upload size={16} />
              Restore backup
              <input
                aria-label="Import personal backup"
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  void read(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {pending && (
            <div className="import-preview">
              <h4>Ready to merge</h4>
              <p>
                {Object.keys(pending.entries).length} personal entries and{" "}
                {pending.manual.length} manual roles. The newest personal update
                wins, with existing ID aliases applied. Current entries will be
                retained.
              </p>
              <button
                className="primary-button"
                onClick={() => {
                  setState(mergePersonal(state, pending, aliases));
                  setPending(null);
                  setMessage("Backup merged successfully.");
                }}
              >
                Merge backup
              </button>
              <button className="text-button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          )}
        </section>
        <section>
          <h3>
            <Plus size={17} />
            Add a role manually
          </h3>
          <p className="help">
            Save a link for your own tracking. JobScout does not fetch the page.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              manual(new FormData(e.currentTarget));
            }}
          >
            <label className="small-field">
              Job title
              <input name="title" required placeholder="Jira Administrator" />
            </label>
            <label className="small-field">
              Company
              <input name="company" required placeholder="Company name" />
            </label>
            <label className="small-field">
              Original posting URL
              <input name="url" required type="url" placeholder="https://…" />
            </label>
            <button className="secondary-button" type="submit">
              <Plus size={15} />
              Save manual role
            </button>
          </form>
        </section>
        <p role="status" className="settings-message">
          {message}
        </p>
        <section>
          <h3>Local data</h3>
          <button className="text-button" onClick={exportRecovery}>
            Export original storage / recovery copy
          </button>
          <p className="help">
            Clearing browser storage removes tracking. Export before clearing.
            Personal information is never included in job CSV exports or URL
            filters.
          </p>
          <button
            className="danger-button"
            onClick={() => {
              backup();
              setMessage(
                "Backup exported. To confirm reset, use the button below.",
              );
              setPending(null);
            }}
          >
            Export before reset
          </button>
          {message ===
            "Backup exported. To confirm reset, use the button below." && (
            <button
              className="danger-button"
              onClick={() => {
                setState({ schemaVersion: 1, entries: {}, manual: [] });
                setMessage(
                  "Local tracking cleared. Your exported backup can restore it.",
                );
              }}
            >
              Confirm clear local tracking
            </button>
          )}
        </section>
      </div>
    </Dialog>
  );
}
