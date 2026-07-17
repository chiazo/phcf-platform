#!/usr/bin/env node
// pb-import.mjs
//
// Admin CLI to import records into a PocketBase collection from a local
// JSON file, using the official `pocketbase` JS SDK.
//
// Requires Node 18+ and the `pocketbase` package (already a dependency
// in the repo root package.json).
//
// Usage:
//   node scripts/pb-import.mjs <path-to-json-file> [options]
//
// Options:
//   --url <url>            PocketBase base URL
//                             (default: $POCKETBASE_URL or http://127.0.0.1:8090)
//   --email <email>        Superuser email
//                             (default: $POCKETBASE_SUPERUSER_EMAIL, prompted if omitted)
//   --password <password>  Superuser password
//                             (default: $POCKETBASE_SUPERUSER_PASSWORD, prompted [hidden] if omitted)
//   --collection <name>    Target collection (default: member_snapshot)
//   --mode <mode>           create | update | upsert (default: upsert)
//   --match-field <path>   Dot-path used to find existing records for
//                             update/upsert (default: personal_info.email_info.primary_email)
//   --batch-size <n>       Number of records sent concurrently (default: 1)
//   --dry-run               Validate and preview only, no API writes
//   -h, --help               Show this help text
//
// Examples:
//   node scripts/pb-import.mjs ./snapshots.json --dry-run
//   node scripts/pb-import.mjs ./snapshots.json --collection member_snapshot --mode upsert
//   node scripts/pb-import.mjs ./snapshots.json --match-field personal_info.email_info.primary_email

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import readline from "node:readline";
import PocketBase, { ClientResponseError } from "pocketbase";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function printHelpAndExit(code = 0) {
  console.log(`
pb-import — import records into a PocketBase collection from a JSON file

Usage:
  node pb-import.mjs <path-to-json-file> [options]

Options:
  --url <url>            PocketBase base URL (default: $POCKETBASE_URL or http://127.0.0.1:8090)
  --email <email>        Superuser email (default: $POCKETBASE_SUPERUSER_EMAIL, prompted if omitted)
  --password <password>  Superuser password (default: $POCKETBASE_SUPERUSER_PASSWORD, prompted if omitted)
  --collection <name>    Target collection (default: member_snapshot)
  --mode <mode>           create | update | upsert (default: upsert)
  --match-field <path>   Dot-path field for detecting existing records (default: personal_info.email_info.primary_email)
  --batch-size <n>       Concurrent requests (default: 1)
  --dry-run               Validate and preview only, no API writes
  -h, --help               Show this help text
`);
  process.exit(code);
}

