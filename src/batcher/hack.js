/** @param {import("../NetscriptDefinitions").NS} ns */
export async function main(ns) {
    // args: sleeptime, target, logToTerminal?
    const sleepTime = Number(ns.args[0]);
    const target = String(ns.args[1]);
    let logTerm = false; 
    if (ns.args[2]) logTerm = Boolean(ns.args[2]);
    let log = logTerm ? ns.tprint : ns.print

    await ns.sleep(sleepTime);
    const gainedMoney = await ns.hack(target);
    log(`Finished hacking ${target}, +$${gainedMoney.toLocaleString("en-us")}.`)
}