/* ═══════════════════════════════════════════════════════════════════════
   App do paciente — fase 1: fotografar, guardar e achar depois.
   SEM IA nesta fase, de propósito: o que precisa ser provado aqui é se o
   paciente fotografa. Se ele não fotografa, nenhuma extração salva o módulo.
   ═══════════════════════════════════════════════════════════════════════ */

const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const el = {
  avisos: $("avisos"), fotografar: $("btn-fotografar"), camera: $("camera"),
  form: $("form"), paginas: $("paginas"), tipo: $("tipo"), nome: $("nome"),
  data: $("data"), salvar: $("btn-salvar"), cancelar: $("btn-cancelar"),
  filtroTipo: $("filtro-tipo"), filtroOrdem: $("filtro-ordem"),
  lista: $("lista"), sub: $("cabecalho-sub"),
  telaRecorte: $("tela-recorte"), recorteArea: $("recorte-area"),
  recorteImg: $("recorte-img"), marca: $("marca"),
  recorteOk: $("recorte-ok"), recorteCancelar: $("recorte-cancelar"),
  recorteTudo: $("recorte-tudo"), recorteTitulo: $("recorte-titulo"),
  telaVisu: $("tela-visu"), visuImg: $("visu-img"), visuTitulo: $("visu-titulo"),
  visuConta: $("visu-conta"), visuAntes: $("visu-antes"),
  visuDepois: $("visu-depois"), visuFechar: $("visu-fechar"),
};

let usuario = null;
let rascunho = [];        // páginas já preparadas, esperando o "Guardar"
let documentos = [];

const ICONES = { exame: "🧪", laudo: "📄", receita: "💊", relatorio: "📋", outro: "📎" };
const ROTULOS = { exame: "Exame", laudo: "Laudo", receita: "Receita",
                  relatorio: "Relatório", outro: "Documento" };

/* ═══ Worker ══════════════════════════════════════════════════════════════
   Toda decodificação de imagem acontece lá. Aqui só se pede e se espera —
   é o que mantém a tela viva enquanto o celular trabalha.                   */
const worker = new Worker("worker.js");
const pendentes = new Map();
let seq = 0;

worker.onmessage = (e) => {
  const p = pendentes.get(e.data.id);
  if (!p) return;
  pendentes.delete(e.data.id);
  e.data.ok ? p.resolve(e.data) : p.reject(new Error(e.data.erro));
};

function pedirAoWorker(mensagem) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    worker.postMessage({ ...mensagem, id });
  });
}

/* ── Avisos ───────────────────────────────────────────────────────────────
   O aviso vai para a tela que está NA FRENTE. A lista principal fica atrás
   do painel de conta; erro desenhado lá some embaixo dele, e o usuário vê um
   botão que pisca e não faz nada — que foi exatamente o que aconteceu.      */
function aviso(texto, tipo = "info", titulo = "") {
  const conta = document.getElementById("tela-conta");
  const alvo = (conta && !conta.classList.contains("escondido"))
    ? document.getElementById("avisos-conta") : el.avisos;
  const d = document.createElement("div");
  d.className = "aviso " + tipo;
  d.innerHTML = (titulo ? `<b>${titulo}</b>` : "") + texto;
  alvo.appendChild(d);
  if (tipo === "ok") setTimeout(() => d.remove(), 4000);
  return d;
}

/* Traduz a falha para o que o paciente precisa saber. O texto cru do
   servidor ("Error sending email change email") não diz nada a ele e
   assusta; o detalhe técnico vai para o console, onde serve. */
function explicar(erro) {
  const cru = String(erro?.message || erro || "");
  console.error("[conta]", cru);
  if (/sending|smtp|mail/i.test(cru))
    return "Não consegui enviar o e-mail agora. Isso é um problema do nosso "
         + "lado — tente de novo em alguns minutos.";
  if (/rate|limit|too many/i.test(cru))
    return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/invalid|expired|token/i.test(cru))
    return "Código inválido ou vencido. Peça um novo código.";
  if (/already registered|already exists/i.test(cru))
    return "Este e-mail já está em uso. Toque em “Já usei antes” para entrar "
         + "com ele.";
  return "Não consegui concluir agora. Tente de novo em alguns minutos.";
}
function limparAvisos() { el.avisos.innerHTML = ""; }

