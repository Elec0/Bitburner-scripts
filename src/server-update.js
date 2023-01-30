// //@ts-check
/** @param {import("./NetscriptDefinitions").NS} ns **/
export async function main(ns) {
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
