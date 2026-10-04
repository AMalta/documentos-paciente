/* Service worker — o mínimo para o app ser instalável e abrir sem rede.
   Guarda só a casca (HTML, JS, manifesto). NÃO guarda imagem de documento:
   elas vêm por URL assinada que expira, e cache de dado de saúde no disco do
   navegador é risco sem ganho — quem precisa do acervo offline é o dono, e
   isso é assunto da fila de envio, não deste arquivo. */
const VERSAO = "casca-v105";
const CASCA = ["./", "./index.html", "./app.js", "./config.js",
                "./manifest.webmanifest", "./worker.js", "./comum.js", "./fila.js", "./agenda.js", "./termo.js", "./conversa.js",
                // Sem esta linha o aplicativo NAO ABRE sem rede: e a
                // biblioteca do Supabase, e `app.js` estoura na linha 15 sem
                // ela. Ficava de fora porque vinha de um CDN, e o cache
                // daqui so alcanca o proprio site.
                "./supabase.min.js",
                // pdf.js, pelo mesmo motivo do supabase.min.js acima: e
                // preciso pro botao "Enviar PDF de exame" funcionar offline.
                "./pdf.min.js", "./pdf.worker.min.js",
                "./icone-192.png", "./icone-512.png", "./favicon.png",
                "./logo_indidoc_branca.png"];

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

/* NOTIFICAÇÕES (sql/016). O serviço do indiDoc manda { titulo, corpo }.
   Tocar no aviso abre o app — ou traz para a frente o que já está aberto. */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "indiDoc", {
    body: d.corpo || "", icon: "./icone-192.png", badge: "./favicon.png", lang: "pt-BR",
    // Mensagem da clínica (sql/018): o toque abre a conversa, e não a lista.
    data: d.abrir === "conversa" ? { abrir: "conversa", pessoa_id: d.pessoa_id, clinica_id: d.clinica_id } : {},
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const dados = e.notification.data || {};
  const destino = dados.abrir === "conversa"
    ? "./#conversa=" + encodeURIComponent(dados.pessoa_id + "," + dados.clinica_id) : "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
    const app = abertas.find((c) => !c.url.includes("/medico"));
    if (!app) return clients.openWindow(destino);
    if (dados.abrir === "conversa") app.postMessage({ abrir: "conversa", pessoa_id: dados.pessoa_id, clinica_id: dados.clinica_id });
    return app.focus();
  }));
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

  // `no-cache` = sempre pergunta ao servidor (responde 304 se nada mudou,
  // quase de graça). Sem ele, o max-age=600 do GitHub Pages deixava o
  // navegador devolver o app.js antigo por até 10 minutos depois de cada
  // publicação — "rede primeiro" que na prática era cache primeiro.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia)).catch(() => {});
        return resposta;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