let args;
let filePositional;
try {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      collection: { type: "string", default: "member_snapshot" },
      mode: { type: "string", default: "upsert" },
      "match-field": {
        type: "string",
        default: "personal_info.email_info.primary_email",
      },
      "batch-size": { type: "string", default: "1" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  args = parsed.values;
  filePositional = parsed.positionals[0];
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  printHelpAndExit(1);
}

if (args.help) printHelpAndExit(0);

const FILE_PATH = filePositional;
if (!FILE_PATH) {
  console.error("Error: missing <path-to-json-file> argument.\n");
  printHelpAndExit(1);
}

const VALID_MODES = ["create", "update", "upsert"];
if (!VALID_MODES.includes(args.mode)) {
  console.error(`Error: --mode must be one of ${VALID_MODES.join(", ")}`);
  process.exit(1);
}

const PB_URL = args.url || process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const COLLECTION = args.collection;
const MODE = args.mode;
const MATCH_FIELD = args["match-field"];
const BATCH_SIZE = Math.max(1, parseInt(args["batch-size"], 10) || 1);
const DRY_RUN = args["dry-run"];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function getNestedValue(obj, path) {
  return path
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// ---------------------------------------------------------------------------
// Prompting — IMPORTANT: reuse a single shared readline interface.
// Creating a second `readline.createInterface()` on process.stdin while one
// is already active causes the two instances' internal cursor/render state
// to collide: the second instance redraws its own (empty) prompt from
// column 0, wiping out whatever the first instance (or a plain
// process.stdout.write) had just printed. In practice this makes the CLI
// look "frozen" — the terminal appears blank, but it's actually still
// waiting for input; the prompt text was just erased.
// ---------------------------------------------------------------------------

let sharedRL = null;
function getSharedReadline() {
  if (!sharedRL) {
    sharedRL = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return sharedRL;
}

function closeSharedReadline() {
  if (sharedRL) {
    sharedRL.close();
    sharedRL = null;
  }
}

function prompt(question) {
  const rl = getSharedReadline();
  return new Promise((resolve) => rl.question(question, resolve));
}

// hidden input for passwords — reuses the same interface. The prompt text
// is passed directly to rl.question() (not written separately) so
// readline's own cursor/redraw math accounts for it; we then let through
// only the very first write (the prompt itself) and suppress everything
// after that (the echoed keystrokes and readline's per-keystroke redraws).
function promptHidden(question) {
  const rl = getSharedReadline();
  const originalWriteToOutput = rl._writeToOutput.bind(rl);

  return new Promise((resolve) => {
    rl._writeToOutput = (stringToWrite) => {
      if (stringToWrite === question) {
        originalWriteToOutput(stringToWrite);
      }
      // else: suppress (typed characters, cursor redraws, etc.)
    };

    rl.question(question, (answer) => {
      rl._writeToOutput = originalWriteToOutput; // restore normal echo
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// PocketBase SDK helpers
// ---------------------------------------------------------------------------

async function authenticate(pb, email, password) {
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch (err) {
    throw new Error(`Authentication failed: ${describeError(err)}`);
  }
}

async function findExistingRecord(pb, matchValue) {
  if (matchValue === undefined || matchValue === null) return null;

  try {
    // pb.filter() safely escapes the interpolated value for us
    const filter = pb.filter(`${MATCH_FIELD} = {:val}`, { val: matchValue });
    return await pb.collection(COLLECTION).getFirstListItem(filter);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw new Error(`Lookup failed: ${describeError(err)}`);
  }
}

async function createRecord(pb, record) {
  try {
    return await pb.collection(COLLECTION).create(record);
  } catch (err) {
    throw new Error(`Create failed: ${describeError(err)}`);
  }
}

async function updateRecord(pb, id, record) {
  try {
    return await pb.collection(COLLECTION).update(id, record);
  } catch (err) {
    throw new Error(`Update failed: ${describeError(err)}`);
  }
}

function describeError(err) {
  if (err instanceof ClientResponseError) {
    return `(${err.status}) ${err.message}${
      err.data?.data ? ` — ${JSON.stringify(err.data.data)}` : ""
    }`;
  }
  return err.message ?? String(err);
}

// ---------------------------------------------------------------------------
// Core import logic
// ---------------------------------------------------------------------------

async function processRecord(pb, record, index, total) {
  const matchValue = getNestedValue(record, MATCH_FIELD);
  const label = matchValue ?? `record #${index + 1}`;
  const prefix = `[${index + 1}/${total}]`;

  try {
    let existing = null;
    if (MODE !== "create") {
      existing = await findExistingRecord(pb, matchValue);
    }

    if (MODE === "create") {
      if (DRY_RUN) {
        console.log(`${prefix} would CREATE (${label})`);
        return { status: "would-create" };
      }
      const created = await createRecord(pb, record);
      console.log(`${prefix} created id=${created.id} (${label})`);
      return { status: "created" };
    }

    if (MODE === "update") {
      if (!existing) {
        console.warn(`${prefix} SKIPPED — no existing record matches ${MATCH_FIELD}="${label}"`);
        return { status: "skipped" };
      }
      if (DRY_RUN) {
        console.log(`${prefix} would UPDATE id=${existing.id} (${label})`);
        return { status: "would-update" };
      }
      await updateRecord(pb, existing.id, record);
      console.log(`${prefix} updated id=${existing.id} (${label})`);
      return { status: "updated" };
    }

    // upsert
    if (existing) {
      if (DRY_RUN) {
        console.log(`${prefix} would UPDATE id=${existing.id} (${label})`);
        return { status: "would-update" };
      }
      await updateRecord(pb, existing.id, record);
      console.log(`${prefix} updated id=${existing.id} (${label})`);
      return { status: "updated" };
    } else {
      if (DRY_RUN) {
        console.log(`${prefix} would CREATE (${label})`);
        return { status: "would-create" };
      }
      const created = await createRecord(pb, record);
      console.log(`${prefix} created id=${created.id} (${label})`);
      return { status: "created" };
    }
  } catch (err) {
    console.error(`${prefix} FAILED (${label}): ${err.message}`);
    return { status: "failed" };
  }
}

async function runInBatches(items, batchSize, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, j) => worker(item, i + j))
    );
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Reading ${FILE_PATH}...`);
  const raw = await readFile(FILE_PATH, "utf-8");

  let records;
  try {
    records = JSON.parse(raw);
  } catch (err) {
    throw new Error(`File is not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(records)) {
    throw new Error("Expected the JSON file to contain a top-level array of record objects.");
  }
  if (records.length === 0) {
    console.log("No records found in file — nothing to do.");
    return;
  }
  const nonObjectIndex = records.findIndex(
    (r) => typeof r !== "object" || r === null || Array.isArray(r)
  );
  if (nonObjectIndex !== -1) {
    throw new Error(`Record at index ${nonObjectIndex} is not a JSON object.`);
  }

  console.log(
    `Loaded ${records.length} record(s). collection="${COLLECTION}" mode="${MODE}" match-field="${MATCH_FIELD}"${DRY_RUN ? " [DRY RUN]" : ""}`
  );

  const email = args.email || process.env.POCKETBASE_SUPERUSER_EMAIL || (await prompt("Superuser email: "));
  const password = args.password || process.env.POCKETBASE_SUPERUSER_PASSWORD || (await promptHidden("Superuser password: "));
  closeSharedReadline();

  const pb = new PocketBase(PB_URL);
  // we're firing concurrent/sequential requests ourselves — don't let the
  // SDK auto-cancel "duplicate" in-flight requests to the same collection
  pb.autoCancellation(false);

  console.log(`Authenticating against ${PB_URL}...`);
  await authenticate(pb, email, password);

  console.log(`Importing (batch size ${BATCH_SIZE})...\n`);
  const results = await runInBatches(records, BATCH_SIZE, (record, index) =>
    processRecord(pb, record, index, records.length)
  );

  const summary = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log("\nSummary:");
  for (const [status, count] of Object.entries(summary)) {
    console.log(`  ${status}: ${count}`);
  }

  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});