//@ts-check
/** @param {import("./NetscriptDefinitions").NS} ns */
export async function main(ns) {
	let target = ns.args[0] || ns.getHostname();
	target = String(target);

	let moneyThreshold = ns.getServerMaxMoney(target) * 0.75;
	let securityThreshold = ns.getServerMinSecurityLevel(target) + 5;
	ns.nuke(target);
	
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (ns.getServerSecurityLevel(target) > securityThreshold) {
			await ns.weaken(target);
		}
		else if (ns.getServerMoneyAvailable(target) < moneyThreshold) {
			await ns.grow(target);
		}
		else {
			await ns.hack(target);
		}
	}
}