/* ── Sessão ───────────────────────────────────────────────────────────────
   Sessão anônima na primeira aberta: o app deixa fotografar antes de pedir
   cadastro. Pedir login antes de entregar valor é onde esse tipo de app
   morre. O e-mail entra depois, quando a pessoa já tem o que perder.        */
async function entrar() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { usuario = session.user; return true; }

  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    aviso("Ligue <b>Anonymous Sign-ins</b> em Authentication → Providers no "
        + "painel do Supabase e recarregue a página.", "erro",
        "Não consegui abrir sua conta");
    return false;
  }
  usuario = data.user;

  // A linha do paciente é criada na primeira entrada. Sem ela, todo insert de
  // documento cai por chave estrangeira — e o erro apareceria lá na frente,
  // depois de a pessoa já ter tirado a foto.
  const { error: e2 } = await sb.from("pacientes_app")
    .upsert({ id: usuario.id }, { onConflict: "id" });
  if (e2) console.warn("[perfil]", e2.message);
  return true;
}

/* ═══ Recorte de margens ══════════════════════════════════════════════════
   Cortar a mesa em volta do papel faz duas coisas ao mesmo tempo: o
   documento passa a ocupar os 1600px inteiros (letra maior) e o arquivo
   encolhe. É o único ajuste que melhora custo e legibilidade junto.

   A marca é guardada em FRAÇÕES da imagem, não em pixels de tela — assim
   ela vale igual no celular pequeno e no tablet.                            */
let rectAtual = null;
let resolverRecorte = null;

function abrirRecorte(urlPreview, titulo) {
  return new Promise((resolve) => {
    resolverRecorte = resolve;
    el.recorteTitulo.textContent = titulo;
    el.recorteImg.src = urlPreview;
    el.telaRecorte.classList.remove("escondido");
    el.recorteImg.onload = () => {
      const l = el.recorteImg.clientWidth, a = el.recorteImg.clientHeight;
      el.recorteArea.style.width = l + "px";
      el.recorteArea.style.height = a + "px";
      // Começa com uma margem de 6%: sugere o corte sem esconder nada do
      // documento, e deixa claro que a marca se mexe.
      posicionar(l * 0.06, a * 0.06, l * 0.88, a * 0.88);
    };
  });
}

function posicionar(x, y, l, a) {
  const areaL = el.recorteArea.clientWidth, areaA = el.recorteArea.clientHeight;
  const min = 48;
  l = Math.max(min, Math.min(l, areaL));
  a = Math.max(min, Math.min(a, areaA));
  x = Math.max(0, Math.min(x, areaL - l));
  y = Math.max(0, Math.min(y, areaA - a));
  Object.assign(el.marca.style, { left: x + "px", top: y + "px",
                                  width: l + "px", height: a + "px" });
  rectAtual = { x: x / areaL, y: y / areaA, l: l / areaL, a: a / areaA };
}

