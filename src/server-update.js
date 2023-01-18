// //@ts-check
/** @param {NS} ns **/
export async function main(ns) {
    //tR (targetRam) (First argument that tells the targeted amount of RAM)
    const tR = ns.args[0];
    //tRSC (targetRamServerCost) (How much the server will cost with the given amount of RAM)
    var tRSC = ns.getPurchasedServerCost(tR);
    //sL (serverList) (The list of all the servers player has)
    var sL = ns.getPurchasedServers();
    //sLL (serverListLength) (The length of the list of all the servers a player has)
    var sLL = sL.length;
    //i (counter) (Counter used to loop through serverList array)
    var i = 0;
    //m (counter) (COunter for money)
    var m = 0;
    while (i < sLL) {
        //pM (playerMoney) (How much money the player currently has)
        var pM = ns.getServerMoneyAvailable("home");
        //tSN (targetedServerName)
        var tSN = sL[i];
        //tSMR (targetedServerMaxRam)
        var tSMR = ns.getServerMaxRam(tSN);
        //nSN (newServerName)
        var nSN = tSN.replace(tSMR, tR);
        if (tSMR < tR) {
            if (pM > tRSC) {
                ns.killall(tSN);
                ns.deleteServer(tSN);
                ns.purchaseServer(nSN, tR);
                ns.tprint("Upgraded " + tSN + " to " + tR + " ram");
                ++m;
            }
        }
        ++i;
    }
    var totalCostU = tRSC * 5;
    var totalCost = totalCostU / 1000000;
    var totalCostR = parseFloat(totalCost).toFixed(3);
    var moneyNeededU = tRSC - ns.getServerMoneyAvailable("home");
    var moneyNeeded = moneyNeededU / 1000000;
    var moneyNeededR = parseFloat(moneyNeeded).toFixed(3);
    if (m > 0) {
        ns.tprint("You bought " + m + " servers for a total of " + totalCostR + " million");
    } else {
        ns.tprint("You can't upgrade a server now! You need " + moneyNeededR + " million before you can do that!");
    }
}

// import { Constants } from "lib/constants";

// /** @param {import("./NetscriptDefinitions").NS} ns */
// export async function main(ns) {
//     let flags = ns.flags([["help", false], ["dry-run", false], ["d", false]]);

//     // @ts-ignore
//     if (flags.help || !flags["_"] || flags["_"].length > 1) {
//         ns.tprint("INFO: usage: run src/server-update.js gbtobuy --help --dry-run (-d)")
//         ns.tprint("INFO: ");
//         ns.tprint("INFO: help:\tShow this message");
//         ns.tprint("INFO: gbtobuy:\tHow many GB the new servers will have (power of 2)");
//         ns.tprint("INFO: dry-run:\tJust print cost, and number of servers to be upgraded, don't buy anything");
//         return;
//     }

//     const gbToBuy = Number(flags["_"][0]);
//     const printOnly = Boolean(flags.dry_run || flags.d);
//     const limit = ns.getPurchasedServerLimit();
//     let cost = ns.getPurchasedServerCost(gbToBuy);
//     // Prevent buying more than the limit, obv
//     const totalCanBuy = Math.min(Math.floor(ns.getPlayer().money / cost), limit);

//     ns.tprintf("Buying %s %sGB servers, total cost of: $%s", totalCanBuy, gbToBuy, (cost * totalCanBuy).toLocaleString("en-US"));

//     if (printOnly) return;

//     let upgraded = 0;
//     let purchasedServers = ns.getPurchasedServers();
//     for (let i = 0; i < purchasedServers.length; ++i) {
//         if (upgraded >= totalCanBuy) break;

//         if (ns.getPurchasedServerCost(gbToBuy) <= ns.getPlayer().money
//             && ns.getServer(purchasedServers[i]).maxRam < gbToBuy) {

//             const newServer = ns.upgradePurchasedServer(purchasedServers[i], gbToBuy);
//             ns.tprintf("Upgraded %s to a %s GB server", purchasedServers[i], gbToBuy.toLocaleString("en-US"));
//             upgraded++;
//         }
//         else {
//             ns.tprint("Either can't afford it, or trying to downgrade servers.");
//         }
//         purchasedServers = ns.getPurchasedServers();
//     }
//     ns.tprintf("All %s servers have been upgraded", totalCanBuy);
// }
