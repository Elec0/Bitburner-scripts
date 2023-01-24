//@ts-check
/*
A few things need to be known before this algorithm can be implemented:

- The effects of hack and grow depend on the server security level, a higher security level results in a reduced effect. You only want these 
effects to occur when the security level is minimized.
- The time taken to execute hack, grow, or weaken is determined when the function is called and is based on the security level of the target 
server and your hacking level. 
- You only want these effects to start when the security level is minimized.
- The effects of hack, grow, and weaken, are determined when the time is completed, rather than at the beginning. 
- Hack should finish when security is minimum and money is maximum. 
- Grow should finish when security is minimum, shortly after a hack occurred. 
- Weaken should occur when security is not at a minimum due to a hack or grow increasing it.

A single batch consists of four actions:

1. A hack script removes a predefined, precalculated amount of money from the target server.
2. A weaken script counters the security increase of the hack script.
3. A grow script counters the money decrease caused by the hack script.
4. A weaken script counters the security increase caused by the grow script.

It is also important that these 4 scripts finish in the order specified above, and all of their effects be precalculated to optimize the ratios between them. 
This is the reason for the delay in the scripts.

It is possible to create batches with 3 scripts (HGW) but the efficiency of grow will be harmed by the security increase caused by the hack scripts.

The following is an image demonstrating batches in action:

../_images/batch.png
Batches only function predictably when the target server is at minimum security and maximum money, so your script must also handle preparing 
a server for your batches. You can utilize batches to prepare a server by using no hack threads during preparation.

Depending on your computer’s performance as well as a few other factors, the necessary delay between script execution times may range 
between 20ms and 200ms, you want to fine-tune this value to be as low as possible while also avoiding your scripts finishing out of order. 
Anything lower than 20ms will not work due to javascript limitations.
*/

import { DfsServer, traverse } from "lib/traverse";

/*
TODO:
1. Calculate ram needed before batch is run
2. Run scripts across all hacked computers for better RAM usage
3. Don't fail on running out of ram partway through a batch, allow the loop to pick back up once it has the ram available
*/

const SCRIPT_HACKING = "src/batcher/hack.js";
const SCRIPT_WEAKEN = "src/batcher/weaken.js";
const SCRIPT_GROWTH = "src/batcher/grow.js";

/** Time between the WGHW steps, in ms */
const SETTLE_TIME = 50;

/** Leave the server with 1% of it's money so grow doesn't have problems with $0.00 predictions */
const HACK_AMT = 0.99;

class BatchParameters {
    /** How much of the hacking server's ram do we want to use for our batches? */
    static MAX_RAM_USED = 0.25;

    static MAX_BATCHES = 10;

    static MAX_TIME_TO_FINISH = -1;

    static DEFAULT_CORES = 1;
}
class HGWFunction {
    /** @type {Function} */
    securityChange;
    /** @type {Function} */
    timeCalc;
    /** @type {string} */
    name;
    /** @type {function} */
    getNumThreads;

    static HACK = undefined;
    static GROW = undefined;
    static WEAKEN = undefined;

    /**
     * @callback numThreadCallback
     * @param {import("./NetscriptDefinitions").Server} targetServer
     * @param {number} hackingCores
     * @param {HGWFunction} hgwFunction
     */

    /**
     * 
     * @param {string} name 
     * @param {Function} securityChangeFunction 
     * @param {Function} timeCalcFunction 
     * @param {numThreadCallback} getNumThreadFunction - Function to use to calculate how many threads need to be run based on whatever
     */
    constructor(name, securityChangeFunction, timeCalcFunction, getNumThreadFunction) {
        this.name = name;
        this.securityChange = securityChangeFunction;
        this.timeCalc = timeCalcFunction;
        this.getNumThreads = getNumThreadFunction;
    }
}

class BatchInfo {
    /** @type {Array<RunInfo>} */
    runs = [];
}
class RunInfo {
    /** @type {number} */
    endTime = 0;
    /** @type {number} */
    threads = 0;
    /** @type {string} */
    script = "";
    /** @type {import("./NetscriptDefinitions").Server} */
    targetServer;

    constructor(endTime, threads, script, targetServer) {
        this.endTime = endTime;
        this.threads = threads;
        this.script = script;
        this.targetServer = targetServer;
    }

    get [Symbol.toStringTag]() {
        return `${this.script}, threads: ${this.threads}, execution time: ${formatTime(this.endTime)}`;
    }
}

