//@ts-check
// import { traverse } from "./lib/traverse";

// const window = eval("window");
// const document = eval("document");

let logf;
/** @type {import("./NetscriptDefinitions").NS} */
let ns;

/** @type {[string, string | number | boolean | string[]][]} */
const FLAG_SCHEMA = [
    ["augs", false],
    ["stats", false],
    ["all-focus", ""],
    ["corp", ""],
    ["shock", false],
    ["travel", ""],
]

/** @param {import("./NetscriptDefinitions").NS} _ns */
export async function main(_ns) {
    ns = _ns;
    logf = ns.tprint;

    let flags = ns.flags(FLAG_SCHEMA);

    if (flags.travel) {
        travel(flags.travel);
    }

    if (flags["all-focus"]) {
        workOnStats(String(flags["all-focus"]));
        logf(`All sleeves now focusing on: ${flags["all-focus"]}`);
    }
    else if (flags.stats) {
        workOnStats();
    }
    else if (flags.corp) {
        workAtCorp(flags.corp);
    }
    else if (flags.shock) {
        shockRecovery();
    }

    if (flags.augs) {
        logf("Buy all augs");
        buyAllAugments();
    }
}

function travel(dest) {
    logf(`All sleeves traveling to ${dest}.`);
    for (let i = 0; i < ns.sleeve.getNumSleeves(); ++i) {
        if (!ns.sleeve.travel(i, dest)) {
            logf(`Sleeve #${i} couldn't travel!`);
        }
    }
}

function shockRecovery() {
    logf(`Setting all sleeves to shock recovery`);
    for (let i = 0; i < ns.sleeve.getNumSleeves(); ++i) {
        if (!ns.sleeve.setToShockRecovery(i)) {
            logf(`Sleeve #${i} couldn't perform shock recovery!`);
        }
    }
}

function workAtCorp(corp) {
    for (let i = 0; i < ns.sleeve.getNumSleeves(); ++i) {
        if (!ns.sleeve.setToCompanyWork(i, corp)) {
            logf(`Sleeve #${i} couldn't work at ${corp}!`);
        }
    }
}

function workOnStats(allOne = "") {
    let uni = ["setToUniversityCourse", "ZB Institute of Technology"];
    let gym = ["setToGymWorkout", "Millenium Fitness Gym"];

    let options = [
        [...uni, "Algorithms"],
        [...uni, "Leadership"],
        [...gym, "Strength"],
        [...gym, "Defense"],
        [...gym, "Dexterity"],
        [...gym, "Agility"]
    ];
    let o = 0;

    if (allOne) {
        o = workOnSameStat(allOne, options);
    }

    for (let i = 0; i < ns.sleeve.getNumSleeves(); ++i) {

        if (!ns.sleeve[options[o][0]](i, options[o][1], options[o][2])) {
            logf(`ERROR: sleeve #${i} failed`);
        }

        // Don't change the skill we're setting if it's all on one skill
        if (!allOne) {
            o++;
        }
        if (o >= options.length) {
            o = 0;
        }
    }
}

/**
 * 
 * @param {string} allOne - what skill to use
 * @param {Array} options - Locations, method, string
 * @returns {number} - What index to set
 */
function workOnSameStat(allOne, options) {
    if (allOne.toLowerCase() == "hacking") {
        allOne = "Algorithms";
    }
    else if (allOne.toLowerCase() == "charisma") {
        allOne = "Leadership";
    }
    for (let optInd = 0; optInd < options.length; ++optInd) {
        if (options[optInd][2].toLowerCase() == allOne.toLowerCase()) {
            return optInd;
        }
    }
    return 0;
}

function buyAllAugments() {
    logf(`Sleeves: ${ns.sleeve.getNumSleeves()}`);

    for (let i = 0; i < ns.sleeve.getNumSleeves(); ++i) {
        let augs = ns.sleeve.getSleevePurchasableAugs(i);
        if (augs.length == 0) {
            continue;
        }

        for (let j = 0; j < augs.length; ++j) {
            if (!ns.sleeve.purchaseSleeveAug(i, augs[j].name)) {
                logf(`ERROR: Buying '${augs[j].name}' failed`);
            }
        }
        logf(`Bought all augs for ${i}`);
    }
}


/**
 * data (Object) – 
    args (string[]) – 
 * @param {Object} data - general data about the game you might want to autocomplete. 
 * @param {string[]} args - current arguments. Minus run script.js 
 * @returns {string[]}
 */
export function autocomplete(data, args) {
    if (args[args.length - 1] == "--travel" || args[args.length - 2] == "--travel") {
        return ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven",]
    }
    
    let res = ["Hacking", "Charisma", "Strength", "Defense", "Dexterity", "Agility"];
    for (let arg of FLAG_SCHEMA) {
        // --argument, or -a
        const prefix = (arg[0].length > 1) ? "--" : "-";
        res.push(`${prefix}${arg[0]}`);
    }

    return res.concat(data.servers);
}