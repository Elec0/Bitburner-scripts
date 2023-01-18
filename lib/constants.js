//@ts-check
/* eslint-disable no-unused-vars */
const PortHacks = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"]
const PortHackMethods = ["brutessh", "ftpcrack", "relaysmtp", "httpworm", "sqlinject"];
const MyServersPrefix = "e0-server";

export class Constants {
    static get MY_SERVERS_PREFIX() {
        return MyServersPrefix;
    }
    static get PORT_HACKS() {
        return PortHacks;
    }
    static get PORT_HACK_METHODS() {
        return PortHackMethods;
    }
}