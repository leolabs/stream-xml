import b from "benny";
import { createReadStream } from "fs";
import { SaxPushParser, parseXml } from "libxmljs2";
import { X2jOptionsOptional, XMLParser } from "fast-xml-parser";
import sax from "sax";

import { Parser } from "../lib";
import { readFile } from "fs/promises";

for(const fileName of ["small.xml", "medium.xml", "semi-large.xml"]) {
  b.suite(
    `XML parsing (${fileName})`,
    b.add("stream-xml", async () => {
      const stream = createReadStream(fileName);
      const parser = new Parser();
      stream.pipe(parser);
      return new Promise((res) => stream.on("end", res));
    }),
    b.add("stream-xml without stream", async () => {
      const file = await readFile(fileName);
      const parser = new Parser();
      parser.parse(file);
    }),
    b.add("libxmljs2", async () => {
      const stream = createReadStream(fileName);
      const parser = new SaxPushParser();
      stream.on("data", (chunk) => {
        const str = chunk.toString("utf8");
        parser.push(str);
      });
      return new Promise<void>((res) =>
        stream.on("end", () => {
          parser.push("");
          res();
        })
      );
    }),
    b.add("libxmljs2 without stream", async () => {
      const file = await readFile(fileName, { encoding: "utf-8" });
      const parsed = parseXml(file);
      parsed.root();
    }),
    b.add("sax", async () => {
      const stream = createReadStream(fileName);
      const parser = sax.createStream(true);
      stream.pipe(parser);
      return new Promise<void>((r) => parser.on("end", r));
    }),
    b.add("sax without stream", async () => {
      const file = await readFile(fileName, { encoding: "utf-8" });
      const parser = sax.parser(true);
      parser.write(file);
    }),
    b.add("fast-xml-parser", async () => {
      const file = await readFile(fileName, { encoding: "utf-8" });
      const parserConfig: X2jOptionsOptional = {
        ignoreAttributes: false,
        ignoreDeclaration: true,
        ignorePiTags: true,
        parseTagValue: false,
        parseAttributeValue: false,
      };
      const parser = new XMLParser(parserConfig);
      parser.parse(file);
    }),
    b.cycle(),
    b.complete((s) => {
      console.log();
  
      for (const result of s.results) {
        console.log();
        console.log(result.name);
        console.log("Mean:", result.details.mean, "s");
      }
    })
  );
}