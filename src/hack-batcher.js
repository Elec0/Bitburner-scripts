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
import { match } from "lib/matcher";

const SCRIPT_HACKING = "src/batcher/hack.js";
const SCRIPT_WEAKEN = "src/batcher/weaken.js";
const SCRIPT_GROWTH = "src/batcher/grow.js";

/**
 * @enum {string}
 * @readonly
 */
const HGWEnum = {
    H: "H",
    G: "G",
    W: "W"
};

/** Time between the WGHW steps, in ms */
const SETTLE_TIME = 50;

/** Leave the server with 1% of it's money so grow doesn't have problems with $0.00 predictions */
const HACK_AMT = 0.99;

class BatchParameters {
    /** How much of our home's ram do we want to use for our batches? */
    static MAX_HOME_RAM_USED = 0.75;

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

    static HACK;
    static GROW;
    static WEAKEN;

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

    ramNeeded = () => this.runs.reduce((accumulator, curVal) => accumulator + curVal.ramNeeded(), 0);

    /**
     * When waiting for ram to be freed up, an amount of time will pass.
     * The runs in the list need to be adjusted based on this time.
     * 
     * Delay & end times are affected by time passing, so subtract the time from all of those values
     * 
     * If endTime becomes 0 during this time, then we need to remove that object as it has completed.
     * @param {number} amt Amount of time passed in ms
     */
    timePassed(amt) {
        let toRemove = [];
        for (let i = 0; i < this.runs.length; ++i) {
            const curRun = this.runs[i];
            // Don't do anything with the time if the script hasn't been fully started yet
            if (curRun.threads != 0) {
                continue;
            }
            curRun.delayTime = Math.max(curRun.delayTime - amt, 0);
            curRun.endTime = Math.max(curRun.endTime - amt, 0);
            if (curRun.endTime == 0) {
                toRemove.push(i);
            }
        }
        // Now go about removing the elements at the saved indexes
        for (let index of toRemove) {
            this.runs.splice(index, 1);
        }
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
    delayTime = 0;
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

    /** @type {HGWEnum} */
    scriptType;

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
        this.delayTime = startDelayTime;
        this.endTime = endTime;
        this.threads = threads;
        this.script = script;
        this.targetServer = targetServer;
        this.scriptType = match(script)
            .on(s => s.includes("hack"), () => HGWEnum.H)
            .on(s => s.includes("grow"), () => HGWEnum.G)
            .on(s => s.includes("weaken"), () => HGWEnum.W)
            .otherwise(s => s);
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
            `delay time: ${formatTime(this.delayTime)}, end time: ${formatTime(this.endTime)}`;
    }
}

/**
 * @enum {string}
 * @readonly
 */
const LogTypes = {
    TERMINAL: "terminal",
    FILE: "file"
}
/** @type {LogTypes} */
const LOG_TYPE = LogTypes.FILE;
let logf;
let loge;

/**
 * Extracted `ns.growthAnalyze`, so we can use a mock server.
 * Returns the number of "growth cycles" needed to grow the specified server by the
 * specified amount.
 * 
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {import("./NetscriptDefinitions").Server} server - Server being grown
 * @param {number} growth - How much the server is being grown by, in DECIMAL form (e.g. 1.5 rather than 50)
 * @param {number} [cores=1] - How many cores the hacking server is using
 * @returns Number of "growth cycles" needed
 */