(function ligarArraste() {
  let modo = null, ini = null;

  const comeco = (e) => {
    const canto = e.target.dataset.canto;
    modo = canto || "mover";
    const r = el.marca.getBoundingClientRect();
    const area = el.recorteArea.getBoundingClientRect();
    ini = { px: e.clientX, py: e.clientY,
            x: r.left - area.left, y: r.top - area.top, l: r.width, a: r.height };
    e.target.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const move = (e) => {
    if (!modo || !ini) return;
    const dx = e.clientX - ini.px, dy = e.clientY - ini.py;
    if (modo === "mover") posicionar(ini.x + dx, ini.y + dy, ini.l, ini.a);
    else if (modo === "tl") posicionar(ini.x + dx, ini.y + dy, ini.l - dx, ini.a - dy);
    else if (modo === "tr") posicionar(ini.x, ini.y + dy, ini.l + dx, ini.a - dy);
    else if (modo === "bl") posicionar(ini.x + dx, ini.y, ini.l - dx, ini.a + dy);
    else if (modo === "br") posicionar(ini.x, ini.y, ini.l + dx, ini.a + dy);
    e.preventDefault();
  };

  const fim = () => { modo = null; ini = null; };

  el.marca.addEventListener("pointerdown", comeco);
  el.marca.addEventListener("pointermove", move);
  el.marca.addEventListener("pointerup", fim);
  el.marca.addEventListener("pointercancel", fim);
})();

function fecharRecorte(rect) {
  el.telaRecorte.classList.add("escondido");
  el.recorteImg.src = "";
  const r = resolverRecorte; resolverRecorte = null;
  r?.(rect);
}
el.recorteOk.onclick = () => fecharRecorte(rectAtual);
el.recorteTudo.onclick = () => fecharRecorte({ x: 0, y: 0, l: 1, a: 1 });
el.recorteCancelar.onclick = () => fecharRecorte(null);

/* ── Rascunho ─────────────────────────────────────────────────────────── */
function desenharRascunho() {
  el.paginas.innerHTML = "";
  rascunho.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "pagina";
    d.innerHTML = `<img src="${p.url}" alt="Página ${i + 1}">
                   <div class="num">${i + 1}</div>
                   <button class="tirar" data-i="${i}" aria-label="Remover página">×</button>`;
    el.paginas.appendChild(d);
  });
  const add = document.createElement("button");
  add.className = "addpagina";
  add.innerHTML = "<span style='font-size:20px'>＋</span><span>página</span>";
  add.onclick = () => el.camera.click();
  el.paginas.appendChild(add);

  el.paginas.querySelectorAll(".tirar").forEach((b) => {
    b.onclick = () => {
      URL.revokeObjectURL(rascunho[+b.dataset.i].url);
      rascunho.splice(+b.dataset.i, 1);
      if (!rascunho.length) return cancelar();
      desenharRascunho();
    };
  });
}

function cancelar() {
  rascunho.forEach((p) => URL.revokeObjectURL(p.url));
  rascunho = [];
  el.form.classList.add("escondido");
  el.fotografar.classList.remove("escondido");
  el.nome.value = "";
  el.camera.value = "";
}

/* ── Guardar ──────────────────────────────────────────────────────────────
   Ordem obrigatória: documento → páginas no storage → linhas das páginas.
   As páginas têm FK para o documento, então tentá-las antes só geraria
   pendência solta. Falhando o documento, nada sobe.                          */
async function guardar() {
  if (!rascunho.length) return;
  el.salvar.disabled = true;
  el.salvar.textContent = "Guardando…";
  limparAvisos();

  try {
    const { data: doc, error: e1 } = await sb.from("documentos").insert({
      paciente_id: usuario.id,
      tipo: el.tipo.value,
      nome: (el.nome.value || "").trim() || ROTULOS[el.tipo.value],
      data_documento: el.data.value || null,
    }).select("id").single();
    if (e1) throw e1;

    for (let i = 0; i < rascunho.length; i++) {
      const p = rascunho[i];
      const caminho = `${usuario.id}/${doc.id}/${i + 1}.jpg`;
      const { error: e2 } = await sb.storage.from("documentos")
        .upload(caminho, p.blob, { contentType: "image/jpeg", upsert: true });
      if (e2) throw e2;

      const { error: e3 } = await sb.from("documento_paginas").insert({
        documento_id: doc.id, ordem: i + 1, storage_path: caminho,
        bytes: p.blob.size, largura: p.largura, altura: p.altura,
      });
      if (e3) throw e3;
    }

    cancelar();
    aviso("Documento guardado.", "ok");
    await carregar();
    convidarAProteger();
  } catch (erro) {
    console.error(erro);
    aviso("Nada foi perdido: as fotos continuam aqui. Confira a internet e "
        + "toque em Guardar de novo.<br><small>" + (erro.message || erro) + "</small>",
        "erro", "Não consegui guardar agora");
  } finally {
    el.salvar.disabled = false;
    el.salvar.textContent = "Guardar documento";
  }
}

