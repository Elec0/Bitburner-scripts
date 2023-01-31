//@ts-check
import { Constants } from "lib/constants";

/**
 * @callback TraverseCallback
 * @param {import("../src/NetscriptDefinitions").NS} ns
 * @param {import("../src/NetscriptDefinitions").Server} server
 */

/**
 * @typedef TraverseType
 * @property {import("../src/NetscriptDefinitions").NS} ns
 * @property {string} hostname - Current or starting server name
 * @property {Set<string>} visited - Set of hosts that have been visited by this function
 * @property {TraverseCallback} [callback] - callback(ns, hostname)
 * @property {boolean} [killScript = false] - Kills all if scriptName is blank
 * @property {string} [scriptName = ""] - What script name to kill, if any
 * @property {boolean} [killOurs = false] - If killOurs is false, all {@link Constants.MY_SERVERS_PREFIX} will be ignored.
 * @property {boolean} [isAsync = false] - If the recursive call should be 'awaited' or not
 * 
 */

/**
 * Run the traverse function
 * @param {object} traverseType
 * @param {import("../src/NetscriptDefinitions").NS} traverseType.ns
 * @param {string} traverseType.hostname - Current or starting server name
 * @param {Set<string>} traverseType.visited - Set of hosts that have been visited by this function
 * @param {TraverseCallback} [traverseType.callback] - callback(ns, hostname)
 * @param {boolean} [traverseType.isAsync = false] - If the recursive call should be 'awaited' or not
 * @returns {Promise<Set<string>>}
 */
export async function traverse({ ns, hostname, visited, callback, isAsync = false }) {
    visited.add(hostname);

    if (callback != undefined) {
        if (callback.constructor.name === "AsyncFunction") {
            await callback(ns, ns.getServer(hostname));
        }
        else {
            callback(ns, ns.getServer(hostname));
        }
    }

    let neighbors = ns.scan(hostname);
    for (const neighbor of neighbors) {
        // Only go there if we haven't been before
        if (visited.has(neighbor)) {
            continue;
        }

        // Do the actual recursive visitation
        /** @type {TraverseType} */
        const paramObj = { ns: ns, hostname: neighbor, visited: visited, callback: callback };
        if (isAsync) {
            visited = await traverse(paramObj);
        }
        else {
            visited = await Promise.resolve(traverse(paramObj));
        }
    }

    return visited;
}

/**
 * 
 * @param {import("../src/NetscriptDefinitions").NS} ns 
 * @param {import("../src/NetscriptDefinitions").Server} startServer - What server to start from. Doesn't super matter, actually.
 * @param {Set<import("../src/NetscriptDefinitions").Server>} [visited] 
 * @param {TraverseCallback} [callback] - callback(ns, server)
 * @param {TraverseCallback} [visitedCondition] - callback(ns, server)
 */
export async function DfsServer(ns, startServer, visited, callback, visitedCondition) {
    if (visited == undefined || visited == null) {
        visited = new Set();
    }
    /**
     * @param {import("../src/NetscriptDefinitions").NS} ns 
     * @param {import("../src/NetscriptDefinitions").Server} server 
     */
    const ourCallback = (ns, server) => {
        if (visited == undefined) {
            ns.tprint(`visited is undefined for ${server.hostname}!`);
            return;
        }
        if (visitedCondition(ns, server) === true) {
            visited.add(server);
            
            if (callback !== undefined) {
                callback(ns, server);
            }
        }
    }
    await traverse({ ns: ns, hostname: startServer.hostname, visited: new Set(), callback: ourCallback });
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