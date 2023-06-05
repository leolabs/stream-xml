import { isEqual } from "./is-equal";

export type Test = (stack: Uint8Array[]) => boolean;

interface StackRule {
  tagName: Uint8Array;
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

export const parseSelector = (selector: string): Test => {
  const parts = selector.split(",");

  const ruleSets = parts.map((p) => getRules(p.trim()));

  if (ruleSets.length === 1 && ruleSets[0]!.length === 1) {
    return (stack: Uint8Array[]) => {
      return (
        stack.length > 0 && isEqual(stack.at(-1)!, ruleSets[0]![0]!.tagName)
      );
    };
  }

  return (stack: Uint8Array[]) => {
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
};
