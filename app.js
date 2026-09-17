/* ═══════════════════════════════════════════════════════════════════════
   App do paciente — fase 1: fotografar, guardar e achar depois.
   SEM IA nesta fase, de propósito: o que precisa ser provado aqui é se o
   paciente fotografa. Se ele não fotografa, nenhuma extração salva o módulo.
   ═══════════════════════════════════════════════════════════════════════ */

// Marca da versão. Existe porque "o conserto subiu?" e "o celular já pegou?"
// são perguntas diferentes: o service worker guarda a casca e, sem internet,
// SEMPRE serve o cache — dá para passar uma hora testando a versão errada sem
// perceber. Aparece no rodapé da tela de conta.
// Quebra de linha sem escape (ver comentario em apagarDocumentoAberto).
const LINHA = String.fromCharCode(10);
const VERSAO_APP = "2026-09-18.29";

const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const el = {
  avisos: $("avisos"), fotografar: $("btn-fotografar"), camera: $("camera"),
  form: $("form"), paginas: $("paginas"), tipo: $("tipo"), nome: $("nome"),
  data: $("data"), salvar: $("btn-salvar"), cancelar: $("btn-cancelar"),
  filtroTipo: $("filtro-tipo"), filtroOrdem: $("filtro-ordem"),
  lista: $("lista"), sub: $("cabecalho-sub"),
  busca: $("busca"), buscaCaixa: $("busca-caixa"), buscaLimpar: $("busca-limpar"),
  corpoBloco: $("corpo-bloco"), corpo: $("corpo"), folhinhas: $("folhinhas"),
  corpoDica: $("corpo-dica"),
  agenda: $("agenda"), agendaItens: $("agenda-itens"), agendaMais: $("agenda-mais"),
  telaCompromisso: $("tela-compromisso"),
  telaRecorte: $("tela-recorte"), recorteArea: $("recorte-area"),
  recorteImg: $("recorte-img"), marca: $("marca"),
  recorteOk: $("recorte-ok"), recorteCancelar: $("recorte-cancelar"),
  recorteTudo: $("recorte-tudo"), recorteTitulo: $("recorte-titulo"),
  recortePalco: $("recorte-palco"), recorteGirar: $("recorte-girar"),
  recorteDicaGirar: $("recorte-dica-girar"),
  telaVisu: $("tela-visu"), visuImg: $("visu-img"), visuTitulo: $("visu-titulo"),
  visuConta: $("visu-conta"), visuAntes: $("visu-antes"),
  visuDepois: $("visu-depois"), visuGirar: $("visu-girar"), visuApagar: $("visu-apagar"), visuFechar: $("visu-fechar"),
};

let usuario = null;
let rascunho = [];        // páginas já preparadas, esperando o "Guardar"
let documentos = [];
let naFila = [];     // guardados no celular, ainda sem subir

const cp = {
  tituloTela: $("comp-titulo-tela"), cancelar: $("comp-cancelar"),
  salvar: $("comp-salvar"), tipo: $("comp-tipo"), nome: $("comp-nome"),
  data: $("comp-data"), hora: $("comp-hora"), onde: $("comp-onde"),
  repetir: $("comp-repetir"), apagar: $("comp-apagar"),
};


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
/* Onde a mensagem vai depende de QUAL TELA esta na frente.

   Nao e detalhe de estilo: as telas cheias tem z-index 50, e o #avisos da
   pagina fica atras delas. Uma mensagem mandada para la enquanto o
   visualizador ou a tela de marcar estao abertos existe no DOM e NINGUEM VE
   — e so aparece quando a tela fecha, empilhada com as outras. Foi assim
   que "Falta a data" apareceu quatro vezes depois de cancelar: as quatro
   tentativas de salvar funcionaram, e nenhuma deu sinal.

   A conta tem lugar proprio dentro do painel dela; qualquer outra tela
   cheia usa o container flutuante.                                        */
function aviso(texto, tipo = "info", titulo = "") {
  const conta = document.getElementById("tela-conta");
  const contaAberta = conta && !conta.classList.contains("escondido");
  const mostrar = document.getElementById("tela-mostrar");
  const mostrarAberta = mostrar && !mostrar.classList.contains("escondido");
  const outraCheia = [...document.querySelectorAll(".tela-cheia")]
    .some((t) => t.id !== "tela-conta" && t.id !== "tela-mostrar"
                 && !t.classList.contains("escondido"));
  const alvo = contaAberta ? document.getElementById("avisos-conta")
    : mostrarAberta ? document.getElementById("avisos-mostrar")
    : outraCheia ? document.getElementById("avisos-cheia")
    : el.avisos;
  // Abaixo da BARRA da tela que esta na frente, nunca por cima dela. A
  // barra guarda Cancelar e Salvar: uma mensagem pousada ali esconde
  // justamente o botao que a pessoa precisa tocar depois de ler o que
  // faltava — foi o que aconteceu com "Falta a data" cobrindo o Salvar.
  // Medido, e nao cravado: cada tela tem a sua altura de barra, e o recorte
  // da tela (safe-area) muda de aparelho para aparelho.
  if (alvo.id === "avisos-cheia") {
    const cheia = [...document.querySelectorAll(".tela-cheia")]
      .find((t) => t.id !== "tela-conta" && !t.classList.contains("escondido"));
    const barra = cheia && cheia.querySelector(".barra");
    const y = barra ? barra.getBoundingClientRect().bottom : 10;
    alvo.style.top = Math.round(y + 8) + "px";
  }
  const d = document.createElement("div");
  d.className = "aviso " + tipo;
  d.innerHTML = (titulo ? `<b>${titulo}</b>` : "") + texto;
  // Flutuante sai no toque: ela esta por cima do conteudo, e quem ja leu
  // precisa de um jeito obvio de tirar do caminho.
  if (alvo.id === "avisos-cheia") d.onclick = () => d.remove();
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
  // As etiquetas do banco vêm PRIMEIRO: são exatas, e um padrão genérico
  // logo acima as sequestra. Foi o que aconteceu — "LIMITE_DOCUMENTOS" casa
  // com /limit/ e o paciente lia "muitas tentativas seguidas" ao chegar no
  // teto de documentos.
  if (/LIMITE_DOCUMENTOS/.test(cru))
    return "Você chegou ao limite de documentos guardados. Para guardar mais, "
         + "apague algum que não precise mais.";
  if (/LIMITE_PAGINAS/.test(cru))
    return "Este documento já tem páginas demais. Guarde o restante como um "
         + "segundo documento.";
  if (/sending|smtp|mail/i.test(cru))
    return "Não consegui enviar o e-mail agora. Isso é um problema do nosso "
         + "lado — tente de novo em alguns minutos.";
  // "rate limit" e não só "limit", pela mesma razão.
  if (/rate limit|too many|over_.*_rate/i.test(cru))
    return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/invalid|expired|token/i.test(cru))
    return "Código inválido ou vencido. Peça um novo código.";
  if (/already registered|already exists/i.test(cru))
    return "Este e-mail já está em uso. Toque em “Já usei antes” para entrar "
         + "com ele.";
  return "Não consegui concluir agora. Tente de novo em alguns minutos.";
}
function limparAvisos() {
  el.avisos.innerHTML = "";
  const m = document.getElementById("avisos-mostrar");
  if (m) m.innerHTML = "";
  const cheia = document.getElementById("avisos-cheia");
  if (cheia) cheia.innerHTML = "";
}

/* ═══ Consentimento ═══════════════════════════════════════════════════════
   Ato afirmativo ANTES da primeira foto. A tela de boas-vindas explica o
   valor; esta pede permissão — são coisas diferentes e não podem virar o
   mesmo botão.

   Data E versão vão para o banco. "O usuário aceitou" não demonstra nada
   seis meses depois, quando o texto já mudou.                              */
const tm = {
  tela: $("termo"), itens: $("termo-itens"), ver: $("termo-ver"),
  completo: $("termo-completo"), aceitar: $("termo-aceitar"),
  recusar: $("termo-recusar"), verNaConta: $("conta-ver-termo"),
};

function pintarTermo() {
  if (tm.itens.childElementCount) return;
  tm.itens.innerHTML = TERMO.resumo.map(([ic, titulo, texto]) => `
    <div class="termo-item">
      <div class="ic">${ic}</div>
      <div><b>${titulo}</b><span>${texto}</span></div>
    </div>`).join("");
  tm.completo.textContent = TERMO.completo;
}

const jaAceitou = () => !!usuario?.termo_aceito_em;

