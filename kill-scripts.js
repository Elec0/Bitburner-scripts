//@ts-check
import { traverse } from "lib/traverse";

/** @param {import("./src/NetscriptDefinitions").NS} ns */
export async function main(ns) {
    await traverse(ns, "home", new Set(), undefined, {killScript: true, killOurs: true });
}