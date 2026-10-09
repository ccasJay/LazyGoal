#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, TextDecoder } from "node:util";

const FORMAT_VERSION = 1;
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function git(cwd, args) {
    return spawnSync("git", ["-C", cwd, "-c", "core.fsmonitor=false", ...args], {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LANG: "C", LC_ALL: "C" },
        maxBuffer: MAX_GIT_OUTPUT,
    });
}

function decode(output, context) {
    try {
        return UTF8_DECODER.decode(output);
    } catch {
        throw new Error(`${context}: Git output is not valid UTF-8`);
    }
}

function requireGit(cwd, args, context) {
    const result = git(cwd, args);
    if (result.status !== 0) {
        const detail = result.error?.message
            ?? (decode(result.stderr ?? Buffer.alloc(0), context).trim() || `Git exited with status ${String(result.status)}`);
        throw new Error(`${context}: ${detail}`);
    }
    return result.stdout;
}

function commitSha(root, label, ref) {
    const context = `cannot resolve ${label} ref ${JSON.stringify(ref)}`;
    const result = git(root, [
        "-c", "core.warnAmbiguousRefs=true",
        "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`,
    ]);
    const stderr = decode(result.stderr ?? Buffer.alloc(0), context);
    if (/\bambiguous\b/iu.test(stderr)) {
        throw new Error(`${label} ref ${JSON.stringify(ref)} is ambiguous; use a fully qualified ref or commit ID`);
    }
    if (result.status !== 0) {
        const detail = result.error?.message ?? (stderr.trim() || `Git exited with status ${String(result.status)}`);
        throw new Error(`${context}: ${detail}`);
    }
    const commits = decode(result.stdout, context).trim().split(/\r?\n/u).filter(Boolean);
    if (commits.length !== 1) throw new Error(`${context}: expected exactly one commit`);
    return commits[0];
}

function mergeBaseSha(root, baseSha, headSha) {
    const context = "cannot resolve merge base";
    const bases = decode(requireGit(root, ["merge-base", "--all", baseSha, headSha], context), context)
        .trim().split(/\r?\n/u).filter(Boolean);
    if (bases.length !== 1) throw new Error(`base and head do not have a unique merge base; found ${bases.length}`);
    return bases[0];
}

function paths(output, context) {
    if (output.length > 0 && output.at(-1) !== 0) throw new Error(`${context}: incomplete Git path output`);
    const result = [];
    let start = 0;
    for (let end = 0; end < output.length; end += 1) {
        if (output[end] !== 0) continue;
        if (end > start) result.push(decode(output.subarray(start, end), context));
        start = end + 1;
    }
    return [...new Set(result)].sort();
}

function diffPaths(root, args, context) {
    return paths(requireGit(root, [
        "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=none",
        "--name-only", "-z", ...args, "--",
    ], context), context);
}

/** Return the committed and worktree paths relative to the containing Git worktree. */
export function changeScope(args, cwd) {
    const { values } = parseArgs({
        args,
        allowPositionals: false,
        options: { base: { type: "string" }, head: { type: "string", default: "HEAD" } },
        strict: true,
    });
    if (values.base === undefined || values.base === "") throw new Error("missing required --base <ref>");
    const root = decode(requireGit(cwd, ["rev-parse", "--show-toplevel"], "cannot locate a Git worktree"), "repository root")
        .replace(/\r?\n$/u, "");
    const baseSha = commitSha(root, "base", values.base);
    const headSha = commitSha(root, "head", values.head);
    const mergeBaseShaValue = mergeBaseSha(root, baseSha, headSha);
    return {
        formatVersion: FORMAT_VERSION,
        repositoryRoot: root,
        input: { base: values.base, head: values.head },
        resolved: { baseSha, headSha, mergeBaseSha: mergeBaseShaValue },
        paths: {
            committed: diffPaths(root, [mergeBaseShaValue, headSha], "cannot inspect committed paths"),
            staged: diffPaths(root, ["--cached"], "cannot inspect staged paths"),
            unstaged: diffPaths(root, [], "cannot inspect unstaged paths"),
            untracked: paths(requireGit(root, ["ls-files", "--others", "--exclude-standard", "-z", "--"],
                "cannot inspect untracked paths"), "cannot inspect untracked paths"),
        },
    };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.stdout.write(`${JSON.stringify(changeScope(process.argv.slice(2), process.cwd()), null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`change-scope: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