/* ═══ Visualizador ════════════════════════════════════════════════════════
   Sem esta tela, tocar na miniatura não fazia nada e o toque longo abria o
   menu do Chrome — "abrir imagem", "baixar", "compartilhar". O documento é
   do paciente, e quem manda nele deve ser o app, não o navegador.           */
let visuPaginas = [], visuIndice = 0;

async function abrirDocumento(doc) {
  const paginas = (doc.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
  if (!paginas.length) return;
  visuTitulo(doc);
  el.telaVisu.classList.remove("escondido");
  el.visuImg.removeAttribute("src");

  // Uma hora de validade: tempo de sobra para olhar, e o link morre depois.
  const { data } = await sb.storage.from("documentos")
    .createSignedUrls(paginas.map((p) => p.storage_path), 3600);
  visuPaginas = (data || []).map((d) => d.signedUrl).filter(Boolean);
  visuIndice = 0;
  mostrarPagina();
}

function visuTitulo(doc) {
  el.visuTitulo.textContent = doc.nome || ROTULOS[doc.tipo];
}

function mostrarPagina() {
  if (!visuPaginas.length) return;
  el.visuImg.src = visuPaginas[visuIndice];
  el.visuConta.textContent = `${visuIndice + 1} / ${visuPaginas.length}`;
  el.visuAntes.disabled = visuIndice === 0;
  el.visuDepois.disabled = visuIndice === visuPaginas.length - 1;
}

el.visuAntes.onclick = () => { if (visuIndice > 0) { visuIndice--; mostrarPagina(); } };
el.visuDepois.onclick = () => {
  if (visuIndice < visuPaginas.length - 1) { visuIndice++; mostrarPagina(); }
};
el.visuFechar.onclick = () => {
  el.telaVisu.classList.add("escondido");
  el.visuImg.removeAttribute("src");
  visuPaginas = [];
};
// Toque longo na imagem não abre o menu do navegador.
el.visuImg.addEventListener("contextmenu", (e) => e.preventDefault());

/* Convite para guardar o acesso, no único momento em que ele faz sentido:
   logo depois do primeiro documento salvo. Aparece uma vez por sessão e
   some se a pessoa já tem e-mail — cobrança repetida vira ruído e ensina o
   usuário a ignorar avisos, inclusive os importantes. */
let convidou = false;
function convidarAProteger() {
  if (convidou || !contaAnonima() || documentos.length !== 1) return;
  convidou = true;
  const d = aviso(
    "Se este celular for limpo ou trocado, você perde o caminho de volta. "
    + "Leva 30 segundos guardar um e-mail.<br>"
    + "<button id='convite-proteger' style=\"margin-top:9px;background:var(--azul);"
    + "color:#fff;border:0;border-radius:8px;padding:9px 14px;font:inherit;"
    + "font-size:14px;font-weight:600\">Guardar meu acesso</button>",
    "info", "Seu primeiro documento está guardado");
  d.querySelector("#convite-proteger").onclick = () => { d.remove(); abrirConta(false); };
}

/* ── Lista ────────────────────────────────────────────────────────────── */
async function carregar() {
  const { data, error } = await sb.from("documentos")
    .select("id, tipo, nome, data_documento, criado_em, documento_paginas(storage_path, ordem)")
    .order("criado_em", { ascending: false });
  if (error) { console.warn(error); return; }
  documentos = data || [];
  desenharLista();
  el.sub.textContent = documentos.length
    ? `${documentos.length} documento${documentos.length > 1 ? "s" : ""} guardado${documentos.length > 1 ? "s" : ""}`
    : "exames, laudos e receitas num lugar só";
}

function dataBR(iso) {
  if (!iso) return "sem data";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function desenharLista() {
  const tipo = el.filtroTipo.value;
  const ordem = el.filtroOrdem.value;
  let lista = documentos.filter((d) => !tipo || d.tipo === tipo);

  const quando = (d) => d.data_documento || d.criado_em;
  if (ordem === "antigo") lista.sort((a, b) => String(quando(a)).localeCompare(String(quando(b))));
  else if (ordem === "tipo") lista.sort((a, b) => a.tipo.localeCompare(b.tipo)
      || String(quando(b)).localeCompare(String(quando(a))));
  else lista.sort((a, b) => String(quando(b)).localeCompare(String(quando(a))));

  if (!lista.length) {
    el.lista.innerHTML = `<div class="vazio"><div class="icone">🗂️</div>
      <p>${documentos.length ? "Nenhum documento com esse filtro."
        : "Ainda não há nada guardado.<br>Comece fotografando um exame."}</p></div>`;
    return;
  }

  el.lista.innerHTML = "";
  for (const d of lista) {
    const paginas = (d.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
    const div = document.createElement("div");
    div.className = "doc";
    div.innerHTML = `
      <div class="capa">${ICONES[d.tipo] || "📎"}</div>
      <div class="txt">
        <div class="nome">${d.nome || ROTULOS[d.tipo]}</div>
        <div class="meta">${ROTULOS[d.tipo]} · ${dataBR(d.data_documento || d.criado_em)}
          ${paginas.length > 1 ? " · " + paginas.length + " páginas" : ""}</div>
      </div>
      <div style="color:var(--tinta-3);font-size:20px">›</div>`;
    div.onclick = () => abrirDocumento(d);
    el.lista.appendChild(div);

    // A miniatura vem por URL assinada: o bucket é privado, e link assinado é
    // o único jeito de o navegador mostrar a imagem sem abrir o acervo para
    // quem descobrir o caminho do arquivo.
    if (paginas[0]) {
      sb.storage.from("documentos").createSignedUrl(paginas[0].storage_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) {
            div.querySelector(".capa").innerHTML = `<img src="${data.signedUrl}" alt="">`;
          }
        });
    }
  }
}

/* ── Captura ──────────────────────────────────────────────────────────────
   Uma foto por vez: prepara no worker (barato para a tela), pergunta as
   margens, depois gera o arquivo final. O progresso é dito em voz alta
   porque são segundos de espera — silêncio nesse intervalo o usuário lê
   como travamento.                                                          */
el.camera.onchange = async () => {
  const arquivos = [...el.camera.files];
  el.camera.value = "";
  if (!arquivos.length) return;

  const estava = el.fotografar.textContent;
  el.fotografar.disabled = true;

  for (let i = 0; i < arquivos.length; i++) {
    el.fotografar.textContent = arquivos.length > 1
      ? `Preparando ${i + 1} de ${arquivos.length}…` : "Preparando…";
    try {
      const prep = await pedirAoWorker({ tipo: "preparar", arquivo: arquivos[i] });
      const urlPrev = URL.createObjectURL(prep.blob);

      const rect = await abrirRecorte(urlPrev, arquivos.length > 1
        ? `Página ${rascunho.length + 1} — ajuste as margens` : "Ajuste as margens");

      if (!rect) { URL.revokeObjectURL(urlPrev); continue; }

      el.fotografar.textContent = "Finalizando…";
      const fim = await pedirAoWorker({
        tipo: "final", blob: prep.blob, rect,
        lado: CONFIG.LADO_MAXIMO, qualidade: CONFIG.QUALIDADE,
      });
      URL.revokeObjectURL(urlPrev);
      rascunho.push({ blob: fim.blob, largura: fim.largura, altura: fim.altura,
                      url: URL.createObjectURL(fim.blob) });
    } catch (e) {
      console.error(e);
      aviso("Não consegui ler uma das fotos.", "erro");
    }
  }

  el.fotografar.disabled = false;
  el.fotografar.textContent = estava;

  if (rascunho.length) {
    el.form.classList.remove("escondido");
    el.fotografar.classList.add("escondido");
    if (!el.data.value) el.data.value = new Date().toISOString().slice(0, 10);
    desenharRascunho();
  }
};

/* ═══ Boas-vindas e instalação ════════════════════════════════════════════
   O QR do consultório leva a uma página, não a uma loja — e é aqui que o
   paciente decide se aquilo vira um ícone no celular dele ou uma aba que ele
   fecha e nunca mais acha. Três regras, todas voltadas para quem tem 70 anos:

   1. quem já usa não vê nada disso: a tela só aparece na primeira visita;
   2. no Android existe botão de instalar DE VERDADE, ligado ao aviso que o
      navegador guarda — instrução escrita é o que se faz quando não há botão;
   3. no iPhone não existe esse aviso, então ensinamos o gesto exato, com o
      nome dos itens do menu. "Adicione aos favoritos" não ajuda ninguém.      */
const bv = {
  tela: $("bemvindo"), instalar: $("bv-instalar"), ios: $("bv-ios"),
  comecar: $("bv-comecar"), faixa: $("faixa-instalar"),
  faixaBtn: $("faixa-btn"), faixaFechar: $("faixa-fechar"),
};

let convite = null;   // o aviso de instalação guardado pelo navegador

const jaInstalado = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// O navegador dispara isto quando considera o app instalável. Guardamos em vez
// de deixar passar: assim o convite aparece no NOSSO botão, no momento em que
// faz sentido, e não numa barrinha que o usuário fecha sem ler.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  convite = e;
  if (!bv.tela.classList.contains("escondido")) bv.instalar.classList.remove("escondido");
  else mostrarFaixa();
});

