import assert from "node:assert/strict";
import { test } from "node:test";
import { recordVerification, releaseBlock, releasedIds } from "../src/lib/owner-verification.js";

test("history keeps every change and the latest status", () => {
  let m = recordVerification({}, "abc12345", "awaiting_verification", { note: "cek", now: 1 });
  m = recordVerification(m, "abc12345", "false_positive", { note: "pemeran dewasa terverifikasi", title: "Salam Pramuka", now: 2 });
  assert.equal(m.abc12345.status, "false_positive");
  assert.deepEqual(m.abc12345.history.map((h) => h.status), ["awaiting_verification", "false_positive"]);
});

test("only keyword-only titles can be released", () => {
  assert.equal(releaseBlock("Salam Pramuka Hijab"), "");
  assert.equal(releaseBlock("Cewek SMU Perawan"), "");
  assert.notEqual(releaseBlock("Anak SMP colmek"), "");
  assert.notEqual(releaseBlock("Abg 15 tahun seragam"), "");
});

test("releasedIds needs false_positive and rechecks the current title", () => {
  let m = recordVerification({}, "id000001", "false_positive", { title: "Salam Pramuka" });
  m = recordVerification(m, "id000002", "keep_restricted", { title: "Pramuka" });
  m = recordVerification(m, "id000003", "false_positive", { title: "Pramuka" });
  assert.deepEqual(releasedIds(m), ["id000001", "id000003"]);
  assert.deepEqual(releasedIds(m, (id) => (id === "id000003" ? "Pramuka 14 tahun" : "Salam Pramuka")), ["id000001"]);
});