function abrirTermo(somenteLeitura = false) {
  pintarTermo();
  tm.aceitar.classList.toggle("escondido", somenteLeitura);
  tm.recusar.textContent = somenteLeitura ? "Fechar" : "Não aceito";
  tm.tela.classList.remove("escondido");
}

async function registrarAceite() {
  tm.aceitar.disabled = true;
  tm.aceitar.textContent = "Guardando…";
  try {
    // upsert e não update: update sem linha correspondente não é erro para o
    // Postgres — afeta zero linhas e volta em silêncio. Foi assim que um
    // aceite "deu certo" sem nada ter sido gravado.
    const { data, error } = await sb.from("pacientes_app").upsert({
      id: usuario.id,
      termo_aceito_em: new Date().toISOString(),
      termo_versao: TERMO.versao,
    }, { onConflict: "id" }).select("termo_aceito_em").single();
    if (error) throw error;
    if (!data?.termo_aceito_em) throw new Error("o aceite não foi gravado");
    usuario.termo_aceito_em = data.termo_aceito_em;
    tm.tela.classList.add("escondido");
  } catch (e) {
    aviso(explicar(e), "erro");
  } finally {
    tm.aceitar.disabled = false;
    tm.aceitar.textContent = "Aceito e quero começar";
  }
}

tm.ver.onclick = () => {
  const aberto = tm.completo.style.display === "block";
  tm.completo.style.display = aberto ? "none" : "block";
  tm.ver.textContent = aberto ? "Ler o texto completo ▾" : "Esconder o texto ▴";
};
tm.aceitar.onclick = registrarAceite;
tm.recusar.onclick = () => {
  if (tm.aceitar.classList.contains("escondido")) {
    tm.tela.classList.add("escondido");   // era só leitura
    return;
  }
  // Recusar é legítimo e precisa ter saída digna — não um beco sem botão.
  tm.itens.innerHTML = `<div class="termo-item">
    <div class="ic">🤝</div>
    <div><b>Tudo bem</b><span>Sem o seu aceite não dá para guardar documentos,
      porque eles são dados de saúde e a lei exige a sua autorização.
      Mudando de ideia, é só voltar aqui.</span></div></div>`;
  tm.completo.style.display = "none";
  tm.ver.classList.add("escondido");
  tm.aceitar.textContent = "Reconsiderar e aceitar";
  tm.aceitar.onclick = () => { tm.itens.innerHTML = ""; tm.ver.classList.remove("escondido");
                               tm.aceitar.onclick = registrarAceite;
                               tm.aceitar.textContent = "Aceito e quero começar";
                               pintarTermo(); };
  tm.recusar.textContent = "Fechar";
  tm.recusar.onclick = () => tm.tela.classList.add("escondido");
};
tm.verNaConta.onclick = () => { ct.tela.classList.add("escondido"); abrirTermo(true); };


/* ── Sessão ───────────────────────────────────────────────────────────────
   Sessão anônima na primeira aberta: o app deixa fotografar antes de pedir
   cadastro. Pedir login antes de entregar valor é onde esse tipo de app
   morre. O e-mail entra depois, quando a pessoa já tem o que perder.        */
async function entrar() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    usuario = session.user;
  } else {
    // Com CAPTCHA configurado, a sessão anônima só nasce com o token. Sem
    // chave, nada muda — o app segue entrando direto, como sempre.
    const captcha = await tokenCaptcha();
    const { data, error } = await sb.auth.signInAnonymously(
      captcha ? { options: { captchaToken: captcha } } : undefined);
    if (error) {
      aviso("Ligue <b>Anonymous Sign-ins</b> em Authentication → Providers no "
          + "painel do Supabase e recarregue a página.", "erro",
          "Não consegui abrir sua conta");
      return false;
    }
    usuario = data.user;
  }
  // SEMPRE, e não só na sessão nova. Saindo daqui cedo por já haver sessão,
  // o aceite do termo nunca era lido de volta — e o paciente veria a tela de
  // consentimento a cada abertura, como se nunca tivesse aceitado. Pior: uma
  // sessão criada por fora fica sem linha em pacientes_app, e aí todo insert
  // de documento cai por chave estrangeira depois da foto tirada.
  await carregarPerfil();
  return true;
}

async function carregarPerfil() {
  const { data, error } = await sb.from("pacientes_app")
    .upsert({ id: usuario.id }, { onConflict: "id" })
    .select("termo_aceito_em, termo_versao").single();
  if (error) { console.warn("[perfil]", error.message); return; }
  usuario.termo_aceito_em = data?.termo_aceito_em || null;
  usuario.termo_versao = data?.termo_versao || null;
}

/* ═══ Recorte de margens ══════════════════════════════════════════════════
   Cortar a mesa em volta do papel faz duas coisas ao mesmo tempo: o
   documento passa a ocupar os 1600px inteiros (letra maior) e o arquivo
   encolhe. É o único ajuste que melhora custo e legibilidade junto.

   A marca é guardada em FRAÇÕES da imagem, não em pixels de tela — assim
   ela vale igual no celular pequeno e no tablet.                            */
let rectAtual = null;
let resolverRecorte = null;
let giro = 0;                 // 0, 90, 180 ou 270 — graus no sentido horário
let natural = { l: 0, a: 0 }; // tamanho do JPEG de trabalho, sem girar

/* Recalcula a área, a imagem e a moldura para o giro atual.

   Tudo o que a tela mede — inclusive as frações que vão para o worker —
   passa a ser do quadro GIRADO. Assim o usuário marca o que vê, e nada no
   caminho precisa converter coordenadas de volta. */
function ajustarTela(preservarMarca) {
  const palco = el.recortePalco.getBoundingClientRect();
  const trocado = giro % 180 !== 0;
  const visL = trocado ? natural.a : natural.l;
  const visA = trocado ? natural.l : natural.a;
  if (!visL || !visA || !palco.width || !palco.height) return;

  const escala = Math.min(palco.width / visL, palco.height / visA);
  const areaL = Math.round(visL * escala), areaA = Math.round(visA * escala);
  el.recorteArea.style.width = areaL + "px";
  el.recorteArea.style.height = areaA + "px";
  // A imagem mantém o tamanho SEM giro; a rotação é que a encaixa na área.
  el.recorteImg.style.width = Math.round(natural.l * escala) + "px";
  el.recorteImg.style.height = Math.round(natural.a * escala) + "px";
  el.recorteImg.style.transform = `translate(-50%,-50%) rotate(${giro}deg)`;

  // Quadro deitado quase sempre é documento em pé fotografado de lado —
  // o caso que a medição mostrou custar a leitura da data.
  el.recorteDicaGirar.classList.toggle("escondido", visL <= visA);

  // Margem de 6%: sugere o corte sem esconder nada, e deixa claro que a
  // moldura se mexe. Num giro ela reinicia, porque o quadro mudou de
  // sentido; num redimensionamento ela é preservada.
  const r = preservarMarca && rectAtual
    ? rectAtual : { x: 0.06, y: 0.06, l: 0.88, a: 0.88 };
  posicionar(areaL * r.x, areaA * r.y, areaL * r.l, areaA * r.a);
}

function abrirRecorte(urlPreview, titulo, dims) {
  return new Promise((resolve) => {
    resolverRecorte = resolve;
    giro = 0;
    natural = { l: dims.l, a: dims.a };
    el.recorteTitulo.textContent = titulo;
    el.recorteImg.src = urlPreview;
    el.telaRecorte.classList.remove("escondido");
    // O palco só tem altura depois de a tela sair de `escondido`; por isso
    // o ajuste vem aqui, e não antes.
    el.recorteImg.onload = () => ajustarTela(false);
  });
}

el.recorteGirar.onclick = () => {
  giro = (giro + 90) % 360;
  ajustarTela(false);
};

