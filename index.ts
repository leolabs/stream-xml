import { createReadStream } from "fs";
import { Parser } from "./lib";

const parser = new Parser();

parser.addCallback("MidiTrack", () => {
  console.log("MIDI:", parser.attributes());
});

parser.addCallback("AudioTrack", () => {
  console.log("Audio:", parser.attributes());
});

const stream = createReadStream("large.xml");

stream.pipe(parser);
