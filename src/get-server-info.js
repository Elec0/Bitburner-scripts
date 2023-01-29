//@ts-check
import { traverse } from "lib/traverse";
import { numPortHacksPresent } from "src/startup";

/** @type {import("./NetscriptDefinitions").Server[]} */
var ServerInfoList = [];

var OnlyAdmin = false;
var OnlyCanHack = false;

class DisplayMode {
    static Full = new DisplayMode("Full");
    static Min = new DisplayMode("Min");
    static Info = new DisplayMode("Info");
    constructor(name) { this.name = name; }
}

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    var flags = ns.flags([
        ["help", false],
        ["h", false],
        ["canhack", false],
        ["admin", false],
        ["f", false],
        ["i", false]
    ]);

    ns.clearLog();
    ServerInfoList = [];

    if (flags.help || flags.h) {
        printHelp(ns);
        return;
    }

    let displayMode = flags["f"] ? DisplayMode.Full
        : flags["i"] ? DisplayMode.Info : DisplayMode.Min;
    OnlyCanHack = Boolean(flags.canhack);
    OnlyAdmin = Boolean(flags.admin);

    if (OnlyCanHack && OnlyAdmin) {
        ns.tprint("ERROR: Invalid flags, both canhack and admin are true. Pick one.");
        return;
    }

    await traverse({ns: ns, hostname: "home", visited: new Set(), callback: toRun });

    ServerInfoList.sort((a, b) => a["hackRank"] - b["hackRank"] || a.moneyMax - b.moneyMax);
    let output = "";
    ServerInfoList.forEach(entry => {
        output += "\n" + formatOutput(ns, entry, displayMode);
    });
    ns.print(output);
    ns.tprintf("Found total of %s servers", ServerInfoList.length);
    ns.tail();
}

function printHelp(ns) {
    ns.tprint("INFO: Usage: run get-server-info.js [--help, -h] {--canhack | --admin} -{f | m | i}");
    ns.tprint("INFO:");
    ns.tprint("INFO: flags:");
    ns.tprint("INFO: canhack\t\tdisplay the servers that can be hacked but are not currently");
    ns.tprint("INFO: admin\t\tif only servers where admin is already obtained should be displayed (options: (t)rue/(f)alse) (default: true)");
    ns.tprint("INFO: output format\t(options: -f/m/i (full/min/info)) (default: m)");
}

/**
 * Rank a given server on how good it is to hack
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} hostname 
 * @returns {number} 0 means don't hack, higher number is better for hacking.
 */
function rankServer(ns, hostname) {
    let server = ns.getServer(hostname);
    if (!server.hasAdminRights) return 0;
    if (server.hackDifficulty > ns.getPlayer().skills.hacking / 2) return 0;
    return server.moneyMax / server.minDifficulty;
}

/**
 * @param {import("./NetscriptDefinitions").NS } ns 
 * @param {import("./NetscriptDefinitions").Server} server 
 */
async function toRun(ns, server) {
    const hostname = server.hostname;
    server["hackRank"] = rankServer(ns, hostname);

    if (OnlyCanHack) {
        if (!server.hasAdminRights && canHack(ns, server)) {
            ServerInfoList.push(server);
        }
    }
    else if (OnlyAdmin && server.hasAdminRights) {
        ServerInfoList.push(server);
    }
    else if (!OnlyAdmin) {
        ServerInfoList.push(server);
    }
}

/**
 * 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} server 
 * @returns {boolean}
 */
function canHack(ns, server) {
    let player = ns.getPlayer();

    return server.requiredHackingSkill <= player.skills.hacking
        && server.numOpenPortsRequired <= numPortHacksPresent(ns);
}

/**
 * @param {import("./NetscriptDefinitions").NS } ns 
 * @param {object} entry 
 * @param {DisplayMode} displayMode 
 * @returns {string}
 */
function formatOutput(ns, entry, displayMode) {
    let fields = [];
    switch (displayMode) {
        case DisplayMode.Full:
            return ns.sprintf("%3j", entry);
        case DisplayMode.Min:
            fields = ["hostname", "moneyMax", "requiredHackingSkill", "hackRank"]
            break;
        case DisplayMode.Info:
            fields = [
                "hostname",
                "hackDifficulty",
                "minDifficulty",
                "moneyAvailable",
                "moneyMax",
                "numOpenPortsRequired",
                "requiredHackingSkill",
                "serverGrowth"
            ];
            break;
    }
    let output = {};
    fields.forEach(field => {
        output[field] = entry[field].toLocaleString("en-US");
    })
    return ns.sprintf("%3j", output);
}