// Virar o celular com a tela de recorte aberta muda o palco. Sem isto a
// moldura fica descolada da imagem — e ela é a única referência do corte.
window.addEventListener("resize", () => {
  if (!el.telaRecorte.classList.contains("escondido")) ajustarTela(true);
});

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
  // O giro viaja junto do rect: os dois descrevem o mesmo quadro, e separá-los
  // abriria espaço para aplicar um sem o outro.
  r?.(rect ? { rect, giro } : null);
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

  // Grava na fila ANTES de tentar subir. Para o paciente, tocar em Guardar
  // guarda — o envio é problema do app a partir daqui.
  const entrada = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    paciente_id: usuario.id,
    tipo: el.tipo.value,
    nome: (el.nome.value || "").trim() || ROTULOS[el.tipo.value],
    data_documento: el.data.value || null,
    criado_em: new Date().toISOString(),
    documento_id: null,
    paginas: rascunho.map((p) => ({
      blob: p.blob, largura: p.largura, altura: p.altura, enviada: false,
    })),
  };

  try {
    await FilaDB.guardar(entrada);
  } catch (e) {
    console.error(e);
    aviso("Não consegui guardar no celular. Se o armazenamento estiver cheio, "
        + "libere espaço e tente de novo.", "erro", "Documento não guardado");
    el.salvar.disabled = false;
    el.salvar.textContent = "Guardar documento";
    return;
  }

  cancelar();
  el.salvar.disabled = false;
  el.salvar.textContent = "Guardar documento";
  // Acabou de guardar: MOSTRE o que ela guardou. Com um filtro ligado, o
  // documento novo pode nao casar com ele e some da tela — e ela conclui
  // que a foto se perdeu. Foi exatamente o que aconteceu com um documento
  // salvo sem nome: ele vira "Exame", nao cai em regiao nenhuma do boneco,
  // e ficou invisivel atras do filtro que estava ligado.
  regiaoAtiva = null;
  el.busca.value = "";
  el.filtroTipo.value = "";
  await carregar();
  await enviarFila();
  convidarAProteger();
}


/* ═══ Mostrar ao médico ═══════════════════════════════════════════════════
   As duas metades da mesma promessa do termo, na mesma tela:

     "será você quem gera um código dentro do aplicativo e o entrega a ele"
     "você pode ver, a qualquer momento, quem abriu seu acervo e quando,
      e pode cancelar acessos"

   Juntas porque respondem a mesma pergunta — quem vê os meus documentos.
   Separadas, a segunda nunca seria encontrada, e ela é a que sustenta o
   consentimento: autorização sem como cancelar não é autorização.         */
const mv = {
  botao: $("btn-mostrar"), tela: $("tela-mostrar"), fechar: $("mostrar-fechar"),
  gerar: $("mv-gerar"), pronto: $("mv-pronto"), codigo: $("mv-codigo"),
  prazo: $("mv-prazo"), url: $("mv-url"), acessos: $("mv-acessos"),
};

// O endereço que o médico digita. Sai do próprio endereço do aplicativo:
// cravá-lo aqui faria a tela mentir no dia em que o site mudar de lugar.
const URL_MEDICO = new URL("medico/", location.href.replace(/[^/]*$/, "")).href;

mv.botao.onclick = () => {
  mv.tela.classList.remove("escondido");
  mv.pronto.classList.add("escondido");
  mv.gerar.disabled = false;
  mv.gerar.textContent = "Gerar código para o médico";
  mv.url.textContent = URL_MEDICO.replace(/^https?:\/\//, "");
  listarAcessos();
};
mv.fechar.onclick = () => { mv.tela.classList.add("escondido"); limparAvisos(); };

mv.gerar.onclick = async () => {
  if (!navigator.onLine) {
    return aviso("Gerar o código precisa de internet — é o servidor que "
                 + "reconhece o número quando o médico digitar.", "info", "Sem conexão");
  }
  mv.gerar.disabled = true;
  mv.gerar.textContent = "Gerando…";
  try {
    const { data, error } = await sb.rpc("gerar_liberacao", { minutos: 15 });
    if (error) throw error;
    const lib = Array.isArray(data) ? data[0] : data;
    // Espaço no meio: seis dígitos corridos se lêem errado em voz alta, e
    // quem digita do outro lado não tem como conferir onde parou.
    mv.codigo.textContent = String(lib.codigo).replace(/(\d{3})(\d{3})/, "$1 $2");
    mv.prazo.textContent = "Vale até " + horaBR(lib.expira_em)
      + " · depois disso, gere outro";
    mv.pronto.classList.remove("escondido");
    mv.gerar.textContent = "Gerar outro código";
    mv.gerar.disabled = false;
    listarAcessos();
  } catch (e) {
    console.warn("[liberacao]", e?.message || e);
    aviso("Não consegui gerar o código agora. Tente de novo em instantes.", "erro");
    mv.gerar.disabled = false;
    mv.gerar.textContent = "Gerar código para o médico";
  }
};

function horaBR(iso) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR",
      { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return "daqui a pouco"; }
}

function quandoBR(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}

/* A lista mostra SÓ quem chegou a abrir. Código gerado e não usado não é
   acesso — é papel rasgado, e enchê-la deles faria a pessoa parar de olhar
   justamente a lista que precisa olhar. */
async function listarAcessos() {
  mv.acessos.innerHTML = '<div class="mv-nenhum">Carregando…</div>';
  const { data, error } = await sb.from("liberacoes")
    .select("id, medico_nome, medico_crm, usado_em, expira_em, revogado_em")
    .not("usado_em", "is", null)
    .order("usado_em", { ascending: false });
  if (error) {
    mv.acessos.innerHTML = '<div class="mv-nenhum">Não consegui ler agora.</div>';
    return;
  }
  const usados = data || [];
  if (!usados.length) {
    mv.acessos.innerHTML = '<div class="mv-nenhum">Ninguém abriu seu acervo ainda.'
      + "<br>Quando um médico usar um código, ele aparece aqui com nome e hora.</div>";
    return;
  }
  mv.acessos.innerHTML = "";
  for (const a of usados) {
    const vivo = !a.revogado_em && new Date(a.expira_em) > new Date();
    const div = document.createElement("div");
    div.className = "acesso" + (vivo ? "" : " morto");
    const estado = a.revogado_em ? "acesso cancelado por você"
      : vivo ? "pode ver até " + horaBR(a.expira_em) : "acesso encerrado";
    div.innerHTML = `
      <div class="quem">
        <div class="nome">${a.medico_nome || "Médico não identificado"}${
          a.medico_crm ? " · CRM " + a.medico_crm : ""}</div>
        <div class="quando">Abriu em ${quandoBR(a.usado_em)} · ${estado}</div>
      </div>`;
    if (vivo) {
      const b = document.createElement("button");
      b.className = "revogar";
      b.textContent = "Cancelar";
      b.onclick = () => revogar(a);
      div.appendChild(b);
    }
    mv.acessos.appendChild(div);
  }
}

async function revogar(a) {
  if (!confirm(`Cancelar o acesso de ${a.medico_nome || "este médico"}?`
               + LINHA + LINHA
               + "Ele deixa de ver seus documentos imediatamente.")) return;
  // `update`, nunca `delete`: a linha é o registro de consentimento, e a
  // prova de que alguém viu não pode sumir porque o acesso acabou. É por
  // isso que `liberacoes` não tem política de exclusão.
  const { error } = await sb.from("liberacoes")
    .update({ revogado_em: new Date().toISOString() }).eq("id", a.id);
  if (error) {
    console.warn("[revogar]", error.message);
    return aviso("Não consegui cancelar agora. Tente de novo.", "erro");
  }
  aviso("Acesso cancelado.", "ok");
  listarAcessos();
}

/* ═══ Envio da fila ═══════════════════════════════════════════════════════
   Retoma de onde parou. `documento_id` é gravado assim que o documento nasce
   no servidor, e cada página é marcada ao subir — sem isso, uma queda no meio
   faria a próxima tentativa criar um documento duplicado com metade das
   folhas.

   O upsert por `storage_path` fecha a última brecha: se a linha da página
   subiu mas o app caiu antes de marcar, a repetição não estoura em chave
   duplicada.                                                               */
let enviando = false;

async function enviarFila() {
  if (enviando || !usuario) return;
  enviando = true;
  try {
    const pendentes = await FilaDB.listar(usuario.id);
    for (const entrada of pendentes) {
      try {
        if (!entrada.documento_id) {
          const { data, error } = await sb.from("documentos").insert({
            paciente_id: usuario.id,
            tipo: entrada.tipo,
            nome: entrada.nome,
            data_documento: entrada.data_documento,
          }).select("id").single();
          if (error) throw error;
          entrada.documento_id = data.id;
          await FilaDB.guardar(entrada);
        }

        for (let i = 0; i < entrada.paginas.length; i++) {
          const pag = entrada.paginas[i];
          if (pag.enviada) continue;
          const caminho = `${usuario.id}/${entrada.documento_id}/${i + 1}.jpg`;

          const { error: e2 } = await sb.storage.from("documentos")
            .upload(caminho, pag.blob, { contentType: "image/jpeg", upsert: true });
          if (e2) throw e2;

          const { error: e3 } = await sb.from("documento_paginas").upsert({
            documento_id: entrada.documento_id, ordem: i + 1, storage_path: caminho,
            bytes: pag.blob.size, largura: pag.largura, altura: pag.altura,
          }, { onConflict: "storage_path" });
          if (e3) throw e3;

          pag.enviada = true;
          await FilaDB.guardar(entrada);
        }

        await FilaDB.remover(entrada.id);
      } catch (e) {
        // Falhou este: para a rodada. Tentar os próximos com a internet caída
        // só gasta bateria e enche o console.
        console.warn("[fila] pendente", entrada.id, e.message || e);
        break;
      }
    }
  } finally {
    enviando = false;
  }
  await carregar();
}

