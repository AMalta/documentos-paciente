/* Service worker — o mínimo para o app ser instalável e abrir sem rede.
   Guarda só a casca (HTML, JS, manifesto). NÃO guarda imagem de documento:
   elas vêm por URL assinada que expira, e cache de dado de saúde no disco do
   navegador é risco sem ganho — quem precisa do acervo offline é o dono, e
   isso é assunto da fila de envio, não deste arquivo. */
const VERSAO = "casca-v45";
const CASCA = ["./", "./index.html", "./app.js", "./config.js",
                "./manifest.webmanifest", "./worker.js", "./comum.js", "./fila.js", "./agenda.js", "./termo.js",
                "./icone-192.png", "./icone-512.png", "./favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Só a casca, e só do próprio site. Chamada ao Supabase nunca passa por
  // cache: dado velho de acervo é pior que erro de rede honesto.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // A pagina do medico fica de fora do cache. Ela nao e o aplicativo: e
  // usada uma vez, num aparelho que nao e o dono do acervo, e depende de
  // rede de qualquer forma. Sem esta linha, cair a conexao la faria o
  // service worker devolver o index.html DO PACIENTE no lugar dela — a
  // tela errada, sem erro nenhum.
  if (url.pathname.includes("/medico")) return;

  e.respondWith(
    fetch(e.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia)).catch(() => {});
        return resposta;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
