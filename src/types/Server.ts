export class ServerPath {
    constructor(hostname: string, path: string[]) {
        this.hostname = hostname;
        this.path = path;
    }

    hostname;
    path: string[];
}
