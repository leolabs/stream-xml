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
const BLANK = " ".charCodeAt(0);
const TAB = "\t".charCodeAt(0);
const RETURN = "\r".charCodeAt(0);
const NEWLINE = "\n".charCodeAt(0);
const EQUAL = "=".charCodeAt(0);
const QUOTE = `"`.charCodeAt(0);
const BACKSLASH = "\\".charCodeAt(0);

const isWhitespace = (char: number) =>
  char === BLANK || char === TAB || char === RETURN || char === NEWLINE;

enum StateType {
  Init = 1, // no args
  Opening = 2, // with startPos
  Comment = 3, // with commentChar
  TagName = 4, // with startPos
  Attributes = 5, // with startPos & endPos
  Closing = 6, // with startPos
  Quoted = 7, // with startPos & endPos
}

type AttrState =
  | { type: StateType.Init }
  | { type: "NAME"; startPos: number }
  | { type: "VALUE"; startPos: number }
  | { type: "QUOTED_VALUE"; startPos: number };

interface Options {
  /**
   * The size of the internal buffer. Should be at least
   * double that of the buffers that get pushed into the stream.
   */
  bufferSize?: number;
}

export class Parser extends Writable {
  #callbacks: Callback[] = [];
  #buffer: Buffer;
  /** position of the end of usable bytes */
  #bufferPos: number = 0;
  #state: StateType = StateType.Init;
  #stateStartPos: number = 0;
  #stateEndPos: number = 0;
  #attributeEndPos: number = 0;
  #stateCommentChar: number = 0;
  /** Position of leftmost character we still care about */
  #resetPos: number = 0;

  constructor(options?: Options) {
    super();
    this.#buffer = Buffer.alloc(options?.bufferSize ?? 128 * 1024);
  }

  private setState(newState: StateType) {
    //console.log(StateType[newState]);
    this.#state = newState;
  }

