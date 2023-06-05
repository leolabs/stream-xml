import b from "benny";
import { join } from "path";
import { cwd } from "process";
import { createReadStream } from "fs";
import { readFile } from "fs/promises";

import sax from "sax";
import { SaxPushParser, parseXml } from "libxmljs2";
import { X2jOptionsOptional, XMLParser } from "fast-xml-parser";
import XmlStreamParser from "node-xml-stream";

import { Parser, StreamParser } from "../lib";

const main = async () => {
  for (const fileName of ["small.xml", "medium.xml", "semi-large.xml"]) {
    const filePath = join(cwd(), "bench", fileName);

    const externalLibs = [
      b.add("node-xml-stream", async () => {
        const stream = createReadStream(filePath);
        const parser = new XmlStreamParser();
        stream.pipe(parser);
        return new Promise((res) => parser.on("finish", res));
      }),
      b.add("libxmljs2", async () => {
        const stream = createReadStream(filePath);
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
        const file = await readFile(filePath, { encoding: "utf-8" });
        const parsed = parseXml(file);
        parsed.root();
      }),
      b.add("sax", async () => {
        const stream = createReadStream(filePath);
        const parser = sax.createStream(true);
        stream.pipe(parser);
        return new Promise<void>((r) => parser.on("end", r));
      }),
      b.add("sax without stream", async () => {
        const file = await readFile(filePath, { encoding: "utf-8" });
        const parser = sax.parser(true);
        parser.write(file);
      }),
      b.add("fast-xml-parser", async () => {
        const file = await readFile(filePath, { encoding: "utf-8" });
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
    ];

    await b.suite(
      `XML parsing (${fileName})`,
      b.add("stream-xml", async () => {
        const stream = createReadStream(filePath);
        const parser = new StreamParser();
        stream.pipe(parser);
        return new Promise((res) => parser.on("finish", res));
      }),
      b.add("stream-xml without stream", async () => {
        const file = await readFile(filePath);
        const parser = new Parser();
        parser.parse(file);
      }),
      b.add("stream-xml with selectors", async () => {
        const stream = createReadStream(filePath);
        const parser = new StreamParser();
        parser.parser.onSelector("LiveSet", () => {});
        stream.pipe(parser);
        return new Promise((res) => parser.on("finish", res));
      }),
      ...(process.env.LIB_ONLY ? [] : externalLibs),
      b.cycle(),
      b.complete()
    );
  }
};

main();