function numCycleForGrowth(ns, server, growth, cores = 1) {
    const ServerBaseGrowthRate = 1.03;
    const ServerMaxGrowthRate = 1.0035;
    let ajdGrowthRate = 1 + (ServerBaseGrowthRate - 1) / server.hackDifficulty;
    if (ajdGrowthRate > ServerMaxGrowthRate) {
        ajdGrowthRate = ServerMaxGrowthRate;
    }

    const serverGrowthPercentage = server.serverGrowth / 100;

    const coreBonus = 1 + (cores - 1) / 16;
    const cycles =
        Math.log(growth) /
        (Math.log(ajdGrowthRate) *
            ns.getPlayer().mults.hacking_grow *
            serverGrowthPercentage *
        /*BitNodeMultipliers.ServerGrowthRate */ 1 *
            /* (get this from https://github.com/bitburner-official/bitburner-src/blob/aa32e235fafd7722d7dcbdd1ff0053363b240318/src/BitNode/BitNode.tsx) */
            coreBonus);

    return cycles;
}

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let flags = ns.flags([
        ["help", false],
        ["infinite", false],
        ["tail", true]
    ]);

    disableLogging(ns);

    switch (LOG_TYPE) {
        case LogTypes.TERMINAL:
            logf = ns.tprintf;
            break;
        case LogTypes.FILE:
            logf = ns.printf;
            break;
    }
    loge = ns.tprint;

    // #region lambdas
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
        return Math.ceil(Math.max(1, numCycleForGrowth(ns, targetServer, multiplier, hackingCores)));
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
    // #endregion

    HGWFunction.HACK = new HGWFunction("hack", ns.hackAnalyzeSecurity, ns.formulas.hacking.hackTime, getNumHackThreads);
    HGWFunction.GROW = new HGWFunction("grow", ns.growthAnalyzeSecurity, ns.formulas.hacking.growTime, getNumGrowthThreads);
    HGWFunction.WEAKEN = new HGWFunction("weaken", ns.weakenAnalyze, ns.formulas.hacking.weakenTime, getNumWeakenThreads);

    let target = String(flags["_"][0]);
    let targetServer = ns.getServer(target);

    if (LOG_TYPE == LogTypes.FILE && flags.tail) {
        ns.tail(); // Pop up the window if it's file logging
        sizeTail(ns);
    }

    // Prepare the target before any batches start
    let batchInfo = prepare(ns, targetServer);
    do {
        // Create and run one batch at a time. The execute function will pause us when
        // the network runs out of ram
        const newBatch = createHWGWBatch(ns, targetServer, batchInfo.lastRun());
        batchInfo.push(newBatch);
        batchInfo = await pauseAndAdjustBatch(ns, batchInfo, 5);

        const executeResult = await executeRunList(ns, batchInfo);

        // If it failed for whatever reason, stop us from doing anything else
        if (executeResult == false) {
            logf(`executeResult is false, quitting everything.`);
            ns.closeTail();
            return;
        }
        // We want to wait for a little bit so the loop doesn't hang the game with large amounts of ram
        batchInfo = await pauseAndAdjustBatch(ns, batchInfo, 60);

    } while (flags.infinite);
    ns.closeTail();
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
 * @returns {BatchInfo} - Calculated runs
