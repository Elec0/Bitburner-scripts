// //@ts-check
/** @param {import("./NetscriptDefinitions").NS} ns **/
export async function main(ns) {
    //tR (targetRam) (First argument that tells the targeted amount of RAM)
    const tR = Math.pow(2, Number(ns.args[0]));
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
