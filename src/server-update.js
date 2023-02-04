//@ts-check

import { Constants } from "lib/constants";

/** @param {import("./NetscriptDefinitions").NS} ns **/
export async function main(ns) {
    let flags = ns.flags([
        ["help", false],
        ["h", false]
    ]);


    if (flags.help || flags.h) {
        ns.tprint(`INFO: usage: server-update ramPo2 (--help)`);
        ns.tprint(`INFO: ramPo2: what power of 2 ram to upgrade to.`);
        return;
    }
    //tR (targetRam) (First argument that tells the targeted amount of RAM)
    const targetRam = Math.pow(2, Number(ns.args[0]));
    //tRSC (targetRamServerCost) (How much the server will cost with the given amount of RAM)
    var targetRamServerCost = ns.getPurchasedServerCost(targetRam);
    //sL (serverList) (The list of all the servers player has)
    let serverList = ns.getPurchasedServers();
    //m (counter) (COunter for money)
    var serversUpgraded = 0;
    for (let serverName of serverList) {
        let playerMoney = ns.getPlayer().money;
        let targetServerMaxRam = ns.getServerMaxRam(serverName);

        if (targetServerMaxRam < targetRam) {
            if (playerMoney > targetRamServerCost) {
                if (ns.upgradePurchasedServer(serverName, targetRam)) {
                    // ns.killall(targetServerName);
                    // ns.deleteServer(targetServerName);
                    // ns.purchaseServer(newName, targetRam);
                    ns.tprint("Upgraded " + serverName + " to " + targetRam + " ram");
                    serversUpgraded++;
                    fixNames(ns, serverName, targetRam);
                }
                else {
                    ns.tprint(`Upgrade failed for some reason`);
                    return;
                }
            }
        }
        else {
            ns.tprint(`Target server '${serverName}' has ${targetServerMaxRam} RAM, more than requested upgrade of ${targetRam}.`);
        }
    }

    let cost = serversUpgraded * targetRamServerCost;

    if (serversUpgraded > 0) {
        ns.tprint(`You bought ${serversUpgraded} servers for a total of $${cost.toLocaleString("en-US")}`);
    } else {
        ns.tprint(`Servers not upgraded. Need $${targetRamServerCost}, have $${ns.getPlayer().money}`);
    }
}

/**
 * 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} serverName 
 * @param {number} newRam 
 */
function fixNames(ns, serverName, newRam) {
    let i = 0
    let newName = (j) => `${Constants.MY_SERVERS_PREFIX}-${newRam}(${Math.log2(newRam)})-${j}`;
    while (ns.serverExists(newName(i))) {
        i++;
    }
    ns.renamePurchasedServer(serverName, newName(i));
}