*/
function prepare(ns, targetServer) {
    const fudgeFactor = 0.05; // A server can be within this mult of it's min/max values and be considered 'done'

    /** @type {BatchInfo} */
    let curRunList = new BatchInfo();

    logf(`Preparing`);

    // Don't need to weaken if it's at minimum
    if (!approxEquals(targetServer.hackDifficulty, targetServer.minDifficulty, fudgeFactor)) {
        logf(`\tStarting difficulty: ${formatFixed(targetServer.hackDifficulty)}, min: ${formatFixed(targetServer.minDifficulty)}`);
        curRunList.push(weaken(ns, targetServer, curRunList.lastRun()?.endTime ?? 0));
    }

    // Don't need to grow & weaken if the money is at max
    if (!approxEquals(targetServer.moneyAvailable, targetServer.moneyMax, fudgeFactor)) {
        logf(`\tStarting money: $${formatLocale(targetServer.moneyAvailable)}, max money: $${formatLocale(targetServer.moneyMax)}`);
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
    // Calc hack per thread before the security goes up
    let hackPerThread = ns.formulas.hacking.hackPercent(targetServer, ns.getPlayer());

    /** @type {RunInfo} */
    const info = action(ns, SCRIPT_HACKING, targetServer, priorEndTime, HGWFunction.HACK, add);
    targetServer.moneyAvailable -= targetServer.moneyAvailable * (hackPerThread * info.threads);

    return info;
}

/**
 * Weaken target server to minimum security
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @returns {RunInfo} - Info required to run the action
 */
function weaken(ns, targetServer, delayStart) {
    return action(ns, SCRIPT_WEAKEN, targetServer, delayStart, HGWFunction.WEAKEN, subtract);
}

/**
 * Grow target server to max money
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @param {number} delayStart - How long, in ms, to wait to start the grow function
 * @returns {RunInfo} - Info required to run the action
 */
function grow(ns, targetServer, delayStart) {
    // Copy the server so we can run a grow calculation on it without the security increase
    const serverBefore = cloneObj(targetServer);
    const info = action(ns, SCRIPT_GROWTH, targetServer, delayStart, HGWFunction.GROW, add);

    const growPercent = ns.formulas.hacking.growPercent(serverBefore, info.threads, ns.getPlayer());

    // logf(`grow: %%: ${growPercent}`);
    // logf(`before: ${targetServer.moneyAvailable}/${targetServer.moneyMax}`);
    targetServer.moneyAvailable += 1 * info.threads; // Taken from the source code
    targetServer.moneyAvailable += targetServer.moneyAvailable * growPercent;
    targetServer.moneyAvailable = Math.min(targetServer.moneyAvailable, targetServer.moneyMax);

    // logf(`after: ${targetServer.moneyAvailable}/${targetServer.moneyMax}`);

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
    let runTime = hgwFunction.timeCalc(ns.getServer(targetServer.hostname), ns.getPlayer()) - 1;
    let delayRunTime = 0;

    // Let us pass in a method to handle adding or subtracting without a branch
    // Clamp the value to min difficulty and 100
    targetServer.hackDifficulty = clamp(
        targetServer.minDifficulty,
        difficultyOperator(targetServer.hackDifficulty, hgwFunction.securityChange(threads)),
        100
    );

    // Prior == 0 if this is the first thing to run
    if (priorEndTime != 0 && priorEndTime > runTime) {
        // How many ms the previous script ends after our runTime finishes
        const timeDelta = priorEndTime - runTime;

        // We need this delta to be at minimum SETTLE_TIME 
        delayRunTime = Math.max(timeDelta + SETTLE_TIME, SETTLE_TIME);
    }

    // logf("Action '%s', threads: %s, runtime: %s, delay time: %s, end time: %s", hgwFunction.name, threads, formatTime(runTime), formatTime(delayRunTime),
    //     formatTime(delayRunTime + runTime));

    return new RunInfo(ns, runTime, delayRunTime, delayRunTime + runTime, threads, scriptName, targetServer);
}

/**
* @param {import("./NetscriptDefinitions").NS} ns 
* @param {RunInfo} runInfo - Script run instance information
* @param {Array<import("./NetscriptDefinitions").Server>} network - Array of whole network, sorted by available RAM descending
* @param {boolean} tail - Open the script log file tail?
* @param {boolean} logToTerminal - If the ran scripts should log their output to the terminal or their local log
* @returns {number} How many threads were successfully run
*/
function runNetworkScript(ns, runInfo, network, tail = false, logToTerminal = false) {

    /**
     * @param {RunInfo} runInfo 
     * @param {import("./NetscriptDefinitions").Server} serv 
     * @param {number} threadsToRun 
     * @returns {number} PID of ran script
     */
    const nsExec = (runInfo, serv, threadsToRun) =>
        ns.exec(runInfo.script, serv.hostname, threadsToRun, runInfo.delayTime, runInfo.targetServer.hostname, logToTerminal);

    /**
     * @param {RunInfo} runInfo 
     * @param {import("./NetscriptDefinitions").Server} serv 
     * @returns True if the file is successfully copied over and false otherwise.
     */
    const scpScript = (runInfo, serv) => ns.scp(fixScriptName(runInfo.script), serv.hostname, "home");

    // Bail immediately if there is nothing to do, or the run has already been executed
    if (runInfo.threads <= 0) {
        return 0;
    }

    let threadsRun = 0;

    for (let serv of network) {
        if (!ns.fileExists(fixScriptName(runInfo.script), serv.hostname)) {
            logf(`Upload to ${serv.hostname}`);
            if (!scpScript(runInfo, serv)) {
                logf(`WARN: Script '${runInfo.script}' failed to upload to ${serv.hostname}!`);
            }
        }

        const avail = serverRamAvailable(ns.getServer(serv.hostname));
        if (avail >= runInfo.ramNeeded(threadsRun)) {
            // We have enough ram to either finish or do it all at once
            const pid = nsExec(runInfo, serv, (runInfo.threads - threadsRun));
            if (pid == 0) logf(`WARN: Unable to execute full script!\n== Script ==\n${JSON.stringify(runInfo)}\n== Server ==\n${JSON.stringify(serv)}`);
            else {
                threadsRun += (runInfo.threads - threadsRun);
            }

            if (tail) ns.tail(pid, serv.hostname, runInfo.delayTime, runInfo.targetServer.hostname);
            // logf(`runNetworkScript: Full run of ${runInfo.toString()} on ${serv.hostname}`);
            break;
        }
        else if (avail >= runInfo.getScriptRam()) {
            // We don't have enough ram to do it all at once, but we can do at least one
            const toRun = Math.floor(avail / runInfo.getScriptRam());
            // logf(`runNetworkScript: Partial run of ${toRun} threads on ${serv.hostname} (scriptRam: ${runInfo.getScriptRam()}).`);
            const pid = nsExec(runInfo, serv, toRun);
            if (pid == 0) logf(`WARN: Unable to execute script!\n== Script ==\n${JSON.stringify(runInfo)}\n== Server ==\n${JSON.stringify(serv)}`);
            else {
                threadsRun += toRun;
            }

            if (tail) ns.tail(pid, serv.hostname, runInfo.delayTime, runInfo.targetServer.hostname);

        }
        // Can't run anything else on this server
    }

    if (threadsRun > 0) {
        // each tabstop = 8 characters
        let threadInfo = `(${threadsRun}/${runInfo.threads})`;
        threadInfo += (threadInfo.length >= 8 ? "" : "\t") + "\t";

        logf(`INFO: ${runInfo.scriptType}\t${threadInfo}\t${runInfo.ramNeeded(threadsRun)}` +
            `\t${runInfo.execTime.toFixed(1)}\t${runInfo.delayTime.toFixed(1)}\t${runInfo.endTime.toFixed(1)}`);
    }
    // Done with the entire network
    // Let our caller know what we accomplished
    return threadsRun;
}

/**
 * Fire off the scripts requested.
 * If there isn't enough RAM across the whole network to run the given step, wait until 
 * we have more ram available.
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {BatchInfo} batchInfo - List of all the RunInfos that we want to run.
 * @returns {Promise<boolean>} False if something went wrong, true if things are going fine
 */
async function executeRunList(ns, batchInfo) {
    // If there's nothing to do, stop
    if (batchInfo.runs.length == 0) return true;

    const { ram: netRamTotal, ramAvailable: netRamAvailable, servers } = await getTotalNetworkRam(ns);

    // We can't use the ram the current script is using, so remove it
    const netRam = netRamTotal - getScriptRam(ns, ns.getScriptName());

    logf(`run list length: ${batchInfo.runs.length}, Available network RAM: ${formatLocale(netRamAvailable)}/${formatLocale(netRamTotal)}, ` +
        `Total RAM needed: ${formatLocale(batchInfo.ramNeeded())}`);

    // Check if there are any single operations that require more ram than we have in the whole network
    // We can't run this list, so error out
    const ops = batchInfo.runs.filter((elem) => elem.ramNeeded() > netRam);
    if (ops.length != 0) {
        loge(`ERROR: Network RAM is insufficient to run a single RunInfo!`);
        ops.forEach(e => {
            loge(`ERROR:\t${e.script}, ${e.threads}, instance ram: ${e.getScriptRam()}, run ram: ${e.ramNeeded()}`);
        })
        return false;
    }

    let sortedNetwork = Array.from(servers).sort(serverSort);

    logf(`INFO: type\tthreads (ran/total)\treq ram\texec\tdelay\tend`);

    let i = 0;
    while (i < batchInfo.runs.length) {
        const elem = batchInfo.runs[i];

        if (elem == undefined) {
            logf(`ERROR: elem is undefined. i=${i}, length=${batchInfo.runs.length}`);
            return false;
        }
        const threadsRan = runNetworkScript(ns, elem, sortedNetwork, false);


        // Adjust the run with how many threads are left to execute
        elem.threads = Math.max(elem.threads - threadsRan, 0);

        if (elem.threads == 0) {
            // We completed running all the requested threads, we're done here
            i++;
            continue;
        }
        // We have not run everything, which means we ran out of ram and need to wait for some to be available
        const oldRunsLength = batchInfo.runs.length; // Save this because it can change during the loop

        batchInfo = await pauseAndAdjustBatch(ns, batchInfo);

        if (oldRunsLength > batchInfo.runs.length) {
            // This many RunInfos have completed and been removed from the list
            const completedRuns = oldRunsLength - batchInfo.runs.length;
            let msg = `${completedRuns}/${oldRunsLength} (cur=${batchInfo.runs.length}) finished during pause.`;

            // Make sure to go back to the current run. Figure out how many elements into the list we were, then 
            // ex: runs=[r0, r1, r2, r3, r4, r5]
            // Before pause, i = 3(r3), runs.length = 6
            // After pause, runs=[r2, r3, r4, r5], runs.length = 4, completed = 2
            // new i should be 1(r3): 3 - 2 = 1
            // Guard running off the end just in case
            const newI = Math.max(i - completedRuns, 0);

            // Update with whatever new free ram there might be
            let { ramAvailable, servers } = await getTotalNetworkRam(ns);

            sortedNetwork = Array.from(servers).sort(serverSort);

            msg += ` Old i=${i}, new i=${newI}, netRamAvail=${ramAvailable}`;

            // logf(msg);
            i = newI;
        }
    }
    // logf(`Run list queued. Completes in ${formatTime(batchInfo.lastRun()?.endTime)}.`);
    return true;
}

/**
 * Waits for 100ms, then adjusts all runs with that time, and removes any that have completed in the interim.
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {BatchInfo} batchInfo 
 * @param {number} [pauseTime=100] How many ms to sleep
 * @returns {Promise<BatchInfo>} The adjusted object
 */
async function pauseAndAdjustBatch(ns, batchInfo, pauseTime = 100) {
    const oldestRun = batchInfo.runs[0];

    // Silently pause here
    await ns.sleep(pauseTime);
    batchInfo.timePassed(pauseTime);

    return batchInfo;
}

/**
 * Get total RAM across all hacked networks on the network.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @returns {Promise<{ram: number, ramAvailable: number, servers: Set<import("./NetscriptDefinitions").Server>}>} - Total network RAM and network servers
 */
async function getTotalNetworkRam(ns) {
    let ramTotal = 0;
    let ramAvailable = 0;

    const addRam = (_, server) => {
        ramTotal += server.maxRam
        ramAvailable += serverRamAvailable(server)
    };
    const visitedCondition = (_, server) => server.hasAdminRights;

    /** @type {Set<import("./NetscriptDefinitions").Server>} */
    let visited = new Set();

    await DfsServer(ns, ns.getServer(), visited, addRam, visitedCondition);

    return { ram: ramTotal, ramAvailable: ramAvailable, servers: visited };
}

/** 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} scriptName 
 */
function getScriptRam(ns, scriptName) {
    return ns.getScriptRam(fixScriptName(scriptName));
}

/**
 * Ensure the path for a script is correct.
 * @param {string} scriptName 
 * @returns Fixed name
 */
function fixScriptName(scriptName) {
    if (!scriptName.startsWith("/")) scriptName = "/" + scriptName;
    return scriptName;
}

/**
 * Turn off internal logging for some functions so they don't spam the tail
 * @param {import("./NetscriptDefinitions").NS} ns 
 */
function disableLogging(ns) {
    let disabledFunctions = ["sleep", "scan", "exec"];
    for (let func of disabledFunctions) {
        ns.disableLog(func);
    }
}

/** 
 * This doesn't do anything, not sure why
 * @param {import("./NetscriptDefinitions").NS} ns 
 */
function sizeTail(ns) {
    const wndDimens = { width: window.innerWidth, height: window.innerHeight };
    const size = { width: Math.round(wndDimens.width * 0.5), height: Math.round(wndDimens.height * 0.35) };
    ns.resizeTail(size.width, size.height);
    ns.moveTail(wndDimens.width - size.width, 0);
}

// #region Lambda functions
// ------------------------

/** 
 * Calculate the multiplier needed to grow the server to max money.
 * If the server has $0.00, calculate assuming it has $10 to avoid divide-by-zero errors 
 */
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
const serverRamAvailable = (server) => {
    const maxMod = (server.hostname == "home") ? BatchParameters.MAX_HOME_RAM_USED : 1;
    return Math.max((server.maxRam * maxMod) - server.ramUsed, 0);
}
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

    let hour = Math.trunc(ms / (3600 * 1000));
    ms = ms % (3600 * 1000); // seconds remaining after extracting hours
    let min = Math.trunc(ms / (60 * 1000));
    ms = ms % (60 * 1000); // seconds remaining after extracting minutes
    let sec = Math.trunc(ms / 1000);
    ms = Math.round(ms % 1000); // ms remaining after extracting seconds
    return (hour != 0 ? `${hour}h` : "")
        + (min != 0 ? `${min}m` : "")
        + (sec != 0 ? `${sec}s ` : "")
        + (`${ms}ms`);
}

/**
 * Default returns .toFixed(2)
 * @param {Number} num - Number to format
 * @param {Number} [point=2] - Decimal points to format to
 * @returns {string} - Formatted number
 */
function formatFixed(num, point = 2) {
    if (num < 0.01) return num.toString();
    return num.toFixed(point);
}

/**
 * Add commas to number
 * @param {Number} money 
 * @returns - Locale'd to 'en-US'
 */
function formatLocale(money) {
    return money.toLocaleString("en-US");
}

function clamp(number, min, max) {
    return Math.max(min, Math.min(number, max));
}

/**
 * Attempt to create a clone of the object
 * @template T
 * @param {T} obj
 * @returns {T} 
 */
function cloneObj(obj) {
    return JSON.parse(JSON.stringify(obj));
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