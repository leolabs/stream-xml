import { expect, test, describe, vi } from "vitest";
import { Parser } from "./parser";
import { StreamParser } from "./stream-parser";

// todo: test quoting (special characters, escapes etc)

test("basic streaming", async () => {
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
    rootMock(p.attributes());
  });
  p.onElement("ChildTag", childMock);

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
      <RöötTag attr1="test 😅" ättr2 attr3="test3">
      <ChildTag />
      <ChildTag />
    </RootTag>
  `;

  const rootMock = vi.fn();
  const childMock = vi.fn();
  const p = new Parser();
  p.onElement("RöötTag", () => {
    rootMock(p.attributes());
  });
  p.onElement("ChildTag", childMock);
  p.push(Buffer.from(pl1));

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test 😅",
    ättr2: true,
    attr3: "test3",
  });
  expect(childMock).toBeCalledTimes(2);
});

test("parse function", async () => {
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

test("tags without attributes", async () => {
  const input = Buffer.from(`
    <?xml something something ?>
    <RootTag>
      <ChildTag />
      <ChildTag />
    </RootTag>
  `);

  const p = new Parser();
  const rootMock = vi.fn();
  p.onElement("RootTag", rootMock);
  p.parse(input);

  expect(rootMock).toBeCalledTimes(1);
});

test("quoting", async () => {
  const xml = `
    <?xml something something ?>
    <RootTag attr1="test > foo" attr2 />
  `;

  const rootMock = vi.fn();
  const p = new Parser();
  p.onElement("RootTag", () => {
    rootMock(p.attributes());
  });
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

describe("aborting parsing", () => {
  test("aborting sync parse", () => {
    const input = Buffer.from(`
      <?xml something something ?>
      <RootTag attr1="test" attr2 attr3="test3">
        <ChildTag />
        <ChildTag />
      </RootTag>
    `);

    const childMock = vi.fn();
    const p = new Parser();
    p.onElement("ChildTag", () => {
      p.abort();
      childMock();
    });

    p.parse(input);
    expect(childMock).toBeCalledTimes(1);

    childMock.mockClear();

    p.parse(input);
    expect(childMock).toBeCalledTimes(1);
  });

  test("aborting streaming parse", () => {
    const pl1 = `
      <?xml something something ?>
      <RootTag attr1="test" attr2 attr3="test3">
        <ChildTag />`;

    const pl2 = `
        <ChildTag />
        <ChildTag />
      </RootTag>`;

    const childMock = vi.fn();
    const p = new StreamParser();
    p.parser.onElement("ChildTag", () => {
      childMock();
      p.parser.abort();
    });

    p.write(Buffer.from(pl1));
    p.write(Buffer.from(pl2));
    p.end();

    expect(childMock).toBeCalledTimes(1);
  });
});
