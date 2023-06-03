import { expect, test, vi } from "vitest";
import { Parser } from ".";

// todo: test quoting (special characters, escapes etc)

test("basic", async () => {
  const pl1 = `
    <?xml something something ?>
    <RootTag attr1="test" attr2`;

  const pl2 = ` attr3="test3">
    <ChildTag />
    <ChildTag />
  </RootTag>`;

  const rootMock = vi.fn();
  const childMock = vi.fn();
  const p = new Parser();
  p.onElement("RootTag", () => {
    console.log("Attr:", p.attributes());
    rootMock(p.attributes());
  });
  p.onElement("ChildTag", childMock);

  await new Promise((r) => p.write(Buffer.from(pl1), r));
  await new Promise((r) => p.write(Buffer.from(pl2), r));
  p.end();

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
      <RöötTag attr1="test 😅" ättr2 attr3="test3">
      <ChildTag />
      <ChildTag />
    </RootTag>
  `;

  const rootMock = vi.fn();
  const childMock = vi.fn();
  const p = new Parser();
  p.onElement("RöötTag", () => {
    console.log("Attr:", p.attributes());
    rootMock(p.attributes());
  });
  p.onElement("ChildTag", childMock);

  await new Promise((r) => p.write(Buffer.from(pl1), r));
  p.end();

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test 😅",
    ättr2: true,
    attr3: "test3",
  });
  expect(childMock).toBeCalledTimes(2);
});

test("parse", async () => {
  const input = Buffer.from(`
    <?xml something something ?>
    <RootTag attr1="test" attr2 attr3="test3">
      <ChildTag />
      <ChildTag />
    </RootTag>
  `);

  const rootMock = vi.fn();
  const childMock = vi.fn();
  const p = new Parser();
  p.onElement("RootTag", () => {
    console.log("Attr:", p.attributes());
    rootMock(p.attributes());
  });
  p.onElement("ChildTag", childMock);

  p.parse(input);

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test",
    attr2: true,
    attr3: "test3",
  });
  expect(childMock).toBeCalledTimes(2);
});

test("quoting", async () => {
  const xml = `
    <?xml something something ?>
    <RootTag attr1="test > foo" attr2 />
  `;

  const rootMock = vi.fn();
  const p = new Parser();
  p.onElement("RootTag", () => {
    console.log("Attr:", p.attributes());
    rootMock(p.attributes());
  });
  await new Promise((r) => p.write(Buffer.from(xml), r));
  p.end();

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
  p.onTextNode((text) => {
    if (text.trim().length > 0) {
      textNodeMock(text.trim());
    }
  });
  await new Promise((r) => p.write(Buffer.from(xml), r));
  p.end();

  expect(textNodeMock).toBeCalledTimes(2);
  expect(textNodeMock).toBeCalledWith("Hello,");
  expect(textNodeMock).toBeCalledWith("World!");
});