const LOG_TYPE = "terminal"; // or "file"
let logf;

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let flags = ns.flags([
        ["help", false],
        ["infinite", true]
    ]);

    switch (LOG_TYPE) {
        case "terminal":
            logf = ns.tprintf;
            break;
        // @ts-ignore
        case "file":
            logf = ns.printf;
            break;
    }

    /**
     * @param {import("./NetscriptDefinitions").Server} targetServer 
     * @param {number} hackingCores 
     * @param {HGWFunction} hgwFunction 
     * @returns 
     */
    let getNumWeakenThreads = (targetServer, hackingCores, hgwFunction) => {
        return Math.ceil((targetServer.hackDifficulty - targetServer.minDifficulty) / hgwFunction.securityChange(1, hackingCores));
    }

    /**
     * Get the number of growth threads needed to max out available money.
     * @param {import("./NetscriptDefinitions").Server} targetServer 
     * @param {number} hackingCores 
     * @param {HGWFunction} _hgwFunction
     * @returns
     */
    let getNumGrowthThreads = (targetServer, hackingCores, _hgwFunction) => {
        let multiplier = getGrowthMultiplier(targetServer); // threads, cores
        return Math.ceil(Math.max(1, ns.growthAnalyze(targetServer.hostname, multiplier, hackingCores)));
    }

    /**
     * Return the number of threads required to hack all but {@link HACK_AMT}% of the money.
     * @param {import("./NetscriptDefinitions").Server} targetServer 
     * @param {number} _hackingCores
     * @param {HGWFunction} _hgwFunction
     * @returns 
     */
    let getNumHackThreads = (targetServer, _hackingCores, _hgwFunction) => {
        let moneyToHack = targetServer.moneyAvailable * HACK_AMT;
        let hackPerThread = ns.formulas.hacking.hackPercent(targetServer, ns.getPlayer());
        return Math.round((moneyToHack / targetServer.moneyMax) / hackPerThread);
    }
    
    HGWFunction.HACK = new HGWFunction("hack", ns.hackAnalyzeSecurity, ns.formulas.hacking.hackTime, getNumHackThreads);
    HGWFunction.GROW = new HGWFunction("grow", ns.growthAnalyzeSecurity, ns.formulas.hacking.growTime, getNumGrowthThreads);
    HGWFunction.WEAKEN = new HGWFunction("weaken", ns.weakenAnalyze, ns.formulas.hacking.weakenTime, getNumWeakenThreads);

    let target = String(flags["_"][0]);
    let targetServer = ns.getServer(target);

    // Pre-prepare the target
    let runList = await prepare(ns, targetServer.hostname, targetServer, true);

    runList = runList.concat(runBatch(ns, targetServer));

    logf(`Run list length: ${runList.length}`);

    const executeResult = executeRunList(ns, runList);
    // If it failed for whatever reason, stop us from doing anything else
    if (executeResult == null) {
        return;
    }
    // const runs = Math.min(BatchParameters.MAX_BATCHES, calculateAvailableBatchRuns(ns));

    // do {
    //     for (let i = 0; i < runs; ++i) {
    //         if (i % 10 == 0) {
    //             await ns.sleep(5); // Prevent the game from locking up
    //         }

    //         if (BatchParameters.MAX_TIME_TO_FINISH != -1 && execTime > BatchParameters.MAX_TIME_TO_FINISH) {
    //             logf(`Exceeded max execution time of ${formatNum(BatchParameters.MAX_TIME_TO_FINISH)}, with ${execTime}. Terminating.`);
    //             break;
    //         }
    //         execTime = runBatch(ns, targetServer, execTime);
    //         logf(`Batch #${i + 1} queued on ${targetServer.hostname}, will complete in ${formatTime(execTime)}.`);
    //     }
    //     if (flags.infinite) {
    //         logf(`Wait ${formatTime(execTime)} for batches to complete.`);
    //         await ns.sleep(execTime);
    //         execTime = 0;
    //     }
    // } while (flags.infinite);
}

