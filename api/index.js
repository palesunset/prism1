import { bootServerlessAsync } from "../server/bootServerless.js";
import { createServerlessApp } from "../server/createServerlessApp.js";

export default bootServerlessAsync(() => createServerlessApp("all"), "api");

export const config = {
  maxDuration: 60,
  memory: 1024,
};
