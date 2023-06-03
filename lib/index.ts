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
const EQUAL = "=".charCodeAt(0);
const QUOTE = `"`.charCodeAt(0);
const BACKSLASH = "\\".charCodeAt(0);

enum StateType {
  Init = 1,
  Opening = 2,
  Comment = 3,
  TagName = 4,
  Attributes = 5,
  Closing = 6,
}

type State =
  | { type: StateType.Init }
  | { type: StateType.Opening; startPos: number }
  | { type: StateType.Comment; typeChar: number }
  | { type: StateType.TagName; startPos: number }
  | {
      type: StateType.Attributes;
      tagNameStart: number;
      tagNameEnd: number;
    }
  | { type: StateType.Closing; tagNameStart: number };

type AttrState =
  | { type: StateType.Init }
  | { type: "NAME"; startPos: number }
  | { type: "VALUE"; startPos: number }
  | { type: "QUOTED_VALUE"; startPos: number };

const BUFFER_SIZE = 131072;

export class Parser extends Writable {
  #callbacks: Callback[] = [];
  #buffer: Buffer = Buffer.alloc(BUFFER_SIZE);
  /** position of the end of usable bytes */
  #bufferPos: number = 0;
  #state: State = { type: StateType.Init };
  /** Position of leftmost character we still care about */
  #resetPos: number = 0;
  #attributeEndPos: number = 0;

  constructor() {
    super();
  }

  private setState(newState: State) {
    // console.log(newState);
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
    // console.log("WRITE", {
    //   resetPos: this.#resetPos,
    //   bufferPos: this.#bufferPos,
    //   length: chunk.length,
    // });
    const buffer = Buffer.from(chunk);
    // truncate working buffer if new buffer does not fit
    if (buffer.length + this.#bufferPos > this.#buffer.length) {
      // console.log("Trimming buffer to make space");
      this.#buffer.copy(this.#buffer, 0, this.#resetPos, this.#bufferPos);
      this.#bufferPos = this.#bufferPos - this.#resetPos;
    }

    const localStart = this.#bufferPos;
    buffer.copy(this.#buffer, this.#bufferPos);
    this.#bufferPos += buffer.length;

    for (let i = localStart; i < this.#bufferPos; i++) {
      const char = this.#buffer[i];
      const lastChar = this.#buffer[i - 1] ?? 0;

      switch (this.#state.type) {
        case StateType.Init: {
          if (char === TAG_START) {
            this.setState({
              type: StateType.Opening,
              startPos: i - 1, // todo: is this used?
            });
          }
          break;
        }
        case StateType.Opening: {
          if (char === BLANK) {
            // ignore
          } else if (char === QUESTION || char === BANG) {
            this.setState({
              type: StateType.Comment,
              typeChar: char,
            });
          } else if (char === TAG_CLOSE) {
            this.setState({
              type: StateType.Closing,
              tagNameStart: i + 1,
            });
          } else {
            this.setState({
              type: StateType.TagName,
              startPos: i,
            });
          }
          break;
        }
        case StateType.Comment: {
          if (char === TAG_END && lastChar === this.#state.typeChar) {
            this.setState({ type: StateType.Init });
            this.#resetPos = i + 1;
          }
          break;
        }
        case StateType.TagName: {
          if (char === BLANK) {
            this.setState({
              type: StateType.Attributes,
              tagNameEnd: i, // before the blank
              tagNameStart: this.#state.startPos,
            });
          } else if (char === TAG_END) {
            this.#resetPos = i + 1;
            const selfClosing = lastChar === TAG_CLOSE;
            const endPos = i - (selfClosing ? 3 : 2);
            this.#attributeEndPos = endPos;
            this.doTagEnd(this.#state.startPos, endPos, true, selfClosing);
            this.setState({ type: StateType.Init });
          }
          break;
        }
        case StateType.Attributes: {
          if (char === TAG_END) {
            this.#resetPos = i + 1;
            const selfClosing = lastChar === TAG_CLOSE;
            this.#attributeEndPos = i - (selfClosing ? 2 : 1);
            this.doTagEnd(
              this.#state.tagNameStart,
              this.#state.tagNameEnd,
              true,
              selfClosing
            );
            this.setState({ type: StateType.Init });
          }
          break;
        }
        case StateType.Closing: {
          if (char === TAG_END) {
            this.#resetPos = i + 1;
            this.#attributeEndPos = i;
            this.doTagEnd(this.#state.tagNameStart, i, false, true);
            this.setState({ type: StateType.Init });
          }
          break;
        }
      }
    }

    next();
  }

  attributes(): Record<string, string | boolean> | null {
    if (this.#state.type !== StateType.Attributes) {
      return null;
    }

    let state: AttrState = { type: StateType.Init };

    // parse attributes into object
    const attrs = {} as Record<string, string | boolean>;

    /** last parsed name */
    let name = "";

    // console.log("Attr end:", this.#attributeEndPos);

    for (let i = this.#state.tagNameEnd + 1; i <= this.#attributeEndPos; i++) {
      const char = this.#buffer[i];

      switch (state.type) {
        case StateType.Init: {
          if (char !== BLANK) {
            state = { type: "NAME", startPos: i };
          }
          break;
        }
        case "NAME": {
          if (char === BLANK) {
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
          } else if (char === BLANK) {
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
        // error case
        break;
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
    const tagName = this.#buffer.subarray(nameStart, nameEnd);
    // console.log("Tag end:", { enter, exit }, `"${tagName.toString()}"`);
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
