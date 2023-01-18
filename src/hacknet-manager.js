//@ts-check

let multCoreCost;
let multLevelCost;
let multMoney;
let multNodeCost;
let multRamCost;

let Constants;

/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
    if (ns.args[0] == "-h") {
        ns.tprint("INFO: usage: hacknet-manager [-d | indexes]")
        return;
    }
    multCoreCost = ns.getPlayer().mults.hacknet_node_core_cost;
    multLevelCost = ns.getPlayer().mults.hacknet_node_level_cost;
    multMoney = ns.getPlayer().mults.hacknet_node_money;
    multNodeCost = ns.getPlayer().mults.hacknet_node_purchase_cost;
    multRamCost = ns.getPlayer().mults.hacknet_node_ram_cost;
    Constants = ns.formulas.hacknetNodes.constants();

    if (ns.args[0] == "-d") {
        ns.tprint("-- Next 10 Hacknet Node Costs --")
        for (let i = ns.hacknet.numNodes() + 1; i < ns.hacknet.numNodes() + 10; ++i) {
            ns.tprintf("Node #%s: $%s", i, ns.formulas.hacknetNodes.hacknetNodeCost(i, multNodeCost).toLocaleString("en-US"));
        }
        
        // dry-run fully buying the next node
        let cost = ns.formulas.hacknetNodes.hacknetNodeCost(ns.hacknet.numNodes() + 1, multNodeCost)
         + ns.formulas.hacknetNodes.levelUpgradeCost(1, Constants.MaxLevel, multLevelCost)
         + ns.formulas.hacknetNodes.ramUpgradeCost(0, Constants.MaxRam, multRamCost)
         + ns.formulas.hacknetNodes.coreUpgradeCost(0, Constants.MaxCores, multCoreCost);
        ns.tprintf("Cost for next full node: $%s", cost.toLocaleString("en-US"));
        return;
    }
    let index = Number(ns.args[0]) - 1 || 0;
    
    let startMoney = ns.getPlayer().money;
    if (index < ns.hacknet.numNodes()) {
        upgradeNode(ns, index);
    }
    while (index + 1 > ns.hacknet.numNodes()) {
        let newNodeIndex = ns.hacknet.purchaseNode();
        if (newNodeIndex == -1) {
            ns.tprint("Can't buy, probably ran out of money");
            break;
        }
        ns.tprintf("Bought node: %s", ns.hacknet.numNodes());
        upgradeNode(ns, newNodeIndex);
    }

    ns.tprintf("Money change: $%s", (ns.getPlayer().money - startMoney).toLocaleString("en-US"));
}

/** @param {import("./NetscriptDefinitions").NS} ns */
function upgradeNode(ns, index) {
    let startNode = ns.hacknet.getNodeStats(index);
    let node = startNode;

    ns.hacknet.upgradeCore(index, ns.formulas.hacknetNodes.constants().MaxCores);
    ns.hacknet.upgradeRam(index, ns.formulas.hacknetNodes.constants().MaxRam);
    ns.hacknet.upgradeLevel(index, ns.formulas.hacknetNodes.constants().MaxLevel);

    node = ns.hacknet.getNodeStats(index);

    let startRate = ns.formulas.hacknetNodes.moneyGainRate(startNode.level, startNode.ram, startNode.cores, multMoney);
    let endRate = ns.formulas.hacknetNodes.moneyGainRate(node.level, node.ram, node.cores, multMoney);
    ns.tprintf("Money rate change: +$%s", (endRate - startRate).toLocaleString("en-US"));
}
