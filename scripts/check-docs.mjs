#!/usr/bin/env node

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const headers = ["概念", "简明含义", "归属模块", "权威说明"];

async function filesUnder(directory) {
    if (!existsSync(directory)) return [];
    const found = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...await filesUnder(path));
        else if (entry.isFile() && path.endsWith(".md")) found.push(path);
    }
    return found;
}

async function documentUnits(root) {
    const units = [];
    for (const area of ["packages", "apps"]) {
        const directory = join(root, area);
        if (!existsSync(directory)) continue;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && existsSync(join(directory, entry.name, "package.json"))) {
                units.push(join(directory, entry.name));
            }
        }
    }
    for (const name of ["benchmarks", "benchmarks/alfworld", "benchmarks/gaia", "benchmarks/swebench", "benchmarks/tua-bench", "prompt-evaluation/gepa"]) {
        if (existsSync(join(root, name))) units.push(join(root, name));
    }
    return units.sort();
}

function visibleName(root, file) {
    return relative(root, file).split(sep).join("/") || ".";
}

function linkDestination(root, source, href) {
    if (/^(https?:|mailto:|tel:|\/\/)/i.test(href)) return { external: true };
    if (/^[a-z][\w+.-]*:/i.test(href)) return { error: `不支持的链接协议：${href}` };
    let decoded;
    try { decoded = decodeURIComponent(href); }
    catch { return { error: `无效的链接编码：${href}` }; }
    const [pathPart, fragment] = decoded.split("#", 2);
    const withoutQuery = pathPart.split("?", 1)[0];
    const target = withoutQuery ? resolve(dirname(source), withoutQuery) : source;
    if (isAbsolute(withoutQuery) || relative(root, target).startsWith(`..${sep}`) || relative(root, target) === "..") {
        return { error: `链接越过项目目录：${href}` };
    }
    return { target, fragment, href };
}

function plainText(tokens) {
    return tokens.map(token => {
        if (token.tokens) return plainText(token.tokens);
        return token.type === "text" || token.type === "codespan" ? token.text ?? "" : "";
    }).join("");
}

function slug(text) {
    return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "").replace(/\s+/g, "-");
}

function tokensFor(markdown) {
    return marked.lexer(markdown, { gfm: true });
}

function anchorsFor(tokens) {
    const headings = new Map();
    const anchors = new Set();
    marked.walkTokens(tokens, token => {
        if (token.type === "heading") {
            const base = slug(token.tokens ? plainText(token.tokens) : token.text);
            const count = headings.get(base) ?? 0;
            anchors.add(count === 0 ? base : `${base}-${count}`);
            headings.set(base, count + 1);
        }
        if (token.type === "html") {
            for (const match of token.raw.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) anchors.add(match[1]);
        }
    });
    return anchors;
}

async function checkLink(root, source, href, cached, errors) {
    const destination = linkDestination(root, source, href);
    if (destination.external) return destination;
    if (destination.error) { errors.push(`${visibleName(root, source)}: ${destination.error}`); return destination; }
    const targetName = visibleName(root, destination.target);
    let info;
    try {
        const canonical = await realpath(destination.target);
        if (relative(root, canonical).startsWith(`..${sep}`) || relative(root, canonical) === "..") {
            errors.push(`${visibleName(root, source)}: 链接越过项目目录：${href}`);
            return destination;
        }
        info = await stat(destination.target);
    } catch {
        errors.push(`${visibleName(root, source)}: 链接目标不存在：${href}`);
        return destination;
    }
    if (destination.fragment) {
        if (!info.isFile()) errors.push(`${visibleName(root, source)}: 目录链接不支持锚点：${href}`);
        else if (destination.target.endsWith(".md")) {
            let anchorSet = cached.get(destination.target);
            if (!anchorSet) {
                anchorSet = anchorsFor(tokensFor(await readFile(destination.target, "utf8")));
                cached.set(destination.target, anchorSet);
            }
            if (!anchorSet.has(destination.fragment)) errors.push(`${visibleName(root, source)}: 锚点不存在：${href}`);
        }
    }
    return { ...destination, targetName };
}

function linksIn(tokens) {
    const links = [];
    marked.walkTokens(tokens, token => {
        if (token.type === "link" || token.type === "image") links.push(token.href);
    });
    return links;
}

