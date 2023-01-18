/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let currentServers = ns.getPurchasedServers();

    for (let i = 0; i < currentServers.length; ++i) {
        ns.killall(currentServers[i]);
        ns.deleteServer(currentServers[i]);
    }
}