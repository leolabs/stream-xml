import b from "benny";
import { Parser } from ".";
import { createReadStream } from "fs";

b.suite(
  "XML parsing",
  b.add(
    "parse a small XML file",
    async () => {
      const stream = createReadStream("bench/empty.xml");
      const parser = new Parser();
      stream.pipe(parser);
      return new Promise((res) => stream.on("end", res));
    },
    { minSamples: 10, maxTime: 30 }
  ),
  b.cycle(),
  b.complete((s) => {
    console.log();
    console.log(s.results[0].samples, "samples");
  })
);