window.addEventListener("appinstalled", () => {
  convite = null;
  bv.faixa.classList.add("escondido");
  aviso("Pronto! O app está na tela inicial do seu celular.", "ok");
});

async function pedirInstalacao() {
  if (!convite) return;
  convite.prompt();
  await convite.userChoice;
  convite = null;
  bv.instalar.classList.add("escondido");
  bv.faixa.classList.add("escondido");
}

function mostrarFaixa() {
  if (jaInstalado() || !convite) return;
  if (localStorage.getItem("faixa-instalar-nao") === "1") return;
  bv.faixa.classList.remove("escondido");
}

function abrirBoasVindas() {
  bv.tela.classList.remove("escondido");
  if (convite) bv.instalar.classList.remove("escondido");
  else if (ehIOS()) bv.ios.classList.remove("escondido");
}

function fecharBoasVindas() {
  bv.tela.classList.add("escondido");
  try { localStorage.setItem("bemvindo-visto", "1"); } catch (e) {}
  mostrarFaixa();
}

bv.instalar.onclick = pedirInstalacao;
bv.faixaBtn.onclick = pedirInstalacao;
bv.comecar.onclick = fecharBoasVindas;
bv.faixaFechar.onclick = () => {
  bv.faixa.classList.add("escondido");
  try { localStorage.setItem("faixa-instalar-nao", "1"); } catch (e) {}
};

