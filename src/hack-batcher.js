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

import { DfsServer } from "lib/traverse";

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

    /**
     * Add the {@link RunInfo}, or another {@link BatchInfo} into this batch.
     * @param {RunInfo | BatchInfo} newRuns 
     */
    push(newRuns) {
        if (newRuns instanceof RunInfo) {
            this.runs.push(newRuns);
        }
        else if (newRuns instanceof BatchInfo) {
            this.runs = this.runs.concat(newRuns.runs);
        }
    }

    /**
     * Get the end of the run list.
     * @returns {RunInfo}
     */
    lastRun() {
        return lastElem(this.runs);
    }
}
class RunInfo {
    /**
     * How long the script will take to execute.
     * @type {number}
     */
    execTime = 0;
    /**
     * How long this script will delay before starting itself, in ms from the initial run of the batcher.
     * @type {number}
     */
    startDelayTime = 0;
    /**
     * When the script will finish executing, relative to other scripts prior.
     * @type {number} 
     */
    endTime = 0;

    /** @type {number} */
    threads = 0;
    /** @type {string} */
    script = "";
    /** @type {import("./NetscriptDefinitions").Server} */
    targetServer;
    /** @type {import("./NetscriptDefinitions").NS} */
    ns;

    /**
     * @param {import("./NetscriptDefinitions").NS} ns 
     * @param {number} execTime - How long the script will take to execute
     * @param {number} startDelayTime - How long this script will delay before starting itself, in ms from the initial run of the batcher
     * @param {number} endTime - When the script will finish executing. When used from a BatchInfo, includes time from previous steps
     * @param {number} threads - How many threads of the script to run
     * @param {string} script - What script file to run
     * @param {import("./NetscriptDefinitions").Server} targetServer - What server is going to be acted upon
     */
    constructor(ns, execTime, startDelayTime, endTime, threads, script, targetServer) {
        this.ns = ns;
        this.execTime = execTime;
        this.startDelayTime = startDelayTime;
        this.endTime = endTime;
        this.threads = threads;
        this.script = script;
        this.targetServer = targetServer;
    }

    /**
     * How much ram is needed to run.
     * @param {number} [threadsRun=0] - Modify given some of the threads have been run.
     * @returns {number}
     */
    ramNeeded(threadsRun = 0) {
        return this.getScriptRam() * (this.threads - threadsRun);
    }

    /**
     * How much ram one thread of the script costs
     * @returns {number}
     */
    getScriptRam() {
        return getScriptRam(this.ns, this.script);
    }

    get [Symbol.toStringTag]() {
        return `${this.script}, threads: ${this.threads}, execution time: ${formatTime(this.execTime)}, ` +
            `delay time: ${formatTime(this.startDelayTime)}, end time: ${formatTime(this.endTime)}`;
    }
}

/**
 * @enum
 * @readonly
 */
