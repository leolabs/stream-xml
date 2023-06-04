import { expect, test, vi } from "vitest";
import { StreamParser } from "./stream-parser";

test("streaming", async () => {
  const pl1 = `
    <?xml something something ?>
    <RootTag attr1="test" attr2`;

  const pl2 = ` attr3="test3">
    <ChildTag />
    <ChildTag />
  </RootTag>`;

  const rootMock = vi.fn();
  const childMock = vi.fn();
  const p = new StreamParser();
  p.parser.onElement("RootTag", () => {
    rootMock(p.parser.attributes());
  });
  p.parser.onElement("ChildTag", childMock);

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
