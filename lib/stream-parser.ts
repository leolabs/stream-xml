import { Writable } from "stream";
import { Options, Parser } from "./parser";

export class StreamParser extends Writable {
  parser: Parser;

  constructor(options?: Options) {
    super();
    this.parser = new Parser(options);
  }

  override _write(
    chunk: any,
    _encoding: BufferEncoding,
    next: (error?: Error | null | undefined) => void
  ): void {
    this.parser.push(chunk);
    next();
  }
}