const LogTypes = {
    TERMINAL: "terminal",
    FILE: "file"
}
/** @type {LogTypes} */
const LOG_TYPE = LogTypes.TERMINAL;
let logf;

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let flags = ns.flags([
        ["help", false],
        ["infinite", true]
    ]);

    switch (LOG_TYPE) {
        case LogTypes.TERMINAL:
            logf = ns.tprintf;
            break;
        case LogTypes.FILE:
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

    // Prepare the target before any batches start
    let batchInfo = await prepare(ns, targetServer);

    batchInfo.push(createHWGWBatch(ns, targetServer, batchInfo.lastRun()));

    logf(`Run list length: ${batchInfo.runs.length}`);

    const executeResult = await executeRunList(ns, batchInfo);
    // If it failed for whatever reason, stop us from doing anything else
    if (executeResult === null) {
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
 * We require the target to have been prepared before calling this method.
 * 
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {import("./NetscriptDefinitions").Server} targetServer - Server object to hack
 * @param {RunInfo} [lastRunInfo] - The end of the run info list, if it exists
 * @returns {BatchInfo} - RunInfos that need to be executed, not including priors
*/
function createHWGWBatch(ns, targetServer, lastRunInfo) {
    let newBatchInfo = new BatchInfo();
    newBatchInfo.push(hack(ns, targetServer, lastRunInfo?.endTime ?? 0));
    newBatchInfo.push(weaken(ns, targetServer, newBatchInfo.lastRun().endTime));
    newBatchInfo.push(grow(ns, targetServer, newBatchInfo.lastRun().endTime));
    newBatchInfo.push(weaken(ns, targetServer, newBatchInfo.lastRun().endTime));

    return newBatchInfo;
}

/** 
 * Ensure the target server is properly setup for the start of the batch hack
 * Runs WGW
 * 
 * @param {import("./NetscriptDefinitions").NS} ns
 * @returns {Promise<BatchInfo>} - Calculated runs
*/
async function prepare(ns, targetServer) {
    const fudgeFactor = 0.05; // A server can be within this mult of it's min/max values and be considered 'done'
    const curTargetServerSecurity = targetServer.hackDifficulty;
    const curTargetServerMoney = targetServer.moneyAvailable;

    /** @type {BatchInfo} */
    let curRunList = new BatchInfo();

    // Don't need to weaken if it's at minimum
    if (!approxEquals(curTargetServerSecurity, targetServer.minDifficulty, fudgeFactor)) {
        logf(`Starting difficulty: ${formatNum(curTargetServerSecurity)}, min: ${formatNum(targetServer.minDifficulty)}`);
        curRunList.push(weaken(ns, targetServer, curRunList.lastRun()?.endTime ?? 0));
    }

    // Don't need to grow & weaken if the money is at max
    if (!approxEquals(curTargetServerMoney, targetServer.moneyMax, fudgeFactor)) {
        logf(`Starting money: $${formatMoney(curTargetServerMoney)}, max money: $${formatMoney(targetServer.moneyMax)}`);
        curRunList.push(grow(ns, targetServer, curRunList.lastRun()?.endTime ?? 0))

        // We've grown, so now we need to weaken again
        // Our targetServer 'mock' object will have been updated by our grow function
        curRunList.push(weaken(ns, targetServer, curRunList.lastRun()?.endTime ?? 0))
    }

    if (curRunList.runs.length == 0) {
        logf("Nothing to be done, server is already prepared.");
    }

    return curRunList;
}

/**
 * Hack {@link HACK_AMT}% of money from the server.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @param {number} priorEndTime - In how many ms the last script will be finished executing
 * @returns {RunInfo} - Info required to run the action
 */
function hack(ns, targetServer, priorEndTime) {
    /** @type {RunInfo} */
    const info = action(ns, SCRIPT_HACKING, targetServer, priorEndTime, HGWFunction.HACK, add);

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
}

/**
 * Generic function for hack, grow, or weaken.
 * Does update the security of the targetServer, but nothing else.
 * 
 * This script needs to finish after the prior one finishes.
 * If it doesn't (this script's run time is shorter than the previous one's end time), then we need
 * to delay the start of this script to ensure it finishes after the previous one.
 * 
 * Ensures there is at minimum {@link SETTLE_TIME}ms between the prior run and this one.
 * 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} scriptName - What script to run
 * @param {import("./NetscriptDefinitions").Server} targetServer
 * @param {number} priorEndTime - In how many ms the last script will be finished executing
 * @param {HGWFunction} hgwFunction - What methods to use for analysis 
 * @returns {RunInfo} - Constructed object for this run
 */
function action(ns, scriptName, targetServer, priorEndTime, hgwFunction, difficultyOperator) {
    let threads = hgwFunction.getNumThreads(targetServer, BatchParameters.DEFAULT_CORES, hgwFunction);
    let runTime = hgwFunction.timeCalc(targetServer, ns.getPlayer());
    let delayRunTime = 0;

    // Let us pass in a method to handle adding or subtracting without a branch
    // Clamp the value to min difficulty and 100
    targetServer.hackDifficulty = clamp(
        targetServer.minDifficulty,
        difficultyOperator(targetServer.hackDifficulty, hgwFunction.securityChange(threads)),
        100
    );

    // Prior == 0 if this is the first thing to run.
    if (priorEndTime != 0 && priorEndTime > runTime) {
        // How many ms the previous script ends after our runTime finishes
        const timeDelta = priorEndTime - runTime;

        // We need this delta to be at minimum SETTLE_TIME 
        delayRunTime = Math.max(timeDelta + SETTLE_TIME, SETTLE_TIME);
    }

    logf("Action '%s', threads: %s, runtime: %s, delay time: %s", hgwFunction.name, threads, formatTime(runTime), delayRunTime);

    return new RunInfo(ns, runTime, delayRunTime, delayRunTime + runTime, threads, scriptName, targetServer);
}

/**
* @param {import("./NetscriptDefinitions").NS} ns 
* @param {RunInfo} runInfo - Script run instance information
* @param {Array<import("./NetscriptDefinitions").Server>} network - Array of whole network, sorted by available RAM descending
* @param {boolean} tail - Open the script log file tail?
* @returns {number} -1 if all threads were run, or how many threads were successfully run otherwise
*/
function runNetworkScript(ns, runInfo, network, tail = false) {
    const logToTerminal = true;

    /**
     * @param {RunInfo} runInfo 
     * @param {import("./NetscriptDefinitions").Server} serv 
     * @param {number} threadsToRun 
     * @returns 
     */
    const nsExec = (runInfo, serv, threadsToRun) =>
        ns.exec(runInfo.script, serv.hostname, threadsToRun, runInfo.startDelayTime, runInfo.targetServer.hostname, logToTerminal);

    let threadsRun = 0;
    for (let serv of network) {
        let avail = serverRamAvailable(serv);
        if (avail >= runInfo.ramNeeded(threadsRun)) {
            // We have enough ram to either finish or do it all at once
            logf(`runNetworkScript: Full run of ${runInfo.toString()} on ${serv.hostname}`);
            let pid = nsExec(runInfo, serv, (runInfo.threads - threadsRun));
            threadsRun += runInfo.threads;

            if (tail) ns.tail(pid);
            break;
        }
        else if (avail >= runInfo.getScriptRam()) {
            // We don't have enough ram to do it all at once, but we can do at least one
            const toRun = Math.floor(avail / runInfo.getScriptRam());
            let pid = nsExec(runInfo, serv, toRun);
            threadsRun += toRun;

            if (tail) ns.tail(pid);
            logf(`runNetworkScript: Partial run of ${toRun} threads on ${serv.hostname}.`);
        }
        // Can't run anything else on this server
    }

    // Done with the entire network
    if (threadsRun != runInfo.threads) {
        // We couldn't run everything, but we ran some stuff. Let the caller know
        return threadsRun;
    }
    // Full run was completed successfully
    return -1;
}

/**
 * Fire off the scripts requested.
 * If there isn't enough RAM across the whole network to run the given step, wait until 
 * we have more ram available.
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {BatchInfo} batchInfo - List of all the RunInfos that we want to run. 
 */
async function executeRunList(ns, batchInfo) {
    if (batchInfo.runs.length == 0) {
        // Nothing to be done, so stop
        return;
    }

    const { ram: netRamInitial, servers } = await getTotalNetworkRam(ns);

    // We can't use the ram the current script is using, so remove it
    const netRam = netRamInitial - getScriptRam(ns, ns.getScriptName());
    const ramNeeded = batchInfo.runs.reduce((accumulator, curVal) => accumulator + curVal.ramNeeded(), 0);

    logf(`Usable network RAM: ${netRam}, Total RAM needed: ${ramNeeded}`);

    // Check if there are any single operations that require more ram than we have in the whole network
    // We can't run this list, so error out
    if (batchInfo.runs.some((elem) => elem.ramNeeded() > netRam)) {
        logf(`ERROR: Network RAM is insufficient to run a single RunInfo`);
        return null;
    }

    if (ramNeeded > netRam) {
        logf(`WARN: Don't have enough ram across the network to run the requested operation, execution time will be longer as a result`);
    }

    const sortedNetwork = Array.from(servers).sort(serverSort);

    for (let i = 0; i < batchInfo.runs.length; i++) {
        const elem = batchInfo.runs[i];
        const threadsRan = runNetworkScript(ns, elem, sortedNetwork);

        if (threadsRan != -1) {
            // Everything has not finished running, so we need to wait until at least some are completed.
            logf(`Pausing execution...`);
            batchInfo = await pauseAndAdjustBatch(batchInfo);
            logf(`Continuing execution.`);
        }
    }
    logf(`Run list has been executed. Will complete in ${formatTime(batchInfo.lastRun().endTime)}.`);
}

/**
 * Wait for the oldest runs to be completed, then adjust the time of everything else & remove the completed run from the list.
 * @param {BatchInfo} batchInfo 
 * @returns {Promise<BatchInfo>} The adjusted object
 */
async function pauseAndAdjustBatch(batchInfo) {
    const oldestRun = batchInfo.runs[0];

    await oldestRun.ns.sleep(oldestRun.endTime);
    // That run has completed now, so remove it and adjust everything else
    batchInfo.runs.shift();
    for (let run of batchInfo.runs) {
        run.endTime -= oldestRun.endTime;
    }

    return batchInfo;
}

/**
 * Get total RAM across all hacked networks on the network.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @returns {Promise<{ram: number, servers: Set<import("./NetscriptDefinitions").Server>}>} - RAM and network contents
 */
async function getTotalNetworkRam(ns) {
    let ram = 0;

    let availableRam = (_, server) => { ram += server.maxRam - server.ramUsed };
    let totalRam = (_, server) => { ram += server.maxRam };

    /** @type {Set<import("./NetscriptDefinitions").Server>} */
    let visited = new Set();

    await DfsServer(ns, ns.getServer(), visited, totalRam);

    return { ram: ram, servers: visited };
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
const getGrowthMultiplier = (targetServer) => targetServer.moneyMax / Math.max(targetServer.moneyAvailable, 10);

/** Function for {@link action} */
const subtract = (totalV, modifyV) => totalV - modifyV;
/** Function for {@link action} */
const add = (totalV, modifyV) => totalV + modifyV;

/**
 * @param {number} num1 Number to compare
 * @param {number} num2 Number to compare to
 * @param {number} fudge Percent of num2 that num1 is allowed to be below and/or above num2
 * @returns 
 */
const approxEquals = (num1, num2, fudge) =>
    (num1 >= num2 * (1 - fudge)) && (num1 <= num2 * (1 + fudge));

/**
 * Sort servers by available ram, descending.
 * @param {import("./NetscriptDefinitions").Server} server1 
 * @param {import("./NetscriptDefinitions").Server} server2
 * @returns 
 */
const serverSort = (server1, server2) => serverRamAvailable(server2) - serverRamAvailable(server1);

/**
 * @param {import("./NetscriptDefinitions").Server} server 
 * @returns {number}
 */
const serverRamAvailable = (server) => server.maxRam - server.ramUsed;
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
    let ms = time;

    let hour = Math.round(ms / (3600 * 1000));
    ms = ms % (3600 * 1000); // seconds remaining after extracting hours
    let min = Math.round(ms / (60 * 1000));
    ms = Math.round(ms % (60 * 1000)); // seconds remaining after extracting minutes
    let sec = Math.round(ms / 1000);
    ms = Math.round(ms % 1000); // ms remaining after extracting seconds
    return (hour != 0 ? `${hour}h` : "")
        + (min != 0 ? `${min}m` : "")
        + (sec != 0 ? `${sec}s ` : "")
        + (`${ms}ms`);
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