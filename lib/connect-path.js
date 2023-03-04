//@ts-check
import { traverseSearch } from "lib/traverse";

/** 
 * @param {NS} ns
 * @param {Server} target 
 */
export async function connectToRemote(ns, target) {
    const pathToTarget = traverseSearch(ns, ns.getHostname(), target);

    if (pathToTarget.length == 0) {
        ns.tprint(`ERROR: No path to target '${target}' was found.`);
        return;
    }

    for (const host of pathToTarget) {
        if (host == "home") continue;
        ns.singularity.connect(host);
    }
}