/**
 * Express 4 n'attrape pas les rejets de promesse : sans ce wrapper, une erreur
 * dans un handler `async` laisse la requête sans réponse jusqu'au timeout.
 */
export function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
