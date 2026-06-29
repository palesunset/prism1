import express from "express";

/** Defer mounting heavy Express routers until the first matching request. */
export function lazyMount(mountFn) {
  const router = express.Router();
  let loading = null;

  return async (req, res, next) => {
    if (!loading) {
      loading = Promise.resolve(mountFn(router));
    }
    await loading;
    return router(req, res, next);
  };
}
