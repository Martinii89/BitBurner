import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
    if (typeof ns.args[0] == "string") {
        await ns.hack(ns.args[0]);
    }
}
