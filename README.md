# `stream-xml`

Streaming XML parser using callbacks for handling individual tags.

## Usage

### Example

```js
import { createReadStream } from "node:fs";
import { Parser } from "stream-xml";

const parser = new Parser();
parser.onElement("myTag", () => {
  console.log("Encountered my tag!");
  // get attributes using: parser.attributes()
});
parser.onTextNode(() => {
  console.log("Encountered a text node");
  // get the content using: parser.textContent()
});

const file = createReadStream("data.xml");
file.pipe(parser);

parser.on("finish", () => console.log("Done 🎉"));
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