/* ═══ Conta ═══════════════════════════════════════════════════════════════
   A sessão anônima resolve o começo — fotografar sem cadastro — e cria um
   problema que só aparece depois: limpar o navegador ou trocar de celular
   apaga o CAMINHO de volta. Os documentos continuam no banco e ninguém mais
   os alcança. Por isso o e-mail não é login, é chave de retorno.

   Pedido no momento certo: nunca na entrada, e sim depois do primeiro
   documento guardado, quando já existe algo a perder. Antes disso é só
   formulário barrando quem ainda não viu valor nenhum.

   Código de 6 dígitos em vez de só link: no celular, o link do e-mail abre
   noutro app, às vezes noutro navegador, e a sessão se perde no caminho.
   Digitar o código mantém tudo na mesma tela. O link continua valendo para
   quem preferir tocar nele.                                                 */
const ct = {
  botao: $("btn-conta"), tela: $("tela-conta"), fechar: $("conta-fechar"),
  estado: $("conta-estado"), estadoTxt: $("conta-estado-txt"),
  proteger: $("conta-proteger"), pronta: $("conta-pronta"),
  passo1: $("proteger-passo1"), passo2: $("proteger-passo2"),
  email: $("conta-email"), enviar: $("conta-enviar"), eco: $("conta-email-eco"),
  codigo: $("conta-codigo"), confirmar: $("conta-confirmar"), voltar: $("conta-voltar"),
  emailAtual: $("conta-email-atual"), sair: $("conta-sair"),
  bvVoltar: $("bv-voltar"),
};

