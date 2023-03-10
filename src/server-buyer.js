//@ts-check
import { Constants } from "lib/constants";

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let flags = ns.flags([
        ["help", false], 
        ["h", false],
        ["dry-run", false], 
        ["d", false],
        ["s", false],
        ["f", false]
    ]);

    // @ts-ignore
    if (flags.help || flags.h || flags["_"].length == 0) {
        ns.tprint("INFO: usage: run src/buyer-server.js gbtobuy --help --dry-run (-d) (-s)")
        ns.tprint("INFO: ");
        ns.tprint("INFO: help:\tShow this message");
        ns.tprint("INFO: gbtobuy:\tWhat power of 2 GB of RAM the servers will have");
        ns.tprint("INFO: dry-run:\tJust print cost, don't buy anything");
        ns.tprint("INFO: (s)ingle:\tOnly buy 1, not max");
        return;
    }
    const gbPowerToBuy = Number(flags["_"][0]);
    const gbToBuy = Math.pow(2, gbPowerToBuy);
    const printOnly = Boolean(flags.dry_run || flags.d);
    const single = Boolean(flags.s);
    const limit = single ? 1 : ns.getPurchasedServerLimit();
    let cost = ns.getPurchasedServerCost(gbToBuy) * limit;
    ns.tprintf(`Buying ${limit} 2^${gbPowerToBuy} = ${gbToBuy} GB servers, total cost of: ${cost} $${cost.toLocaleString("en-US")}`);

    if (printOnly) return;
 
    let purchasedServers = ns.getPurchasedServers();
    ns.tprintf("%s/%s servers owned", purchasedServers.length, limit);
    while (purchasedServers.length < limit) {
        if (flags.f || ns.getPurchasedServerCost(gbToBuy) <= ns.getPlayer().money) {
            let i = 0;
            let newName = `${Constants.MY_SERVERS_PREFIX}-${gbToBuy}(${gbPowerToBuy})-${i}`;
            while (ns.serverExists(newName)) {
                i++;
                newName = newName.replace(/-\d+$/, `-${i}`)
            }
            const newServer = ns.purchaseServer(newName, gbToBuy);
            ns.tprintf("Bought %s, %sGB server", newServer, gbToBuy);
        }
        else {
            await ns.sleep(2000);
        }
        purchasedServers = ns.getPurchasedServers();
    }
    ns.tprintf("All %s servers have been bought", limit);
}