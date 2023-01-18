var visited = [];

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {

    let map = mapNetwork(ns, "home", {});
    ns.tprint(map);
}

/**
 * @param {import("./NetscriptDefinitions").NS } ns 
 * @param {string} hostname 
 * @param {object} curMap
 */
function mapNetwork(ns, hostname, curMap) {
    let neighbors = ns.scan(hostname);
    curMap[hostname] = {};
    visited.push(hostname);

    neighbors.forEach(neighbor => {
        if (!visited.includes(neighbor)) {
            mapNetwork(ns, neighbor, curMap[hostname]);
        }
    });
    return curMap;
}