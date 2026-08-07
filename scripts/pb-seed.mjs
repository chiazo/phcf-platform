#!/usr/bin/env node
// pb-seed.mjs
//
// Populates fake/demo data into a PocketBase instance for local testing,
// matching the actual schema defined in server/main.go's ensureAppCollections:
//
//   users            — standard PB auth collection (email, password, ...)
//   member_snapshot  — user_id (relation, required), member_id (text),
//                       updated_by (text), notes (text), personal_info (json,
//                       required), member_info (json, required),
//                       box_info (json, required)
//   member           — user_id (relation, required),
//                       member_snapshot_id (relation, required)
//   boxes            — box_state (number), updated_by (text),
//                       box_members (json), waitlist (json), notes (text)
//   work_formula     — member_id (TEXT, not a relation), work_hours_required,
//                       work_hours_completed, open_hours_required,
//                       open_hours_completed (all int numbers)
//
// Requires Node 18+, the `pocketbase` package (already a repo dependency),
// and `@faker-js/faker` (install with: npm install -D @faker-js/faker).
//
// Usage:
//   node scripts/pb-seed.mjs [options]
//
// Options:
//   --url <url>            PocketBase base URL
//                             (default: $POCKETBASE_URL or http://127.0.0.1:8090)
//   --email <email>        Superuser email
//                             (default: $POCKETBASE_SUPERUSER_EMAIL, prompted if omitted)
//   --password <password>  Superuser password
//                             (default: $POCKETBASE_SUPERUSER_PASSWORD, prompted [hidden] if omitted)
//   --users <n>             Number of fake users (each gets a member_snapshot +
//                             member record created) (default: 10)
//   --boxes <n>             Number of fake boxes records (default: 5)
//   --work-formulas <n>    Number of fake work_formula records (default: 10)
//   --wipe                  Delete previously seeded records first (matches on
//                             a `seeded_by_script = true` marker field where present)
//   --dry-run               Preview only, no API writes
//   -h, --help               Show this help text
//
// Examples:
//   node scripts/pb-seed.mjs --users 20
//   node scripts/pb-seed.mjs --users 15 --boxes 8 --work-formulas 30
//   node scripts/pb-seed.mjs --dry-run --users 5
//   node scripts/pb-seed.mjs --wipe --users 0 --boxes 0 --work-formulas 0

import { parseArgs } from "node:util";
import readline from "node:readline";
import PocketBase, { ClientResponseError } from "pocketbase";
import { faker } from "@faker-js/faker";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function printHelpAndExit(code = 0) {
  console.log(`
pb-seed — populate fake/demo data into a PocketBase instance

Usage:
  node pb-seed.mjs [options]

Options:
  --url <url>            PocketBase base URL (default: $POCKETBASE_URL or http://127.0.0.1:8090)
  --email <email>        Superuser email (default: $POCKETBASE_SUPERUSER_EMAIL, prompted if omitted)
  --password <password>  Superuser password (default: $POCKETBASE_SUPERUSER_PASSWORD, prompted if omitted)
  --users <n>             Number of fake users, each with a member_snapshot + member (default: 10)
  --boxes <n>             Number of fake boxes records (default: 5)
  --work-formulas <n>    Number of fake work_formula records (default: 10)
  --wipe                  Delete previously seeded records first
  --dry-run               Preview only, no API writes
  -h, --help               Show this help text
`);
  process.exit(code);
}

