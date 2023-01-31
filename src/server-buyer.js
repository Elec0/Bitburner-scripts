//@ts-check
import { Constants } from "lib/constants";

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let flags = ns.flags([
        ["help", false], 
        ["h", false],
        ["dry-run", false], 
        ["d", false],
        ["s", false]
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

    ns.tprintf("Buying %s %sGB servers, total cost of: $%s", limit, gbToBuy, cost.toLocaleString("en-US"));

    if (printOnly) return;
 
    let purchasedServers = ns.getPurchasedServers();
    ns.tprintf("%s/%s servers owned", purchasedServers.length, limit);
    while (purchasedServers.length < limit) {
        if (ns.getPurchasedServerCost(gbToBuy) <= ns.getPlayer().money) {
            const newServer = ns.purchaseServer(Constants.MY_SERVERS_PREFIX, gbToBuy);
            ns.tprintf("Bought %s, %sGB server", newServer, gbToBuy);
        }
        else {
            await ns.sleep(2000);
        }
        purchasedServers = ns.getPurchasedServers();
    }
    ns.tprintf("All %s servers have been bought", limit);
}