function semanticTable(tokens) {
    return tokens.find(token => token.type === "table" && token.header.map(cell => cell.text.trim()).join("|") === headers.join("|"));
}

export async function checkDocs(projectRoot = defaultRoot) {
    const root = await realpath(projectRoot);
    const errors = [];
    const units = await documentUnits(root);
    const owners = new Set(units.map(unit => join(unit, "README.md")));
    const sources = new Set([join(root, "README.md"), join(root, "AGENTS.md"), join(root, "CLAUDE.md")]);
    const cached = new Map();
    if (!existsSync(join(root, "README.md")) || !(await readFile(join(root, "README.md"), "utf8")).trim()) {
        errors.push("README.md: 项目说明入口不存在或为空");
    }
    for (const unit of units) {
        const readme = join(unit, "README.md");
        const overview = join(unit, "notes/overview.md");
        const semantics = join(unit, "notes/semantics.md");
        for (const required of [readme, overview, semantics]) {
            if (!existsSync(required) || !(await readFile(required, "utf8")).trim()) {
                errors.push(`${visibleName(root, required)}: 必需的说明文件不存在或为空`);
            }
        }
        for (const entry of await readdir(unit, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
                errors.push(`${visibleName(root, join(unit, entry.name))}: 模块说明必须位于 notes/，README.md 除外`);
            }
        }
        for (const file of [readme, ...await filesUnder(join(unit, "notes"))]) sources.add(file);
        if (existsSync(readme) && existsSync(overview) && existsSync(semantics)) {
            const readmeLinks = linksIn(tokensFor(await readFile(readme, "utf8")))
                .map(href => linkDestination(root, readme, href).target);
            for (const required of [overview, semantics]) {
                if (!readmeLinks.includes(required)) errors.push(`${visibleName(root, readme)}: 缺少指向 ${visibleName(root, required)} 的入口`);
            }
        }
    }
    for (const file of await filesUnder(join(root, ".agents/skills"))) sources.add(file);
    for (const file of [...sources].sort()) {
        if (!existsSync(file)) continue;
        const markdown = await readFile(file, "utf8");
        const tokens = tokensFor(markdown);
        for (const href of linksIn(tokens)) await checkLink(root, file, href, cached, errors);
        if (markdown.includes("docs/architecture/")) {
            errors.push(`${visibleName(root, file)}: 当前说明仍引用旧架构文档目录`);
        }
        if (!file.endsWith("/notes/semantics.md")) continue;
        const table = semanticTable(tokens);
        if (!table || table.rows.length === 0) {
            errors.push(`${visibleName(root, file)}: 语义表需要四列表头与至少一条概念`);
            continue;
        }
        for (const [index, row] of table.rows.entries()) {
            if (row.length !== 4 || row.some(cell => !cell.text.trim())) {
                errors.push(`${visibleName(root, file)}: 第 ${index + 1} 条概念缺少列值`);
                continue;
            }
            const ownerLink = linksIn(row[2].tokens)[0];
            const authorityLinks = linksIn(row[3].tokens);
            const destination = ownerLink ? linkDestination(root, file, ownerLink) : undefined;
            if (!destination?.target || !owners.has(destination.target)) {
                errors.push(`${visibleName(root, file)}: 第 ${index + 1} 条概念的归属模块不是已发现的 README`);
            }
            if (!authorityLinks.length || authorityLinks.every(link => linkDestination(root, file, link).external)) {
                errors.push(`${visibleName(root, file)}: 第 ${index + 1} 条概念缺少本地权威说明链接`);
            }
        }
    }
    if (existsSync(join(root, "docs/architecture"))) errors.push("docs/architecture/: 旧架构文档目录尚未移除");
    return { units: units.length, documents: sources.size, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await checkDocs(process.argv[2] ?? defaultRoot);
    if (result.errors.length) {
        for (const error of result.errors) console.error(error);
        console.error(`文档检查未通过：${result.errors.length} 个问题，${result.units} 个模块。`);
        process.exitCode = 1;
    } else {
        console.log(`文档检查通过：${result.units} 个模块，${result.documents} 份当前说明。`);
    }
}
