//@ts-check


/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    while(true) {
        await ns.share();
    }

    // moneyList = [];
    // await traverse(ns, "home", new Set(), toRun, { killScript: false });
    // ns.tprint("finish traverse")

    // moneyList.sort((a, b) => a.moneyMax - b.moneyMax)

    // ns.tprint(moneyList);
    // ns.tprintf("Found total of %s servers", moneyList.length);
}

/**
 * @param {import("./NetscriptDefinitions").NS } ns 
 * @param {string} hostname 
 */
// function toRun(ns, hostname) {
//     let server = ns.getServer(hostname);
//     if (ONLY_ADMIN && server.hasAdminRights) {
//         moneyList.push(server);
//     }
//     else if (!ONLY_ADMIN) {
//         moneyList.push(server);
//     }
// }