// Três gatilhos, porque são três realidades: a conexão que volta, o app que
// é reaberto, e a espera longa com o app na tela.
window.addEventListener("online", () => { enviarFila(); sincronizarAgenda(); });
setInterval(() => { if (navigator.onLine) { enviarFila(); sincronizarAgenda(); } }, 60000);

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

/* ═══ Agenda ══════════════════════════════════════════════════════════════
   Local-first: a tela lê SEMPRE de `compromissos`, que vem do celular. A
   rede só mexe nisso em segundo plano.                                     */
let compromissos = [];
let compEditando = null;

const ROTULO_TIPO = { consulta: "Consulta", retorno: "Retorno",
                      exame: "Exame", outro: "Compromisso" };

/* SOBE ANTES DE DESCER, sempre. Descer primeiro sobrescreveria com a versão
   do servidor aquilo que a pessoa acabou de escrever offline — e ela não
   teria como saber que perdeu. Mesmo princípio do sync do Indiclin.        */
async function sincronizarAgenda() {
  if (!usuario) return;
  let locais = [];
  try { locais = await AgendaDB.todos(); } catch (e) { return; }
  const meus = locais.filter((c) => c.paciente_id === usuario.id);

  if (navigator.onLine) {
    for (const c of meus.filter((x) => x.pendente || x.apagado)) {
      try {
        if (c.apagado) {
          const { error } = await sb.from("compromissos").delete().eq("id", c.id);
          if (error) throw error;
          // Só agora a lápide some: enquanto o servidor não confirmar, ela
          // precisa continuar aqui para a linha não ressuscitar na descida.
          await AgendaDB.remover(c.id);
        } else {
          const { pendente, apagado, ...linha } = c;
          const { error } = await sb.from("compromissos").upsert(linha);
          if (error) throw error;
          await AgendaDB.guardar({ ...c, pendente: false });
        }
      } catch (e) {
        console.warn("[agenda] pendente", c.id, e?.message || e);
        break;   // falhou um, para a rodada: os próximos falhariam igual
      }
    }

    try {
      const { data, error } = await sb.from("compromissos").select("*");
      if (!error && data) {
        const agora = await AgendaDB.todos();
        const local = new Map(agora.map((c) => [c.id, c]));
        for (const linha of data) {
          const meu = local.get(linha.id);
          // Trabalho local ainda não confirmado VENCE o servidor: ele é mais
          // novo por definição, e o servidor ainda não o viu.
          if (meu && (meu.pendente || meu.apagado)) continue;
          await AgendaDB.guardar({ ...linha, pendente: false });
        }
        // Some daqui o que sumiu de lá (apagado noutro aparelho).
        const doServidor = new Set(data.map((l) => l.id));
        for (const c of agora) {
          if (c.paciente_id === usuario.id && !c.pendente && !c.apagado
              && !doServidor.has(c.id)) await AgendaDB.remover(c.id);
        }
      }
    } catch (e) { console.warn("[agenda] descida", e?.message || e); }
  }

  try { compromissos = await AgendaDB.listar(usuario.id); } catch (e) { /* vazio */ }
  desenharAgenda();
}

function desenharAgenda() {
  const prox = proximosCompromissos(compromissos);
  el.agenda.classList.toggle("escondido", !usuario);
  el.agendaItens.innerHTML = "";
  if (!prox.length) {
    el.agendaMais.textContent = compromissos.length
      ? "+ Marcar consulta ou exame"
      : "+ Marcar uma consulta ou exame";
    return;
  }
  el.agendaMais.textContent = "+ Marcar outro";

  for (const c of prox) {
    const f = comoFalta(diasAte(c.quando));
    const div = document.createElement("div");
    div.className = "comp " + f.urgencia;
    const detalhes = [dataBR(c.quando), c.hora || "", c.onde || ""]
      .filter(Boolean).join(" · ");
    div.innerHTML = `
      <div class="txt">
        <div class="quando">${f.texto}</div>
        <div class="nome">${c.titulo}</div>
        <div class="det">${ROTULO_TIPO[c.tipo] || ""}${detalhes ? " · " + detalhes : ""}</div>
      </div>`;
    // Só o que já passou ou é HOJE ganha "Já foi". A urgência não serve para
    // decidir isto: ela junta hoje e amanhã na mesma cor (as duas merecem
    // destaque), e amanhã ganhava um botão para marcar como realizado o que
    // ainda não aconteceu. Aqui a conta é a de dias, não a da cor.
    if (diasAte(c.quando) <= 0) {
      const b = document.createElement("button");
      b.className = "feito";
      b.textContent = "Já foi";
      b.onclick = (e) => { e.stopPropagation(); marcarFeito(c); };
      div.appendChild(b);
    }
    div.onclick = () => abrirCompromisso(c);
    el.agendaItens.appendChild(div);
  }
}

/* Marcar como feito, e — se a pessoa pediu repetição — oferecer o próximo.
   OFERECER, não criar sozinho: a periodicidade é a decisão dela, e o médico
   pode ter mudado o intervalo na consulta que ela acabou de sair.          */
async function marcarFeito(c) {
  await salvarCompromisso({ ...c, feito_em: new Date().toISOString() });
  if (!c.repetir_meses) return aviso("Marcado como feito.", "ok");
  const proxima = somarMeses(c.quando, c.repetir_meses);
  if (confirm(`Marcar o próximo "${c.titulo}" para ${dataBR(proxima)}?`
              + LINHA + LINHA + "Você pode mudar a data depois.")) {
    await salvarCompromisso({
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      paciente_id: usuario.id, tipo: c.tipo, titulo: c.titulo,
      quando: proxima, hora: c.hora || null, onde: c.onde || null,
      repetir_meses: c.repetir_meses, feito_em: null,
      criado_em: new Date().toISOString(),
    });
    aviso(`Próximo marcado para ${dataBR(proxima)}.`, "ok");
  }
}

/* Grava LOCAL e sobe em paralelo. Não é "grava e envia quando reconectar":
   envia agora, e a marca `pendente` existe só para a falha.                */
async function salvarCompromisso(c) {
  const linha = { ...c, atualizado_em: new Date().toISOString(), pendente: true };
  await AgendaDB.guardar(linha);
  compromissos = await AgendaDB.listar(usuario.id);
  desenharAgenda();
  sincronizarAgenda();
}

async function apagarCompromisso(id) {
  const c = compromissos.find((x) => x.id === id);
  if (!c) return;
  // Lápide, não remoção: apagar só aqui faria a linha ressuscitar na próxima
  // descida do servidor.
  await AgendaDB.guardar({ ...c, apagado: true, pendente: true });
  compromissos = await AgendaDB.listar(usuario.id);
  desenharAgenda();
  sincronizarAgenda();
}

/* ── A tela de marcar ─────────────────────────────────────────────────── */
function abrirCompromisso(c, sugestao) {
  compEditando = c || null;
  cp.tituloTela.textContent = c ? "Compromisso" : "Marcar";
  cp.tipo.value = (c && c.tipo) || (sugestao && sugestao.tipo) || "consulta";
  cp.nome.value = (c && c.titulo) || (sugestao && sugestao.titulo) || "";
  cp.data.value = (c && c.quando) || "";
  cp.hora.value = (c && c.hora) || "";
  cp.onde.value = (c && c.onde) || "";
  cp.repetir.value = (c && c.repetir_meses) ? String(c.repetir_meses) : "";
  cp.apagar.classList.toggle("escondido", !c);
  limparAvisos();
  el.telaCompromisso.classList.remove("escondido");
  if (!c) setTimeout(() => cp.nome.focus(), 120);
}

function fecharCompromisso() {
  el.telaCompromisso.classList.add("escondido");
  // Sem isto, o "falta a data" ficaria pendurado no container flutuante e
  // reapareceria sobre a proxima tela cheia que abrisse.
  limparAvisos();
  compEditando = null;
}