// `recuperando` distingue as duas jornadas que usam a MESMA tela: guardar o
// e-mail de quem já está aqui, e trazer de volta o acervo de quem chegou num
// celular novo. O código do Supabase é diferente em cada caso.
let recuperando = false;

const contaAnonima = () => !usuario?.email;

function pintarConta() {
  const protegida = !contaAnonima();
  ct.pronta.classList.toggle("escondido", !protegida);
  ct.proteger.classList.toggle("escondido", protegida);
  ct.estado.classList.toggle("alerta", !protegida);
  ct.estado.querySelector(".ico").textContent = protegida ? "✅" : "⚠️";
  ct.estadoTxt.innerHTML = protegida
    ? "<b>Seu acesso está guardado</b>Você consegue abrir seus documentos em outro celular."
    : "<b>Seu acesso ainda não está guardado</b>Se este celular for limpo ou trocado, "
      + "você perde o caminho de volta aos documentos.";
  if (protegida) ct.emailAtual.textContent = usuario.email;
}

function abrirConta(paraRecuperar = false) {
  recuperando = paraRecuperar;
  ct.passo1.classList.remove("passo-oculto");
  ct.passo2.classList.add("passo-oculto");
  ct.codigo.value = "";
  pintarConta();
  if (paraRecuperar) {
    ct.proteger.classList.remove("escondido");
    ct.proteger.querySelector("h3").textContent = "Voltar ao meu acervo";
    ct.proteger.querySelector("p").textContent =
      "Informe o e-mail que você usou antes. Enviamos um código para confirmar "
      + "que é você.";
  } else {
    ct.proteger.querySelector("h3").textContent = "Guarde seu acesso";
    ct.proteger.querySelector("p").textContent =
      "Informe um e-mail para conseguir abrir seus documentos em outro celular "
      + "— ou neste mesmo, se um dia ele for limpo ou trocado.";
  }
  ct.tela.classList.remove("escondido");
}

async function enviarCodigo() {
  const email = (ct.email.value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    aviso("Confira o e-mail digitado.", "erro");
    return;
  }
  ct.enviar.disabled = true;
  ct.enviar.textContent = "Enviando…";
  try {
    if (recuperando) {
      // Trazer de volta um acervo que já existe. Se houver documentos nesta
      // sessão anônima, eles ficam para trás — avisa antes, não depois.
      if (documentos.length) {
        const ok = confirm(`Você tem ${documentos.length} documento(s) guardado(s) `
          + "neste celular que ainda não estão ligados a e-mail nenhum. Ao entrar "
          + "com outra conta, eles deixam de aparecer aqui. Deseja continuar?");
        if (!ok) throw new Error("cancelado");
      }
      const { error } = await sb.auth.signInWithOtp({ email });
      if (error) throw error;
    } else {
      const { error } = await sb.auth.updateUser({ email });
      if (error) throw error;
    }
    ct.eco.textContent = email;
    ct.passo1.classList.add("passo-oculto");
    ct.passo2.classList.remove("passo-oculto");
    ct.codigo.focus();
  } catch (e) {
    if (e.message !== "cancelado") aviso(explicar(e), "erro");
  } finally {
    ct.enviar.disabled = false;
    ct.enviar.textContent = "Enviar código";
  }
}

