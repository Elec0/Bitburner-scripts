//@ts-check
import { traverse } from "lib/traverse";

/** @param {import("./src/NetscriptDefinitions").NS} ns */
export async function main(ns) {
    await traverse({ns, hostname: "home", visited: new Set(), killScript: true, killOurs: true });
}