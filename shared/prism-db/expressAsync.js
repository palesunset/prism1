/** Wrap Express handlers so rejected promises reach error middleware. */

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Wrap every route handler on a Router (idempotent for already-async handlers). */
export function promisifyRouter(router) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const stackItem of layer.route.stack) {
      if (stackItem.__prismAsync) continue;
      const original = stackItem.handle;
      if (original.length >= 4) continue;
      stackItem.handle = asyncHandler(original);
      stackItem.__prismAsync = true;
    }
  }
  return router;
}
