export class UnexpectedEndOfStream extends Error {
    constructor() {
        super("unexpected end of stream");
    }
}
