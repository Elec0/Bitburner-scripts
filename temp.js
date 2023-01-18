//@ts-check
// import { traverse } from "./lib/traverse";

/** @type {import("./src/NetscriptDefinitions").Server[]} */
var moneyList = [];

const ONLY_ADMIN = false;

// const window = eval("window");
// const document = eval("document");

/** @param {import("./src/NetscriptDefinitions").NS} ns */
export async function main(ns) {
    ns.tprint(ns.getScriptRam("temp.js", "home"));
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
