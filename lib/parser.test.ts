import { Mock, expect, test, vi } from "vitest";
import { Attributes, Parser } from "./parser";

/** Creates a tag mock that should get called each time a tag name is visited */
const makeSelectorMock = (
  parser: Parser,
  selector: string
): Mock<[Attributes], void> => {
  const mock = vi.fn();

  parser.onElement(selector, () => {
    mock(parser.attributes());
  });

  return mock;
};

test("basic", async () => {
  const pl1 = `
    <?xml something something ?>
    <RootTag attr1="test" attr2`;

  const pl2 = ` attr3="test3">
    <ChildTag />
    <ChildTag />
  </RootTag>`;

  const p = new Parser();

  const rootMock = makeSelectorMock(p, "RootTag");
  const childMock = makeSelectorMock(p, "ChildTag");

  p.push(Buffer.from(pl1));
  p.push(Buffer.from(pl2));

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test",
    attr2: true,
    attr3: "test3",
  });
  expect(childMock).toBeCalledTimes(2);
});

test("other encodings", async () => {
  const pl1 = `
    <?xml something something ?>
    <RöötTag attr1="test 😅" ättr2 attr3="test3" />
  `;

  const p = new Parser();
  const rootMock = makeSelectorMock(p, "RöötTag");
  p.push(Buffer.from(pl1));

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test 😅",
    ättr2: true,
    attr3: "test3",
  });
});

test("parse", async () => {
  const input = Buffer.from(`
    <?xml something something ?>
    <RootTag attr1="test" attr2 attr3="test3">
      <ChildTag />
      <ChildTag />
    </RootTag>
  `);

  const p = new Parser();
  const rootMock = makeSelectorMock(p, "RootTag");
  const childMock = makeSelectorMock(p, "ChildTag");

  p.parse(input);

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test",
    attr2: true,
    attr3: "test3",
  });
  expect(childMock).toBeCalledTimes(2);
});

test("tags without attributes", async () => {
  const input = Buffer.from(`
    <?xml something something ?>
    <RootTag>
      <ChildTag />
      <ChildTag />
    </RootTag>
  `);

  const p = new Parser();
  const rootMock = makeSelectorMock(p, "RootTag");
  p.parse(input);

  expect(rootMock).toBeCalledTimes(1);
});

test("quoting", async () => {
  const xml = `
    <?xml something something ?>
    <RootTag attr1="test > foo" attr2 />
  `;

  const p = new Parser();
  const rootMock = makeSelectorMock(p, "RootTag");
  p.push(Buffer.from(xml));

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test > foo",
    attr2: true,
  });
});

test("text nodes", async () => {
  const xml = `
    <?xml something something ?>
    <RootTag attr1="test > foo" attr2>
      Hello,
      <ChildTag />
      <ChildTag>World!</ChildTag>
    </RootTag>
  `;

  const textNodeMock = vi.fn();
  const p = new Parser();
  p.onTextNode(() => {
    const text = p.textContent().trim();
    if (text.length > 0) {
      textNodeMock(text);
    }
  });
  p.push(Buffer.from(xml));

  expect(textNodeMock).toBeCalledTimes(2);
  expect(textNodeMock).toBeCalledWith("Hello,");
  expect(textNodeMock).toBeCalledWith("World!");
});

test("selectors", () => {
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
  const childMock = makeSelectorMock(p, "RootTag  > Child");
  const barMock = makeSelectorMock(p, "RootTag  Bar");
  const allChildMock = makeSelectorMock(p, "Child");
  const multipleRulesMock = makeSelectorMock(p, "Child, RootTag Bar");

  const enc = new TextEncoder();
  p.parse(enc.encode(xml));

  expect(childMock).toBeCalledTimes(2);
  expect(barMock).toBeCalledTimes(2);
  expect(allChildMock).toBeCalledTimes(5);
  expect(multipleRulesMock).toBeCalledTimes(7);
});
