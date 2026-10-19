import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Independently verify both Minisign signatures before uploading release assets.
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const installer = resolve(process.argv[2] ?? `src-tauri/target/release/bundle/nsis/DevStackBox_${config.version}_x64-setup.exe`);
const publicLines = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8").trim().split(/\r?\n/);
const key = Buffer.from(publicLines[1], "base64");
assert.equal(key.length, 42, "Invalid public key length");
const publicKey = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key.subarray(10)]),
  format: "der", type: "spki",
});
const lines = Buffer.from(readFileSync(`${installer}.sig`, "utf8").trim(), "base64").toString("utf8").trim().split(/\r?\n/);
assert.equal(lines.length, 4, "Invalid Minisign signature structure");
const signature = Buffer.from(lines[1], "base64");
assert.equal(signature.length, 74, "Invalid signature length");
assert.deepEqual(signature.subarray(2, 10), key.subarray(2, 10), "Signing key ID mismatch");
const algorithm = signature.subarray(0, 2).toString();
assert.ok(["Ed", "ED"].includes(algorithm), "Unsupported signature algorithm");
const bytes = readFileSync(installer);
const message = algorithm === "ED" ? createHash("blake2b512").update(bytes).digest() : bytes;
assert.ok(verify(null, message, publicKey, signature.subarray(10)), "Installer signature failed");
assert.ok(lines[2].startsWith("trusted comment: "), "Missing trusted comment");
const comment = Buffer.from(lines[2].slice("trusted comment: ".length));
assert.ok(verify(null, Buffer.concat([signature.subarray(10), comment]), publicKey, Buffer.from(lines[3], "base64")), "Trusted-comment signature failed");
console.log(`Verified installer and trusted-comment signatures: ${installer}`);
console.log(`SHA-256: ${createHash("sha256").update(bytes).digest("hex").toUpperCase()}`);
