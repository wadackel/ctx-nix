import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  parseSha256Sums,
  PLATFORMS,
  sha256Hex,
  sriHash,
  TAG_PATTERN,
} from "./update-sources.ts";

Deno.test("TAG_PATTERN accepts canonical stable tags", () => {
  assert(TAG_PATTERN.test("v1.2.3"));
  assert(TAG_PATTERN.test("v0.24.0"));
  assert(TAG_PATTERN.test("v10.20.30"));
});

Deno.test("TAG_PATTERN rejects non-stable or malformed tags", () => {
  assertFalse(TAG_PATTERN.test("v1.2.3-alpha.1"));
  assertFalse(TAG_PATTERN.test("v1.2.3-beta.2"));
  assertFalse(TAG_PATTERN.test("v1.2.3-rc.1"));
  assertFalse(TAG_PATTERN.test("rust-v1.2.3"));
  assertFalse(TAG_PATTERN.test("1.2.3"));
  assertFalse(TAG_PATTERN.test("v01.2.3"));
  assertFalse(TAG_PATTERN.test("v1.2"));
});

Deno.test("PLATFORMS maps supported Nix systems to ctx release assets", () => {
  assertEquals(Object.keys(PLATFORMS), [
    "aarch64-darwin",
    "x86_64-darwin",
    "aarch64-linux",
    "x86_64-linux",
  ]);
  assertEquals(PLATFORMS["aarch64-darwin"].assetName, "ctx-macos-arm64");
  assertEquals(PLATFORMS["x86_64-darwin"].assetName, "ctx-macos-x64");
  assertEquals(PLATFORMS["aarch64-linux"].assetName, "ctx-linux-aarch64");
  assertEquals(PLATFORMS["x86_64-linux"].assetName, "ctx-linux-x64");
});

Deno.test("parseSha256Sums accepts standard and binary-mode lines", () => {
  const sums = parseSha256Sums(
    [
      "ff726f3d48fc7c84ecfd02d0d47d4afdd4212ebc053e0257f50e832e9e0609e4  ctx-linux-x64",
      "db91e6fa22c45b2aae8a24554cf1e0e52c7e19f14afd07ef72a28a343509aa14 *ctx-linux-aarch64",
    ].join("\n"),
  );
  assertEquals(
    sums.get("ctx-linux-x64"),
    "ff726f3d48fc7c84ecfd02d0d47d4afdd4212ebc053e0257f50e832e9e0609e4",
  );
  assertEquals(
    sums.get("ctx-linux-aarch64"),
    "db91e6fa22c45b2aae8a24554cf1e0e52c7e19f14afd07ef72a28a343509aa14",
  );
});

Deno.test("parseSha256Sums rejects malformed lines", () => {
  assertThrows(
    () => parseSha256Sums("not-a-checksum  ctx-linux-x64"),
    Error,
    "Invalid SHA256SUMS line",
  );
});

Deno.test("sha256 helpers return expected hex and SRI formats", async () => {
  const empty = new Uint8Array(0);
  assertEquals(
    await sha256Hex(empty),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assertEquals(await sriHash(empty), "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
});