/** 
 * The way a batch works is you start all 4 scripts at the same time, but give them different
 * starting sleep times, so they will start at the correct time such that they finish very soon after the prior step.
 * 
 * NOTE: Don't hack the server down to $0.00, it will probably cause the next grow run to have too many threads.
 * Or, if we do, run 1 grow cycle, but that seems potentially annoying.
 * 
 * We require the target to have been pre-prepared.
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {import("./NetscriptDefinitions").Server} targetServer - Server object to hack
 * @returns {Array<RunInfo>} - Array of RunInfos that need to be executed
*/
function runBatch(ns, targetServer) {
    let execList = [];
    execList.push(hack(ns, targetServer, lastElem(execList)?.endTime ?? 0));
    execList.push(weaken(ns, targetServer, lastElem(execList).endTime));
    execList.push(grow(ns, targetServer, lastElem(execList).endTime));
    execList.push(weaken(ns, targetServer, lastElem(execList).endTime));

    return execList;
}

/** 
 * Ensure the target server is properly setup for the start of the batch hack
 * Runs WGW
 * 
 * TODO: Wait on prepare scripts if we run out of ram for them
 * 
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {string} targetName 
 * @param {boolean} wait - Whether to wait for scripts to complete or not
 * @returns {Promise<Array<RunInfo>>} - Array of calculated runs
*/
async function prepare(ns, targetName, targetServer, hackingServer, wait = false) {
    const fudgeFactor = 0.05; // A server can be within this mult of it's min/max values and be considered 'done'
    const curTargetServerSecurity = targetServer.hackDifficulty;
    const curTargetServerMoney = targetServer.moneyAvailable;

    /** @type {Array<RunInfo>} */
    let curRunList = [];

    logf(`Starting difficulty: ${formatNum(curTargetServerSecurity)}, min: ${formatNum(targetServer.minDifficulty)}`);
    logf(`Starting money: $${formatMoney(curTargetServerMoney)}, max money: $${formatMoney(targetServer.moneyMax)}`);

    // Don't need to weaken if it's at minimum
    if (!approxEquals(curTargetServerSecurity, targetServer.minDifficulty, fudgeFactor)) {
        curRunList.push(weaken(ns, targetServer, lastElem(curRunList)?.endTime ?? 0));
    }

    // Don't need to grow & weaken if the money is at max
    if (!approxEquals(curTargetServerMoney, targetServer.moneyMax, fudgeFactor)) {
        curRunList.push(grow(ns, targetServer, lastElem(curRunList)?.endTime ?? 0))
        
        // We've grown, so now we need to weaken again
        // Our targetServer 'mock' object will have been updated by our grow function
        curRunList.push(weaken(ns, targetServer, lastElem(curRunList)?.endTime ?? 0))
    }

    if(curRunList.length == 0) {
        logf("Nothing to be done, server is already prepared.");
        return [];
    }

    if (wait) {
        logf("Finished setting up prepare scripts, waiting for %s", formatTime(lastElem(curRunList).endTime));
        await ns.sleep(lastElem(curRunList).endTime);
        // If we're waiting, then we should show this info after, but otherwise probably don't need to
        targetServer = ns.getServer(targetName);
        logf("Done.\n%s: Security: %s, Money: $%s, Min Security: %s, Max Money: $%s", targetName,
            targetServer.hackDifficulty, targetServer.moneyAvailable, targetServer.minDifficulty, targetServer.moneyMax);
    }

    return curRunList;
}

/**
 * Hack {@link HACK_AMT}% of money from the server.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @returns {RunInfo} - Info required to run the action
 */
function hack(ns, targetServer, delayStart) {
    /** @type {RunInfo} */
    const info = action(ns, SCRIPT_HACKING, targetServer, delayStart, HGWFunction.HACK, add);

    let hackPerThread = ns.formulas.hacking.hackPercent(targetServer, ns.getPlayer());
    targetServer.moneyAvailable = targetServer.moneyAvailable * (1 - (hackPerThread * info.threads));

    return info;
}

/**
 * Weaken target server to minimum security
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @returns {RunInfo} - Info required to run the action
 */
function weaken(ns, targetServer, delayStart) {
    return action(ns, SCRIPT_WEAKEN, targetServer, delayStart, HGWFunction.WEAKEN, add);
}

/**
 * Grow target server to max money
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @param {number} delayStart - How long, in ms, to wait to start the grow function
 * @returns {RunInfo} - Info required to run the action
 */
