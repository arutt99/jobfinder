import rules from "../config/scoring-rules.json";
import { text } from "./normalize";
import type { Job } from "./schema";
export function match(
  title: string,
  description = "",
): Pick<Job, "relevance" | "roleFamilies" | "tags"> {
  const rawTitle = text(title).toLowerCase();
  const rawDescription = text(description).toLowerCase();
  const rawAll = `${rawTitle} ${rawDescription}`;
  const jsm =
    /\bjira service (management|desk)\b/.test(rawAll) ||
    (/\bjsm\b/.test(rawAll) &&
      (/\b(jira|atlassian|itsm|itil|service projects?|request types?|slas?|service desk)\b/.test(
        rawAll,
      ) ||
        /\bjsm\s+(?:systems?\s+)?admin(?:istrator)?\b/.test(rawTitle)));
  // Ambiguous uses of the acronym alone must not imply the Atlassian product.
  const t = jsm ? rawTitle : rawTitle.replace(/\bjsm\b/g, "");
  const d = jsm ? rawDescription : rawDescription.replace(/\bjsm\b/g, "");
  const all = `${t} ${d}`;
  const product = /\b(jira|atlassian|confluence|jsm)\b/;
  const ownership =
    /\b(administer(?:ing|s)?|administrat(?:ion|or|ing)|configur(?:es?|ing|ation)|own(?:s|ing)?|manag(?:es?|ing))\b.{0,65}\b(jira|atlassian|confluence|jsm)\b|\b(jira|atlassian|confluence|jsm)\b.{0,60}\b(administration|configuration|ownership|platform owner)\b/.test(
      d,
    );
  const reasons: Job["relevance"]["reasons"] = [];
  const add = (
    id: keyof typeof rules.points,
    label: string,
    points = rules.points[id],
  ) => reasons.push({ ruleId: id, points, label });
  const admin =
    product.test(t) &&
    /\b(admin(?:istrator)?|system administrator|systems administrator)\b/.test(
      t,
    );
  if (admin) add("admin_title", "Core Atlassian administrator role");
  else if (
    product.test(t) &&
    /\b(engineer|consultant|architect|specialist)\b/.test(t)
  )
    add("specialist_title", "Atlassian engineering or consulting role");
  if (ownership) add("ownership", "Explicit Atlassian platform ownership");
  const configurations = [
    ["Workflows & schemes", /\b(workflows?|schemes?)\b/],
    ["Permissions & access", /\b(permissions?|saml|sso|scim|provisioning)\b/],
    [
      "Projects & fields",
      /\b(custom fields?|issue types?|screens?|service projects?|request types?)\b/,
    ],
  ] as const;
  if (product.test(all) && (ownership || admin || product.test(t)))
    for (const [label, expression] of configurations)
      if (expression.test(d)) add("configuration", label);
  if (jsm && (ownership || admin || /\b(own|configure|administer)\b/.test(d)))
    add("jsm", "Jira Service Management administration");
  if (
    product.test(all) &&
    (ownership || admin || product.test(t)) &&
    /\b(migrations?|integrations?|data center|atlassian cloud|upgrades?)\b/.test(
      d,
    )
  )
    add("platform", "Platform migrations or integrations");
  if (
    !ownership &&
    !admin &&
    /\b(software|frontend|backend|scrum master|project manager)\b/.test(t)
  )
    add("incidental_title", "Title primarily outside platform administration");
  if (
    !ownership &&
    !admin &&
    /\b(use|using)\b.{0,25}\bjira\b.{0,40}\b(track|tasks?|sprints?|tickets?)\b/.test(
      d,
    )
  )
    add("incidental_use", "Jira appears as a task-tracking tool");
  const score = Math.max(
    0,
    Math.min(
      100,
      reasons.reduce((n, r) => n + r.points, 0),
    ),
  );
  const roleFamilies = new Set<string>();
  if (admin && /\bjira\b/.test(t)) roleFamilies.add("Jira admin");
  if (admin && /\batlassian\b/.test(t)) roleFamilies.add("Atlassian admin");
  if (jsm) roleFamilies.add("JSM");
  if (/\bengineer\b/.test(t) && score >= 40) roleFamilies.add("Engineering");
  if (/\bconsultant\b/.test(t) && score >= 40) roleFamilies.add("Consulting");
  if (roleFamilies.size === 0)
    roleFamilies.add(score >= 40 ? "Related" : "Other");
  const tags = [
    ["Jira", /\bjira\b/],
    ["Confluence", /\bconfluence\b/],
    ["JSM", /\b(jsm|jira service (management|desk))\b/],
    ["ScriptRunner", /\bscriptrunner\b/],
    ["Cloud", /\bcloud\b/],
    ["Data Center", /\bdata center\b/],
    ["ITIL", /\bitil\b/],
    ["Groovy", /\bgroovy\b/],
    ["Migration", /\bmigrations?\b/],
  ]
    .filter(([, re]) => (re as RegExp).test(all))
    .map(([label]) => label as string);
  return {
    relevance: {
      score,
      tier:
        score >= rules.thresholds.strong
          ? "strong"
          : score >= rules.thresholds.related
            ? "related"
            : "weak",
      ruleVersion: rules.version,
      reasons,
    },
    roleFamilies: [...roleFamilies],
    tags,
  };
}
