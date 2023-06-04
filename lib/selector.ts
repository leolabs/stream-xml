import { Parser } from "./parser";
import { isEqual } from "./util/is-equal";

type CallbackFn = () => unknown;

type TagName = Uint8Array;

type Test = (stack: TagName[]) => boolean;

interface Selector {
  test: Test;
  enter: CallbackFn;
  exit?: CallbackFn;
}

interface StackRule {
  tagName: TagName;
  directChild: boolean;
}

const DIRECT_CHILD = ">";
const textEncoder = new TextEncoder();

const getRules = (selectorPart: string): StackRule[] => {
  const parts = selectorPart.split(" ").filter((p) => p);
  const rules: StackRule[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === DIRECT_CHILD) {
      continue;
    }

    rules.push({
      tagName: textEncoder.encode(part),
      directChild: parts[i + 1] === DIRECT_CHILD,
    });
  }

  return rules;
};

function parseSelector(selector: string): Test {
  const parts = selector.split(",");

  const ruleSets = parts.map((p) => getRules(p.trim()));

  return (stack: TagName[]) => {
    return ruleSets.some((rules) => {
      let matchIndex = rules.length - 1;

      for (let i = stack.length - 1; i >= 0; i--) {
        const tagName = stack[i]!;
        const currentRule = rules[matchIndex]!;

        if (isEqual(currentRule.tagName, tagName)) {
          if (matchIndex === 0) {
            return true;
          }

          matchIndex--;
        } else if (currentRule.directChild || matchIndex === rules.length - 1) {
          return false;
        }
      }

      return matchIndex < 0;
    });
  };
}

/**
 * Allows you to specify CSS-like selectors to be matched.
 */
export class SelectorParser {
  #parser: Parser;
  #selectors: Selector[] = [];

  #stack: TagName[] = [];

  constructor(inner: Parser) {
    this.#parser = inner;

    this.#parser.onElement(
      (tagName) => {
        this.#stack.push(tagName);

        for (const selector of this.#selectors) {
          if (selector.test(this.#stack)) {
            selector.enter();
          }
        }
      },
      () => {
        for (const selector of this.#selectors) {
          if (selector.test(this.#stack)) {
            selector.exit?.();
          }
        }

        this.#stack.pop();
      }
    );
  }

  /**
   * @example
   * // matches all ChildTag elements in TagName elements
   * on("TagName ChildTag")
   * @example
   * // matches direct ChildTag descendants in TagName elements
   * on("TagName > ChildTag")
   * @example
   * // matches multiple rules
   * on("TagName > ChildTag, OtherTag")
   */
  on(selector: string, enter: CallbackFn, exit?: CallbackFn) {
    const test = parseSelector(selector);
    this.#selectors.push({
      test,
      enter,
      exit,
    });
  }

  /**
   * See `Parser.parse`
   */
  parse(buffer: Uint8Array): void {
    this.#parser.parse(buffer);
  }

  push(chunk: Uint8Array): void {
    this.#parser.push(chunk);
  }
}