  addCallback(tagName: string, enter: CallbackFn, exit?: CallbackFn) {
    this.#callbacks.push({
      tagName: Buffer.from(tagName),
      enter,
      exit,
    });
  }

  parse(buffer: Buffer): void {
    this.#state = StateType.Init;
    this.#buffer = buffer;
    this._parse(0, buffer.length);
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    next: (error?: Error | null | undefined) => void
  ): void {
    // console.log("WRITE", {
    //   resetPos: this.#resetPos,
    //   bufferPos: this.#bufferPos,
    //   length: chunk.length,
    // });
    const buffer = Buffer.from(chunk);

    // truncate working buffer if new buffer does not fit
    if (this.#bufferPos + buffer.length > this.#buffer.length) {
      if (
        this.#bufferPos - this.#resetPos + buffer.length >
        this.#buffer.length
      ) {
        throw new Error("Buffer too small");
      }
      this.#buffer.copy(this.#buffer, 0, this.#resetPos, this.#bufferPos);
      this.#bufferPos = this.#bufferPos - this.#resetPos;
    }

    const localStart = this.#bufferPos;
    buffer.copy(this.#buffer, this.#bufferPos);
    this.#bufferPos += buffer.length;

    this._parse(localStart, this.#bufferPos);
    next();
  }

  private _parse(start: number, end: number) {
    for (let i = start; i < end; i++) {
      const char = this.#buffer[i];
      const lastChar = this.#buffer[i - 1] ?? 0;

      switch (this.#state) {
        case StateType.Init: {
          if (char === TAG_START) {
            this.setState(StateType.Opening);
          }
          break;
        }
        case StateType.Opening: {
          if (isWhitespace(char)) {
            // ignore
          } else if (char === QUESTION || char === BANG) {
            this.setState(StateType.Comment);
            this.#stateCommentChar = char;
          } else if (char === TAG_CLOSE) {
            this.setState(StateType.Closing);
            this.#stateStartPos = i + 1;
          } else {
            this.setState(StateType.TagName);
            this.#stateStartPos = i;
          }
          break;
        }
        case StateType.Comment: {
          if (char === TAG_END && lastChar === this.#stateCommentChar) {
            this.setState(StateType.Init);
            this.#resetPos = i + 1;
          }
          break;
        }
        case StateType.TagName: {
          if (isWhitespace(char)) {
            this.setState(StateType.Attributes);
            this.#stateEndPos = i;
          } else if (char === TAG_END) {
            this.#resetPos = i + 1;
            const selfClosing = lastChar === TAG_CLOSE;
            const endPos = i - (selfClosing ? 3 : 2);
            this.#attributeEndPos = endPos;
            this.doTagEnd(this.#stateStartPos, endPos, true, selfClosing);
            this.setState(StateType.Init);
          }
          break;
        }
        case StateType.Attributes: {
          if (char === TAG_END) {
            this.#resetPos = i + 1;
            const selfClosing = lastChar === TAG_CLOSE;
            this.#attributeEndPos = i - (selfClosing ? 2 : 1);
            this.doTagEnd(
              this.#stateStartPos,
              this.#stateEndPos,
              true,
              selfClosing
            );
            this.setState(StateType.Init);
          } else if (char === QUOTE) {
            this.setState(StateType.Quoted);
          }
          break;
        }
        case StateType.Closing: {
          if (char === TAG_END) {
            this.#resetPos = i + 1;
            this.#attributeEndPos = i;
            this.doTagEnd(this.#stateStartPos, i, false, true);
            this.setState(StateType.Init);
          }
          break;
        }
        case StateType.Quoted: {
          if (char === QUOTE && lastChar != BACKSLASH) {
            this.setState(StateType.Attributes);
          }
          break;
        }
      }
    }
  }

  attributes(): Record<string, string | boolean> | null {
    if (this.#state !== StateType.Attributes) {
      return null;
    }

    let state: AttrState = { type: StateType.Init };

    // parse attributes into object
    const attrs = {} as Record<string, string | boolean>;

    /** last parsed name */
    let name = "";

    // console.log("Attr end:", this.#attributeEndPos);

    for (let i = this.#stateEndPos + 1; i <= this.#attributeEndPos; i++) {
      const char = this.#buffer[i];

      switch (state.type) {
        case StateType.Init: {
          if (!isWhitespace(char)) {
            state = { type: "NAME", startPos: i };
          }
          break;
        }
        case "NAME": {
          if (isWhitespace(char)) {
            // boolean attribute
            const attrName = this.#buffer
              .subarray(state.startPos, i)
              .toString();
            attrs[attrName] = true;
            state = { type: StateType.Init };
          } else if (char === EQUAL) {
            name = this.#buffer.subarray(state.startPos, i).toString();
            state = { type: "VALUE", startPos: i + 1 };
          }
          break;
        }
        case "VALUE": {
          if (i === state.startPos && char === QUOTE) {
            state = { type: "QUOTED_VALUE", startPos: i + 1 };
          } else if (isWhitespace(char)) {
            const value = this.#buffer.subarray(state.startPos, i).toString();
            attrs[name] = value;
            state = { type: StateType.Init };
          }
          break;
        }
        case "QUOTED_VALUE": {
          if (char === QUOTE && this.#buffer[i - 1] !== BACKSLASH) {
            const value = this.#buffer.subarray(state.startPos, i).toString();
            attrs[name] = value;
            state = { type: StateType.Init };
          }
          break;
        }
      }
    }

    // final
    switch (state.type) {
      case StateType.Init: {
        break;
      }
      case "NAME": {
        // boolean attribute
        const attrName = this.#buffer
          .subarray(state.startPos, this.#attributeEndPos + 1)
          .toString();
        attrs[attrName] = true;
        break;
      }
      case "VALUE": {
        const value = this.#buffer
          .subarray(state.startPos, this.#attributeEndPos + 1)
          .toString();
        attrs[name] = value;
        break;
      }
      case "QUOTED_VALUE": {
        throw new Error("invalid quoting of attribute value");
      }
    }

    return attrs;
  }

  private doTagEnd(
    nameStart: number,
    nameEnd: number,
    enter: boolean,
    exit: boolean
  ) {
    for (const cb of this.#callbacks) {
      if (
        Buffer.compare(
          this.#buffer.subarray(nameStart, nameEnd),
          cb.tagName
        ) === 0
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
