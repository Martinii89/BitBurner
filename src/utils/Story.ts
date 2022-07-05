import { NS } from "@ns";
import { ServerPath } from "/types/Server";
import { FindAllServers } from "/utils/DfsScan";
import { NukeServer } from "utils/AutoNuke";

class StoryHelper {
    constructor(ns: NS) {
        this.ns = ns;
    }
    ns;
    ServerPaths: ServerPath[] = [];

    async Init() {
        this.ServerPaths = await FindAllServers(this.ns);
    }

    FindServerPath(serverName: string): ServerPath | null {
        for (const serverPath of this.ServerPaths) {
            if (serverPath.hostname == serverName) {
                return serverPath;
            }
        }
        return null;
    }

    GetServerConnectionString(serverPath: ServerPath): string {
        const conCommands = [...serverPath.path.slice(1), serverPath.hostname].map((x) => {
            return `connect ${x};`;
        });
        return "home; " + conCommands.join(" ");
    }

    PrintBackdoorCommand(target: string): void {
        const server = this.ns.getServer(target);
        if (server.backdoorInstalled || server.requiredHackingSkill > this.ns.getHackingLevel()) {
            return;
        }
        const csecServer = this.FindServerPath(target);
        if (csecServer == null) {
            this.ns.tprintf(`Failed to find the ${target} server`);
            return;
        }

        let command = this.GetServerConnectionString(csecServer);
        command += " backdoor;";
        if (!NukeServer(target, this.ns)) {
            this.ns.tprintf(`Can't backdoor ${target}`);
            return;
        }
        this.ns.tprintf(`${command}`);
    }
}

export async function main(ns: NS): Promise<void> {
    const storyHelper = new StoryHelper(ns);
    await storyHelper.Init();
    storyHelper.PrintBackdoorCommand("CSEC");
    storyHelper.PrintBackdoorCommand("avmnite-02h");
    storyHelper.PrintBackdoorCommand("I.I.I.I");
    storyHelper.PrintBackdoorCommand("run4theh111z");
}