function grow(ns, targetServer, delayStart) {
    const info = action(ns, SCRIPT_GROWTH, targetServer, delayStart, HGWFunction.GROW, add);
    targetServer.moneyAvailable *= getGrowthMultiplier(targetServer);
    return info;

    // let growThreads = getNumGrowthThreads(ns, targetServer, hackingServer.cpuCores);

    // Grow raises the security level of the target server by 0.004 per thread.
    // let growSecurityAdd = ns.growthAnalyzeSecurity(growThreads, null, hackingServer.cpuCores);
    // let growTime = ns.formulas.hacking.growTime(targetServer, ns.getPlayer());

    // targetServer.hackDifficulty += growSecurityAdd;

    // logf("Growth threads: %s, securityAdd: %s, time: %s", growThreads, formatNum(growSecurityAdd), formatTime(growTime));
    // runScript(ns, SCRIPT_GROWTH, targetName, growThreads, delayStart);
}

/**
 * Generic function for hack, grow, or weaken.
 * Does update the security of the targetServer, but nothing else.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} scriptName - What script to run
 * @param {import("./NetscriptDefinitions").Server} targetServer
 * @param {HGWFunction} hgwFunction - What methods to use for analysis 
 * @returns {RunInfo} - Constructed object for this run
 */
function action(ns, scriptName, targetServer, delayStart, hgwFunction, difficultyOperator) {
    let threads = hgwFunction.getNumThreads(targetServer, BatchParameters.DEFAULT_CORES, hgwFunction);
    let runTime = hgwFunction.timeCalc(targetServer, ns.getPlayer());
    // Let us pass in a method to handle adding or subtracting without a branch
    // Clamp the value to min difficulty and 100
    targetServer.hackDifficulty = clamp(
        targetServer.minDifficulty,
        difficultyOperator(targetServer.hackDifficulty, hgwFunction.securityChange(threads)),
        100
    );

    logf("Action '%s', threads: %s, end time: %s", hgwFunction.name, threads, formatTime(runTime));

    return new RunInfo(delayStart + addSettleTime(runTime), threads, scriptName, targetServer);
}

/**
 * Handle running the required script & threads somewhere on our accessible servers. 
 * Want to keep acquiring the resources separate from the logic that determines what scripts to run,
 * since they're both complicated.
 * 
 * Let's have this split runs up by thread if needed.
 * We'll sort all the servers we have access to by available ram, then go down the list, running as many threads 
 * that can run on each server. 
 * If we run out of ram on all available servers, we will kick off a sleep for an amount of time equal to
 * half the runtime of the script, then re-try.
 * When the function returns, all of the requested script runs will have been completed.
 * We have no way of knowing exactly how long it will take, so we'll have to wait for everything
 * to complete for the preparing stage.
 * I'm not sure how to deal with the batching part of it, though. Perhaps re-run whatever stage (HGW) we 
 * got to initially, while skipping the earlier ones. We'd have to wait for the script execution time to 
 * complete, otherwise the calculations won't make any sense.
 * 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} scriptName 
 * @param {string} targetName 
 * @param {number} threads 
 * @param {number} startDelay 
 */
function runScript(ns, scriptName, targetName, threads, startDelay, tail = false) {

    if (threads == 0) {
        logf(`WARN: No work needed, aborting execution of '${scriptName}'`);
        return;
    }
    // Make sure it doesn't require more ram than we have
    const availableRam = ns.getServer().maxRam - ns.getServer().ramUsed;
    const scriptRam = getScriptRam(ns, scriptName);

    if (scriptRam * threads > availableRam) {
        throw `ERROR: Trying to run ${scriptName} w/ ${threads} threads requires ${scriptRam * threads} RAM, `
        + `more than the ${availableRam} we have available!`;
    }
    let pid = ns.run(scriptName, threads, startDelay, targetName);
    if (pid == 0) {
        throw `Problem running '${scriptName}', w/ ${threads} threads.`;
    }

    if (tail) ns.tail(pid, ns.getHostname());
}

/**
 * 
 * @param {import("./NetscriptDefinitions").NS} ns -
 * @param {Array<RunInfo>} runList - List of all the RunInfos that we want to run. 
 */
