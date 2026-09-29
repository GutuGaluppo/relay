// Runs the migrations against PGlite (Postgres in WASM) with a stub of Supabase's
// auth schema, and checks RLS, idempotency and last-writer-wins. `pnpm test:db`
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create publication supabase_realtime;
  insert into auth.users values ('${A}'), ('${B}');
`);
// Apply every migration in order.
const dir = new URL("../migrations/", import.meta.url);
for (const f of readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await db.exec(readFileSync(new URL(f, dir), "utf8"));
}
await db.exec(
  `grant select, insert, update, delete on public.reminders to authenticated; grant usage on schema public to authenticated;`,
);

const as = async (user, sql, params) => {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`,
  );
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
};
const item = (id, updated, status = "inbox", extra = {}) => ({
  id,
  text: "Preparar proposta",
  source: "voice",
  status,
  created_at: "2026-03-10T12:00:00.000Z",
  updated_at: updated,
  next_reminder_at: null,
  started_at: null,
  completed_at: null,
  ...extra,
});
const up = (user, items) =>
  as(user, "select public.upsert_reminders($1::jsonb)", [JSON.stringify(items)]);
const get = async (user) =>
  (await as(user, "select id, status, updated_at, user_id from public.reminders order by id")).rows;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL:", m);
    process.exitCode = 1;
  } else console.log("ok -", m);
};

const R1 = "aaaaaaaa-0000-4000-8000-000000000001";
await up(A, [item(R1, "2026-03-10T12:00:00.000Z")]);
await up(A, [item(R1, "2026-03-10T12:00:00.000Z")]); // duplicate
ok((await get(A)).length === 1, "duplicate insert is idempotent");
await up(A, [
  item(R1, "2026-03-10T12:05:00.000Z", "pending", { next_reminder_at: "2026-03-10T14:05:00Z" }),
]);
await up(A, [item(R1, "2026-03-10T12:01:00.000Z", "done")]); // stale write
let rows = await get(A);
ok(rows[0].status === "pending", "stale write ignored (last-writer-wins)");
ok(rows[0].user_id === A, "user_id forced to auth.uid()");
ok((await get(B)).length === 0, "RLS: other user sees nothing");
let err = null;
try {
  await up(B, [item(R1, "2026-03-10T13:00:00.000Z", "archived")]);
} catch (e) {
  err = e.message;
}
rows = await get(A);
ok(rows[0].status === "pending", `RLS: other user cannot overwrite (${err ?? "silently ignored"})`);
try {
  await as(B, "update public.reminders set status='archived', updated_at=now()");
} catch {
  /* RLS may raise; either way nothing must change */
}
ok((await get(A))[0].status === "pending", "RLS: direct update by other user affects nothing");
let emptyErr = null;
try {
  await up(A, [
    item("aaaaaaaa-0000-4000-8000-000000000002", "2026-03-10T12:00:00Z", "inbox", { text: "   " }),
  ]);
} catch (e) {
  emptyErr = e.message;
}
ok(emptyErr !== null, "blank text rejected by check constraint");
let anonErr = null;
try {
  await db.exec("set role anon");
  await db.query("select public.upsert_reminders('[]'::jsonb)");
} catch (e) {
  anonErr = e.message;
} finally {
  await db.exec("reset role");
}
ok(anonErr !== null, "anon cannot call upsert_reminders");
