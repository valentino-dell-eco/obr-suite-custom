export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  // Rimappa /api-dnd-center/... → https://obr.dnd.center/...
  const target = "https://obr.dnd.center" + url.pathname.replace("/api-dnd-center", "") + url.search;

  const req = new Request(target, {
    method: ctx.request.method,
    headers: ctx.request.headers,
    body: ["GET", "HEAD"].includes(ctx.request.method) ? undefined : ctx.request.body,
  });

  const res = await fetch(req);

  // Passa la risposta originale aggiungendo CORS se serve
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(res.body, {
    status: res.status,
    headers,
  });
};