

/** ms to wait to read port info */
const POLL_TIME = 10000;

/** @param {import("../NetscriptDefinitions").NS} ns */
export async function main(ns) {
    let port = ns.getPortHandle(1);
    let lastCommand = "";

    ns.tprint(port.peek());
    // Main loop
    while (true) {
        let cmd = processCmd(ns, port);
        if (cmd == lastCommand) {

        }

        await ns.sleep(POLL_TIME);
    }
}

/**
 * Read the port and return a string array with the parts.
 * 
 * @param {import("../NetscriptDefinitions").NS} ns
 * @param {NetscriptPort} portHandle 
 * @return {string[]}
 */
function processCmd(ns, portHandle) {
    let cmd = portHandle.peek();

    // See if it's a more complicated command or not
    if (cmd.includes(":")) {
        /** @type string[] */
        let parts = cmd.split(":");

        ns.printf("Received complex command: %s", parts);
    }
    else {
        switch (cmd) {
            case "end":
                ns.print("End received, quitting.");
                ns.exit();
                break;
        }
    }
}