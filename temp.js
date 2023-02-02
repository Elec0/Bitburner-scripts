//@ts-check
// import { traverse } from "./lib/traverse";

import { Constants } from "./lib/constants";

/** @type {import("./src/NetscriptDefinitions").Server[]} */
var moneyList = [];

const ONLY_ADMIN = false;

// const window = eval("window");
// const document = eval("document");

/** @param {import("./src/NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let servers = ns.getPurchasedServers();
    for(let i = 0; i < servers.length; ++i) {
        const ram = ns.getServerMaxRam(servers[i]);
        ns.renamePurchasedServer(servers[i], `${Constants.MY_SERVERS_PREFIX}-${ram}(${Math.log2(ram)})-${i}`);
    }
}
/*
2^x = n

*/
/**
 * @param {import("./src/NetscriptDefinitions").NS } ns 
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
