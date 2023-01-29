/** @param {import("../NetscriptDefinitions").NS} ns */
export async function main(ns) {
    // args: sleeptime, target, logToTerminal?
    const sleepTime = Number(ns.args[0]);
    const target = String(ns.args[1]);
    let logTerm = false; 
    if (ns.args[2]) logTerm = Boolean(ns.args[2]);
    let log = logTerm ? ns.tprint : ns.print

    await ns.sleep(sleepTime);
    const amt = await ns.grow(target);
    
    log(`Finished growing ${target} by x${amt.toFixed(2)}`);
}