import { Mock, expect, test, vi } from "vitest";
import { Parser } from "./parser";
import { isEqual } from "./util/is-equal";

// todo: test quoting (special characters, escapes etc)

/** Creates a tag mock that should get called each time a tag name is visited */
const makeTagMock = (parser: Parser, tagName: string): Mock<[], void> => {
  const mock = vi.fn();
  const enc = new TextEncoder();
  const encoded = enc.encode(tagName);
  parser.onElement((tag) => {
    if (isEqual(tag, encoded)) {
      mock(parser.attributes());
    }
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

  const rootMock = makeTagMock(p, "RootTag");
  const childMock = makeTagMock(p, "ChildTag");

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
  const rootMock = makeTagMock(p, "RöötTag");
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
  const rootMock = makeTagMock(p, "RootTag");
  const childMock = makeTagMock(p, "ChildTag");

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
  const rootMock = makeTagMock(p, "RootTag");
  p.parse(input);

  expect(rootMock).toBeCalledTimes(1);
});

test("quoting", async () => {
  const xml = `
    <?xml something something ?>
    <RootTag attr1="test > foo" attr2 />
  `;

  const p = new Parser();
  const rootMock = makeTagMock(p, "RootTag");
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
