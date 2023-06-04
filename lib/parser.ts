import { decodeXML } from "entities";

export type CallbackFn = () => unknown;

interface Callback {
  tagName: Uint8Array;
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

/**
 * Checks if two Uint8Arrays are equal
 */
const isEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((d, i) => d === b[i]);
};

enum StateType {
  Init = 1, // no args
  Opening = 2, // with startPos
  Comment = 3, // with commentChar
  TagName = 4, // with startPos
  Attributes = 5, // with startPos & endPos
  Closing = 6, // with startPos
  Quoted = 7, // with startPos & endPos
  TextNode = 8, // with startPos
}

type AttrState =
  | { type: "INIT" }
  | { type: "NAME"; startPos: number }
  | { type: "VALUE"; startPos: number }
  | { type: "QUOTED_VALUE"; startPos: number };

export interface Options {
  /**
   * The size of the internal buffer. Should be at least
   * double that of the buffers that get pushed into the stream.
   */
  bufferSize?: number;

  /**
   * Encoding that is used when converting parts of the XML document,
   * e.g. attributes or text nodes, into strings. Default: utf-8
   */
  encoding?: BufferEncoding;
}

export class Parser {
  #callbacks: Callback[] = [];
  #textNodeCallbacks: CallbackFn[] = [];
  #buffer: Uint8Array;
  /** position of the end of usable bytes */
  #bufferPos: number = 0;
  #state: StateType = StateType.Init;
  #stateStartPos: number = 0;
  #stateEndPos: number = 0;
  #attributeEndPos: number = 0;
  #stateCommentChar: number = 0;
  /** Position of leftmost character we still care about */
  #resetPos: number = 0;

  #textDecoder: TextDecoder;
  #textEncoder = new TextEncoder();

  /**
   * Create a new Parser.
   *
   * The parser implements `Stream.Writable`.
   *
   * @param options - used to configure the parser
   */
  constructor(options?: Options) {
    this.#textDecoder = new TextDecoder(options?.encoding ?? "utf-8");
    this.#buffer = new Uint8Array(options?.bufferSize ?? 128 * 1024);
  }

  private setState(newState: StateType) {
    this.#state = newState;
  }

  /**
   * Register a callback for a certain tag name.
   *
   * Use the `attributes()` method to access the attributes during the callback.
   *
   * @param tagName - Name of the tag to register the callback for - case sensitive
   * @param enter - Function to call when the tag for tagName is opened
   * @param exit - Function to call when the tag for tagName is closed (optional)
   */
  onElement(tagName: string, enter: CallbackFn, exit?: CallbackFn) {
    this.#callbacks.push({
      tagName: this.#textEncoder.encode(tagName),
      enter,
      exit,
    });
  }

  /**
   * Register a callback for text nodes.
   *
   * @param cb - Function to call when a text node is encountered
   */
  onTextNode(cb: CallbackFn) {
    this.#textNodeCallbacks.push(cb);
  }

  /**
   * Parse XML without support for streaming.
   *
   * This requires you to have the entire payload in memory.
   * In some cases this can be faster than using the
   * streaming parsing.
   *
   * @param buffer - The byte buffer to parse
   */
  parse(buffer: Uint8Array): void {
    this.#state = StateType.Init;
    this.#buffer = buffer;
    this._parse(0, buffer.length);
  }

  push(chunk: Uint8Array): void {
    // truncate working buffer if new buffer does not fit
    if (this.#bufferPos + chunk.length > this.#buffer.length) {
      if (
        this.#bufferPos - this.#resetPos + chunk.length >
        this.#buffer.length
      ) {
        throw new Error("Buffer too small");
      }
      this.#buffer.set(
        this.#buffer.subarray(this.#resetPos, this.#bufferPos),
        0
      );
      this.#bufferPos = this.#bufferPos - this.#resetPos;
    }

    const localStart = this.#bufferPos;
    this.#buffer.set(chunk, this.#bufferPos);
    this.#bufferPos += chunk.length;

    this._parse(localStart, this.#bufferPos);
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
            this.#stateStartPos = i + 1;
            this.setState(StateType.TextNode);
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
            this.#stateStartPos = i + 1;
            this.setState(StateType.TextNode);
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
            this.#stateStartPos = i + 1;
            this.setState(StateType.TextNode);
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
            this.#stateStartPos = i + 1;
            this.setState(StateType.TextNode);
          }
          break;
        }
        case StateType.Quoted: {
          if (char === QUOTE && lastChar != BACKSLASH) {
            this.setState(StateType.Attributes);
          }
          break;
        }
        case StateType.TextNode: {
          if (char === TAG_START) {
            this.#stateEndPos = i;
            for (const cb of this.#textNodeCallbacks) {
              cb();
            }
            this.setState(StateType.Opening);
          }
          break;
        }
      }
    }
  }

  /**
   * Returns the attributes of the node that is currently being entered.
   * This method can only be called from inside the enter callback of a node.
   *
   * @returns A flat object with all attributes of the currently entered tag.
   */
  attributes(): Record<string, string | boolean> {
    if (this.#state !== StateType.Attributes) {
      throw new Error(
        "trying to access attributes outside of the enter callback"
      );
    }

    let state: AttrState = { type: "INIT" };

    // parse attributes into object
    const attrs = {} as Record<string, string | boolean>;

    /** last parsed name */
    let name = "";

    const addValueAndReset = (start: number, end: number) => {
      const value = this.#textDecoder.decode(this.#buffer.subarray(start, end));
      attrs[name] = decodeXML(value);
      state = { type: "INIT" };
    };

    for (let i = this.#stateEndPos + 1; i <= this.#attributeEndPos; i++) {
      const char = this.#buffer[i];

      switch (state.type) {
        case "INIT": {
          if (!isWhitespace(char)) {
            state = { type: "NAME", startPos: i };
          }
          break;
        }
        case "NAME": {
          const attrName = this.#textDecoder.decode(
            this.#buffer.subarray(state.startPos, i)
          );

          if (isWhitespace(char)) {
            // boolean attribute
            attrs[attrName] = true;
            state = { type: "INIT" };
          } else if (char === EQUAL) {
            name = attrName;
            state = { type: "VALUE", startPos: i + 1 };
          }
          break;
        }
        case "VALUE": {
          if (i === state.startPos && char === QUOTE) {
            state = { type: "QUOTED_VALUE", startPos: i + 1 };
          } else if (isWhitespace(char)) {
            addValueAndReset(state.startPos, i);
          }
          break;
        }
        case "QUOTED_VALUE": {
          if (char === QUOTE && this.#buffer[i - 1] !== BACKSLASH) {
            addValueAndReset(state.startPos, i);
          }
          break;
        }
      }
    }

    // final
    switch (state.type) {
      case "INIT": {
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

  /**
   * Returns the content for the current text node.
   *
   * Only use this inside a text node callback.
   *
   * @returns the content for the current text node
   */
  textContent(): string {
    return this.#textDecoder.decode(
      this.#buffer.subarray(this.#stateStartPos, this.#stateEndPos)
    );
  }

  private doTagEnd(
    nameStart: number,
    nameEnd: number,
    enter: boolean,
    exit: boolean
  ) {
    for (const cb of this.#callbacks) {
      if (isEqual(this.#buffer.subarray(nameStart, nameEnd), cb.tagName)) {
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
