// Integration smoke: the REAL connect-web client (what the frontend uses) against a running
// admin, proving connect-web's gRPC-web wire is compatible with our in-house translator.
// Usage: ADMIN_URL=http://127.0.0.1:8099 npx tsx smoke.ts
import { createApiClients } from "./src/index.ts";

const base = process.env.ADMIN_URL ?? "http://127.0.0.1:8099";
const pw = "pw123456";
const email = `ts-${process.pid}@example.com`;

const api = createApiClients(base);
const user = await api.auth.registerCompany({ companyName: "TS Co", email, password: pw });
console.log(`  RegisterCompany -> role=${user.role} compId=${user.compId}`);

const tok = await api.auth.login({ email, password: pw });
console.log(`  Login           -> accessToken len=${tok.accessToken.length}`);

const authed = createApiClients(base, () => tok.accessToken);
const me = await authed.auth.me({});
console.log(`  Me              -> id=${me.id} role=${me.role}`);

if (user.role !== "company_admin" || me.role !== "company_admin") {
  throw new Error("FAIL: unexpected role");
}
console.log("PASS: connect-web client <-> in-house gRPC-web translator");
