import { Writable } from "stream";

declare module "node-xml-stream" {
  export default class Parser extends Writable {
    on(event: string, callback: (...args: any) => unknown);
  }
}
