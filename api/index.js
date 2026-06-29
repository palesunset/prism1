import { bootServerless } from "../server/bootServerless.js";
import { createServerlessApp } from "../server/createServerlessApp.js";

export default bootServerless(() => createServerlessApp("all"), "api");

export const config = {
  maxDuration: 60,
  memory: 1024,
};