cp.cancelar.onclick = fecharCompromisso;
cp.salvar.onclick = async () => {
  limparAvisos();
  const titulo = (cp.nome.value || "").trim() || ROTULO_TIPO[cp.tipo.value];
  if (!cp.data.value) {
    aviso("Escolha a data do compromisso.", "erro", "Falta a data");
    // Abre o seletor no proprio campo: a mensagem diz o que falta, e isto
    // leva a pessoa ate la sem ela ter de procurar.
    cp.data.focus();
    if (cp.data.showPicker) { try { cp.data.showPicker(); } catch (e) { /* ignora */ } }
    return;
  }
  const base = compEditando || {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    paciente_id: usuario.id, feito_em: null,
    criado_em: new Date().toISOString(),
  };
  await salvarCompromisso({
    ...base, tipo: cp.tipo.value, titulo, quando: cp.data.value,
    hora: cp.hora.value || null, onde: (cp.onde.value || "").trim() || null,
    repetir_meses: cp.repetir.value ? Number(cp.repetir.value) : null,
  });
  fecharCompromisso();
  aviso("Compromisso guardado.", "ok");
};
cp.apagar.onclick = async () => {
  if (!compEditando) return;
  if (!confirm(`Apagar "${compEditando.titulo}"?`)) return;
  await apagarCompromisso(compEditando.id);
  fecharCompromisso();
};
el.agendaMais.onclick = () => abrirCompromisso(null);

/* ═══ Visualizador ════════════════════════════════════════════════════════
   Sem esta tela, tocar na miniatura não fazia nada e o toque longo abria o
   menu do Chrome — "abrir imagem", "baixar", "compartilhar". O documento é
   do paciente, e quem manda nele deve ser o app, não o navegador.           */
let visuPaginas = [], visuIndice = 0;
// De onde veio a pagina aberta. O giro precisa saber: documento guardado se
// regrava no servidor, pendente se regrava no IndexedDB, e sem isso o botao
// nao teria onde escrever.
let visuOrigem = null;      // "documento" | "pendente"
let visuCaminhos = [];      // storage_path de cada pagina (so em documento)
let visuEntrada = null;     // a entrada da fila (so em pendente)
let visuDoc = null;         // o documento aberto (so em documento)
// O blob como estava quando o visualizador abriu. Girar SEMPRE parte daqui,
// nunca do resultado do giro anterior: cada toque seria uma recodificacao
// JPEG em cima da outra, e quatro toques (que voltam a orientacao original)
// deixariam a imagem visivelmente pior do que comecou.
let visuOriginal = new Map();
/* Capa recem-girada, por storage_path. A miniatura da lista vem por URL
   assinada, e duas assinaturas pedidas no mesmo segundo saem iguais — o
   navegador serviria a imagem antiga do cache e a lista mostraria a pagina
   ainda deitada enquanto o visualizador ja a mostra em pe. Guardar o arquivo
   local tira a duvida e ainda aparece na hora, sem ida ao servidor. */
const capaLocal = new Map();

