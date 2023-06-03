import b from "benny";
import { createReadStream } from "fs";
import { SaxPushParser, parseXml } from "libxmljs2";
import { X2jOptionsOptional, XMLParser } from "fast-xml-parser";
import sax from "sax";

import { Parser } from ".";
import { readFile } from "fs/promises";

b.suite(
  "XML parsing",
  b.add("stream-xml", async () => {
    const stream = createReadStream("bench/session.xml");
    const parser = new Parser();
    stream.pipe(parser);
    return new Promise((res) => stream.on("end", res));
  }),
  b.add("stream-xml without stream", async () => {
    const file = await readFile("bench/session.xml");
    const parser = new Parser();
    parser.parse(file);
  }),
  b.add("libxmljs2", async () => {
    const stream = createReadStream("bench/session.xml");
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
    const file = await readFile("bench/session.xml", { encoding: "utf-8" });
    const parsed = parseXml(file);
    parsed.root();
  }),
  b.add("sax", async () => {
    const stream = createReadStream("bench/session.xml");
    const parser = sax.createStream(true);
    stream.pipe(parser);
    return new Promise<void>((r) => parser.on("end", r));
  }),
  b.add("sax without stream", async () => {
    const file = await readFile("bench/session.xml", { encoding: "utf-8" });
    const parser = sax.parser(true);
    parser.write(file);
  }),
  b.add("sax lenient", async () => {
    const stream = createReadStream("bench/session.xml");
    const parser = sax.createStream(false);
    stream.pipe(parser);
    return new Promise<void>((r) => parser.on("end", r));
  }),
  b.add("sax lenient without stream", async () => {
    const file = await readFile("bench/session.xml", { encoding: "utf-8" });
    const parser = sax.parser(false);
    parser.write(file);
  }),
  b.add("fast-xml-parser", async () => {
    const file = await readFile("bench/session.xml", { encoding: "utf-8" });
    const parserConfig: X2jOptionsOptional = {
      ignoreAttributes: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      parseTagValue: false,
      parseAttributeValue: false,
    };
    const parser = new XMLParser(parserConfig);
    const jObj = parser.parse(file);
  }),
  b.cycle(),
  b.complete((s) => {
    console.log();
    console.log(s.results[0]);
  })
);
