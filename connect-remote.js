//@ts-check
import { traverse, traverseSearch } from "lib/traverse";

let logf;
let flags;

/** @param {import("./src/NetscriptDefinitions").NS} ns */
export async function main(ns) {
    logf = printSilent(ns);
    flags = ns.flags([
        ["help", false],
        ["h", false],
        ["silent", false],
        ["s", false],
    ]);
    if (flags["help"] || flags["h"] || (flags["_"] instanceof Array && flags["_"].length == 0)) {
        printHelp();
        return;
    }

    let target = String(flags["_"][0]);

    const pathToTarget = traverseSearch(ns, ns.getHostname(), target);

    if (pathToTarget.length == 0) {
        logf(`ERROR: No path to target '${target}' was found.`);
        return;
    }
    let msg = "";

    for (const host of pathToTarget) {
        if (host == "home") continue;
        msg += "connect " + host + (host != target ? "; " : "");
        //ns.singularity.connect(host);
    }
    logf(msg);
}

function isSilent() {
    return flags["silent"] || flags["s"];
}

function printSilent(ns) {
    return m => {
        if (!isSilent()) ns.tprintf(m);
    }
}

function printHelp() {
    logf("INFO: Usage: run connect-remote.js server-to-connect");
    logf("INFO:");
    logf("INFO: flags:");
    logf("INFO: help:\t\tprint this message");
    logf("INFO: silent:\tsuppress output");
}


/**
 * data (Object) – 
    args (string[]) – 
 * @param {Object} data - general data about the game you might want to autocomplete. 
 * @param {string[]} args - current arguments. Minus run script.js 
 * @returns {string[]}
 */
export function autocomplete(data, args) {
    return [...data.servers];
}