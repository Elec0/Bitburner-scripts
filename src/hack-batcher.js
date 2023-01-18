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

    // let s = ns.getServer("omega-net");
    // ns.tprintf("threads %s", getNumGrowthThreads(ns, s, 1));
    // ns.tprintf("mult %s", getGrowthMultiplier(s));
    // ns.tprintf("cur money: %s, max money: %s, mult money: %s", s.moneyAvailable, s.moneyMax, s.moneyAvailable * getGrowthMultiplier(s));
    // ns.tprintf("Growth analyze: %s", ns.formulas.hacking.growPercent(s, getNumGrowthThreads(ns, s, 1), ns.getPlayer()));
    // return
    let hacker = "home";
    const hackingServer = ns.getServer(hacker);
    let target = String(flags["_"][0]);
    let targetServer = ns.getServer(target);

    // Pre-prepare the target
    let execTime = await prepare(ns, targetServer.hostname, targetServer, hackingServer);
    const runs = Math.min(BatchParameters.MAX_BATCHES, calculateAvailableBatchRuns(ns, hackingServer));

    do {
        for (let i = 0; i < runs; ++i) {
            if (i % 10 == 0) {
                await ns.sleep(5); // Prevent the game from locking up
            }

            if (BatchParameters.MAX_TIME_TO_FINISH != -1 && execTime > BatchParameters.MAX_TIME_TO_FINISH) {
                logf(`Exceeded max execution time of ${formatNum(BatchParameters.MAX_TIME_TO_FINISH)}, with ${execTime}. Terminating.`);
                break;
            }
            execTime = runBatch(ns, targetServer, hackingServer, execTime);
            logf(`Batch #${i + 1} queued on ${targetServer.hostname}, will complete in ${formatTime(execTime)}.`);
        }
        if (flags.infinite) {
            logf(`Wait ${formatTime(execTime)} for batches to complete.`);
            await ns.sleep(execTime);
            execTime = 0;
        }
    } while (flags.infinite);
}

