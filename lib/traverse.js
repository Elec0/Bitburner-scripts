//@ts-check
import { Constants } from "lib/constants";

/**
 * @typedef {Function}
 */

/**
 * Run the traverse function
 * @param {import("../src/NetscriptDefinitions").NS} ns
 * @param {string} hostname - Current or starting server name
 * @param {Set<string>} visited - Set of hosts that have been visited by this function
 * @param {Function?} callback - callback(ns, hostname)
 * @param {{killScript: boolean, scriptName?: string, killOurs?: boolean }} obj - Kills all if scriptName is blank. 
 * If killOurs is false, all {@link Constants.MY_SERVERS_PREFIX} will be ignored.
 * @returns {Promise<Set<string>>}
*/
export async function traverse(ns, hostname, visited, callback, { killScript, scriptName = "", killOurs = false }) {
    visited.add(hostname);

    if (callback != undefined) {
        await callback(ns, hostname);
    }

    let neighbors = ns.scan(hostname);
    for (const neighbor of neighbors) {
        let notOurs = !neighbor.startsWith(Constants.MY_SERVERS_PREFIX);

        // Only go there if we haven't been before and it's not our server
        // Skip the server if we have been there
        if (visited.has(neighbor)) {
            continue;
        }
        // Handle the killing of the scripts
        if ((notOurs || killOurs) && killScript) {
            // Nuke everything if we aren't trying to kill a specific script
            if (!scriptName) {
                ns.killall(neighbor);
            }
            else {
                ns.scriptKill(scriptName, neighbor);
            }
        }
        // Do the actual recursive visitation
        visited = await traverse(ns, neighbor, visited, callback, { killScript, scriptName });
    }

    return visited;
}

/**
 * 
 * @param {import("../src/NetscriptDefinitions").NS} ns 
 * @param {import("../src/NetscriptDefinitions").Server} startServer - What server to start from. Doesn't super matter, actually.
 * @param {Set<import("../src/NetscriptDefinitions").Server>?} visited 
 * @param {Function?} callback - callback(ns, server)
 */
export async function DfsServer(ns, startServer, visited = new Set(), callback = undefined) {
    let curServer = null
    /**
     * 
     * @param {import("../src/NetscriptDefinitions").NS} ns 
     * @param {string} serverName 
     */
    let ourCallback = (ns, serverName) => {
        curServer = ns.getServer(serverName);
        ns.tprint(`Callback on ${curServer.hostname}`);
        visited.add(curServer);
        ns.tprint("visited");
        ns.tprint(visited);
        if (callback !== undefined) {
            callback(ns, curServer);
        }
    }
    ns.tprint(`Starting dfs with ${startServer.hostname}`);
    let vis = new Set();
    // traverse(ns, startServer.hostname, new Set(), ourCallback, {killScript: false });
    traverse(ns, startServer.hostname, vis, (ns, h) => {}, {killScript: false });
    ns.tprint(vis);
}

/**
 * Find a path to the provided hostname 
 * @param {import("../src/NetscriptDefinitions").NS} ns 
 * @param {string} hostname - Current host
 * @param {string} target - Host we're looking for a path to
 * @param {Array<string>} curPath - The path this particular iteration has taken
 * @param {Set<string>} visited
 * @returns {Array<string>} - Path to the target
 */
export function traverseSearch(ns, hostname, target, curPath = new Array(), visited = new Set()) {
    visited.add(hostname);
    curPath.push(hostname);
    let neighbors = ns.scan(hostname);

    // @ts-ignore
    if (neighbors.includes(target)) {
        curPath.push(target);
        return curPath;
    }

    for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
            const res = traverseSearch(ns, neighbor, target, curPath, visited);
            if (res.length != 0) {
                // We found it
                return res;
            }
        }
    }

    // If we get here, then it wasn't found
    curPath.pop();
    return [];
}