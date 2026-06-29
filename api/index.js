import serverless from "serverless-http";
import { createPlatformApi } from "../server/createPlatformApi.js";

const app = createPlatformApi();
const handler = serverless(app, { binary: ["multipart/form-data", "application/octet-stream"] });

export default handler;

export const config = {
  maxDuration: 60,
  memory: 1024,
};
