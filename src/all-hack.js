//@ts-check
import { traverse } from "lib/traverse";
import { Constants } from "lib/constants";

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let noRamAvoid = [ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];

    await traverse({
        ns: ns,
        hostname: "home", visited: new Set(), callback: (ns, server) => doHack(ns, server),
        isAsync: true
    });
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
            
            // With Singularity, run installBackdoor.
        }
        catch (err) {
            ns.tprintf("ERROR: \tCaught on nuke(%s), ports: %s/%s, RAM: %s, hack level: %s / %s",
                hostname, server.openPortCount, ports, server.maxRam, ns.getPlayer().skills.hacking, server.requiredHackingSkill);
            return;
        }
    }
}
/** @param {import("./NetscriptDefinitions").NS} ns */
export function numPortHacksPresent(ns) {
    let result = 0;
    Constants.PORT_HACKS.forEach(hack => result += ns.fileExists(hack) ? 1 : 0);
    return result;
}