/**
 * How many full batch runs can be queued up with the current amount of ram available.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {import("./NetscriptDefinitions").Server} hackingServer
 * @returns {Number}
*/
function calculateAvailableBatchRuns(ns, hackingServer) {
    // TODO: This is just wrong. Need to factor number of threads in

    const total = getScriptRam(ns, SCRIPT_HACKING) + getScriptRam(ns, SCRIPT_GROWTH) + getScriptRam(ns, SCRIPT_WEAKEN);
    const maxAvailable = hackingServer.maxRam * BatchParameters.MAX_RAM_USED;
    const runs = Math.floor(maxAvailable / total);
    logf(`Total ram: ${total}, maxAvailable: ${maxAvailable}, runs: ${runs}`);
    return runs;
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
 * @param {import("./NetscriptDefinitions").Server} hackingServer - What computer is going to be running the scripts
 * @returns {Number} - Amount of time in ms the batch will take to run, added to the initial execTime parameter
*/
function runBatch(ns, targetServer, hackingServer, execTime = 0) {
    // If the server is already prepped to be hacked, prepExecTime will return 0
    const targetName = targetServer.hostname;
    execTime += hack(ns, targetName, targetServer, execTime);
    execTime += weaken(ns, targetName, targetServer, hackingServer, execTime);
    execTime += grow(ns, targetName, targetServer, hackingServer, execTime);
    execTime += weaken(ns, targetName, targetServer, hackingServer, execTime);

    return execTime;
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
 * @returns {Promise<number>} - ms of total execution time
*/
async function prepare(ns, targetName, targetServer, hackingServer, wait = false) {
    const fudgeFactor = 0.05; // A server can be within this mult of it's min/max values and be considered 'done'
    const curTargetServerSecurity = targetServer.hackDifficulty;
    const curTargetServerMoney = targetServer.moneyAvailable;

    let curExecTime = 0;

    logf(`Starting difficulty: ${formatNum(curTargetServerSecurity)}, min: ${formatNum(targetServer.minDifficulty)}`);
    logf(`Starting money: $${formatMoney(curTargetServerMoney)}, max money: $${formatMoney(targetServer.moneyMax)}`);

    // Don't need to weaken if it's at minimum
    if (!approxEquals(curTargetServerSecurity, targetServer.minDifficulty, fudgeFactor)) {
        curExecTime += weaken(ns, targetName, targetServer, hackingServer, curExecTime);
    }

    // Don't need to grow & weaken if the money is at max
    if (!approxEquals(curTargetServerMoney, targetServer.moneyMax, fudgeFactor)) {
        curExecTime += grow(ns, targetName, targetServer, hackingServer, curExecTime);

        // We've grown, so now we need to weaken again
        // Our targetServer 'mock' object will be updated by our grow function
        curExecTime += weaken(ns, targetName, targetServer, hackingServer, curExecTime);
    }

    if (wait) {
        logf("Finished setting up prepare scripts, waiting for %s", formatTime(curExecTime));
        await ns.sleep(curExecTime);
        // If we're waiting, then we should show this info after, but otherwise probably don't need to
        targetServer = ns.getServer(targetName);
        logf("Done.\n%s: Security: %s, Money: $%s, Min Security: %s, Max Money: $%s", targetName,
            targetServer.hackDifficulty, targetServer.moneyAvailable, targetServer.minDifficulty, targetServer.moneyMax);
    }

    return curExecTime;
}

/**
 * Hack {@link HACK_AMT}% of money from the server.
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} targetName 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @returns {number} - Result from hackTime()
 */
function hack(ns, targetName, targetServer, delayStart) {
    let moneyToHack = targetServer.moneyAvailable * HACK_AMT;
    let hackPerThread = ns.formulas.hacking.hackPercent(targetServer, ns.getPlayer());
    let threads = Math.round((moneyToHack / targetServer.moneyMax) / hackPerThread);

    let hackTime = ns.formulas.hacking.hackTime(targetServer, ns.getPlayer());

    const secIncrease = ns.hackAnalyzeSecurity(threads);
    targetServer.hackDifficulty += secIncrease
    targetServer.moneyAvailable = targetServer.moneyAvailable * (1 - (hackPerThread * threads));

    logf(`Hack threads  : ${threads}, time: ${formatTime(hackTime)}, secIncrease: ${formatNum(secIncrease)}, moneyToHack: $${formatMoney(moneyToHack)}`);
    runScript(ns, SCRIPT_HACKING, targetName, threads, delayStart);

    return addSettleTime(hackTime);
}

/**
 * Weaken target server to minimum security
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} targetName 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @param {import("./NetscriptDefinitions").Server} hackingServer 
 * @returns {number} - Result from formulas.weakenTime() + settleTime
 */
function weaken(ns, targetName, targetServer, hackingServer, delayStart) {
    let weakenThreads = getNumWeakenThreads(ns, targetServer.hackDifficulty, targetServer.minDifficulty, hackingServer.cpuCores);
    let weakenTime = ns.formulas.hacking.weakenTime(targetServer, ns.getPlayer());
    targetServer.hackDifficulty -= ns.weakenAnalyze(weakenThreads, hackingServer.cpuCores);

    logf("Weaken threads: %s, time: %s", weakenThreads, formatTime(weakenTime));

    runScript(ns, SCRIPT_WEAKEN, targetName, weakenThreads, delayStart);
    return addSettleTime(weakenTime);
}

/**
 * Grow target server to max money
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} targetName 
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @param {import("./NetscriptDefinitions").Server} hackingServer 
 * @param {number} delayStart - How long, in ms, to wait to start the grow function
 * @returns {number} - Result from formulas.growTime() + settleTime
 */
function grow(ns, targetName, targetServer, hackingServer, delayStart) {
    let growThreads = getNumGrowthThreads(ns, targetServer, hackingServer.cpuCores);

    // Grow raises the security level of the target server by 0.004 per thread.
    let growSecurityAdd = ns.growthAnalyzeSecurity(growThreads, null, hackingServer.cpuCores);
    let growTime = ns.formulas.hacking.growTime(targetServer, ns.getPlayer());

    targetServer.hackDifficulty += growSecurityAdd;

    logf("Growth threads: %s, securityAdd: %s, time: %s", growThreads, formatNum(growSecurityAdd), formatTime(growTime));
    runScript(ns, SCRIPT_GROWTH, targetName, growThreads, delayStart);

    targetServer.moneyAvailable *= getGrowthMultiplier(targetServer);

    return addSettleTime(growTime);
}

/** Run a script, but clamp threads to available memory, if possible. */
function runScriptClamp(ns, scriptName, targetName, threads, startDelay, tail = false) {
    const availableRam = ns.getServer().maxRam - ns.getServer().ramUsed;
    const reqRam = getScriptRam(ns, scriptName) * threads;
    let runThreads = threads;

    if (reqRam > availableRam) {
        logf(`WARN: Not enough available ram to run '${scriptName} on ${targetName} w/ ${threads} threads (req: ${reqRam}, have: ${availableRam})`);

        runThreads = Math.floor(availableRam / getScriptRam(ns, scriptName));
        if (threads == 0) {
            throw `ERROR: Ram out of RAM trying to run (${scriptName}, ${targetName}, ${threads}, ${startDelay}!`
        }
        logf(`WARN: \tRunning with ${runThreads} threads instead.`);
    }
    runScript(ns, scriptName, targetName, runThreads, startDelay, tail);
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
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {string} scriptName 
 */
function getScriptRam(ns, scriptName) {
    if (!scriptName.startsWith("/")) scriptName = "/" + scriptName;
    return ns.getScriptRam(scriptName);
}

// #region Lambda functions
// ------------------------

/**
 * Get the number of weaken threads needed to decrease security to minimum.
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {number} hackDifficulty Current security level
 * @param {number} minDifficulty Minimum possible security level
 * @param {number} hackingCores 
 */
let getNumWeakenThreads = (ns, hackDifficulty, minDifficulty, hackingCores) => {
    return Math.ceil((hackDifficulty - minDifficulty) / ns.weakenAnalyze(1, hackingCores));
}

/**
 * Get the number of growth threads needed to max out available money.
 * @param {import("./NetscriptDefinitions").NS} ns
 * @param {import("./NetscriptDefinitions").Server} targetServer 
 * @param {number} hackingCores 
 */
let getNumGrowthThreads = (ns, targetServer, hackingCores) => {
    let multiplier = getGrowthMultiplier(targetServer);
    return Math.ceil(Math.max(1, ns.growthAnalyze(targetServer.hostname, multiplier, hackingCores)));
}

/** If the server has $0.00, calculate assuming it has $10 to avoid divide-by-zero errors */
let getGrowthMultiplier = (targetServer) => targetServer.moneyMax / Math.max(targetServer.moneyAvailable, 10);

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