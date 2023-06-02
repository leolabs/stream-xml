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
  p.addCallback("RootTag", rootMock);
  p.addCallback("ChildTag", childMock);

  await new Promise((r) => p.write(Buffer.from(pl), r));
  p.end();

  expect(rootMock).toBeCalledTimes(1);
  expect(childMock).toBeCalledTimes(2);
});
