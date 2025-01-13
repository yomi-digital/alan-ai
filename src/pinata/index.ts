import {
  Plugin,
  Provider,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
  Action,
  HandlerCallback,
  ActionExample,
  ModelClass,
} from "@elizaos/core";
import fs from "fs";
import { PinataSDK } from "pinata-web3";
import { Blob } from "buffer";
import { z } from "zod";
export const FileLocationResultSchema = z
  .object({
    fileLocation: z.string().min(1),
  })
  .strict();

export type FileLocationResult = z.infer<typeof FileLocationResultSchema>;

export function isFileLocationResult(obj: unknown): obj is FileLocationResult {
  return FileLocationResultSchema.safeParse(obj).success;
}

export const getFileLocationTemplate = `
{{recentMessages}}

extract the file location from the users message or the attachment in the message history that they are referring to.
your job is to infer the correct attachment based on the recent messages, the users most recent message, and the attachments in the message
image attachments are the result of the users uploads, or images you have created.
only respond with the file location, no other text.
typically the file location is in the form of a URL or a file path.

\`\`\`json
{
    "fileLocation": "file location text goes here"
}
\`\`\`
`;

const uploadFile: Action = {
  name: "UPLOAD_FILE",
  similes: ["UPLOAD_DOCUMENT", "UPLOAD_AUDIO", "UPLOAD_IMAGE", "UPLOAD_VIDEO"],
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  description: "Upload a file to IPFS",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    // Create context with attachments and URL
    const attachments = message.content.attachments;
    console.log("attachments", attachments);
    if (attachments.length === 0) {
      callback({
        text: "No attachments found",
      });
      return false;
    }
    if (
      !runtime.getSetting("PINATA_JWT") ||
      !runtime.getSetting("PINATA_GATEWAY")
    ) {
      callback({
        text: "No PINATA_JWT or PINATA_GATEWAY found",
      });
      return false;
    }
    const pinataJWT = runtime.getSetting("PINATA_JWT");
    const pinataGateway = runtime.getSetting("PINATA_GATEWAY");

    const pinata = new PinataSDK({
      pinataJwt: pinataJWT!,
      pinataGateway: pinataGateway!,
    });

    const blob = new Blob([fs.readFileSync(attachments[0].url)]);
    const file = new File([blob], attachments[0].title, {
      type: attachments[0].contentType,
    });
    const upload = await pinata.upload.file(file);
    callback({
      text:
        "File uploaded to IPFS, this is the URL: https://gateway.pinata.cloud/ipfs/" +
        upload.IpfsHash,
    });

    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you upload this image to IPFS?",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll upload this image to IPFS...",
          action: "UPLOAD_FILE",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "This is the image I've uploaded to IPFS.",
          attachment:
            "https://ipfs.io/ipfs/bafkreibuebjs2p7zsr5lm5hlius2acinuc5xkpixhhn2kbannnuicmnemi",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to upload this image to IPFS.",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll upload this image to IPFS...",
          action: "UPLOAD_FILE",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "This is the image I've uploaded to IPFS.",
          attachment:
            "https://ipfs.io/ipfs/bafkreibuebjs2p7zsr5lm5hlius2acinuc5xkpixhhn2kbannnuicmnemi",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

export const ipfsPlugin: Plugin = {
  name: "IPFS",
  description: "Plugin for uploading files to IPFS",
  actions: [uploadFile],
  providers: [],
  evaluators: [],
};

export default ipfsPlugin;
