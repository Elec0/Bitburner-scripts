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
    let flags = ns.flags([
        ["test", false],
        ["no-nope", false],
        ["all-focus", ""]
    ]);
    ns.tprint(flags);

    ns.tprint(ns.sleeve.getNumSleeves());
    for (let i = 0; i < ns.sleeve.getNumSleeves(); ++i) {
        ns.tprint(ns.sleeve.getSleeve(i));
    }
}

function renameServers(ns) {
    let servers = ns.getPurchasedServers();
    for (let i = 0; i < servers.length; ++i) {
        const ram = ns.getServerMaxRam(servers[i]);
        ns.renamePurchasedServer(servers[i], `${Constants.MY_SERVERS_PREFIX}-${ram}(${Math.log2(ram)})-${i}`);
    }
}
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
