import { assert, expect, test, vi } from "vitest";
import { Parser } from ".";

// todo: test quoting (special characters, escapes etc)

test("basic", async () => {
  const pl = `
    <?xml something something ?>
    <RootTag attr1="test" attr2>
      <ChildTag />
      <ChildTag />
    </RootTag>
  `;

  const rootMock = vi.fn();
  const childMock = vi.fn();
  const p = new Parser();
  p.addCallback("RootTag", () => {
    console.log("Attr:", p.attributes());
    rootMock(p.attributes());
  });
  p.addCallback("ChildTag", childMock);

  await new Promise((r) => p.write(Buffer.from(pl), r));
  p.end();

  expect(rootMock).toBeCalledTimes(1);
  expect(rootMock).toBeCalledWith({
    attr1: "test",
    attr2: true,
    attr3: "test3",
  });
  expect(childMock).toBeCalledTimes(2);
});
