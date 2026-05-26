import type { AttachmentBuilder } from "discord.js";

export function getAttachmentBuffer(attachment: AttachmentBuilder): Buffer {
  const value = attachment.attachment;

  if (Buffer.isBuffer(value)) {
    return value;
  }

  throw new Error("Renderer returned a non-buffer attachment.");
}

export function sendImage(
  res: {
    setHeader(name: string, value: string): void;
    status(statusCode: number): { send(body: Buffer): void };
  },
  contentType: string,
  filename: string,
  body: Buffer,
): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", `${body.byteLength}`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.status(200).send(body);
}

export type FilePayload = {
  name: string;
  contentType: string;
  base64: string;
};

export function buildFilePayload(
  name: string,
  contentType: string,
  body: Buffer,
): FilePayload {
  return {
    name,
    contentType,
    base64: body.toString("base64"),
  };
}
