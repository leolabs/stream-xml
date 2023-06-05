import { Mock, expect, test, vi } from "vitest";
import { StreamParser } from "./stream-parser";
import { Parser } from "./parser";

/** Creates a tag mock that should get called each time a tag name is visited */
const makeTagMock = (parser: Parser, tagName: string): Mock<[], void> => {
  const mock = vi.fn();
  parser.onElement(tagName, () => {
    mock(parser.attributes());
  });
  return mock;
};

test("streaming", async () => {
  const pl1 = `
    <?xml something something ?>
    <RootTag attr1="test" attr2`;

  const pl2 = ` attr3="test3">
    <ChildTag />
    <ChildTag />
  </RootTag>`;

  const p = new StreamParser();
  const rootMock = makeTagMock(p.parser, "RootTag");
  const childMock = makeTagMock(p.parser, "ChildTag");

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
