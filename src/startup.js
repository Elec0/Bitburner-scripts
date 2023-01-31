//@ts-check
import { traverse } from "lib/traverse";
import { Constants } from "lib/constants";

// \TODO Investigate ns.prompt
export const SCRIPT_TO_RUN = "/src/basic-hack-1.js";
/** Leave this much RAM free when running on home. */
const HOME_PERCENT_RAM_LEAVE = 0.1;

var HackTarget = "";
var IncludeHome = false;
var Script = SCRIPT_TO_RUN;

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    var flags = ns.flags([
        ["script", SCRIPT_TO_RUN],
        ["home", false],
        ["help", false]
    ]);
    ns.tprint(flags);
    if (flags.help) {
        ns.tprint("INFO: Usage: run startup.js server --help --script script-name --home");
        ns.tprint("INFO:");
        ns.tprint("INFO: flags:");
        ns.tprint("INFO: help:\tprint this message");
        ns.tprint("INFO: server:\twhat hostname to target, defaults to each server hacking itself");
        ns.tprint("INFO: script:\twhat hacking script to run, defaults to '" + SCRIPT_TO_RUN + "'");
        ns.tprint("INFO: home:\tIf the hacking script should also be started on home");
        return;
    }
    // @ts-ignore
    HackTarget = flags["_"].length == 0 ? "" : flags["_"][0].toString();
    IncludeHome = Boolean(flags.home);
    Script = flags.script.toString();

    await traverse({
        ns: ns,
        hostname: "home", visited: new Set(), callback: traverseCallback, isAsync: true
    });

    if (ns.getPurchasedServers().length != 0) {
        ns.tprint("Purchased servers:"); // Only print this if we're going to run the next block
    }
    for (const neighbor of ns.getPurchasedServers()) {
        uploadScript(ns, neighbor);
        await runScript(ns, ns.getServer(neighbor), HackTarget);
    }

    ns.tprint("== Done ==");
}

/**
 * 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} server 
 */
async function traverseCallback(ns, server) {
    // @todo kill scripts on server
    if (doHack(ns, server)) {
        await runScript(ns, server, HackTarget);
    }
}

/** 
 * Breach host if we have enough port hacks to open it, then nuke and exec {@link SCRIPT_TO_RUN}
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {import("./NetscriptDefinitions").Server} server
 * @returns {boolean} - If the hacking script should be run on this host
*/
function doHack(ns, server) {
    const hostname = server.hostname;
    const ports = server.numOpenPortsRequired;
    const numPortHacks = numPortHacksPresent(ns);

    if (hostname != "home") {
        if (server.requiredHackingSkill > ns.getPlayer().skills.hacking
            || ports > numPortHacks
            || hostname.startsWith(Constants.MY_SERVERS_PREFIX)) {
            return false;
        }
    }
    else if (!IncludeHome) {
        return false;
    }

    ns.tprint(hostname);

    // If we get here we have enough of the hacks to open the ports
    // See if we actually need to open any ports
    if (!server.hasAdminRights && server.openPortCount < ports) {
        for (let i = 0; i < ports; ++i) {

            let hackMethod = Constants.PORT_HACK_METHODS[i];
            ns[hackMethod](hostname);
            server = ns.getServer(hostname);
            ns.tprintf("\tCalled ns.%s on %s (%s/%s open/req)", hackMethod, hostname, server.openPortCount, ports);
        }
    }

    if (!server.hasAdminRights) {
        try {
            ns.nuke(hostname);
        }
        catch (err) {
            ns.tprintf("\tCaught error on nuke(%s), ports: %s/%s, RAM: %s, hack level: %s / %s",
                hostname, server.openPortCount, ports, server.maxRam, ns.getPlayer().skills.hacking, server.requiredHackingSkill);
            return false;
        }
    }
    // Want to hack it, but not try and run anything on it
    if (server.maxRam == 0) {
        ns.tprintf("\tSkipping 0 RAM server: %s", hostname);
        return false;
    }

    if (hostname != "home") {
        uploadScript(ns, hostname);
        ns.tprintf("\tBreached %s", hostname);
    }
    return true;
}

/** @param {import("./NetscriptDefinitions").NS} ns */
function uploadScript(ns, hostname) {
    ns.scp(Script, hostname, "home");
}

/** 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} server
 * @param {string} target
*/
async function runScript(ns, server, target) {
    const hostname = server.hostname;
    const mem = ns.getScriptRam(Script);
    let availableRam = (server.maxRam - server.ramUsed);
    if (hostname == "home") availableRam *= (1 - HOME_PERCENT_RAM_LEAVE);
    const threads = Math.floor(availableRam / mem);

    // Make sure the server we're going to be running the script against is hacked
    if (target != "" && !ns.getServer(target).hasAdminRights) {
        doHack(ns, ns.getServer(target));
    }

    if (threads == 0) {
        ns.tprintf("WARN: Not enough ram to run any threads on '%s'!", hostname);
    }

    const pid = ns.exec(Script, hostname, threads, target);
    ns.tprintf("\tRunning %s on %s w/ %s threads - PID: %s", Script, hostname, threads, pid);

    await ns.sleep(20); // Prevent scripts running in the same tick, hopefully stopping some overhacking
}
/** @param {import("./NetscriptDefinitions").NS} ns */
export function numPortHacksPresent(ns) {
    let result = 0;
    Constants.PORT_HACKS.forEach(hack => result += ns.fileExists(hack) ? 1 : 0);
    return result;
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
