const buf = Buffer.from("<!DOCTYPE html><html", "latin1");
const magic = buf.toString("latin1").substring(0, 5);
const first16Str = magic.toLowerCase();
console.log({ magic, first16Str });
