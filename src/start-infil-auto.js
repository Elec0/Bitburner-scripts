
//@ts-check
import { Constants } from "lib/constants";

const REP_GAINED_PER_RUN = 72000;

/**
 * Automatically keep re-starting the automated infiltration for easy rep. 
 *  rep
 * @param {import("./NetscriptDefinitions").NS} ns 
 */
export async function main(ns) {
    let flags = ns.flags([
        ["help", false],
        ["h", false],
        ["runs", 0],
        ["rep", 0]
    ]);

    if ((flags.runs && flags.rep) || (!flags.runs && !flags.rep)) {
        flags.h = true;
    }
    if (flags.h || flags.help) {
        ns.tprint(`INFO: usage: start-infil-auto [--runs N] [--rep repToGain] (--help, -h)`);
        ns.tprint(`INFO: runs: How many times to re-run the infiltration. Cannot be given with --rep`)
        ns.tprint(`INFO: rep: About how much rep to be gained based on the ECorp calculation. Cannot be given with --runs`)
        return;
    }
    let runs = 0;
    if (flags.runs) {
        runs = Number(flags.runs);
    }
    else if (flags.rep) {
        runs = Math.ceil(Number(flags.rep) / REP_GAINED_PER_RUN);
    }
    ns.tprint(`Running ${runs} runs`);

    await execRuns(ns, runs);
}

/**
 * 
 * @param {import("./NetscriptDefinitions").NS} ns 
 * @param {number} runs 
 * @returns 
 */
async function execRuns(ns, runs) {
    return new Promise(resolve => {
        let completedRuns = 0;
        let intervalId = setInterval(() => {
            const endInterval = () => {
                clearInterval(intervalId);
                resolve();
            }
            console.log(`Interval ID: ${intervalId}`);
            // Check if we're done, and
            // If the parent script isn't running anymore, we don't want to keep with the intervals
            try {
                if ((runs != -1 && completedRuns >= runs) || !ns.scriptRunning(ns.getScriptName(), ns.getHostname())) {
                    console.log("Time to quit, clearing interval");
                    endInterval();
                    return;
                }
            }
            catch (e) {
                endInterval();
                return;
            }
            const city = clickOnText("City", "p");
            const corp = click('[aria-label="ECorp"]');
            const infil = clickOnText("Infiltrate Company", "button", true);
            if (city && corp && infil) {
                completedRuns++;
                console.log(`Runs: ${completedRuns}/${runs}`);
                if (completedRuns >= runs) {
                    console.log("Runs all completed, ending");
                    endInterval();
                }
            }
            else {
                console.warn(city, corp, infil);
            }
        }, 10 * 1000);
    });
}

function click(text) {
    const label = document.querySelector(text);
    if (!label) {
        return false;
    }
    // @ts-ignore
    label.click();
    return true;
}
function clickOnText(text, querySelector = "button", trusted = false) {
    try {
        if (trusted) {
            getReactElemByText(text, querySelector).onClick({ isTrusted: true });
        }
        else {
            getElemByText(text, querySelector).click()
        }
        return true;
    }
    catch (e) {
        return false;
    }
}

function getReactElemByText(text, querySelector) {
    let elem = getElemByText(text, querySelector);
    return elem[Object.keys(elem)[1]];
}
function getElemByText(text, querySelector) {
    return [...document.querySelectorAll(querySelector)].find(btn => btn.textContent.includes(text));
}