let args;
try {
  const parsed = parseArgs({
    allowPositionals: false,
    options: {
      url: { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      users: { type: "string", default: "10" },
      boxes: { type: "string", default: "5" },
      legacy_snapshots: { type: "string", default: "10" },
      "work-formulas": { type: "string", default: "10" },
      wipe: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  args = parsed.values;
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  printHelpAndExit(1);
}

if (args.help) printHelpAndExit(0);

const PB_URL =
  args.url || process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const NUM_USERS = Math.max(0, parseInt(args.users, 10) || 0);
const NUM_BOXES = Math.max(0, parseInt(args.boxes, 10) || 0);
const NUM_WORK_FORMULAS = Math.max(0, parseInt(args["work-formulas"], 10) || 0);
const NUM_LEGACY_SNAPSHOTS = Math.max(0, parseInt(args.legacy_snapshots, 10) || 0);
const WIPE = args.wipe;
const DRY_RUN = args["dry-run"];

const SEED_MARKER_FIELD = "seeded_by_script";

// ---------------------------------------------------------------------------
// Prompting (same pattern as pb-import.mjs — reuse a single readline
// instance to avoid the two-instance redraw collision described there)
// ---------------------------------------------------------------------------

let sharedRL = null;
function getSharedReadline() {
  if (!sharedRL) {
    sharedRL = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
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

function promptHidden(question) {
  const rl = getSharedReadline();
  const originalWriteToOutput = rl._writeToOutput.bind(rl);

  return new Promise((resolve) => {
    rl._writeToOutput = (stringToWrite) => {
      if (stringToWrite === question) {
        originalWriteToOutput(stringToWrite);
      }
    };

    rl.question(question, (answer) => {
      rl._writeToOutput = originalWriteToOutput;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
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
// Fake data builders — one per real collection in your schema
// ---------------------------------------------------------------------------

function fakeMemberSnapshotPayload(userId) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  return {
    user_id: userId,
    // member_id is intentionally omitted here — member doesn't exist yet.
    // It gets patched in after the member record is created, in
    // seedUsersWithProfiles below.
    updated_by: "pb-seed script",
    notes: faker.datatype.boolean() ? faker.lorem.sentence() : "",

    personal_info: {
      firstName,
      lastName,
      pronouns: faker.helpers.arrayElement(["she/her", "he/him", "they/them"]),
      address: {
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        zipCode: faker.location.zipCode(),
      },
      emailInfo: {
        primaryEmail: faker.internet
          .email({ firstName, lastName })
          .toLowerCase(),
        onMailingList: faker.datatype.boolean(),
      },
      phoneInfo: {
        primaryPhoneNumber: faker.phone.number("###-###-####"),
      },
    },

    member_info: {
      role: faker.helpers.arrayElement(["ROLE_INVALID", "BOARD", "VOLUNTEER"]),
      memberType: faker.helpers.arrayElement(["GENERAL", "ADMIN"]),
      memberState: faker.helpers.arrayElement(["PENDING", "APPROVED"]),
      orientationDate: Math.floor(
        faker.date.past({ years: 2 }).getTime() / 1000,
      ),
      dues: {
        amountPaid: faker.number.int({
          min: 0,
          max: 200,
        }),
        dueState: faker.helpers.arrayElement(["PAID", "UNPAID", "PARTIAL"]),
        paymentType: faker.helpers.arrayElement(["CASH", "CARD", "CHECK"]),
        duesPaidAt: Math.floor(
          faker.date.recent({ days: 90 }).getTime() / 1000,
        ),
      },
      requirements: {
        meetingsCompleted: faker.number.int({
          min: 0,
          max: 12,
        }),
        meetingsRequired: 12,
      },
    },

    box_info: {
      boxId: null,
      assignedAt: Math.floor(faker.date.recent({ days: 30 }).getTime() / 1000),
    },

    [SEED_MARKER_FIELD]: true,
  };
}

function fakeBoxPayload(memberIdsPool) {
  const memberCount = faker.number.int({
    min: 0,
    max: Math.min(4, memberIdsPool.length),
  });
  const waitlistCount = faker.number.int({
    min: 0,
    max: Math.min(3, memberIdsPool.length),
  });

  const adjective = faker.food.adjective();

  return {
    box_state: "ASSIGNED",
    box_name: `${adjective.charAt(0).toUpperCase()}${adjective.slice(1)} Box`,
    updated_by: "pb-seed script",
    box_members: faker.helpers.arrayElements(memberIdsPool, memberCount),
    waitlist: faker.helpers.arrayElements(memberIdsPool, waitlistCount),
    notes: faker.datatype.boolean() ? faker.lorem.sentence() : "",
    [SEED_MARKER_FIELD]: true,
  };
}

function fakeWorkFormulaPayload(memberIdTextPool) {
  const workRequired = faker.number.int({ min: 10, max: 60 });
  const openRequired = faker.number.int({ min: 5, max: 30 });

  return {
    member_id: memberIdTextPool.length
      ? faker.helpers.arrayElement(memberIdTextPool)
      : faker.string.alphanumeric(8).toUpperCase(),
    work_hours_required: workRequired,
    work_hours_completed: faker.number.int({ min: 0, max: workRequired }),
    open_hours_required: openRequired,
    open_hours_completed: faker.number.int({ min: 0, max: openRequired }),
    [SEED_MARKER_FIELD]: true,
  };
}

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

// Creates N fake users, and for each one explicitly creates its
// member_snapshot and member records (this script does NOT rely on any
// server-side hook to do this automatically — main.go's current
// ensureAppCollections bootstrap doesn't register one).
async function seedUsersWithProfiles(pb, count) {
  console.log(
    `\n👤 Seeding ${count} fake user(s) + member_snapshot + member...`,
  );

  const result = {
    users: [],
    memberSnapshots: [],
    members: [],
  };

  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = `${firstName} ${lastName}`;
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();

    const password = "password123";

    if (DRY_RUN) {
      console.log(
        `  [${i + 1}/${count}] would create user ${email} + snapshot + member`,
      );
      continue;
    }

    try {
      const user = await pb.collection("users").create({
        email,
        password,
        passwordConfirm: password,
        name,
      });

      console.log("Created user:", user);
      console.log("User ID:", user.id);

      if (!user?.id) {
        throw new Error("User creation failed: no id returned");
      }

      result.users.push(user);

      // Step 1: create the snapshot without member_id (member doesn't
      // exist yet).
      const snapshotPayload = fakeMemberSnapshotPayload(user.id);
      const snapshot = await pb
        .collection("member_snapshot")
        .create(snapshotPayload);

      result.memberSnapshots.push(snapshot);

      // Step 2: create member, referencing the snapshot.
      const member = await pb.collection("member").create({
        user_id: user.id,
        member_snapshot_id: snapshot.id,
      });
      result.members.push(member);

      // Step 3: patch the snapshot with the real member.id, now that it
      // exists.
      const updatedSnapshot = await pb
        .collection("member_snapshot")
        .update(snapshot.id, { member_id: member.id });
      result.memberSnapshots[result.memberSnapshots.length - 1] =
        updatedSnapshot;

      console.log(
        `  [${i + 1}/${count}] created user=${user.id} snapshot=${snapshot.id} member=${member.id} (${email})`,
      );
    } catch (err) {
      console.error(
        `  [${i + 1}/${count}] FAILED (${email}): ${describeError(err)}`,
      );
    }
  }

  return result;
}

async function seedBoxes(pb, count, memberIdsPool) {
  console.log(`\n📦 Seeding ${count} fake boxes record(s)...`);
  const created = [];

  for (let i = 0; i < count; i++) {
    const payload = fakeBoxPayload(memberIdsPool);

    if (DRY_RUN) {
      console.log(
        `  [${i + 1}/${count}] would create:`,
        JSON.stringify(payload),
      );
      continue;
    }

    try {
      const box = await pb.collection("boxes").create(payload);
      console.log(`  [${i + 1}/${count}] created id=${box.id}`);
      created.push(box);
    } catch (err) {
      console.error(`  [${i + 1}/${count}] FAILED: ${describeError(err)}`);
    }
  }

  return created;
}

async function seedLegacySnaphots(pb, count, memberIdsPool) {
  console.log(`\n📦 Seeding ${count} fake legacy snapshot record(s)...`);
  const created = [];

  for (let i = 0; i < count; i++) {
    const payload = fakeMemberSnapshotPayload(memberIdsPool); //change to snapshot payload

    if (DRY_RUN) {
      console.log(
        `  [${i + 1}/${count}] would create:`,
        JSON.stringify(payload),
      );
      continue;
    }

    try {
      const snapshot = await pb.collection("legacy_snaphots").create(payload);
      console.log(`  [${i + 1}/${count}] created id=${snapshot.id}`);
      created.push(snapshot);
    } catch (err) {
      console.error(`  [${i + 1}/${count}] FAILED: ${describeError(err)}`);
    }
  }

  return created;
}

async function seedWorkFormulas(pb, count, memberIdTextPool) {
  console.log(`\n🧾 Seeding ${count} fake work_formula record(s)...`);
  const created = [];

  for (let i = 0; i < count; i++) {
    const payload = fakeWorkFormulaPayload(memberIdTextPool);

    if (DRY_RUN) {
      console.log(
        `  [${i + 1}/${count}] would create:`,
        JSON.stringify(payload),
      );
      continue;
    }

    try {
      const wf = await pb.collection("work_formula").create(payload);
      console.log(`  [${i + 1}/${count}] created id=${wf.id}`);
      created.push(wf);
    } catch (err) {
      console.error(`  [${i + 1}/${count}] FAILED: ${describeError(err)}`);
    }
  }

  return created;
}

async function wipeSeededData(pb, collectionNames) {
  console.log(
    `\n🧹 Wiping previously seeded data (marker: ${SEED_MARKER_FIELD}=true)...`,
  );

  for (const name of collectionNames) {
    try {
      const schema = await pb.collections.getOne(name);
      const hasMarker = (schema.fields || []).some(
        (f) => f.name === SEED_MARKER_FIELD,
      );
      if (!hasMarker) {
        console.log(
          `  "${name}" has no ${SEED_MARKER_FIELD} field — skipping (cannot safely identify seeded records).`,
        );
        continue;
      }

      const filter = pb.filter(`${SEED_MARKER_FIELD} = true`);
      const records = await pb.collection(name).getFullList({ filter });

      if (records.length === 0) {
        console.log(`  "${name}": nothing to wipe.`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  "${name}": would delete ${records.length} record(s).`);
        continue;
      }

      for (const record of records) {
        await pb.collection(name).delete(record.id);
      }
      console.log(`  "${name}": deleted ${records.length} record(s).`);
    } catch (err) {
      console.error(`  "${name}": wipe failed — ${describeError(err)}`);
    }
  }

  // member/users records don't carry the marker field themselves (only
  // member_snapshot does in this schema), so clean up any member/user
  // records left orphaned by the member_snapshot wipe above.
  try {
    const orphanMembers = await pb.collection("member").getFullList();
    for (const m of orphanMembers) {
      try {
        await pb.collection("member_snapshot").getOne(m.member_snapshot_id);
      } catch (err) {
        if (err instanceof ClientResponseError && err.status === 404) {
          if (!DRY_RUN) await pb.collection("member").delete(m.id);
          console.log(`  "member": deleted orphaned record id=${m.id}`);
        }
      }
    }
  } catch (err) {
    console.error(
      `  Could not clean up orphaned "member" records: ${describeError(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const email =
    args.email ||
    process.env.POCKETBASE_SUPERUSER_EMAIL ||
    (await prompt("Superuser email: "));
  const password =
    args.password ||
    process.env.POCKETBASE_SUPERUSER_PASSWORD ||
    (await promptHidden("Superuser password: "));
  closeSharedReadline();

  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  console.log(`Authenticating against ${PB_URL}...`);
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch (err) {
    throw new Error(`Authentication failed: ${describeError(err)}`);
  }

  if (WIPE) {
    await wipeSeededData(pb, ["member_snapshot", "boxes", "legacy_snapshots", "work_formula"]);
  }

  let userResult = {
    users: [],
    memberSnapshots: [],
    members: [],
  };
  if (NUM_USERS > 0) {
    userResult = await seedUsersWithProfiles(pb, NUM_USERS);
  }

  if (NUM_BOXES > 0) {
    await seedBoxes(
      pb,
      NUM_BOXES,
      userResult.members.map((m) => m.id),
    );
  }

  if (NUM_LEGACY_SNAPSHOTS > 0) {
    await seedLegacySnaphots(
      pb,
      NUM_LEGACY_SNAPSHOTS,
      userResult.members.map((m) => m.id),
    );
  }

  if (NUM_WORK_FORMULAS > 0) {
    await seedWorkFormulas(
      pb,
      NUM_WORK_FORMULAS,
      userResult.members.map((m) => m.id),
    );
  }

  console.log(
    `\n${DRY_RUN ? "Dry run complete — no data was written." : "Seeding complete."}`,
  );
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
