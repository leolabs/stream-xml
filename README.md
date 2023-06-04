# `stream-xml`

Streaming XML parser using callbacks for handling individual tags.

## Installing with Yarn or NPM

```sh
yarn add stream-xml
```

or

```sh
npm i stream-xml
```

## Installing in Deno

```js
import { Parser } from "https://deno.land/x/stream_xml/lib/parser.ts";
```

## Usage

### Example

#### Parsing a Stream

```js
import { createReadStream } from "node:fs";
import { StreamParser, SelectorParser } from "stream-xml";

const streamParser = new StreamParser();
const selectorParser = new SelectorParser(streamParser.parser);

selectorParser.on("myTag", () => {
  console.log("Encountered my tag!");
  // get attributes using: parser.attributes()
});
streamParser.parser.on(() => {
  console.log("Encountered a text node");
  // get the content using: parser.textContent()
});

const file = createReadStream("data.xml");
file.pipe(streamParser);

streamParser.on("finish", () => console.log("Done 🎉"));
```

#### Parsing an Entire File

```js
import { readFileSync } from "node:fs";
import { Parser, SelectorParser } from "stream-xml";

const parser = new Parser();
const selectorParser = new SelectorParser(parser);

selectorParser.on("myTag", () => {
  console.log("Encountered my tag!");
  // get attributes using: parser.attributes()
});
parser.onTextNode(() => {
  console.log("Encountered a text node");
  // get the content using: parser.textContent()
});

const file = readFileSync("data.xml");
parser.parse(file);
```

### Options

You can pass these in an object to the `Parser` constructor.

#### `bufferSize`

_Type: `number`_

_Default: `128 * 1024`_

The size of the internal buffer. Should be at least
double that of the buffers that get pushed into the stream.

#### `encoding`

_Type: `BufferEncoding`_

_Default: `utf-8`_

Encoding that is used when converting parts of the XML document,
e.g. attributes or text nodes, into strings.
