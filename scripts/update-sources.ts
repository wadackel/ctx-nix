#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net

// Refresh sources.json against the latest stable ctxrs/ctx release.
//
// stdout: "unchanged" when sources.json already tracks the latest tag,
//         "changed"   when sources.json was rewritten.
// exit 0: either of the above.
// exit 1: upstream fetch failure, asset lookup failure, checksum mismatch, or
//         sources.json write failure.

const UPSTREAM_OWNER = "ctxrs";
const UPSTREAM_REPO = "ctx";

// Stable ctx releases use vX.Y.Z. Leading zeros are rejected so the tag
// round-trips through semver tooling without surprises.
export const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type PlatformSpec = {
  assetName: string;
  binaryName: string;
};

export const PLATFORMS: Record<string, PlatformSpec> = {
  "aarch64-darwin": { assetName: "ctx-macos-arm64", binaryName: "ctx" },
  "x86_64-darwin": { assetName: "ctx-macos-x64", binaryName: "ctx" },
  "aarch64-linux": { assetName: "ctx-linux-aarch64", binaryName: "ctx" },
  "x86_64-linux": { assetName: "ctx-linux-x64", binaryName: "ctx" },
};

export type SystemEntry = {
  url: string;
  hash: string;
  assetName: string;
  binaryName: string;
};

export type Sources = {
  version: string;
  tag: string;
  systems: Record<string, SystemEntry>;
};

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type Release = {
  tag_name: string;
  assets: ReleaseAsset[];
};

const scriptDir = new URL(".", import.meta.url).pathname;
const sourcesPath = `${scriptDir}../sources.json`;

async function fetchLatestRelease(): Promise<Release> {
  const cmd = new Deno.Command("gh", {
    args: ["api", `repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/releases/latest`],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(`gh api failed (exit ${code}): ${new TextDecoder().decode(stderr)}`);
  }
  return JSON.parse(new TextDecoder().decode(stdout)) as Release;
}

async function downloadToBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed for ${url}: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(bytes);
  return hex(digest);
}

export async function sriHash(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(bytes);
  let binary = "";
  for (let i = 0; i < digest.byteLength; i += 1) {
    binary += String.fromCharCode(digest[i]);
  }
  return `sha256-${btoa(binary)}`;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}

export function parseSha256Sums(text: string): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const match = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!match) {
      throw new Error(`Invalid SHA256SUMS line: ${JSON.stringify(line)}`);
    }
    checksums.set(match[2], match[1].toLowerCase());
  }
  return checksums;
}

function findAsset(release: Release, name: string): ReleaseAsset {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) {
    throw new Error(`Asset not found in release ${release.tag_name}: ${name}`);
  }
  return asset;
}

async function readCurrent(): Promise<Sources | null> {
  try {
    const raw = await Deno.readTextFile(sourcesPath);
    return JSON.parse(raw) as Sources;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
}

async function writeAtomic(next: Sources): Promise<void> {
  const tmp = `${sourcesPath}.tmp.${crypto.randomUUID()}`;
  await Deno.writeTextFile(tmp, JSON.stringify(next, null, 2) + "\n");
  await Deno.rename(tmp, sourcesPath);
}

async function processPlatform(
  release: Release,
  system: string,
  spec: PlatformSpec,
  checksums: Map<string, string>,
): Promise<SystemEntry> {
  const asset = findAsset(release, spec.assetName);
  const expected = checksums.get(spec.assetName);
  if (!expected) {
    throw new Error(`SHA256SUMS has no entry for ${spec.assetName}`);
  }

  const bytes = await downloadToBytes(asset.browser_download_url);
  const actual = await sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${spec.assetName}: expected ${expected}, got ${actual}`,
    );
  }
  console.error(`[update-sources] checksum verified for ${system} (${spec.assetName})`);

  return {
    url: asset.browser_download_url,
    hash: await sriHash(bytes),
    assetName: spec.assetName,
    binaryName: spec.binaryName,
  };
}

async function main(): Promise<void> {
  const release = await fetchLatestRelease();
  if (!TAG_PATTERN.test(release.tag_name)) {
    throw new Error(`Refusing tag with unexpected shape: ${JSON.stringify(release.tag_name)}`);
  }
  console.error(`[update-sources] upstream latest tag: ${release.tag_name}`);

  const current = await readCurrent();
  if (current && current.tag === release.tag_name) {
    console.error("[update-sources] decision: unchanged (tags match)");
    console.log("unchanged");
    return;
  }

  const sha256SumsAsset = findAsset(release, "SHA256SUMS");
  const sha256SumsBytes = await downloadToBytes(sha256SumsAsset.browser_download_url);
  const checksums = parseSha256Sums(new TextDecoder().decode(sha256SumsBytes));

  const systems: Record<string, SystemEntry> = {};
  for (const [system, spec] of Object.entries(PLATFORMS)) {
    systems[system] = await processPlatform(release, system, spec, checksums);
  }

  const next: Sources = {
    version: release.tag_name.slice(1),
    tag: release.tag_name,
    systems,
  };
  await writeAtomic(next);
  console.error(
    `[update-sources] decision: changed (${current?.tag ?? "(none)"} -> ${release.tag_name})`,
  );
  console.log("changed");
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    Deno.exit(1);
  });
}
