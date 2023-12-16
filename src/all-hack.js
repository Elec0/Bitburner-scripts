//@ts-check
import { traverse } from "lib/traverse";
import { Constants } from "lib/constants";
import {connectToRemote } from "lib/connect-path";
import {formatTime} from "lib/utils";

const DEFAULT_MAX_BACKDOOR_TIME = 10; // Seconds
let customBackdoorTime;
let flags;

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    // @ts-ignore
    let noRamAvoid = [ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];
    flags = ns.flags([
        ["timeout", DEFAULT_MAX_BACKDOOR_TIME],
        ["no-timeout", false],
        ["no-backdoor", false]
    ]);

    let customBackdoorTime = Number(flags.timeout);

    await traverse({
        ns: ns,
        hostname: "home", visited: new Set(), callback: doHack,
        isAsync: true
    });

    ns.singularity.connect("home");
    ns.tprint(`Done`);
}

/** 
 * Breach host if we have enough port hacks to open it, then nuke and exec {@link SCRIPT_TO_RUN}
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {import("./NetscriptDefinitions").Server} server
*/
async function doHack(ns, server) {
    const hostname = server.hostname;
    const ports = server.numOpenPortsRequired;

    if (hostname == "home") {
        return;
    }
    if (server.requiredHackingSkill > ns.getPlayer().skills.hacking
        || ports > numPortHacksPresent(ns)
        || hostname.startsWith(Constants.MY_SERVERS_PREFIX)) {
        return;
    }

    // If we get here we have enough of the hacks to open the ports
    // See if we actually need to open any ports
    if (!server.hasAdminRights && server.openPortCount < ports) {
        ns.tprint(`${hostname}`);

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
            ns.tprintf("Breached %s", hostname);
        }
        catch (err) {
            ns.tprintf("ERROR: \tCaught on nuke(%s), ports: %s/%s, RAM: %s, hack level: %s / %s",
                hostname, server.openPortCount, ports, server.maxRam, ns.getPlayer().skills.hacking, server.requiredHackingSkill);
            return;
        }
    }
    if (!server.backdoorInstalled && !flags["no-backdoor"]) {
        connectToRemote(ns, hostname);
        // Should be connected to server now
        const backdoorTime = ns.getHackTime(hostname) / 4;

        ns.tprint(`Installing backdoor on ${hostname}. Time: ${formatTime(backdoorTime)}`);
        if (!flags["no-timeout"] && backdoorTime >= customBackdoorTime * 1000) {
            ns.tprint(`\tBackdoor time out of acceptable range, skipping`);
            return;
        }

        await ns.singularity.installBackdoor();
        
        ns.tprintf("Backdoor installed on %s", ns.singularity.getCurrentServer());
        ns.singularity.connect("home");
    }
}
/** @param {import("./NetscriptDefinitions").NS} ns */
export function numPortHacksPresent(ns) {
    let result = 0;
    Constants.PORT_HACKS.forEach(hack => result += ns.fileExists(hack) ? 1 : 0);
    return result;
}