function executeRunList(ns, runList) {
    /** @type {RamAndNetwork} */
    const ramNetwork = getTotalNetworkRam(ns);
    const netRam = ramNetwork.ram;
    const network = ramNetwork.servers;

    logf(`Total network ram: ${netRam}`);
    const ramNeeded = runList.reduce((accumulator, curVal) => accumulator + calculateRamNeeded(ns, curVal), 0);
    logf(`Total ram needed: ${ramNeeded}`);
    logf("Full network");
    ns.tprint(network);

    // Check if there are any single operations that require more ram than we have in the whole network
    // We can't run this list, so error out.
    for (let i = 0; i < runList.length; i++) {
        if (calculateRamNeeded(ns, runList[i]) > netRam) {
            logf(`ERROR: Network RAM is insufficient to run the single RunInfo "${runList[i].toString()}"`)
            return null;
        }
        
    }
    // TODO: Change this to pause or something instead of failing
    if (ramNeeded > netRam) {
        logf(`ERROR: Don't have enough ram across the network to run the requested operation.`)
    }
}

/**
 * 
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {RunInfo} runInfo 
 * @returns {number}
 */
function calculateRamNeeded(ns, runInfo) {
    return getScriptRam(ns, runInfo.script) * runInfo.threads;
}

/**
 * @typedef {Object} RamAndNetwork
 * @property {number} ram - Total RAM of all servers in the network
 * @property {Set} servers - All servers in the network
 */

/**
 * Get total RAM across all hacked networks on the network.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @returns {RamAndNetwork} - RAM and network contents
 */
function getTotalNetworkRam(ns) {
    let ram = 0;
    /**
     * @param {import("./NetscriptDefinitions").NS} ns
     * @param {import("./NetscriptDefinitions").Server} server 
     */
    let getRam = (ns, server) => {
        ram += server.maxRam;
    }
    let visited = new Set();
    DfsServer(ns, ns.getServer(), visited, getRam);
    logf("get total done")
    // traverse(ns, ns.getServer().hostname, visited, getRam, { killScript: false});

    return {ram: ram, servers: visited};
}

/** 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} scriptName 
 */
function getScriptRam(ns, scriptName) {
    if (!scriptName.startsWith("/")) scriptName = "/" + scriptName;
    return ns.getScriptRam(scriptName);
}

// #region Lambda functions
// ------------------------

/** If the server has $0.00, calculate assuming it has $10 to avoid divide-by-zero errors */
let getGrowthMultiplier = (targetServer) => targetServer.moneyMax / Math.max(targetServer.moneyAvailable, 10);

/** Function for {@link action} */
let subtract = (totalV, modifyV) => totalV - modifyV;
/** Function for {@link action} */
let add = (totalV, modifyV) => totalV + modifyV;

/** How long the gap between scripts should be, in ms. */
let addSettleTime = (timeMs) => timeMs + SETTLE_TIME;

/**
 * @param {number} num1 Number to compare
 * @param {number} num2 Number to compare to
 * @param {number} fudge Percent of num2 that num1 is allowed to be below and/or above num2
 * @returns 
 */
let approxEquals = (num1, num2, fudge) =>
    (num1 >= num2 * (1 - fudge)) && (num1 <= num2 * (1 + fudge));

// #endregion Lambda functions


// #region Utility functions
// -------------------------

/**
 * Return the last element in the array
 * @template T
 * @param {Array<T>} arr 
 * @returns {T}
 */
function lastElem(arr) {
    return arr[arr.length - 1];
}

/**
 * @param {number} time 
 * @returns {string} - time in hhmmss format
 */
function formatTime(time) {
    let sec = time / 1000;
    if (sec < 1) return `${formatNum(time)}ms`;

    let hour = Math.round(sec / 3600);
    sec = sec % 3600; // seconds remaining after extracting hours
    let min = Math.round(sec / 60);
    sec = Math.round(sec % 60); // seconds remaining after extracting minutes
    return (hour != 0 ? `${hour}h` : "")
        + (min != 0 ? `${min}m` : "")
        + (`${sec}s`);
}

/**
 * Default returns .toFixed(2)
 * @param {Number} num - Number to format
 * @returns {string} - Formatted number
 */
function formatNum(num) {
    if (num < 0.01) return num.toString();
    return num.toFixed(2);
}

/**
 * Add commas to number
 * @param {Number} money 
 * @returns - Locale'd to 'en-US'
 */
function formatMoney(money) {
    return money.toLocaleString("en-US");
}

function clamp(number, min, max) {
    return Math.max(min, Math.min(number, max));
}

// #endregion

/**
 * data (Object) – 
    args (string[]) – 
 * @param {Object} data - general data about the game you might want to autocomplete. 
 * @param {string[]} args - current arguments. Minus run script.js 
 * @returns {string[]}
 */
export function autocomplete(data, args) {
    return [...data.servers];
}