async function abrirDocumento(doc) {
  const paginas = (doc.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
  if (!paginas.length) return;
  visuTitulo(doc);
  el.telaVisu.classList.remove("escondido");
  el.visuImg.removeAttribute("src");

  // Uma hora de validade: tempo de sobra para olhar, e o link morre depois.
  // A imagem mora no servidor e vem por link assinado — sem internet não há
  // como buscá-la. Antes o visualizador abria preto, e tela preta sem
  // explicação o usuário lê como app quebrado.
  const { data, error } = await sb.storage.from("documentos")
    .createSignedUrls(paginas.map((p) => p.storage_path), 3600);
  visuPaginas = (data || []).map((d) => d.signedUrl).filter(Boolean);
  visuOrigem = "documento";
  visuCaminhos = paginas.map((p) => p.storage_path);
  visuDoc = doc;
  visuEntrada = null;
  visuOriginal.clear();
  if (!visuPaginas.length) {
    el.telaVisu.classList.add("escondido");
    console.warn("[visualizador]", error?.message || "sem urls");
    aviso(navigator.onLine
      ? "Não consegui abrir as imagens agora. Tente de novo em instantes."
      : "Este documento está guardado na nuvem e precisa de internet para ser "
        + "aberto. Ele não foi perdido — volta assim que a conexão voltar.",
      "info", "Sem conexão");
    return;
  }
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
  visuOrigem = null; visuCaminhos = []; visuEntrada = null; visuDoc = null;
  visuOriginal.clear();
};
/* ── Girar uma página já guardada ──────────────────────────────────────
   Gira 90° por toque e REGRAVA. O recorte não tem equivalente aqui de
   propósito: o original de 12 MP morre no celular logo depois da foto, então
   um segundo recorte só cortaria mais de uma imagem que já está em 1600px —
   prometeria reenquadrar e entregaria encolher. Girar não perde nada: é
   rearranjo de pixels, e o único custo é recodificar o JPEG uma vez.        */
async function girarPaginaAberta() {
  if (!visuPaginas.length || !visuOrigem) return;
  const i = visuIndice;

  el.visuGirar.disabled = true;
  try {
    // Sempre a partir do blob como estava ao abrir a tela: ver o comentário
    // de visuOriginal. Na primeira vez ele é buscado e fica guardado.
    let base = visuOriginal.get(i);
    if (!base) {
      const bruto = visuOrigem === "pendente"
        ? visuEntrada.paginas[i].blob
        : await (await fetch(visuPaginas[i])).blob();
      base = { blob: bruto, giro: 0 };
      visuOriginal.set(i, base);
    }
    base.giro = (base.giro + 90) % 360;

    const fim = await pedirAoWorker({
      tipo: "final", blob: base.blob, rect: { x: 0, y: 0, l: 1, a: 1 },
      giro: base.giro, lado: CONFIG.LADO_MAXIMO, qualidade: CONFIG.QUALIDADE,
    });

    if (visuOrigem === "pendente") {
      // Ainda não subiu: o lugar dela é o IndexedDB, e girar funciona offline.
      const pag = visuEntrada.paginas[i];
      pag.blob = fim.blob; pag.largura = fim.largura; pag.altura = fim.altura;
      await FilaDB.guardar(visuEntrada);
    } else {
      if (!navigator.onLine) {
        base.giro = (base.giro + 270) % 360;   // desfaz: nada foi gravado
        return aviso("Girar um documento já guardado precisa de internet. "
                     + "A imagem está no servidor.", "info", "Sem conexão");
      }
      const caminho = visuCaminhos[i];
      const { error } = await sb.storage.from("documentos")
        .upload(caminho, fim.blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      // bytes alimenta o contador de consumo, que é a base do limite
      // gratuito: deixá-lo desatualizado faria o teto contar o tamanho errado.
      await sb.from("documento_paginas")
        .update({ bytes: fim.blob.size, largura: fim.largura, altura: fim.altura })
        .eq("storage_path", caminho);
      // Só a primeira página vira capa na lista.
      if (i === 0) {
        const antiga = capaLocal.get(caminho);
        if (antiga) URL.revokeObjectURL(antiga);
        capaLocal.set(caminho, URL.createObjectURL(fim.blob));
      }
    }

    // Mostra o resultado do arquivo local, não do link assinado: o link
    // devolveria a versão em cache e o giro pareceria não ter acontecido.
    if (visuPaginas[i].startsWith("blob:")) URL.revokeObjectURL(visuPaginas[i]);
    visuPaginas[i] = URL.createObjectURL(fim.blob);
    mostrarPagina();
    carregar();
  } catch (e) {
    // Erro do Supabase e objeto, e console.warn(obj) imprime "Object" — o
    // suficiente para saber que falhou e nada para saber por que.
    console.warn("[girar]", e?.message || e?.error || JSON.stringify(e));
    aviso("Não consegui girar esta página agora. Tente de novo.", "erro");
  } finally {
    el.visuGirar.disabled = false;
  }
}
el.visuGirar.onclick = girarPaginaAberta;

/* ── Apagar o documento aberto ─────────────────────────────────────────
   O termo de consentimento promete, com estas palavras: "Você apaga quando
   quiser. Qualquer documento, ou a conta inteira. Apagou, sai do servidor."
   Promessa escrita em termo de LGPD que o aplicativo não cumpre é pior que
   promessa não feita.

   ORDEM: as IMAGENS primeiro, a linha depois. Apagar a linha antes deixaria
   os JPEG no servidor sem ninguém que saiba o caminho deles — `meu_consumo`
   soma `bytes` das linhas, então eles nem apareceriam no contador, e
   "apagou, sai do servidor" seria falso sem ninguém notar. Na ordem certa,
   uma falha no meio deixa as imagens fora e a linha de pé: o documento
   continua na lista e apagar de novo termina o serviço — `remove` sobre
   arquivo que já não existe não reclama.                                  */
async function apagarDocumentoAberto() {
  if (!visuOrigem) return;
  const nome = el.visuTitulo.textContent || "este documento";
  const quantas = visuPaginas.length;

  // A quebra de linha vem de LINHA, nunca de escapada dentro de aspas:
  // uma quebra solta no meio de uma string e erro de sintaxe.
  const aviso1 = `Apagar "${nome}"${quantas > 1 ? ` e suas ${quantas} páginas` : ""}?`;
  const aviso2 = `Isto não pode ser desfeito. Se você tem o papel original, `
    + `ele continua com você — some apenas a cópia guardada aqui.`;
  if (!confirm(aviso1 + LINHA + LINHA + aviso2)) return;

  el.visuApagar.disabled = true;
  try {
    if (visuOrigem === "pendente") {
      // Ainda não subiu: existe só neste celular, e apagar funciona offline.
      await FilaDB.remover(visuEntrada.id);
    } else {
      if (!navigator.onLine) {
        return aviso("Apagar um documento guardado precisa de internet — ele "
                     + "está no servidor, não no celular.", "info", "Sem conexão");
      }
      const { error: e1 } = await sb.storage.from("documentos").remove(visuCaminhos);
      if (e1) throw e1;
      // A linha some com as páginas junto (on delete cascade).
      const { error: e2 } = await sb.from("documentos").delete().eq("id", visuDoc.id);
      if (e2) throw e2;
      for (const c of visuCaminhos) {
        const capa = capaLocal.get(c);
        if (capa) { URL.revokeObjectURL(capa); capaLocal.delete(c); }
      }
    }
    el.visuFechar.click();
    await carregar();
    aviso("Documento apagado.", "ok");
  } catch (e) {
    console.warn("[apagar]", e?.message || e?.error || JSON.stringify(e));
    aviso("Não consegui apagar agora. O documento continua guardado — "
          + "tente de novo em instantes.", "erro");
  } finally {
    el.visuApagar.disabled = false;
  }
}
el.visuApagar.onclick = apagarDocumentoAberto;

// Toque longo na imagem não abre o menu do navegador.
el.visuImg.addEventListener("contextmenu", (e) => e.preventDefault());

/* O pendente também abre: ele está guardado, e só não subiu ainda. Impedir
   de ver o que se acabou de fotografar faria o "aguardando envio" parecer
   perda. */
function abrirPendente(entrada) {
  el.visuTitulo.textContent = entrada.nome || ROTULOS[entrada.tipo];
  el.telaVisu.classList.remove("escondido");
  visuPaginas = entrada.paginas.map((p) => URL.createObjectURL(p.blob));
  visuOrigem = "pendente";
  visuEntrada = entrada;
  visuDoc = null;
  visuCaminhos = [];
  visuOriginal.clear();
  visuIndice = 0;
  mostrarPagina();
}

/* ── Lista ────────────────────────────────────────────────────────────── */
async function carregar() {
  // A FILA PRIMEIRO, e sem depender da rede. Lendo o servidor antes e
  // desistindo no erro, era exatamente sem internet — quando a fila importa —
  // que ela deixava de ser desenhada: a tela congelava no estado anterior e o
  // documento recém-guardado sumia de vista.
  try {
    naFila = await FilaDB.listar(usuario?.id);
  } catch (e) {
    naFila = [];
  }

  const { data, error } = await sb.from("documentos")
    .select("id, tipo, nome, data_documento, criado_em, documento_paginas(storage_path, ordem)")
    .order("criado_em", { ascending: false });
  // Falhou a leitura: mantém o que já estava carregado em vez de esvaziar a
  // lista. Sumir com o acervo por causa de um sinal ruim assusta sem motivo.
  if (error) console.warn("[lista]", error.message || error);
  else documentos = data || [];

  await lerConsumo();
  desenharLista();
  // A agenda anda junto da lista, e nao numa chamada propria: sao os mesmos
  // tres momentos (abrir, voltar a conexao, o minuto) e um so lugar para
  // lembrar deles.
  sincronizarAgenda();
  const total = documentos.length + naFila.length;
  el.sub.textContent = total
    ? `${total} documento${total > 1 ? "s" : ""} guardado${total > 1 ? "s" : ""}`
      + (naFila.length ? ` · ${naFila.length} aguardando envio` : "")
    : "exames, laudos e receitas num lugar só";
}

function dataBR(iso) {
  if (!iso) return "sem data";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/* ── Busca ─────────────────────────────────────────────────────────────
   Procurar pelo NOME e o que realmente acha um documento. A categoria foi
   avaliada e descartada: a tabela de procedimentos do Indiclin joga 90% do
   laboratorio em "Patologia", palavra que paciente nenhum clica, e um eco e
   ao mesmo tempo imagem e coracao — eixo unico sempre erra um dos dois.
   "eco" acha o ecocardiograma sem discussao de taxonomia.

   Aparece assim que existe UM documento. A primeira versao so mostrava a
   caixa a partir de seis, com o argumento de que sobre tres itens ela e
   ruido — e o primeiro a usar o aplicativo perguntou onde ficava a busca.
   Esse e o teste que importa: controle escondido atras de limiar invisivel
   nao e discreto, e inexistente para quem nao sabe que ele vai nascer. O
   pouco de excesso com tres documentos custa menos que a funcao que ninguem
   descobre.                                                                 */
const MINIMO_BUSCA = 1;

/* Compara conteudo, nao grafia. Quem procura digita "colesterol" no celular,
   sem acento e em minusculas, e o documento se chama "COLESTEROL TOTAL E
   FRAÇÕES". Exigir que os dois coincidam mediria a paciencia de quem digita,
   nao a vontade de achar. */
let regiaoAtiva = null;

/* Acende o que tem documento e desenha as folhinhas.

   Conta sobre o acervo INTEIRO, nao sobre o que sobrou dos outros filtros:
   senao a regiao ativa se apagaria sozinha ao filtrar, e o paciente veria o
   proprio toque desaparecer. */
function pintarCorpo() {
  const todos = [...documentos, ...naFila];
  const conta = {};
  for (const d of todos) {
    for (const id of regioesDoDocumento(d)) conta[id] = (conta[id] || 0) + 1;
  }
  const algumaAcesa = REGIOES.some((r) => conta[r.id]);
  el.corpoBloco.classList.toggle("escondido", !algumaAcesa);

  for (const r of REGIOES.filter((x) => x.corpo)) {
    const alvo = el.corpo.querySelector(`[data-regiao="${r.id}"]`);
    if (!alvo) continue;
    const tem = !!conta[r.id];
    alvo.classList.toggle("tem", tem);
    alvo.classList.toggle("ativa", regiaoAtiva === r.id);
    // Regiao sem documento sai do alcance do toque e do leitor de tela:
    // botao que nao faz nada e pior que botao ausente.
    alvo.setAttribute("aria-hidden", tem ? "false" : "true");
    alvo.setAttribute("tabindex", tem ? "0" : "-1");
    alvo.setAttribute("aria-pressed", regiaoAtiva === r.id ? "true" : "false");
  }

  // A dica nomeia o que EXISTE, e muda quando ha filtro. Duas razoes:
  // mandar tocar numa regiao apagada ensina em um segundo que o recurso nao
  // funciona; e quem filtrou precisa de uma saida visivel — sem ela, "sumiu
  // metade dos meus documentos" e a leitura natural.
  if (regiaoAtiva) {
    const r = REGIOES.find((x) => x.id === regiaoAtiva);
    // Botao de SAIR, e nao so a instrucao "toque de novo". Soltar tocando na
    // mesma regiao exige lembrar em qual se tocou — e tocar noutra apenas
    // TROCA o filtro, nunca limpa. Sem uma saida explicita, quem escolheu
    // errado fica presto num acervo que parece ter encolhido.
    el.corpoDica.innerHTML = `Mostrando <b>${(r && r.rotulo) || ""}</b> `
      + `<button class="ver-todos" id="ver-todos">✕ ver todos</button>`;
    const b = document.getElementById("ver-todos");
    if (b) b.onclick = () => { regiaoAtiva = null; desenharLista(); };
  } else {
    // SO as regioes do corpo. A primeira versao listava as nove, folhinhas
    // inclusive, e ocupava tres linhas — mais dificil de ler que a propria
    // instrucao. As folhinhas ja trazem o nome escrito nelas; quem precisa
    // de legenda e o desenho.
    const nomes = REGIOES.filter((r) => r.corpo && conta[r.id])
      .map((r) => r.rotulo.toLowerCase());
    const lista = nomes.length > 1
      ? nomes.slice(0, -1).join(", ") + " ou " + nomes[nomes.length - 1]
      : nomes[0] || "";
    el.corpoDica.innerHTML = lista
      ? `Toque no corpo — <b>${lista}</b> — para ver só esses documentos`
      : `Toque num cartão para ver só esses documentos`;
  }

  el.folhinhas.innerHTML = "";
  for (const r of REGIOES.filter((x) => !x.corpo && conta[x.id])) {
    const b = document.createElement("button");
    b.className = "folhinha" + (regiaoAtiva === r.id ? " ativa" : "");
    b.setAttribute("aria-pressed", regiaoAtiva === r.id ? "true" : "false");
    b.dataset.regiao = r.id;
    b.innerHTML = `<span>${r.icone}</span><span>${r.rotulo}</span>`
                + `<span class="n">${conta[r.id]}</span>`;
    b.onclick = () => alternarRegiao(r.id);
    el.folhinhas.appendChild(b);
  }
}

/* Tocar de novo solta. Uma regiao por vez, de proposito: combinar peito com
   sangue devolveria a intersecao vazia com frequencia, e "sumiu tudo" e a
   forma mais rapida de o paciente concluir que o aplicativo quebrou. */
function alternarRegiao(id) {
  regiaoAtiva = regiaoAtiva === id ? null : id;
  desenharLista();
}

function desenharLista() {
  const tipo = el.filtroTipo.value;
  const ordem = el.filtroOrdem.value;
  const termos = termosDaBusca();

  // A caixa aparece pelo TOTAL do acervo, nao pelo que sobrou do filtro:
  // senao ela sumiria no meio de uma busca que nao achou nada, levando
  // embora o campo com o texto digitado.
  const total = documentos.length + naFila.length;
  el.buscaCaixa.classList.toggle("escondido",
    total < MINIMO_BUSCA && !termos.length);
  el.buscaCaixa.classList.toggle("tem-texto", !!el.busca.value);
  pintarCorpo();

  const naRegiao = (d) => !regiaoAtiva || regioesDoDocumento(d).has(regiaoAtiva);
  let lista = documentos.filter((d) =>
    (!tipo || d.tipo === tipo) && casaBusca(d, termos) && naRegiao(d));

  const quando = (d) => d.data_documento || d.criado_em;
  if (ordem === "antigo") lista.sort((a, b) => String(quando(a)).localeCompare(String(quando(b))));
  else if (ordem === "tipo") lista.sort((a, b) => a.tipo.localeCompare(b.tipo)
      || String(quando(b)).localeCompare(String(quando(a))));
  else lista.sort((a, b) => String(quando(b)).localeCompare(String(quando(a))));

  const pend = naFila.filter((e) =>
    (!tipo || e.tipo === tipo) && casaBusca(e, termos) && naRegiao(e));

  if (!lista.length && !pend.length) {
    // Tres situacoes diferentes, tres respostas. Dizer "nenhum documento"
    // para quem acabou de digitar uma palavra faz pensar que o acervo sumiu.
    let texto;
    if (termos.length) {
      texto = `Nada encontrado para <b>${el.busca.value}</b>.`
            + `<br><span style="font-size:13px">Procure por parte do nome, `
            + `pelo tipo (“receita”) ou pelo ano.</span>`;
    } else if (documentos.length || naFila.length) {
      texto = "Nenhum documento com esse filtro.";
    } else {
      texto = "Ainda não há nada guardado.<br>Comece fotografando um exame.";
    }
    el.lista.innerHTML = `<div class="vazio"><div class="icone">${
      termos.length ? "🔎" : "🗂️"}</div><p>${texto}</p></div>`;
    return;
  }

  el.lista.innerHTML = "";

  // Os que ainda não subiram vêm primeiro e dizem em que pé estão. O aviso é
  // tranquilizador de propósito: não há nada para o paciente fazer, e pedir
  // ação a quem não pode agir só gera ansiedade.
  for (const e of pend) {
    const div = document.createElement("div");
    div.className = "doc";
    const url = e.paginas[0] ? URL.createObjectURL(e.paginas[0].blob) : "";
    div.innerHTML = `
      <div class="capa">${url ? `<img src="${url}" alt="">` : (ICONES[e.tipo] || "📎")}</div>
      <div class="txt">
        <div class="nome">${e.nome || ROTULOS[e.tipo]}</div>
        <div class="meta">${ROTULOS[e.tipo]} · ${dataBR(e.data_documento || e.criado_em)}
          ${e.paginas.length > 1 ? " · " + e.paginas.length + " páginas" : ""}</div>
        <div class="fila">${navigator.onLine ? "⏳ enviando…"
          : "⏳ guardado no celular · envia quando a internet voltar"}</div>
      </div>`;
    div.onclick = () => abrirPendente(e);
    el.lista.appendChild(div);
  }
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
      const local = capaLocal.get(paginas[0].storage_path);
      if (local) {
        div.querySelector(".capa").innerHTML = `<img src="${local}" alt="">`;
      } else {
        sb.storage.from("documentos").createSignedUrl(paginas[0].storage_path, 3600)
          .then(({ data }) => {
            if (data?.signedUrl) {
              div.querySelector(".capa").innerHTML = `<img src="${data.signedUrl}" alt="">`;
            }
          });
      }
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

      const escolha = await abrirRecorte(
        urlPrev,
        arquivos.length > 1
          ? `Página ${rascunho.length + 1} — ajuste as margens`
          : "Ajuste as margens",
        { l: prep.largura, a: prep.altura });

      if (!escolha) { URL.revokeObjectURL(urlPrev); continue; }

      el.fotografar.textContent = "Finalizando…";
      const fim = await pedirAoWorker({
        tipo: "final", blob: prep.blob, rect: escolha.rect, giro: escolha.giro,
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
  // Boas-vindas explica o valor; o termo pede permissão. Nessa ordem, e
  // nunca no mesmo botão.
  if (usuario && !jaAceitou()) abrirTermo();
}

bv.instalar.onclick = pedirInstalacao;
bv.faixaBtn.onclick = pedirInstalacao;
bv.comecar.onclick = fecharBoasVindas;
bv.faixaFechar.onclick = () => {
  bv.faixa.classList.add("escondido");
  try { localStorage.setItem("faixa-instalar-nao", "1"); } catch (e) {}
};

/* ═══ Consumo ═════════════════════════════════════════════════════════════
   O teto é conferido no BANCO (sql/002_limites.sql) — no aplicativo ele seria
   contornável por quem tem a chave anônima. Aqui o número serve para avisar
   a tempo: descobrir o limite depois de fotografar seis folhas é a pior hora
   possível.                                                                 */
let consumo = { documentos: 0, teto: 100 };

async function lerConsumo() {
  try {
    const { data, error } = await sb.rpc("meu_consumo");
    if (error) throw error;
    const l = Array.isArray(data) ? data[0] : data;
    if (l) consumo = { documentos: l.documentos, teto: l.teto, bytes: l.bytes };
  } catch (e) {
    console.warn("[consumo]", e.message || e);
  }
}

function noLimite() {
  return consumo.teto && consumo.documentos + naFila.length >= consumo.teto;
}

function avisarSeApertando() {
  if (!consumo.teto) return;
  const usados = consumo.documentos + naFila.length;
  const restam = consumo.teto - usados;
  if (restam > 5 || restam < 0) return;
  aviso(restam <= 0
    ? "Você chegou ao limite de documentos guardados. Para guardar mais, apague "
      + "algum que não precise mais."
    : `Restam ${restam} documento(s) dentro do seu limite de ${consumo.teto}.`,
    restam <= 0 ? "erro" : "info");
}

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
  encerrar: $("conta-encerrar"),
  bvVoltar: $("bv-voltar"),
};

// `recuperando` distingue as duas jornadas que usam a MESMA tela: guardar o
// e-mail de quem já está aqui, e trazer de volta o acervo de quem chegou num
// celular novo. O código do Supabase é diferente em cada caso.
let recuperando = false;

// Ter e-mail não basta: entre o pedido e a confirmação, o Supabase já
// devolve o endereço como PENDENTE. Tratar isso como conta protegida
// mostraria "✅ acesso guardado" para quem ainda não confirmou nada.
const confirmado = (u) => !!(u?.email && (u.email_confirmed_at || u.confirmed_at));
const contaAnonima = () => !confirmado(usuario);

function pintarConta() {
  const rodape = ct.tela.querySelector(".conta-caixa > div:last-child");
  if (rodape && !rodape.dataset.versao) {
    rodape.dataset.versao = "1";
    rodape.insertAdjacentHTML("beforeend",
      `<br><span style="opacity:.55">versão ${VERSAO_APP}</span>`);
  }
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

  const uso = ct.tela.querySelector("#conta-uso");
  if (uso && consumo.teto) {
    const usados = consumo.documentos + naFila.length;
    uso.innerHTML = `<b>${usados} de ${consumo.teto} documentos</b>`
      + (consumo.bytes ? ` · ${(consumo.bytes / 1048576).toFixed(1)} MB` : "");
  }
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
      // Com CAPTCHA ligado no Supabase, TODA porta de entrada passa a exigir
      // o token — inclusive esta. Sem o token aqui, ligar a proteção
      // quebraria justamente a recuperação de conta: a tela que a pessoa
      // procura no dia em que o celular quebrou.
      const captcha = await tokenCaptcha();
      const { error } = await sb.auth.signInWithOtp(
        captcha ? { email, options: { captchaToken: captcha } } : { email });
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

/* ── Encerrar a conta ──────────────────────────────────────────────────
   A outra metade de "você apaga quando quiser: qualquer documento, ou a
   conta inteira". Sem isto, o termo prometia uma saída que não existia.

   DUAS perguntas, e a segunda diz o número. "Apagar tudo?" é abstrato;
   "apagar seus 23 documentos?" é o que a pessoa de fato vai perder, e é a
   diferença entre confirmar por reflexo e confirmar por decisão. A palavra
   "sair" não aparece em lugar nenhum daqui: ela é o botão de cima, que não
   apaga nada, e confundir os dois é o erro caro desta tela.

   ORDEM, a mesma de apagar um documento e pela mesma razão: as IMAGENS
   primeiro, pelo cliente, e a conta por último. Apagar a conta antes
   deixaria os arquivos no servidor sem nenhuma sessão capaz de alcançá-los
   — ninguém mais poderia apagá-los, nem a própria pessoa. Por isso o RPC
   se RECUSA a encerrar enquanto sobrar arquivo: com a conta de pé, dá para
   tentar de novo.                                                         */
async function encerrarConta() {
  if (!usuario) return;
  if (!navigator.onLine) {
    return aviso("Encerrar a conta precisa de internet: seus documentos estão "
                 + "no servidor.", "info", "Sem conexão");
  }
  if (!confirm("Encerrar sua conta e apagar tudo o que está guardado?"
               + LINHA + LINHA
               + "Isto NÃO é o mesmo que sair do aplicativo. Não dá para "
               + "desfazer, e os documentos não voltam em nenhum celular.")) return;

  // Conta de verdade, do servidor e da fila: a segunda pergunta precisa
  // dizer o que se perde, não "tudo".
  let quantos = documentos.length + naFila.length;
  const aviso2 = quantos
    ? `Confirmar: apagar ${quantos} documento(s) e encerrar a conta?`
    : "Confirmar: encerrar a conta?";
  if (!confirm(aviso2 + LINHA + LINHA
               + "Se você tem os papéis originais, eles continuam com você.")) return;

  ct.encerrar.disabled = true;
  ct.encerrar.textContent = "Encerrando…";
  try {
    // 1. As imagens. Lista as pastas do próprio dono e remove em lote.
    const caminhos = [];
    const { data: pastas } = await sb.storage.from("documentos").list(usuario.id);
    for (const pasta of (pastas || [])) {
      const { data: arquivos } = await sb.storage.from("documentos")
        .list(`${usuario.id}/${pasta.name}`);
      for (const a of (arquivos || [])) caminhos.push(`${usuario.id}/${pasta.name}/${a.name}`);
    }
    if (caminhos.length) {
      const { error } = await sb.storage.from("documentos").remove(caminhos);
      if (error) throw error;
    }

    // 2. A conta. Derruba pacientes_app, documentos, páginas e liberações
    //    em cascata, e leva junto o e-mail guardado em auth.users.
    const { error: e2 } = await sb.rpc("encerrar_minha_conta");
    if (e2) throw e2;

    // 3. O que ficou neste celular. A fila é IndexedDB: sem limpá-la, o
    //    app tentaria subir para uma conta que não existe mais.
    try {
      for (const e of await FilaDB.listar(usuario.id)) await FilaDB.remover(e.id);
    } catch (e) { console.warn("[encerrar] fila", e?.message || e); }
    try { localStorage.clear(); } catch (e) { /* janela anônima */ }

    await sb.auth.signOut();
    location.reload();
  } catch (e) {
    const msg = e?.message || e?.error || JSON.stringify(e);
    console.warn("[encerrar]", msg);
    ct.encerrar.disabled = false;
    ct.encerrar.textContent = "Encerrar conta e apagar tudo";
    aviso(String(msg).includes("IMAGENS_PENDENTES")
      ? "Algumas imagens não puderam ser apagadas agora, então a conta "
        + "continua de pé — assim você pode tentar de novo. Nada foi perdido."
      : "Não consegui encerrar a conta agora. Nada foi apagado. Tente de "
        + "novo em instantes.", "erro");
  }
}
ct.encerrar.onclick = encerrarConta;

// Quem toca no link do e-mail em vez de digitar o código volta para cá com a
// sessão já trocada.
//
// A condição é estreita de propósito. `updateUser` dispara USER_UPDATED no
// INSTANTE em que o código é pedido, ainda sem confirmação — e a versão
// anterior fechava o painel nesse evento, engolindo a tela de digitar o
// código. Só fecha quando o e-mail está confirmado E a tela está esperando.
sb.auth.onAuthStateChange((evento, sessao) => {
  const u = sessao?.user;
  if (!u) return;
  const trocouDeConta = usuario && usuario.id !== u.id;
  usuario = u;
  const esperando = !ct.passo2.classList.contains("passo-oculto");
  if (confirmado(u) && esperando) {
    ct.tela.classList.add("escondido");
    aviso("Pronto! Seu acesso está guardado.", "ok");
  }
  if (trocouDeConta) carregar();
});

/* ── Ligações ─────────────────────────────────────────────────────────── */
el.fotografar.onclick = () => {
  // Sem aceite não se coleta dado de saúde — e a hora de perguntar é antes
  // da câmera, não depois de seis fotos tiradas.
  if (!jaAceitou()) { abrirTermo(); return; }
  // Bloqueia ANTES da câmera. Deixar fotografar e recusar no fim faria a
  // pessoa perder o trabalho inteiro para descobrir o teto.
  if (noLimite()) { limparAvisos(); avisarSeApertando(); return; }
  el.camera.click();
};
el.salvar.onclick = guardar;
el.cancelar.onclick = cancelar;
el.filtroTipo.onchange = desenharLista;
el.filtroOrdem.onchange = desenharLista;

// Filtra a cada tecla, sem botao de buscar. A lista e local e pequena: nao
// ha ida ao servidor para economizar, e ver o resultado encolher enquanto
// digita e o que ensina a pessoa que bastam tres letras.
el.busca.oninput = desenharLista;
el.buscaLimpar.onclick = () => {
  el.busca.value = "";
  desenharLista();
  el.busca.focus();
};
// Enter fecha o teclado do celular em vez de submeter coisa nenhuma: com a
// lista ja filtrada, o teclado so esta tapando o resultado.
el.busca.onkeydown = (e) => { if (e.key === "Enter") el.busca.blur(); };

// Um ouvinte no SVG inteiro, e nao um por regiao: pintarCorpo() redesenha o
// estado a cada lista, e religar handler a cada vez acumularia ouvintes.
el.corpo.addEventListener("click", (e) => {
  const alvo = e.target.closest(".regiao.tem");
  if (alvo) alternarRegiao(alvo.dataset.regiao);
});
el.corpo.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const alvo = e.target.closest(".regiao.tem");
  if (alvo) { e.preventDefault(); alternarRegiao(alvo.dataset.regiao); }
});

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

  if (await entrar()) {
    await carregar();
    // O que ficou da sessão anterior sobe agora, sem o usuário pedir.
    if (navigator.onLine) enviarFila();
  }

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
