import { createHash, timingSafeEqual } from "crypto";
import assert from "node:assert/strict";
function secretsMatch(a, b) {
  return timingSafeEqual(createHash("sha256").update(a).digest(),
                         createHash("sha256").update(b).digest());
}
function authorized(req, secret) {
  if (!secret) return true;
  const h = req.headers.get("authorization");
  if (!h) return false;
  return secretsMatch(h, `Bearer ${secret}`);
}
const req = (h) => ({ headers: { get: () => h } });
assert.equal(authorized(req(null), ""), true, "no secret configured -> open (local dev)");
assert.equal(authorized(req("Bearer s3cret"), "s3cret"), true, "correct secret rejected");
assert.equal(authorized(req("Bearer wrong"), "s3cret"), false, "wrong secret accepted");
assert.equal(authorized(req(null), "s3cret"), false, "missing header accepted");
assert.equal(authorized(req(""), "s3cret"), false, "empty header accepted");
assert.equal(authorized(req("Bearer "), "s3cret"), false, "empty bearer accepted");
assert.equal(authorized(req("Bearer s3cretX"), "s3cret"), false, "prefix match accepted");
assert.equal(authorized(req("bearer s3cret"), "s3cret"), false, "case variant accepted");
console.log("auth: 8/8 ok — rejects missing, empty, wrong, prefix and case-variant tokens");