async function confirmarCodigo() {
  const email = (ct.eco.textContent || "").trim();
  // O tamanho do código é configurável no Supabase (6 a 10 dígitos) e varia
  // de projeto para projeto. Aceitar o que vier, em vez de cravar um número,
  // evita que mudar uma opção no painel quebre a tela sem aviso.
  const token = (ct.codigo.value || "").replace(/\D/g, "");
  if (token.length < 6) {
    aviso("Digite o código inteiro, como veio no e-mail.", "erro");
    return;
  }

  ct.confirmar.disabled = true;
  ct.confirmar.textContent = "Confirmando…";
  try {
    // `email_change` liga o e-mail a quem já está aqui; `email` entra numa
    // conta que já existia. Trocar os dois faz o Supabase recusar o código
    // sem dizer o motivo.
    const { data, error } = await sb.auth.verifyOtp({
      email, token, type: recuperando ? "email" : "email_change",
    });
    if (error) throw error;
    usuario = data.user || (await sb.auth.getUser()).data.user;
    await sb.from("pacientes_app").upsert({ id: usuario.id }, { onConflict: "id" });
    ct.tela.classList.add("escondido");
    aviso(recuperando ? "Pronto! Seus documentos foram recuperados."
                      : "Acesso guardado. Agora dá para abrir em outro celular.", "ok");
    await carregar();
  } catch (e) {
    aviso(explicar(e), "erro");
  } finally {
    ct.confirmar.disabled = false;
    ct.confirmar.textContent = "Confirmar";
  }
}

ct.botao.onclick = () => abrirConta(false);
ct.bvVoltar.onclick = () => { fecharBoasVindas(); abrirConta(true); };
ct.fechar.onclick = () => ct.tela.classList.add("escondido");
ct.enviar.onclick = enviarCodigo;
ct.confirmar.onclick = confirmarCodigo;
ct.voltar.onclick = () => {
  ct.passo2.classList.add("passo-oculto");
  ct.passo1.classList.remove("passo-oculto");
};
ct.sair.onclick = async () => {
  if (!confirm("Sair da conta neste celular? Seus documentos continuam "
             + "guardados e voltam quando você entrar de novo.")) return;
  await sb.auth.signOut();
  location.reload();
};

// Quem toca no link do e-mail em vez de digitar o código volta para cá com a
// sessão já trocada.
sb.auth.onAuthStateChange((evento, sessao) => {
  if (sessao?.user) {
    const mudou = usuario && usuario.id !== sessao.user.id;
    usuario = sessao.user;
    if (!ct.tela.classList.contains("escondido")) {
      ct.tela.classList.add("escondido");
      aviso("Pronto! Seu acesso está guardado.", "ok");
    }
    if (mudou) carregar();
  }
});

/* ── Ligações ─────────────────────────────────────────────────────────── */
el.fotografar.onclick = () => el.camera.click();
el.salvar.onclick = guardar;
el.cancelar.onclick = cancelar;
el.filtroTipo.onchange = desenharLista;
el.filtroOrdem.onchange = desenharLista;

/* ── Partida ──────────────────────────────────────────────────────────── */
(async () => {
  if (!CONFIG.SUPABASE_URL.includes("supabase.co") || CONFIG.SUPABASE_ANON_KEY.length < 40) {
    aviso("Preencha <b>config.js</b> com a URL e a chave anônima do projeto.",
          "erro", "Falta configurar");
    return;
  }
  // A tela de boas-vindas abre ANTES de qualquer espera de rede: quem chegou
  // pelo QR precisa entender onde está no primeiro segundo, não depois de a
  // sessão negociar com o servidor.
  let visto = "1";
  try { visto = localStorage.getItem("bemvindo-visto"); } catch (e) {}
  if (!visto && !jaInstalado()) abrirBoasVindas();

  if (await entrar()) await carregar();

  // Atalho do ícone: segurar o app na tela inicial oferece "Fotografar
  // documento" e cai aqui já com a câmera aberta. Promessa feita no
  // manifesto tem de ser cumprida, senão o atalho só frustra.
  if (new URLSearchParams(location.search).get("acao") === "fotografar") {
    history.replaceState(null, "", location.pathname);
    fecharBoasVindas();
    el.camera.click();
  }
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
