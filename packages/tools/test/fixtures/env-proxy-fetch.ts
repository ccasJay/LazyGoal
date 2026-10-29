const target = "https://env-proxy-check.test/probe";

async function probe(label: string): Promise<{ readonly label: string; readonly result: string }> {
    try {
        await fetch(target);
        return { label, result: "ok" };
    } catch {
        return { label, result: "error" };
    }
}

const before = await probe("before");
await import("../../src/web/fetch-default");
const after = await probe("after");

process.stdout.write(JSON.stringify({ before, after }));

export {};
