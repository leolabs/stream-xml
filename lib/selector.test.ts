import { expect, test, vi } from "vitest";
import { SelectorParser, Parser } from ".";

test("basic", () => {
  const xml = `
    <RootTag>
      <Child>
        <Bar />
      </Child>
      <Other>
        <Child />
      </Other>
      <Bar />
      <Child>
        <Child />
      </Child>
    </RootTag>
    <Child />
  `;

  const p = new Parser();
  const s = new SelectorParser(p);
  const childMock = vi.fn();
  s.on("RootTag  > Child", childMock);
  const barMock = vi.fn();
  s.on("RootTag  Bar", barMock);
  const allChildMock = vi.fn();
  s.on("Child", allChildMock);
  const multipleRulesMock = vi.fn();
  s.on("Child, RootTag Bar", multipleRulesMock);

  const enc = new TextEncoder();
  p.parse(enc.encode(xml));

  expect(childMock).toBeCalledTimes(2);
  expect(barMock).toBeCalledTimes(2);
  expect(allChildMock).toBeCalledTimes(5);
  expect(multipleRulesMock).toBeCalledTimes(7);
});
