import { Writable } from "node:stream";

type CallbackFn = () => unknown;

interface Callback {
  tagName: Buffer;
  enter: CallbackFn;
  exit?: CallbackFn;
}

const TAG_START = "<".charCodeAt(0);
const TAG_END = ">".charCodeAt(0);
const TAG_CLOSE = "/".charCodeAt(0);
const QUESTION = "?".charCodeAt(0);
const BANG = "!".charCodeAt(0);
const BLANK = " ".charCodeAt(0); // todo: consider all whitespace

type State =
  | { type: "INIT" }
  | { type: "OPENING"; startPos: number }
  | { type: "COMMENT"; typeChar: number }
  | { type: "TAGNAME"; startPos: number }
  | { type: "ATTRIBUTES"; tagNameStart: number; tagNameEnd: number }
  | { type: "CLOSING"; tagNameStart: number };

export class Parser extends Writable {
  #callbacks: Callback[] = [];
  #buffer: Buffer = Buffer.alloc(4096);
  #bufferPos: number = 0; // position of the next character added
  #state: State = { type: "INIT" };

  constructor() {
    super();
  }

  private setState(newState: State) {
    console.debug(newState);
    this.#state = newState;
  }

  addCallback(tagName: string, enter: CallbackFn, exit?: CallbackFn) {
    this.#callbacks.push({
      tagName: Buffer.from(tagName),
      enter,
      exit,
    });
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    next: (error?: Error | null | undefined) => void
  ): void {
    const buffer = Buffer.from(chunk);

    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      const lastChar = this.#buffer[this.#bufferPos - 1] ?? 0;
      let reset;

      switch (this.#state.type) {
        case "INIT": {
          if (char === TAG_START) {
            this.setState({
              type: "OPENING",
              startPos: this.#bufferPos - 1, // todo: is this used?
            });
          }
          break;
        }
        case "OPENING": {
          if (char === BLANK) {
            // ignore
          } else if (char === QUESTION || char === BANG) {
            this.setState({
              type: "COMMENT",
              typeChar: char,
            });
          } else if (char === TAG_CLOSE) {
            this.setState({
              type: "CLOSING",
              tagNameStart: this.#bufferPos + 1,
            });
          } else {
            this.setState({
              type: "TAGNAME",
              startPos: this.#bufferPos,
            });
          }
          break;
        }
        case "COMMENT": {
          if (char === TAG_END && lastChar === this.#state.typeChar) {
            this.setState({ type: "INIT" });
            reset = true;
          }
          break;
        }
        case "TAGNAME": {
          if (char === BLANK) {
            this.setState({
              type: "ATTRIBUTES",
              tagNameEnd: this.#bufferPos, // before the blank
              tagNameStart: this.#state.startPos,
            });
          } else if (char === TAG_END) {
            reset = true;
            const selfClosing = lastChar === TAG_CLOSE;
            const endPos = this.#bufferPos - (selfClosing ? 3 : 2);
            this.doTagEnd(
              this.#state.startPos,
              endPos,
              endPos,
              true,
              selfClosing
            );
            this.setState({ type: "INIT" });
          }
          break;
        }
        case "ATTRIBUTES": {
          if (char === TAG_END) {
            reset = true;
            const selfClosing = lastChar === TAG_CLOSE;
            const endPos = this.#bufferPos - (selfClosing ? 3 : 2);
            this.doTagEnd(
              this.#state.tagNameStart,
              this.#state.tagNameEnd,
              endPos,
              true,
              selfClosing
            );
            this.setState({ type: "INIT" });
          }
          break;
        }
        case "CLOSING": {
          if (char === TAG_END) {
            reset = true;
            this.doTagEnd(
              this.#state.tagNameStart,
              this.#bufferPos,
              this.#bufferPos,
              false,
              true
            );
            this.setState({ type: "INIT" });
          }
          break;
        }
      }

      if (!reset) {
        this.#buffer[this.#bufferPos] = char;
        this.#bufferPos++;
      } else {
        this.#bufferPos = 0;
      }
    }

    next();
  }

  private doTagEnd(
    nameStart: number,
    nameEnd: number,
    attributesEnd: number,
    enter: boolean,
    exit: boolean
  ) {
    const tagName = this.#buffer.slice(nameStart, nameEnd);
    console.log("tagEnd", { buf: tagName.toString() });
    for (const cb of this.#callbacks) {
      if (
        Buffer.compare(this.#buffer.slice(nameStart, nameEnd), cb.tagName) === 0
      ) {
        if (enter) {
          cb.enter();
        }
        if (exit) {
          cb.exit?.();
        }
      }
    }
  }
}
