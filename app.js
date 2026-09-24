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
const VERSAO_APP = "2026-09-23.7";

const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const el = {
  avisos: $("avisos"), celebrar: $("celebrar"), fotografar: $("btn-fotografar"), camera: $("camera"),
  form: $("form"), formDica: $("form-dica"), formContagem: $("form-contagem"),
  paginas: $("paginas"), tipo: $("tipo"), nome: $("nome"),
  leitura: $("leitura"), leituraIcone: $("leitura-icone"),
  leituraTexto: $("leitura-texto"),
  data: $("data"), salvar: $("btn-salvar"), cancelar: $("btn-cancelar"),
  duplicata: $("duplicata"), duplicataNome: $("duplicata-nome"),
  filtroTipo: $("filtro-tipo"), filtroOrdem: $("filtro-ordem"),
  lista: $("lista"), sub: $("cabecalho-sub"),
  recentes: $("recentes"), recentesTrilha: $("recentes-trilha"),
  pessoasBarra: $("pessoas-barra"), formPessoa: $("form-pessoa"),
  busca: $("busca"), buscaCaixa: $("busca-caixa"), buscaLimpar: $("busca-limpar"),
  corpoBloco: $("corpo-bloco"), corpo: $("corpo"), folhinhas: $("folhinhas"),
  corpoCabecalho: $("corpo-cabecalho"), corpoSeta: $("corpo-seta"),
  corpoDica: $("corpo-dica"), subs: $("subs"),
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
  pdf: $("input-pdf"), pdfBotao: $("btn-pdf"),
  pdfNav: $("pdf-nav"), pdfNavAnterior: $("pdf-nav-anterior"),
  pdfNavTexto: $("pdf-nav-texto"), pdfNavProxima: $("pdf-nav-proxima"),
  pdfMaisPagina: $("btn-pdf-mais-pagina"),
  modalFundo: $("modal-fundo"), modalTitulo: $("modal-titulo"),
  modalTexto: $("modal-texto"), modalCancelar: $("modal-cancelar"),
  modalConfirmar: $("modal-confirmar"), faixaOffline: $("faixa-offline"),
};

let usuario = null;
let rascunho = [];        // páginas já preparadas, esperando o "Guardar"
let documentos = [];
let naFila = [];     // guardados no celular, ainda sem subir

/* ═══ DE QUEM SÃO OS DOCUMENTOS ═══════════════════════════════════════════
   Uma conta pode guardar o acervo de mais de uma pessoa — a mãe com os
   exames dela e os do filho. No banco isso é a tabela `pessoas` (sql/009);
   aqui são duas variáveis e um punhado de filtros.

   `documentos` e `naFila` continuam com o acervo INTEIRO da conta, e não
   só o da pessoa escolhida. Não é descuido: a cota de 100 documentos é da
   CONTA — as duas pessoas dividem os mesmos 100 —, e o rodapé, o aviso de
   teto e o encerramento de conta falam do total. Quem recorta por pessoa é
   quem DESENHA: lista, boneco, folhinhas, recentes e a checagem de
   duplicata. Assim as duas contas ficam certas ao mesmo tempo, em vez de
   uma delas mentir por tabela.                                             */
let pessoas = [];
let pessoaAtiva = null;
// De QUEM sao as pessoas que estao em memoria. Sem isto, entrar com outro
// e-mail no mesmo celular (recuperar acervo, ou sair e voltar) seguiria
// desenhando as abas da conta anterior — e `pessoaAtiva` apontaria para uma
// pessoa que o RLS nem deixa mais ler.
let pessoasDaConta = null;

const pessoaEuId = () =>
  (pessoas.find((p) => p.parentesco === "eu") || {}).id || null;

/* Documento SEM pessoa é da "eu", e não de ninguém.

   No servidor a coluna é NOT NULL, então isto nunca fala de documento
   guardado — fala da FILA: entradas gravadas no IndexedDB por uma versão
   anterior do aplicativo não têm o campo. Com uma comparação estrita elas
   sumiriam da lista, e "guardei a foto ontem e hoje ela não está lá" é o
   pior defeito que este módulo sabe produzir.

   Cair na "eu" não é chute: é exatamente o que o gatilho
   `documento_pessoa_padrao` (sql/009) vai fazer quando essa entrada subir.
   A tela e o banco contam a mesma história. */
const daPessoa = (d) => {
  const dele = d.pessoa_id || pessoaEuId();
  return !pessoaAtiva || dele === pessoaAtiva;
};
const docsDaPessoa = () => documentos.filter(daPessoa);
const filaDaPessoa = () => naFila.filter(daPessoa);
const pessoaDe = (id) => pessoas.find((p) => p.id === id) || null;
const nomeDaPessoa = (p) =>
  (p && (p.nome || "").trim()) || (p && p.parentesco === "eu" ? "Eu" : "Sem nome");
// Só a PRIMEIRA carga mostra o skeleton. Nas seguintes (depois de guardar,
// apagar, trocar de conta…) a lista já tem conteúdo na tela — trocá-lo por
// blocos cinza a cada vez seria a lista "piscando" sem motivo.
let primeiraCargaLista = true;

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

/* ── Modal de confirmação ─────────────────────────────────────────────────
   Substitui o confirm() nativo do navegador: mesma pergunta, mesmo "espera
   a resposta antes de continuar", mas no visual do app, não na caixa cinza
   do sistema. `mensagem` aceita quebras de linha soltas (LINHA), como os
   textos que já existiam para o confirm() nativo — o CSS (white-space:
   pre-line) cuida de exibi-las.

   `opcoes.perigo` pinta o botão de confirmar em vermelho, para ações que
   não voltam atrás (apagar, encerrar conta) — o mesmo sinal visual que o
   resto do app já usa nesses casos.

   Um modal só, reaproveitado por todo mundo: como cada chamada espera a
   anterior fechar (é sempre `await`), não há disputa por ele. */
function confirmarModal(mensagem, opcoes = {}) {
  const { titulo = "", textoConfirmar = "Confirmar",
          textoCancelar = "Cancelar", perigo = false } = opcoes;
  return new Promise((resolve) => {
    el.modalTitulo.classList.toggle("escondido", !titulo);
    el.modalTitulo.textContent = titulo;
    el.modalTexto.textContent = mensagem;
    el.modalCancelar.textContent = textoCancelar;
    el.modalConfirmar.textContent = textoConfirmar;
    el.modalConfirmar.classList.toggle("perigo", perigo);
    el.modalFundo.classList.remove("escondido");

    const fechar = (resultado) => {
      el.modalFundo.classList.add("escondido");
      el.modalConfirmar.onclick = null;
      el.modalCancelar.onclick = null;
      el.modalFundo.onclick = null;
      document.removeEventListener("keydown", teclado);
      resolve(resultado);
    };
    const teclado = (e) => {
      if (e.key === "Escape") fechar(false);
      else if (e.key === "Enter") fechar(true);
    };
    el.modalConfirmar.onclick = () => fechar(true);
    el.modalCancelar.onclick = () => fechar(false);
    // Tocar fora do cartão cancela — o mesmo gesto que fecha qualquer
    // outra caixa flutuante do app.
    el.modalFundo.onclick = (e) => { if (e.target === el.modalFundo) fechar(false); };
    document.addEventListener("keydown", teclado);
  });
}


// Selo de "guardado": o único reforço visual forte do app, e por isso
// reservado só para o momento que mais precisa de confirmação clara — o
// documento foi guardado de verdade. `celebrarTimer` corta uma chamada
// em andamento antes de começar outra: guardar duas páginas em sequência
// rápida não deve deixar o selo preso a meio caminho de sumir.
let celebrarTimer = null;
function celebrarGuardado() {
  clearTimeout(celebrarTimer);
  el.celebrar.classList.remove("mostrar");
  // Força o navegador a "esquecer" a transição anterior antes de reaplicar
  // a classe — sem isto, duas chamadas seguidas não reiniciam a animação.
  void el.celebrar.offsetWidth;
  el.celebrar.classList.add("mostrar");
  celebrarTimer = setTimeout(() => el.celebrar.classList.remove("mostrar"), 900);
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
  if (/LIMITE_PESSOAS/.test(cru))
    return "Duas pessoas é o limite gratuito desta conta. Guardar o acervo "
         + "de uma terceira vai ser um recurso pago, ainda não disponível.";
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
  // Inclusive o da CONTA: `aviso()` manda para ca quando o painel esta
  // aberto, e sem limpar aqui cada tentativa de reenviar o codigo
  // empilhava mais uma linha vermelha sobre a anterior.
  const c = document.getElementById("avisos-conta");
  if (c) c.innerHTML = "";
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
  titulo: $("termo-titulo"), sub: $("termo-sub"), mudou: $("termo-mudou"),
};

/* O texto MUDOU desde que esta pessoa aceitou — coisa diferente de nunca
   ter aceitado. Quem nunca aceitou vê o termo no caminho normal (boas-vindas,
   e de novo antes da câmera). Quem já aceitou precisa ser avisado na
   ABERTURA: ela pode passar semanas só consultando documentos, sem tocar em
   Fotografar, sob um texto que nunca leu. */
const termoMudou = () => !!usuario?.termo_aceito_em
                      && usuario?.termo_versao !== TERMO.versao;

function pintarTermo() {
  if (tm.itens.childElementCount) return;
  tm.itens.innerHTML = TERMO.resumo.map(([ic, titulo, texto]) => `
    <div class="termo-item">
      <div class="ic">${ic}</div>
      <div><b>${titulo}</b><span>${texto}</span></div>
    </div>`).join("");
  tm.completo.textContent = TERMO.completo;
}

/* A VERSÃO CONTA, e não só a existência do aceite.

   Até aqui isto era `!!usuario?.termo_aceito_em`: a versão era gravada no
   banco e nunca lida. Quem aceitou uma vez nunca mais veria o texto, por
   mais que ele mudasse — e o comentário logo acima já dizia que "o usuário
   aceitou" não demonstra nada quando o texto mudou. O código não fazia o
   que o comentário prometia.

   Descoberto ao acrescentar ao termo a leitura automática da foto, que é
   uma mudança do QUE se permite: a imagem passa a sair do país. Sem esta
   comparação, ninguém que já usa o aplicativo seria consultado sobre isso.

   `termo_versao` nulo (aceite antigo, de antes de a coluna existir) também
   cai aqui e pede de novo. É o lado certo para errar. */
const jaAceitou = () =>
  !!usuario?.termo_aceito_em && usuario?.termo_versao === TERMO.versao;

function abrirTermo(somenteLeitura = false) {
  pintarTermo();
  /* MUDOU o texto: diga O QUE mudou, em uma linha. Reapresentar a mesma
     parede sem dizer o que mudou é o jeito mais eficiente de ensinar a
     clicar em "aceito" sem ler — que é o contrário do que o consentimento
     serve. A frase é escrita à mão a cada mudança de versão, de propósito:
     gerar isso automaticamente produziria "o texto foi atualizado", que não
     informa nada. */
  const mudou = !somenteLeitura && termoMudou();
  tm.mudou.classList.toggle("escondido", !mudou);
  if (mudou) {
    tm.titulo.textContent = "O texto mudou";
    tm.sub.textContent = "Você já tinha aceitado uma versão anterior. "
                       + "Leia de novo e aceite para continuar.";
    tm.mudou.innerHTML = "<b>O que mudou:</b> ao guardar um documento, a foto "
      + "passa a ser enviada a um serviço de leitura automática que sugere o "
      + "nome e a data, para você não digitar. Está explicado no item 4.";
  }
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
    // Sem esta linha o aceite acabado de dar nao "conta": jaAceitou compara
    // a versao, e a do objeto em memoria continuaria a antiga ate recarregar.
    usuario.termo_versao = TERMO.versao;
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
    .select("termo_aceito_em, termo_versao, nome").single();
  if (error) { console.warn("[perfil]", error.message); return; }
  usuario.termo_aceito_em = data?.termo_aceito_em || null;
  usuario.termo_versao = data?.termo_versao || null;
  usuario.nome = data?.nome || null;
  await carregarPessoas();
}

/* As pessoas da conta, com a "eu" SEMPRE em primeiro: é o acervo de quem
   abriu a conta, e é onde o app deve abrir. A ordem do resto é a de
   cadastro, que é a ordem em que a pessoa pensa neles. */
async function carregarPessoas() {
  const { data, error } = await sb.from("pessoas")
    .select("id, nome, parentesco, data_nascimento, criado_em")
    .order("criado_em", { ascending: true });
  if (error) { console.warn("[pessoas]", error.message); return; }
  pessoas = (data || []).slice()
    .sort((a, b) => (b.parentesco === "eu") - (a.parentesco === "eu"));

  // Conta sem pessoa nenhuma e um estado em que o aplicativo nao guarda
  // NADA: sem a "eu", o gatilho do banco nao tem para onde mandar o
  // documento e o insert bate no NOT NULL. O gatilho trg_conta_pessoa_eu
  // (sql/009) ja impede isso do lado de la; esta linha e a rede para o dia
  // em que alguem apontar o app para um banco sem ele — e custa uma
  // gravacao que so acontece uma vez na vida da conta.
  if (!pessoas.length) {
    const nova = await sb.from("pessoas").insert({
      conta_id: usuario.id, nome: usuario.nome || null, parentesco: "eu",
    }).select("id, nome, parentesco, data_nascimento, criado_em").single();
    if (nova.data) pessoas = [nova.data];
    else console.warn("[pessoas] conta sem pessoa e nao consegui criar",
                      nova.error && nova.error.message);
  }
  pessoasDaConta = usuario.id;

  // A escolha da visita anterior, se a pessoa ainda existir. Guardada por
  // CONTA: entrar com outro e-mail no mesmo celular não pode herdar a
  // escolha de quem usava antes.
  let salva = null;
  try { salva = localStorage.getItem("pessoa-ativa-" + usuario.id); }
  catch (e) { /* janela anônima */ }
  pessoaAtiva = (salva && pessoas.some((p) => p.id === salva))
    ? salva : (pessoas[0] && pessoas[0].id) || null;
}

function trocarPessoa(id) {
  if (id === pessoaAtiva) return;
  pessoaAtiva = id;
  try { localStorage.setItem("pessoa-ativa-" + usuario.id, id); }
  catch (e) { /* janela anônima */ }
  // Os filtros eram sobre o acervo da OUTRA pessoa: uma região do corpo que
  // fazia sentido lá pode devolver lista vazia aqui, e "sumiu tudo" é a
  // leitura mais rápida que este aplicativo já produziu.
  regiaoAtiva = null; subAtivo = null;
  el.busca.value = ""; el.filtroTipo.value = "";
  desenharLista();
}

/* As abas. Some com uma pessoa só — que é o caso de toda conta existente. */
function desenharPessoas() {
  if (!el.pessoasBarra) return;
  el.pessoasBarra.classList.toggle("escondido", pessoas.length < 2);
  if (pessoas.length < 2) return;
  el.pessoasBarra.innerHTML = "";
  for (const p of pessoas) {
    const n = documentos.filter((d) => d.pessoa_id === p.id).length
            + naFila.filter((d) => d.pessoa_id === p.id).length;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pessoa-chip" + (p.id === pessoaAtiva ? " ativa" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", p.id === pessoaAtiva ? "true" : "false");
    b.innerHTML = `<span>${escaparHTML(nomeDaPessoa(p))}</span>`
                + `<span class="n">${n}</span>`;
    b.onclick = () => trocarPessoa(p.id);
    el.pessoasBarra.appendChild(b);
  }
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
    const lado = e.target.dataset.lado;
    modo = canto || lado || "mover";
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
    // Lados: mexem em UM eixo só, na direção que a própria barra indica —
    // é o ajuste fino que faltava, sem "puxar" a dimensão perpendicular
    // junto (o problema de usar só cantos para tudo).
    else if (modo === "cima") posicionar(ini.x, ini.y + dy, ini.l, ini.a - dy);
    else if (modo === "baixo") posicionar(ini.x, ini.y, ini.l, ini.a + dy);
    else if (modo === "esquerda") posicionar(ini.x + dx, ini.y, ini.l - dx, ini.a);
    else if (modo === "direita") posicionar(ini.x, ini.y, ini.l + dx, ini.a);
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

// Navegação entre páginas do PDF, resolvida a partir da PRÓPRIA tela de
// recorte — não é "confirmar" nem "cancelar" o corte desta página, é
// trocar de página sem decidir nada sobre a atual ainda.
function fecharRecorteNavegando(delta) {
  el.telaRecorte.classList.add("escondido");
  el.recorteImg.src = "";
  const r = resolverRecorte; resolverRecorte = null;
  r?.({ navegarPdf: delta });
}
el.pdfNavAnterior.onclick = () => fecharRecorteNavegando(-1);
el.pdfNavProxima.onclick = () => fecharRecorteNavegando(1);

/* ── Rascunho ─────────────────────────────────────────────────────────── */

// A dica "um laudo de várias folhas é UM documento" só precisa ser dita até
// a pessoa guardar o primeiro documento — a partir daí ela já demonstrou que
// entendeu, e repeti-la em todo exame novo vira ruído fixo no topo do card
// (mesmo raciocínio já usado para bemvindo-visto e corpo-recolhido).
let dicaPaginasVista = false;
try { dicaPaginasVista = localStorage.getItem("dica-paginas-vista") === "1"; }
catch (e) { /* janela anônima */ }
function marcarDicaPaginasVista() {
  if (dicaPaginasVista) return;
  dicaPaginasVista = true;
  try { localStorage.setItem("dica-paginas-vista", "1"); } catch (e) { /* janela anônima */ }
}

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

  el.formContagem.textContent = rascunho.length > 1
    ? rascunho.length + " páginas" : "";
  el.formDica.classList.toggle("escondido", dicaPaginasVista);
  // Sob quem este documento vai ser arquivado. So com duas pessoas ou mais:
  // com uma, a resposta e obvia e a linha vira ruido fixo no topo do card.
  // Existe porque o seletor la em cima pode estar fora da tela na hora de
  // guardar, e arquivar o exame do filho no acervo da mae e um erro que so
  // aparece meses depois, quando o medico olha a evolucao e nao fecha.
  if (el.formPessoa) {
    const p = pessoaDe(pessoaAtiva);
    el.formPessoa.classList.toggle("escondido", pessoas.length < 2 || !p);
    if (p && pessoas.length > 1) {
      el.formPessoa.textContent = "Documento de " + nomeDaPessoa(p);
    }
  }
  verificarDuplicata();
}

function cancelar() {
  rascunho.forEach((p) => URL.revokeObjectURL(p.url));
  rascunho = [];
  el.form.classList.add("escondido");
  el.fotografar.classList.remove("escondido");
  el.pdfBotao.classList.remove("escondido");
  el.nome.value = "";
  // Tipo e data tambem, e nao so o nome: `el.camera.onchange` so escreve
  // hoje `if (!el.data.value)`, entao a data que sobrasse aqui seria
  // herdada pelo documento SEGUINTE — apresentada como se a pessoa a
  // tivesse escolhido para ele. E a data e justamente o campo que este
  // app ja sabe que ninguem confere quando parece plausivel (ver o
  // comentario de duas linhas em lerDocumento).
  el.tipo.value = "exame";
  el.data.value = "";
  el.camera.value = "";
  el.duplicata.classList.add("escondido");
  leituraPedido++;          // invalida resposta em voo
  leituraCalar();
}

/* ── Leitura automática do documento ──────────────────────────────────────
   Manda a PRIMEIRA página para a função `sugerir` e preenche o formulário
   com o que estiver escrito nela. Quem lê é o Groq, do outro lado; a chave
   dele nunca entra aqui (ver supabase/functions/sugerir/index.ts).

   QUATRO REGRAS, e as quatro vêm da mesma ideia — isto é um ATALHO, não um
   requisito. O paciente sempre pôde digitar o nome, e continua podendo:

   1. NÃO BLOQUEIA. O formulário abre na hora e os botões funcionam desde o
      primeiro instante. A leitura chega depois, se chegar.
   2. NÃO SOBRESCREVE o que a pessoa digitou. Quem começou a escrever o nome
      decidiu qual é o nome; a sugestão que chegar em cima disso apagaria
      trabalho feito, e é o tipo de coisa que ninguém perdoa duas vezes.
   3. SÓ A PRIMEIRA PÁGINA. Um laudo de dez folhas tem o cabeçalho na
      primeira; ler as dez gastaria dez vezes a cota para repetir a resposta.
   4. FALHA SEM ASSUSTAR. Sem internet, sem cota, função fora do ar: a mesma
      caixa discreta que disse "Lendo o documento…" passa a dizer que não
      deu, pede os campos e oferece 🔁 Tentar de novo. Nunca o vermelho de
      `.aviso.erro`, nunca bloqueando o formulário — erro vermelho
      transformaria uma comodidade ausente em aplicativo quebrado.

      Até 21/09 esta regra dizia SILÊNCIO: o aviso sumia e pronto. Estava
      errada, e o próprio código já discordava dela logo abaixo, no ramo do
      offline. Silêncio só é neutro quando nada foi prometido, e aqui a tela
      ACABOU de anunciar que estava lendo, com o livrinho piscando: some-lo
      deixa a pessoa sem saber se espera mais ou se começa a digitar. O que
      a regra protege é contra ASSUSTAR, não contra avisar — e disso cuida
      o lugar da mensagem (a caixa cinza da leitura), não o silêncio.

   A DATA continua sendo a de HOJE quando a leitura não vem — era assim
   antes e continua sendo. A diferença é que agora a sugestão pode
   substituí-la, porque "hoje" ali nunca foi uma escolha da pessoa, foi um
   palpite do aplicativo. */

// Campos que a leitura ainda pode preencher. Tocou no campo, ele sai daqui
// e a sugestão nunca mais mexe nele — nem que chegue meio segundo depois.
let leituraPodeEscrever = {};
let leituraPedido = 0;   // descarta resposta de uma foto já cancelada

function leituraSoltar(campo) { leituraPodeEscrever[campo] = false; }
el.nome.addEventListener("input", () => { leituraSoltar("nome"); verificarDuplicata(); });
el.data.addEventListener("input", () => {
  leituraSoltar("data");
  // Mexeu na data: a marca some. Ela quer dizer "voce ainda nao olhou
  // isto", nao "isto esta errado" — e quem digitou por cima ja olhou.
  el.data.classList.remove("conferir");
  verificarDuplicata();
});
el.tipo.addEventListener("change", () => { leituraSoltar("tipo"); verificarDuplicata(); });

/* ── Duplicidade, verificada CEDO ─────────────────────────────────────────
   Antes, só se sabia que o documento já existia ao tocar em "Guardar" —
   depois de fotografar tudo e preencher o formulário inteiro. Tarde demais:
   a pessoa fazia o trabalho todo para descobrir, só no fim, que já tinha
   aquele exame guardado.

   `encontrarDuplicata` é a mesma checagem de sempre (mesmo nome + mesma
   data, em qualquer origem — já guardado ou ainda na fila de envio), agora
   extraída para uma função só, usada tanto aqui quanto no gate final de
   `guardar()`. Só compara quando há data, pelo mesmo motivo de antes: nome
   batendo sem data é comum demais para servir de aviso.

   `verificarDuplicata` roda a cada mudança em nome/tipo/data E depois que a
   leitura automática preenche os campos sozinha (ver `sugerir`) — porque
   preencher `.value` por código não dispara o evento "input" dos campos, e
   sem essa chamada extra o aviso nunca apareceria para quem deixou a
   leitura escrever por ela. */
function encontrarDuplicata(nome, data) {
  if (!data) return null;
  const normalizar = (s) => (s || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return [...docsDaPessoa(), ...filaDaPessoa()].find((d) =>
    normalizar(d.nome) === normalizar(nome) && d.data_documento === data) || null;
}

function verificarDuplicata() {
  const nome = (el.nome.value || "").trim() || ROTULOS[el.tipo.value];
  const data = el.data.value || null;
  const dup = encontrarDuplicata(nome, data);
  el.duplicataNome.textContent = dup ? `"${dup.nome || nome}"` : "";
  el.duplicata.classList.toggle("escondido", !dup);
  return dup;
}

function leituraDizer(texto, lendo) {
  el.leitura.classList.remove("escondido");
  el.leitura.classList.toggle("lendo", !!lendo);
  el.leituraIcone.textContent = lendo ? "📖" : "✓";
  el.leituraTexto.innerHTML = texto;
}
function leituraCalar() {
  el.leitura.classList.add("escondido");
  el.leitura.classList.remove("lendo");
  el.leituraTexto.textContent = "";
  el.data.classList.remove("conferir");
}

// Mensagem de falha + botão para tentar de novo, sem precisar recortar a
// página outra vez — a imagem já processada (rascunho[0]) continua ali.
function leituraFalhou(motivo) {
  leituraDizer(motivo + " <b>Preencha os campos abaixo</b>, por favor. "
    + '<button type="button" id="leitura-tentar" class="leitura-tentar">'
    + "🔁 Tentar de novo</button>", false);
  el.leituraIcone.textContent = "⚠️";
  const botao = document.getElementById("leitura-tentar");
  if (botao) botao.onclick = () => { if (rascunho[0]) lerDocumento(rascunho[0].blob); };
}

async function lerDocumento(blob) {
  if (!CONFIG.LEITURA_AUTOMATICA) return;
  // Offline nem tenta: a fila existe para a FOTO chegar ao servidor depois,
  // e não há como adiar uma sugestão que precisa aparecer agora, enquanto o
  // formulário está aberto. Mas o paciente precisa SABER que não vai vir
  // sozinho, e não descobrir isso só porque o campo ficou vazio.
  if (!navigator.onLine) {
    leituraFalhou("Sem conexão para ler o documento agora.");
    return;
  }

  const meu = ++leituraPedido;
  leituraDizer("Lendo o documento para preencher os campos…", true);
  try {
    const base64 = await new Promise((ok, falha) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).replace(/^data:[^,]+,/, ""));
      fr.onerror = falha;
      fr.readAsDataURL(blob);
    });

    const { data: ses } = await sb.auth.getSession();
    const r = await fetch(CONFIG.SUPABASE_URL + "/functions/v1/sugerir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + (ses?.session?.access_token || ""),
      },
      body: JSON.stringify({ imagem: base64 }),
    });
    const dados = await r.json();
    if (meu !== leituraPedido) return;          // outra foto entrou no lugar
    if (!dados || !dados.ok) {
      console.warn("[leitura]", dados && dados.erro);
      leituraFalhou("Não consegui ler este documento automaticamente.");
      return;
    }

    // Achou algo? Independente de ter conseguido ESCREVER (o paciente pode
    // já ter digitado por cima, e aí leituraPodeEscrever barra de propósito)
    // — "não achei nada no documento" e "já estava preenchido" são avisos
    // diferentes, e só o primeiro precisa dizer algo.
    const achouAlgo = !!(dados.tipo || dados.nome || dados.data);

    const postos = [];
    if (dados.tipo && leituraPodeEscrever.tipo) {
      el.tipo.value = dados.tipo; postos.push("o tipo");
    }
    if (dados.nome && leituraPodeEscrever.nome) {
      el.nome.value = dados.nome; postos.push("o nome");
    }
    if (dados.data && leituraPodeEscrever.data) {
      el.data.value = dados.data; postos.push("a data");
    }
    if (!postos.length) {
      if (achouAlgo) return leituraCalar();  // já estava preenchido — nada a dizer
      leituraFalhou("Não consegui identificar informações neste documento.");
      return;
    }

    verificarDuplicata();   // .value por código não dispara "input" sozinho

    const lista = postos.length > 1
      ? postos.slice(0, -1).join(", ") + " e " + postos[postos.length - 1]
      : postos[0];

    /* O aviso tem DOIS níveis, e a segunda linha é só sobre a data.
       Não é ênfase decorativa: medindo contra gabarito, o nome saiu certo
       em 42% das fotos e a data em 10% — e os erros de data não são
       recusas, são datas PLAUSÍVEIS que não estão escritas no papel. Na
       foto real que abriu o recurso, o laudo dizia 25/11 e 26/11 e a
       leitura respondeu 23/11.

       A assimetria é o que justifica tratar os dois campos diferente:
       nome errado a pessoa vê na hora, porque acabou de ler aquele papel.
       Data errada com cara de plausível ela confirma sem olhar — e o
       estrago aparece anos depois, quando o exame fica na ordem errada
       para o médico que precisa comparar. */
    let texto = "Preenchi <b>" + lista + "</b> lendo a foto.";
    if (dados.data && postos.includes("a data")) {
      el.data.classList.add("conferir");
      texto += "<span class=\"leitura-data\">⚠️ Confira a data no papel — "
             + "é o que mais sai errado.</span>";
    } else {
      // "Confira" no imperativo, e não "pode conter erros". O paciente não
      // precisa saber que existe um modelo por trás; precisa saber que
      // aquele texto não foi ele quem escreveu e que a palavra final é dele.
      texto += " <b>Confira</b> antes de guardar.";
    }
    leituraDizer(texto, false);
  } catch (e) {
    console.warn("[leitura]", e?.message || e);
    if (meu === leituraPedido) {
      leituraFalhou("Não consegui ler este documento automaticamente.");
    }
  }
}

/* ── Guardar ──────────────────────────────────────────────────────────────
   Ordem obrigatória: documento → páginas no storage → linhas das páginas.
   As páginas têm FK para o documento, então tentá-las antes só geraria
   pendência solta. Falhando o documento, nada sobe.                          */
async function guardar() {
  if (!rascunho.length) return false;

  const nomeNovo = (el.nome.value || "").trim() || ROTULOS[el.tipo.value];
  const dataNova = el.data.value || null;

  // Duplicidade: a mesma checagem de `verificarDuplicata` (ver o comentário
  // lá), agora como confirmação de verdade antes de gravar — não só um
  // aviso que dava para ignorar sem querer. A pessoa já deve ter visto o
  // aviso no formulário a esta altura; isto aqui é o último freio, para
  // quem preencheu tudo rápido sem reparar nele.
  const duplicata = encontrarDuplicata(nomeNovo, dataNova);
  if (duplicata) {
    const seguir = await confirmarModal(`Você já tem um documento chamado "${nomeNovo}" `
      + `com a data ${dataBR(dataNova)}. Guardar mesmo assim?`,
      { textoConfirmar: "Guardar mesmo assim" });
    if (!seguir) return false;
  }

  el.salvar.disabled = true;
  el.salvar.textContent = "Guardando…";
  limparAvisos();

  // Grava na fila ANTES de tentar subir. Para o paciente, tocar em Guardar
  // guarda — o envio é problema do app a partir daqui.
  const entrada = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    paciente_id: usuario.id,
    // Sob QUEM este documento é arquivado. Viaja na fila, e não é resolvido
    // na hora de subir: entre guardar e a internet voltar a pessoa pode ter
    // trocado de aba, e o documento iria para o acervo errado — calado.
    pessoa_id: pessoaAtiva,
    tipo: el.tipo.value,
    nome: nomeNovo,
    data_documento: dataNova,
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
    return false;
  }

  marcarDicaPaginasVista();
  cancelar();
  el.salvar.disabled = false;
  el.salvar.textContent = "Guardar documento";
  celebrarGuardado();
  aviso("Documento guardado.", "ok");
  // Acabou de guardar: MOSTRE o que ela guardou. Com um filtro ligado, o
  // documento novo pode nao casar com ele e some da tela — e ela conclui
  // que a foto se perdeu. Foi exatamente o que aconteceu com um documento
  // salvo sem nome: ele vira "Exame", nao cai em regiao nenhuma do boneco,
  // e ficou invisivel atras do filtro que estava ligado.
  regiaoAtiva = null;
  subAtivo = null;
  el.busca.value = "";
  el.filtroTipo.value = "";
  await carregar();
  await enviarFila();
  convidarAProteger();
  return true;
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
  mvPessoa = pessoaAtiva;
  desenharMvPessoas();
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
    // Assinatura de DOIS argumentos: a de um continua no banco como atalho
    // para a pessoa "eu", e existe para o aplicativo ANTIGO, nao para este.
    const { data, error } = await sb.rpc("gerar_liberacao",
      { p_minutos: 15, p_pessoa: mvPessoa || pessoaAtiva });
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

/* MEIA-NOITE NAO E HORA, E O FIM DE UM DIA — e e assim que se diz.

   `abrir_acervo` grava `expira_em` como a meia-noite seguinte no fuso de
   Brasilia (sql/006), entao horaBR() devolvia "00:00" para TODO acesso
   vivo. Quem le isso as duas da tarde entende um horario que ja passou, e
   conclui que o acesso acabou — bem na lista que existe para responder
   "quem esta vendo meus documentos AGORA". E contradizia, tres centimetros
   acima, o cartao que ja dizia certo: "o acesso termina sozinho no fim do
   dia".

   Estreito de proposito: so troca o texto quando a hora E meia-noite E cai
   noutro dia. Expirando as 15h de amanha, continua dizendo 15h — "fim do
   dia" ali seria mentira de outro tipo. */
function ateQuando(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "o fim do dia";
  const meiaNoite = d.getHours() === 0 && d.getMinutes() === 0;
  if (meiaNoite && diaLocalDe(iso) !== hojeISO()) return "o fim do dia";
  return horaBR(iso);
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
/* Mesmo espírito do skeleton da lista principal (ver desenharEsqueletoLista):
   2 blocos bastam aqui, porque a lista de quem abriu o acervo raramente
   tem mais que isso, e o card inteiro é pequeno. */
function desenharEsqueletoAcessos(qtd = 2) {
  mv.acessos.innerHTML = "";
  for (let i = 0; i < qtd; i++) {
    const div = document.createElement("div");
    div.className = "esqueleto-acesso";
    div.innerHTML = `<div class="bloco linha1"></div><div class="bloco linha2"></div>`;
    mv.acessos.appendChild(div);
  }
}

async function listarAcessos() {
  desenharEsqueletoAcessos();
  const { data, error } = await sb.from("liberacoes")
    .select("id, medico_nome, medico_crm, usado_em, expira_em, revogado_em, pessoa_id")
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
      : vivo ? "pode ver até " + ateQuando(a.expira_em) : "acesso encerrado";
    div.innerHTML = `
      <div class="quem">
        <div class="nome">${escaparHTML(a.medico_nome || "Médico não identificado")}${
          a.medico_crm ? " · CRM " + escaparHTML(a.medico_crm) : ""}</div>
        <div class="quando">Abriu em ${quandoBR(a.usado_em)} · ${estado}</div>
        ${pessoas.length > 1
          ? '<div class="quando">acervo de ' +
            escaparHTML(nomeDaPessoa(pessoaDe(a.pessoa_id))) + '</div>' : ''}
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
  if (!await confirmarModal(`Cancelar o acesso de ${a.medico_nome || "este médico"}?`
               + LINHA + LINHA
               + "Ele deixa de ver seus documentos imediatamente.",
               { textoConfirmar: "Cancelar acesso" })) return;
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
            // `|| pessoaAtiva` cobre a fila ANTIGA: entradas gravadas antes
            // desta versão não têm o campo, e nasceram quando a conta só
            // tinha a pessoa "eu" — que é a que está ativa numa conta de
            // uma pessoa só.
            pessoa_id: entrada.pessoa_id || pessoaAtiva,
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

/* ── Faixa "sem conexão" ───────────────────────────────────────────────────
   `online`/`offline` do navegador cobrem a troca de rede em si; falta o
   caso de abrir o app já sem internet, por isso a chamada extra na
   partida (ver a IIFE final do arquivo). */
function atualizarFaixaOffline() {
  el.faixaOffline.classList.toggle("escondido", navigator.onLine);
}
window.addEventListener("online", atualizarFaixaOffline);
window.addEventListener("offline", atualizarFaixaOffline);

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
    const detalhes = [dataBR(c.quando), escaparHTML(c.hora || ""), escaparHTML(c.onde || "")]
      .filter(Boolean).join(" · ");
    div.innerHTML = `
      <div class="txt">
        <div class="quando">${f.texto}</div>
        <div class="nome">${escaparHTML(c.titulo)}</div>
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
  if (await confirmarModal(`Marcar o próximo "${c.titulo}" para ${dataBR(proxima)}?`
              + LINHA + LINHA + "Você pode mudar a data depois.",
              { textoConfirmar: "Marcar" })) {
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
  if (!await confirmarModal(`Apagar "${compEditando.titulo}"?`,
      { textoConfirmar: "Apagar", perigo: true })) return;
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
/* ── Apagar, direto — sem precisar abrir o documento antes ───────────────
   Extraído do que era só `apagarDocumentoAberto`: aquela função dependia
   inteira do estado do visualizador (visuDoc, visuCaminhos...), então só
   existia um jeito de apagar — abrir o documento primeiro. O gesto de
   deslizar (ver `tornarDeslizavel`) precisa apagar a partir do CARTÃO da
   lista, sem abrir nada; por isso a lógica de verdade mora aqui, recebendo
   o documento como parâmetro, e as dias formas de chamar (botão da tela
   cheia, deslizar o cartão) viram cascas finas em cima dela. */
async function apagarDocumento(doc) {
  const nome = doc.nome || ROTULOS[doc.tipo] || "este documento";
  const paginas = (doc.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
  const quantas = paginas.length;

  // A quebra de linha vem de LINHA, nunca de escapada dentro de aspas:
  // uma quebra solta no meio de uma string e erro de sintaxe.
  const aviso1 = `Apagar "${nome}"${quantas > 1 ? ` e suas ${quantas} páginas` : ""}?`;
  const aviso2 = `Isto não pode ser desfeito. Se você tem o papel original, `
    + `ele continua com você — some apenas a cópia guardada aqui.`;
  if (!await confirmarModal(aviso1 + LINHA + LINHA + aviso2,
      { textoConfirmar: "Apagar", perigo: true })) return false;

  if (!navigator.onLine) {
    aviso("Apagar um documento guardado precisa de internet — ele "
         + "está no servidor, não no celular.", "info", "Sem conexão");
    return false;
  }
  try {
    const caminhos = paginas.map((p) => p.storage_path);
    const { error: e1 } = await sb.storage.from("documentos").remove(caminhos);
    if (e1) throw e1;
    // A linha some com as páginas junto (on delete cascade).
    const { error: e2 } = await sb.from("documentos").delete().eq("id", doc.id);
    if (e2) throw e2;
    for (const c of caminhos) {
      const capa = capaLocal.get(c);
      if (capa) { URL.revokeObjectURL(capa); capaLocal.delete(c); }
    }
    // Se era este mesmo documento que estava aberto no visualizador, fecha —
    // apagar pelo cartão de trás da tela cheia deixaria ela mostrando um
    // documento que já não existe mais.
    if (visuOrigem === "documento" && visuDoc && visuDoc.id === doc.id) {
      el.visuFechar.click();
    }
    await carregar();
    aviso("Documento apagado.", "ok");
    return true;
  } catch (e) {
    console.warn("[apagar]", e?.message || e?.error || JSON.stringify(e));
    aviso("Não consegui apagar agora. O documento continua guardado — "
          + "tente de novo em instantes.", "erro");
    return false;
  }
}

/* O pendente ainda não subiu: existe só neste celular, e apagar funciona
   offline — sem o aviso de "precisa de internet" que o documento já
   guardado tem. */
async function apagarEntradaPendente(entrada) {
  const nome = entrada.nome || ROTULOS[entrada.tipo] || "este documento";
  if (!await confirmarModal(`Apagar "${nome}"? Ainda não terminou de enviar.`,
      { textoConfirmar: "Apagar", perigo: true })) return false;
  await FilaDB.remover(entrada.id);
  if (visuOrigem === "pendente" && visuEntrada && visuEntrada.id === entrada.id) {
    el.visuFechar.click();
  }
  await carregar();
  aviso("Documento apagado.", "ok");
  return true;
}

el.visuApagar.onclick = async () => {
  if (!visuOrigem) return;
  el.visuApagar.disabled = true;
  try {
    if (visuOrigem === "pendente") await apagarEntradaPendente(visuEntrada);
    else await apagarDocumento(visuDoc);
  } finally {
    el.visuApagar.disabled = false;
  }
};

/* ── Compartilhar, direto do cartão ───────────────────────────────────────
   Mesma lógica das imagens do visualizador (URL assinada para o que já
   subiu, blob local para o pendente), só que empacotada como arquivo, para
   o próprio celular abrir o menu de "enviar para" — WhatsApp, e-mail,
   Bluetooth — sem passar pelo aplicativo de novo. */
async function compartilharDocumento(doc) {
  const paginas = (doc.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
  if (!paginas.length) return;
  if (!navigator.onLine) {
    return aviso("Compartilhar um documento guardado precisa de internet.",
      "info", "Sem conexão");
  }
  try {
    // 5 minutos: tempo de sobra para o menu de compartilhar abrir e buscar
    // o arquivo, e o link morre logo depois — não é o mesmo link de mostrar
    // ao médico, que fica ativo o dia inteiro de propósito.
    const { data, error } = await sb.storage.from("documentos")
      .createSignedUrls(paginas.map((p) => p.storage_path), 300);
    if (error) throw error;
    const urls = (data || []).map((d) => d.signedUrl).filter(Boolean);
    if (!urls.length) throw new Error("sem urls assinadas");
    const nomeBase = doc.nome || ROTULOS[doc.tipo] || "documento";
    const arquivos = await Promise.all(urls.map(async (u, i) => {
      const blob = await (await fetch(u)).blob();
      return new File([blob], `${nomeBase}${urls.length > 1 ? "-" + (i + 1) : ""}.jpg`,
        { type: blob.type || "image/jpeg" });
    }));
    await compartilharArquivos(arquivos, nomeBase);
  } catch (e) {
    console.warn("[compartilhar]", e?.message || e);
    aviso("Não consegui preparar o compartilhamento agora. Tente de novo.", "erro");
  }
}

async function compartilharEntradaPendente(entrada) {
  const nomeBase = entrada.nome || ROTULOS[entrada.tipo] || "documento";
  const arquivos = (entrada.paginas || []).map((p, i) =>
    new File([p.blob], `${nomeBase}${entrada.paginas.length > 1 ? "-" + (i + 1) : ""}.jpg`,
      { type: p.blob.type || "image/jpeg" }));
  await compartilharArquivos(arquivos, nomeBase);
}

async function compartilharArquivos(arquivos, titulo) {
  if (!arquivos.length) return;
  if (navigator.canShare && navigator.canShare({ files: arquivos })) {
    try {
      await navigator.share({ files: arquivos, title: titulo || "Documento" });
    } catch (e) {
      // AbortError: a pessoa fechou o menu de compartilhar sem escolher nada
      // — nao e erro, e a escolha dela, e um aviso aqui so atrapalharia.
      if (e && e.name !== "AbortError") {
        console.warn("[compartilhar]", e);
        aviso("Não consegui compartilhar agora.", "erro");
      }
    }
  } else {
    // Sem suporte a compartilhar arquivos (comum em computador): baixa a
    // primeira página, para a pessoa anexar por conta própria onde precisar.
    const url = URL.createObjectURL(arquivos[0]);
    const a = document.createElement("a");
    a.href = url; a.download = arquivos[0].name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    aviso("Este aparelho não compartilha arquivos direto. Baixamos a "
        + "primeira página para você anexar onde precisar.", "info");
  }
}

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
  // Skeleton só entra ANTES da primeira resposta chegar, e só na primeira
  // carga (ver `primeiraCargaLista`) — é a única vez que a lista está
  // realmente vazia na tela, então é a única vez que blocos cinza substituem
  // "nada" em vez de substituir documentos que a pessoa já via.
  if (primeiraCargaLista) desenharEsqueletoLista();

  // A FILA PRIMEIRO, e sem depender da rede. Lendo o servidor antes e
  // desistindo no erro, era exatamente sem internet — quando a fila importa —
  // que ela deixava de ser desenhada: a tela congelava no estado anterior e o
  // documento recém-guardado sumia de vista.
  try {
    naFila = await FilaDB.listar(usuario?.id);
  } catch (e) {
    naFila = [];
  }

  // Pessoas da conta que esta logada AGORA. Barato quando ja estao certas,
  // e e o unico ponto por onde passam todos os caminhos que trocam de conta.
  if (usuario && pessoasDaConta !== usuario.id) await carregarPessoas();

  const { data, error } = await sb.from("documentos")
    .select("id, tipo, nome, data_documento, criado_em, pessoa_id, documento_paginas(storage_path, ordem)")
    .order("criado_em", { ascending: false });
  // Falhou a leitura: mantém o que já estava carregado em vez de esvaziar a
  // lista. Sumir com o acervo por causa de um sinal ruim assusta sem motivo.
  if (error) console.warn("[lista]", error.message || error);
  else documentos = data || [];

  await lerConsumo();
  primeiraCargaLista = false;
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

// dataBR vive em comum.js: as duas paginas mostram a mesma data, e a
// regra que distingue data pura de instante nao pode existir em duas
// copias — uma delas passaria a mostrar o dia seguinte depois das 21h.

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
/* ── Deslizar o cartão para agir ──────────────────────────────────────────
   `touch-action:pan-y` no CSS já garante que rolar a lista pra cima/baixo
   continua funcionando sem que a gente precise adivinhar a direção do dedo
   a cada toque: só o gesto horizontal chega aqui como evento de ponteiro.

   Um cartão aberto por vez: guardamos qual é o "wrap" deslizado agora, e
   abrir outro fecha o anterior sozinho — do jeito que WhatsApp e Gmail já
   fazem, e sem isso a lista acumularia cartões meio-abertos espalhados. */
let deslizAberto = null;

function tornarDeslizavel(wrap, alvo, origem) {
  const cartao = wrap.querySelector(".doc");
  const LIMITE = 78; // largura de cada botão de ação, em px
  let inicioX = 0, inicioTranslado = 0, atual = 0, arrastando = false;

  const fechar = (animar = true) => {
    cartao.style.transition = animar ? "transform .2s ease" : "none";
    cartao.style.transform = "translateX(0px)";
    wrap.dataset.aberto = "";
    if (deslizAberto === wrap) deslizAberto = null;
  };
  // Fica acessível de fora: é assim que abrir UM cartão fecha o outro.
  wrap._fecharDeslizar = fechar;

  const abrirLado = (lado) => {
    cartao.style.transition = "transform .2s ease";
    cartao.style.transform = `translateX(${lado === "esq" ? LIMITE : -LIMITE}px)`;
    wrap.dataset.aberto = lado;
    marcarDicaDeslizarVista();
    if (deslizAberto && deslizAberto !== wrap && deslizAberto._fecharDeslizar) {
      deslizAberto._fecharDeslizar(false);
    }
    deslizAberto = wrap;
  };

  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    arrastando = true;
    inicioX = e.clientX;
    inicioTranslado = wrap.dataset.aberto === "esq" ? LIMITE
                    : wrap.dataset.aberto === "dir" ? -LIMITE : 0;
    // Comeca de onde o cartao esta, e nao de onde o dedo ANTERIOR parou:
    // `soltar` le `atual`, e um toque limpo (sem pointermove nenhum, como
    // o de tocar nos botoes de tras) decidia com o resto do gesto passado.
    atual = inicioTranslado;
    cartao.style.transition = "none";
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
  });
  wrap.addEventListener("pointermove", (e) => {
    if (!arrastando) return;
    atual = Math.max(-LIMITE, Math.min(LIMITE, inicioTranslado + (e.clientX - inicioX)));
    cartao.style.transform = `translateX(${atual}px)`;
  });
  const soltar = () => {
    if (!arrastando) return;
    arrastando = false;
    if (atual > LIMITE * 0.45) abrirLado("esq");
    else if (atual < -LIMITE * 0.45) abrirLado("dir");
    else fechar();
  };
  wrap.addEventListener("pointerup", soltar);
  wrap.addEventListener("pointercancel", soltar);

  // Com o cartão aberto, o primeiro toque nele só fecha — abrir o documento
  // sem querer, por baixo do dedo que ia tocar "Apagar", seria pior que não
  // ter o gesto. Sem estar aberto, o clique de sempre continua livre.
  cartao.addEventListener("click", (e) => {
    if (wrap.dataset.aberto) { e.stopPropagation(); e.preventDefault(); fechar(); }
  }, true);

  const btnCompartilhar = wrap.querySelector(".doc-fundo-compartilhar");
  const btnApagar = wrap.querySelector(".doc-fundo-apagar");
  if (btnCompartilhar) btnCompartilhar.onclick = () => {
    fechar();
    origem === "pendente" ? compartilharEntradaPendente(alvo) : compartilharDocumento(alvo);
  };
  if (btnApagar) btnApagar.onclick = () => {
    fechar();
    origem === "pendente" ? apagarEntradaPendente(alvo) : apagarDocumento(alvo);
  };
}

/* Envolve um cartão `.doc` já pronto com o fundo de ações e liga o gesto de
   deslizar. Function separada de `cartaoDoc`/o laço do pendente porque as
   DUAS listas (documento guardado e pendente na fila) ganham o mesmo
   comportamento, só trocando qual função de apagar/compartilhar chamar. */
function comAcoesDeslizar(cartao, alvo, origem) {
  const wrap = document.createElement("div");
  wrap.className = "doc-deslizar";
  wrap.innerHTML = `
    <div class="doc-fundo">
      <button class="doc-fundo-btn doc-fundo-compartilhar" type="button">📤 Compartilhar</button>
      <button class="doc-fundo-btn doc-fundo-apagar" type="button">🗑️ Apagar</button>
    </div>`;
  wrap.appendChild(cartao);
  tornarDeslizavel(wrap, alvo, origem);
  return wrap;
}

/* ── Balão \"deslize para compartilhar/apagar\" ────────────────────────────
   Some para sempre ao tocar \"Entendi\" ou na primeira vez que a pessoa
   desliza um cartão (ver abrirLado). Mesmo padrão de dica-paginas-vista. */
let dicaDeslizarVista = false;
try { dicaDeslizarVista = localStorage.getItem("dica-deslizar-vista") === "1"; }
catch (e) { /* janela anônima */ }
let empurraoFeito = false;

function marcarDicaDeslizarVista() {
  if (dicaDeslizarVista) return;
  dicaDeslizarVista = true;
  try { localStorage.setItem("dica-deslizar-vista", "1"); } catch (e) { /* janela anônima */ }
  const b = document.getElementById("dica-deslizar");
  if (b) b.remove();
}

function inserirDicaDeslizar() {
  if (dicaDeslizarVista || document.getElementById("dica-deslizar")) return;
  const d = document.createElement("div");
  d.className = "dica-deslizar";
  d.id = "dica-deslizar";
  d.setAttribute("role", "note");
  d.innerHTML = `<span class="dica-deslizar-ico">👈👉</span>
    <span class="dica-deslizar-txt">Deslize um documento para o lado para
      <b>compartilhar</b> ou <b>apagar</b></span>
    <button type="button" class="dica-deslizar-ok">Entendi</button>`;
  d.querySelector("button").onclick = marcarDicaDeslizarVista;
  // FORA de `#lista`, e nao como primeiro filho dela. `#lista` e a lista de
  // DOCUMENTOS, e quem a percorre — aqui e nos testes — espera achar um
  // cartao em cada filho; um balao no meio rebenta no primeiro
  // `.querySelector('.nome')` que voltar nulo. Na tela nao muda nada: ela
  // fica encostada logo acima, com a seta do balao apontando pra baixo.
  // Era assim que a dica anterior vivia, declarada no proprio HTML.
  el.lista.parentNode.insertBefore(d, el.lista);

  // Empurrãozinho no primeiro cartão visível: uma vez por sessão.
  if (empurraoFeito) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  empurraoFeito = true;
  setTimeout(() => {
    const cartao = [...el.lista.querySelectorAll(".doc-deslizar .doc")]
      .find((c) => c.offsetParent);
    if (!cartao || cartao.closest(".doc-deslizar").dataset.aberto) return;
    const mover = (x) => {
      cartao.style.transition = "transform .35s ease";
      cartao.style.transform = `translateX(${x}px)`;
    };
    mover(30);
    setTimeout(() => mover(0), 450);
    setTimeout(() => mover(-30), 900);
    setTimeout(() => mover(0), 1350);
  }, 700);
}

let regiaoAtiva = null;
/* O refino dentro da regiao. SEMPRE se apaga junto com ela — um sub-assunto
   sobrevivente de uma regiao que nao esta mais ligada filtraria sem nada na
   tela dizendo por que. */
let subAtivo = null;

/* Acende o que tem documento e desenha as folhinhas.

   Conta sobre o acervo INTEIRO, nao sobre o que sobrou dos outros filtros:
   senao a regiao ativa se apagaria sozinha ao filtrar, e o paciente veria o
   proprio toque desaparecer. */
function pintarCorpo() {
  // Da PESSOA, e nao da conta. O boneco existe para retratar quem usa —
  // "quem tem cardiopatia ve o peito aceso" — e misturar mae e filho na
  // mesma figura destrói exatamente isso: o peito acenderia por um exame
  // que nao e do corpo que esta sendo olhado.
  const todos = [...docsDaPessoa(), ...filaDaPessoa()];
  const conta = {};
  for (const d of todos) {
    for (const id of regioesDoDocumento(d)) conta[id] = (conta[id] || 0) + 1;
  }
  const algumaAcesa = REGIOES.some((r) => conta[r.id]);
  el.corpoBloco.classList.toggle("escondido", !algumaAcesa);

  for (const r of REGIOES.filter((x) => x.corpo)) {
    // querySelectorAll, nao querySelector: "membros" sao TRES elementos
    // (duas pernas juntas e cada braco), e pintar so o primeiro deixaria os
    // bracos apagados e mudos ao toque.
    const alvos = [...el.corpo.querySelectorAll(`[data-regiao="${r.id}"]`)];
    if (!alvos.length) continue;
    const tem = !!conta[r.id];
    for (const alvo of alvos) {
    alvo.classList.toggle("tem", tem);
    alvo.classList.toggle("ativa", regiaoAtiva === r.id);
    // Regiao sem documento sai do alcance do toque e do leitor de tela:
    // botao que nao faz nada e pior que botao ausente.
    //
    // Quem manda aqui e o `role="button"` do HTML, e nao o aria-hidden do
    // momento: os espelhos (o outro braco, a outra perna) e os retangulos
    // de alcance nascem sem role e nunca devem ganhar foco. Testar o
    // aria-hidden ATUAL travava o elemento de verdade — bastava a regiao
    // ficar sem documento uma vez (aria-hidden passa a "true") para a
    // volta dela cair no mesmo teste e ser tratada como espelho. Ela
    // acendia e respondia ao toque, mas ficava invisivel para o teclado e
    // para o leitor de tela, sem nada na tela denunciando.
    if (alvo.getAttribute("role") === "button") {
      alvo.setAttribute("aria-hidden", tem ? "false" : "true");
      alvo.setAttribute("tabindex", tem ? "0" : "-1");
    }
    alvo.setAttribute("aria-pressed", regiaoAtiva === r.id ? "true" : "false");
    }
  }

  // Bolhas de contagem no boneco: mesma conta das folhinhas.
  // Coordenadas do desenho de CORPO_SVG (comum.js). Cada bolha pousa na
  // BORDA da regiao, nao no meio dela: no meio ela taparia justamente a cor
  // que diz se a regiao esta acesa. As dos membros caem sobre o retangulo
  // de alcance, que e transparente — e `pointer-events:none` no CSS impede que
  // elas roubem o toque da regiao por baixo.
  const BOLHAS = { cabeca: [63, 9], peito: [71, 48], barriga: [70, 84],
                   pelve: [72, 114], bracos: [11, 116], pernas: [26, 192] };
  const bolhas = el.corpo.querySelector("#corpo-bolhas");
  if (bolhas) {
    while (bolhas.firstChild) bolhas.removeChild(bolhas.firstChild);
    const NS = "http://www.w3.org/2000/svg";
    for (const r of REGIOES.filter((x) => x.corpo && conta[x.id] && BOLHAS[x.id])) {
      const [cx, cy] = BOLHAS[r.id];
      const g = document.createElementNS(NS, "g");
      if (regiaoAtiva === r.id) g.setAttribute("class", "ativa");
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", "5.5");
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", cx); t.setAttribute("y", cy);
      t.textContent = conta[r.id] > 99 ? "99+" : String(conta[r.id]);
      g.appendChild(c); g.appendChild(t);
      bolhas.appendChild(g);
    }
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
    if (b) b.onclick = () => {
      regiaoAtiva = null; subAtivo = null; desenharLista();
    };
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

  pintarSubs(todos);
}

/* As fichinhas de sub-assunto. Como `pintarCorpo`, contam sobre o acervo
   INTEIRO: contar sobre o que sobrou faria a fichinha escolhida encolher
   para "1" no instante do toque. */
function pintarSubs(todos) {
  const achados = regiaoAtiva ? subAssuntos(regiaoAtiva, todos) : [];
  el.subs.classList.toggle("escondido", !achados.length);
  el.subs.innerHTML = "";
  if (!achados.length) { subAtivo = null; return; }

  // O sub-assunto ligado sumiu da lista (o acervo mudou): solta, em vez de
  // filtrar por um criterio que nao esta mais escrito em lugar nenhum.
  if (subAtivo && !achados.some((a) => a.id === subAtivo)) subAtivo = null;

  const rot = document.createElement("span");
  rot.className = "subs-rot";
  rot.textContent = "Mostrar só:";
  el.subs.appendChild(rot);

  for (const a of achados) {
    const b = document.createElement("button");
    b.className = "sub" + (subAtivo === a.id ? " ativa" : "");
    b.setAttribute("aria-pressed", subAtivo === a.id ? "true" : "false");
    b.innerHTML = `<span>${a.rotulo}</span><span class="n">${a.n}</span>`;
    // Tocar de novo solta, igual as regioes: e o mesmo gesto, e ensinar
    // duas saidas diferentes para dois controles vizinhos e pior que uma.
    b.onclick = () => {
      subAtivo = subAtivo === a.id ? null : a.id;
      desenharLista();
    };
    el.subs.appendChild(b);
  }
}

/* Tocar de novo solta. Uma regiao por vez, de proposito: combinar peito com
   sangue devolveria a intersecao vazia com frequencia, e "sumiu tudo" e a
   forma mais rapida de o paciente concluir que o aplicativo quebrou. */
function alternarRegiao(id) {
  regiaoAtiva = regiaoAtiva === id ? null : id;
  subAtivo = null;
  desenharLista();
}

/* ── Skeleton da lista (só na primeira carga) ─────────────────────────────
   Blocos cinza pulsando no lugar dos cartões de documento, com a mesma
   moldura do `.doc` (ver CSS), enquanto a primeira resposta do servidor não
   chega. O objetivo é só a sensação de "já está acontecendo algo" — troca
   pelo conteúdo de verdade assim que `desenharLista` roda pela primeira
   vez, sem esperar nada além disso. */
function desenharEsqueletoLista(qtd = 4) {
  el.lista.innerHTML = "";
  for (let i = 0; i < qtd; i++) {
    const div = document.createElement("div");
    div.className = "esqueleto";
    div.innerHTML = `
      <div class="bloco capa"></div>
      <div class="txt">
        <div class="bloco linha1"></div>
        <div class="bloco linha2"></div>
      </div>`;
    el.lista.appendChild(div);
  }
}

function desenharLista() {
  const tipo = el.filtroTipo.value;
  const ordem = el.filtroOrdem.value;
  const termos = termosDaBusca();

  // A caixa aparece pelo TOTAL do acervo, nao pelo que sobrou do filtro:
  // senao ela sumiria no meio de uma busca que nao achou nada, levando
  // embora o campo com o texto digitado.
  const meus = docsDaPessoa(), minhaFila = filaDaPessoa();
  const total = meus.length + minhaFila.length;
  el.buscaCaixa.classList.toggle("escondido",
    total < MINIMO_BUSCA && !termos.length);
  el.buscaCaixa.classList.toggle("tem-texto", !!el.busca.value);
  desenharPessoas();
  pintarCorpo();
  desenharRecentes();

  const naRegiao = (d) => (!regiaoAtiva || regioesDoDocumento(d).has(regiaoAtiva))
    && (!subAtivo || noSubAssunto(d, regiaoAtiva, subAtivo));
  let lista = meus.filter((d) =>
    (!tipo || d.tipo === tipo) && casaBusca(d, termos) && naRegiao(d));

  const quando = (d) => d.data_documento || d.criado_em;
  if (ordem === "antigo") lista.sort((a, b) => String(quando(a)).localeCompare(String(quando(b))));
  else if (ordem === "tipo") lista.sort((a, b) => a.tipo.localeCompare(b.tipo)
      || String(quando(b)).localeCompare(String(quando(a))));
  else lista.sort((a, b) => String(quando(b)).localeCompare(String(quando(a))));

  const pend = minhaFila.filter((e) =>
    (!tipo || e.tipo === tipo) && casaBusca(e, termos) && naRegiao(e));

  if (!lista.length && !pend.length) {
    // Nomes legiveis de cada filtro LIGADO agora, na ordem em que aparecem
    // na tela: tipo, depois regiao do corpo (com sub-assunto junto, se
    // houver). A busca por texto entra separada, porque ja tem frase
    // propria ("Nada encontrado para X") — aqui ela so soma ao combinado
    // quando outro filtro tambem esta ligado.
    const nomesFiltro = [];
    if (tipo) nomesFiltro.push(ROTULOS[tipo]);
    if (regiaoAtiva) {
      const r = REGIOES.find((x) => x.id === regiaoAtiva);
      let rotulo = (r && r.rotulo) || "";
      const s = subAtivo && r && r.sub && r.sub.find((x) => x.id === subAtivo);
      if (s) rotulo += " › " + s.rotulo;
      if (rotulo) nomesFiltro.push(rotulo);
    }
    const combinados = termos.length
      ? [`“${escaparHTML(el.busca.value)}”`, ...nomesFiltro] : nomesFiltro.slice();

    // Duas situacoes diferentes, tres respostas — mas quando DOIS FILTROS OU
    // MAIS estao ligados ao mesmo tempo (ex.: tipo "Receita" + regiao
    // "Tórax"), a frase antiga so citava a busca de texto e ignorava o
    // resto, ou caia no generico "esse filtro" (singular) sem dizer QUAIS.
    // Quem via aquilo nao sabia se soltava o tipo, a regiao ou os dois.
    // Agora cada filtro ligado entra na frase, entao a pessoa sabe
    // exatamente o que esta zerando a lista.
    let texto;
    if (combinados.length >= 2) {
      texto = `Nada encontrado para ${combinados.map((n) => `<b>${n}</b>`).join(" + ")}.`
            + `<br><span style="font-size:13px">Tente soltar um dos filtros.</span>`;
    } else if (termos.length) {
      texto = `Nada encontrado para <b>${escaparHTML(el.busca.value)}</b>.`
            + `<br><span style="font-size:13px">Procure por parte do nome, `
            + `pelo tipo (“receita”) ou pelo ano.</span>`;
    } else if (nomesFiltro.length) {
      texto = `Nenhum documento em <b>${nomesFiltro[0]}</b>.`;
    } else if (meus.length || minhaFila.length) {
      texto = "Nenhum documento com esse filtro.";
    } else {
      texto = pessoas.length > 1
        ? `Ainda não há nada guardado de <b>${escaparHTML(nomeDaPessoa(pessoaDe(pessoaAtiva)))}</b>.`
          + "<br>Comece fotografando um exame."
        : "Ainda não há nada guardado.<br>Comece fotografando um exame.";
    }

    // So mostra "limpar filtros" quando ha o que limpar — na lista
    // realmente vazia (acervo zerado) o botao nao teria o que fazer.
    const temFiltro = combinados.length > 0;
    // A dica agora mora FORA de `#lista` (ver inserirDicaDeslizar), entao
    // limpar a lista nao a leva junto: sem isto ela sobreviveria a uma
    // busca sem resultado, ensinando a deslizar cartao que nao existe.
    const dicaAberta = document.getElementById("dica-deslizar");
    if (dicaAberta) dicaAberta.remove();
    el.lista.innerHTML = `<div class="vazio"><div class="icone">${
      termos.length ? "🔎" : "🗂️"}</div><p>${texto}</p>${
      temFiltro ? `<button class="ver-todos" id="vazio-limpar">✕ limpar filtros</button>` : ""}</div>`;
    if (temFiltro) {
      document.getElementById("vazio-limpar").onclick = () => {
        el.filtroTipo.value = "";
        el.busca.value = "";
        regiaoAtiva = null; subAtivo = null;
        desenharLista();
      };
    }
    return;
  }

  el.lista.innerHTML = "";
  inserirDicaDeslizar();

  // Os que ainda não subiram vêm primeiro e dizem em que pé estão. O aviso é
  // tranquilizador de propósito: não há nada para o paciente fazer, e pedir
  // ação a quem não pode agir só gera ansiedade.
  for (const e of pend) el.lista.appendChild(cartaoPendente(e));

  if (ordem === "exame") desenharAgrupadoApp(lista);
  else if (ordem === "tipo") desenharPorTipoApp(lista);
  else for (const d of lista) el.lista.appendChild(cartaoDoc(d));
}

/* ── "Recentes", fixo em cima, IGNORANDO filtro/busca/corpo ─────────────────
   Deliberadamente lê `documentos` (o acervo inteiro), não `lista` (o que
   sobrou dos filtros): o ponto inteiro deste bloco é continuar mostrando o
   que acabou de ser guardado mesmo que a pessoa tenha, digamos, o filtro de
   tipo em "Receitas" e tenha acabado de fotografar um exame de sangue — ela
   quer conferir que salvou, não que o filtro está "certo".

   Só documentos JÁ guardados (não os pendentes): o pendente já aparece bem
   em cima da lista, com a própria faixa de "enviando…" — repeti-lo aqui
   diria a mesma coisa duas vezes em lugares diferentes.

   MAS só vale a pena existir quando ela DIVERGE do topo da lista — com tudo
   em "Todos os tipos" / "Mais recentes" e sem busca nem região tocada (o
   estado em que a pessoa abre o app), os 3 documentos daqui são os MESMOS
   3 que já nascem no topo da lista, na mesma ordem: a faixa duplicava o
   que a pessoa já estava vendo um dedo abaixo. Some nesse caso; volta a
   aparecer assim que algum filtro muda o que a lista mostra primeiro. */
function desenharRecentes() {
  // Guarda defensiva: se este HTML nao tiver o bloco #recentes (por exemplo,
  // um deploy que atualizou o app.js sem levar junto o index.html mais
  // recente, ou vice-versa), `el.recentes`/`el.recentesTrilha` vem `null`.
  // Sem este retorno antecipado, o `.classList` de uma linha abaixo quebra
  // com uma excecao NAO CAPTURADA — e como esta funcao roda logo no INICIO
  // de `desenharLista` (antes do corpo, dos filtros e da propria lista),
  // essa quebra impede TUDO o que vem depois de ser desenhado. Foi
  // exatamente esse encadeamento que apagou corpo+filtros+lista de uma vez
  // só, apesar de nenhum dos tres ter, sozinho, nada de errado.
  if (!el.recentes || !el.recentesTrilha) return;

  const semFiltro = !el.filtroTipo.value && !regiaoAtiva
    && el.filtroOrdem.value === "recente" && !termosDaBusca().length;
  if (semFiltro) { el.recentes.classList.add("escondido"); return; }

  const N = 3;
  const recentes = docsDaPessoa()
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
    .slice(0, N);

  el.recentes.classList.toggle("escondido", recentes.length === 0);
  if (!recentes.length) return;

  el.recentesTrilha.innerHTML = "";
  for (const d of recentes) {
    const paginas = (d.documento_paginas || []);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "recente";
    b.innerHTML = `
      <div class="capa">${ICONES[d.tipo] || "📎"}</div>
      <div class="nome">${escaparHTML(d.nome || ROTULOS[d.tipo])}</div>
      <div class="meta">${dataBR(d.data_documento || d.criado_em)}
        ${paginas.length > 1 ? " · " + paginas.length + " pág." : ""}</div>
      <div class="selo">✓ guardado</div>`;
    b.onclick = () => abrirDocumento(d);
    el.recentesTrilha.appendChild(b);
  }
}

/* Um documento guardado, como cartão. Extraído para ser usado solto, dentro
   de um grupo e dentro de uma faixa de tipo. O PENDENTE continua desenhado
   à parte, de propósito: ele tem a faixa de "enviando" e não existe no
   servidor — e ele nunca entra em grupo nenhum, para não sumir fechado
   dentro de um justo no minuto em que a pessoa quer vê-lo. */
function cartaoDoc(d) {
  {
    const paginas = (d.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
    const div = document.createElement("div");
    div.className = "doc";
    div.innerHTML = `
      <div class="capa">${ICONES[d.tipo] || "📎"}</div>
      <div class="txt">
        <div class="nome">${escaparHTML(d.nome || ROTULOS[d.tipo])}</div>
        <div class="meta">${ROTULOS[d.tipo]} · ${dataBR(d.data_documento || d.criado_em)}
          ${paginas.length > 1 ? " · " + paginas.length + " páginas" : ""}</div>
      </div>
      <div style="color:var(--tinta-3);font-size:20px">›</div>`;
    div.onclick = () => abrirDocumento(d);
    return comAcoesDeslizar(div, d, "documento");
  }
}

/* O pendente, como cartão — mesmo visual de sempre (ver o laço em
   `desenharLista`), extraído pra função pra ganhar o mesmo deslizar do
   documento já guardado, sem duplicar o innerHTML nos dois lugares. */
function cartaoPendente(e) {
  const div = document.createElement("div");
  div.className = "doc";
  div.innerHTML = `
    <div class="capa">${ICONES[e.tipo] || "📎"}</div>
    <div class="txt">
      <div class="nome">${escaparHTML(e.nome || ROTULOS[e.tipo])}</div>
      <div class="meta">${ROTULOS[e.tipo]} · ${dataBR(e.data_documento || e.criado_em)}
        ${e.paginas.length > 1 ? " · " + e.paginas.length + " páginas" : ""}</div>
      <div class="fila">${navigator.onLine ? "⏳ enviando…"
        : "⏳ guardado no celular · envia quando a internet voltar"}</div>
    </div>`;
  div.onclick = () => abrirPendente(e);
  return comAcoesDeslizar(div, e, "pendente");
}

/* ── Agrupado por exame, no aplicativo ────────────────────────────────────
   Mesmas regras da tela do médico (`agruparPorExame`, em comum.js) e mesma
   escolha: grupo de UM não vira grupo, e os grupos nascem FECHADOS.

   NÃO é o padrão aqui, e a diferença é proposital. O médico chega com uma
   pergunta clínica — "como está este exame ao longo do tempo". O paciente
   chega com outra: "onde está o que eu fotografei ontem". Abrindo agrupado,
   o documento de ontem pode nascer fechado dentro de um grupo — e concluir
   que a foto se perdeu é a reação mais rápida que este aplicativo já
   produziu, uma vez, com o documento sem nome atrás de um filtro ligado. */
let gruposAbertosApp = new Set();

function desenharAgrupadoApp(lista) {
  for (const g of agruparPorExame(lista)) {
    if (g.docs.length === 1) { el.lista.appendChild(cartaoDoc(g.docs[0])); continue; }
    const aberto = gruposAbertosApp.has(g.chave);

    const cab = document.createElement("div");
    cab.className = "grupo" + (aberto ? " aberto" : "");
    cab.setAttribute("role", "button");
    cab.setAttribute("tabindex", "0");
    cab.setAttribute("aria-expanded", aberto ? "true" : "false");
    cab.innerHTML = `
      <div class="grupo-seta" aria-hidden="true">▸</div>
      <div class="capa">${ICONES[g.docs[0].tipo] || "📎"}</div>
      <div class="txt">
        <div class="nome">${escaparHTML(g.nome)}</div>
        <div class="meta">${resumoDoGrupo(g)}</div>
      </div>`;
    el.lista.appendChild(cab);

    const caixa = document.createElement("div");
    caixa.className = "grupo-docs" + (aberto ? "" : " escondido");
    for (const d of g.docs) caixa.appendChild(cartaoDoc(d));
    el.lista.appendChild(caixa);

    const alternar = () => {
      const agora = !gruposAbertosApp.has(g.chave);
      if (agora) gruposAbertosApp.add(g.chave); else gruposAbertosApp.delete(g.chave);
      cab.classList.toggle("aberto", agora);
      cab.setAttribute("aria-expanded", agora ? "true" : "false");
      caixa.classList.toggle("escondido", !agora);
    };
    cab.onclick = alternar;
    cab.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); }
    };
  }
}

/* ── Por tipo, no aplicativo ──────────────────────────────────────────────
   Aqui o rótulo sempre foi honesto ("Por tipo", não "Agrupados por tipo"),
   mas o comportamento era o mesmo da tela do médico antes da correção: um
   `sort` e nada mais. A faixa com contagem custa pouco e diz onde uma
   espécie acaba e a outra começa.

   Faixa e não grupo que abre: são quatro ou cinco espécies, e fechá-las
   esconderia o acervo inteiro atrás de cinco linhas.

   EXCEÇÃO: com o filtro de tipo já travado numa categoria (select
   "filtro-tipo" em "Receitas", por exemplo), `lista` só tem receita — e
   pintar aqui uma faixa "Receitas (n)" repetiria, uma linha abaixo, o que o
   próprio select já diz. A faixa some só nesse caso; com "Todos os tipos"
   ela continua separando as espécies como sempre. */
function desenharPorTipoApp(lista) {
  const pularFaixa = !!el.filtroTipo.value;
  const ORDEM_TIPOS = ["exame", "laudo", "receita", "relatorio", "outro"];
  const porTipo = new Map();
  for (const d of lista) {
    if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, []);
    porTipo.get(d.tipo).push(d);
  }
  const tipos = [...porTipo.keys()].sort((a, b) => {
    const ia = ORDEM_TIPOS.indexOf(a), ib = ORDEM_TIPOS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const t of tipos) {
    const docs = porTipo.get(t).sort((a, b) =>
      String(b.data_documento || b.criado_em)
        .localeCompare(String(a.data_documento || a.criado_em)));
    if (!pularFaixa) {
      const faixa = document.createElement("div");
      faixa.className = "secao";
      faixa.innerHTML = `<span class="secao-nome">${(ROTULOS[t] || t)}`
                      + `${docs.length > 1 ? "s" : ""}</span>`
                      + `<span class="secao-n">${docs.length}</span>`;
      el.lista.appendChild(faixa);
    }
    for (const d of docs) el.lista.appendChild(cartaoDoc(d));
  }
}

/* ── Captura ──────────────────────────────────────────────────────────────
   Uma foto por vez: prepara no worker (barato para a tela), pergunta as
   margens, depois gera o arquivo final. O progresso é dito em voz alta
   porque são segundos de espera — silêncio nesse intervalo o usuário lê
   como travamento.                                                          */
el.camera.onchange = async () => {
  // Se o formulario JA estava aberto, esta foto e a segunda pagina de um
  // documento em andamento — e a leitura ja rodou na primeira. Reler o
  // verso de um laudo gastaria cota para responder pior que da primeira vez.
  const jaAberto = !el.form.classList.contains("escondido");
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
    const primeiraFoto = !jaAberto;
    el.form.classList.remove("escondido");
    el.fotografar.classList.add("escondido");
    // hojeISO, e nao toISOString(): das 21h de Brasilia em diante o UTC ja
    // virou o dia seguinte, e o documento fotografado a noite nascia
    // datado de AMANHA — com a pessoa conferindo e achando certo, porque
    // "amanha" nao parece erro, parece a data de hoje.
    if (!el.data.value) el.data.value = hojeISO();
    desenharRascunho();
    // SEM await: o formulario ja esta na tela e os botoes ja funcionam. A
    // leitura chega quando chegar, ou nao chega.
    if (primeiraFoto) {
      leituraPodeEscrever = { nome: true, data: true, tipo: true };
      lerDocumento(rascunho[0].blob);
    }
  }
};

/* ── Upload de PDF (resultados de exame) ─────────────────────────────────
   O laboratório manda um PDF só, mas cada página costuma ser um exame
   DIFERENTE (hemograma, urina, ureia...) — não um documento de várias
   páginas. Por isso cada página vira o seu próprio documento, e a lista de
   páginas fica INTEIRA (não é consumida): dá pra andar pra frente e pra
   trás, e reabrir a MESMA página para recortar um segundo exame nela.     */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
}

el.pdfBotao.onclick = () => {
  if (!jaAceitou()) { abrirTermo(); return; }
  if (noLimite()) { limparAvisos(); avisarSeApertando(); return; }
  el.pdf.click();
};

async function pdfParaBlobs(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const blobs = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const vp = pagina.getViewport({ scale: 2 }); // resolução suficiente pro Groq ler
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pagina.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.92));
    blobs.push(new File([blob], `pagina-${n}.jpg`, { type: "image/jpeg" }));
  }
  return blobs;
}

// Páginas do PDF em andamento: array FIXO (não é fila que se esvazia) mais
// um índice de posição. `null`/`-1` quando não há upload de PDF em curso.
let filaPdfPaginas = null;
let indicePdfAtual = -1;

// Capturado UMA vez, no carregamento — não a cada página. Tentar "lembrar"
// o texto de antes em cada chamada é o que causava o botão preso em
// "Preparando…": chamadas encadeadas (pular página, erro, navegar) rodavam
// em paralelo sem se esperar, e uma podia salvar o texto errado (o
// "Preparando…" de outra) como se fosse o estado de repouso.
const TEXTO_PDF_REPOUSO = el.pdfBotao.textContent;

function atualizarNavPdf() {
  const emFluxoPdf = Array.isArray(filaPdfPaginas) && indicePdfAtual >= 0;
  el.pdfNav.classList.toggle("escondido", !emFluxoPdf);
  if (!emFluxoPdf) return;
  el.pdfNavTexto.textContent = `Página ${indicePdfAtual + 1} de ${filaPdfPaginas.length} do PDF`;
  el.pdfNavAnterior.disabled = indicePdfAtual <= 0;
  el.pdfNavProxima.disabled = indicePdfAtual >= filaPdfPaginas.length - 1;
}

// Só aparece quando existe uma PRÓXIMA página do PDF para oferecer — sem
// isso o botão ficaria clicável na última página e não faria nada.
function atualizarBotaoMaisPagina() {
  const temProxima = Array.isArray(filaPdfPaginas)
    && indicePdfAtual >= 0 && indicePdfAtual < filaPdfPaginas.length - 1;
  el.pdfMaisPagina.classList.toggle("escondido", !temProxima);
}

// Pega a PRÓXIMA página do PDF, deixa recortar, e — ao confirmar — ANEXA o
// resultado ao documento que já está aberto no formulário (em vez de abrir
// um novo). É o caminho para um exame que ocupa mais de uma página do
// arquivo: sem isso, cada página vira um documento à parte sempre.
el.pdfMaisPagina.onclick = async () => {
  if (!filaPdfPaginas || indicePdfAtual >= filaPdfPaginas.length - 1) return;
  const proximoIndice = indicePdfAtual + 1;
  const pagina = filaPdfPaginas[proximoIndice];

  el.pdfMaisPagina.disabled = true;
  try {
    const prep = await pedirAoWorker({ tipo: "preparar", arquivo: pagina });
    const urlPrev = URL.createObjectURL(prep.blob);
    const escolha = await abrirRecorte(urlPrev,
      `Página ${proximoIndice + 1} de ${filaPdfPaginas.length} — mesmo documento`,
      { l: prep.largura, a: prep.altura });

    if (!escolha || escolha.navegarPdf) { URL.revokeObjectURL(urlPrev); return; }

    const fim = await pedirAoWorker({
      tipo: "final", blob: prep.blob, rect: escolha.rect, giro: escolha.giro,
      lado: CONFIG.LADO_MAXIMO, qualidade: CONFIG.QUALIDADE,
    });
    URL.revokeObjectURL(urlPrev);

    rascunho.push({ blob: fim.blob, largura: fim.largura, altura: fim.altura,
                    url: URL.createObjectURL(fim.blob) });
    indicePdfAtual = proximoIndice;   // marca esta página como usada
    desenharRascunho();
    atualizarBotaoMaisPagina();
  } catch (e) {
    console.error(e);
    aviso("Não consegui anexar essa página ao documento.", "erro");
  } finally {
    el.pdfMaisPagina.disabled = false;
  }
};

function encerrarFluxoPdf() {
  const estavaAtivo = filaPdfPaginas !== null;
  filaPdfPaginas = null;
  indicePdfAtual = -1;
  atualizarNavPdf();
  el.pdfBotao.disabled = false;
  el.pdfBotao.textContent = TEXTO_PDF_REPOUSO;
  if (estavaAtivo) aviso("PDF concluído — todas as páginas foram processadas.", "ok");
}

// Depois de guardar ou pular (cancelar) a página atual: segue pra próxima,
// ou encerra se essa era a última. Não faz nada fora de um fluxo de PDF.
// `await`-ável de propósito: SEM isso, cada chamada dispara a próxima e
// segue em frente sem esperar, e foi essa corrida — não o conteúdo do
// código — que deixava o botão preso.
async function avancarPdf() {
  if (!filaPdfPaginas) return;
  if (indicePdfAtual + 1 < filaPdfPaginas.length) await abrirPaginaPdf(indicePdfAtual + 1);
  else encerrarFluxoPdf();
}

async function abrirPaginaPdf(indice) {
  if (!filaPdfPaginas || indice < 0 || indice >= filaPdfPaginas.length) {
    encerrarFluxoPdf();
    return;
  }
  indicePdfAtual = indice;
  const pagina = filaPdfPaginas[indice];

  el.pdfBotao.disabled = true;
  el.pdfBotao.textContent = "Preparando…";
  try {
    const prep = await pedirAoWorker({ tipo: "preparar", arquivo: pagina });
    const urlPrev = URL.createObjectURL(prep.blob);

    // abrirRecorte já deixa a tela visível antes de devolver a promessa —
    // por isso dá pra atualizar a barra de navegação logo em seguida, e ela
    // aparece por cima da imagem em tamanho real, não da miniatura do form.
    const promessaRecorte = abrirRecorte(
      urlPrev,
      filaPdfPaginas.length > 1
        ? `Página ${indice + 1} de ${filaPdfPaginas.length} — ajuste as margens`
        : "Ajuste as margens",
      { l: prep.largura, a: prep.altura });
    atualizarNavPdf();
    const escolha = await promessaRecorte;

    if (escolha && escolha.navegarPdf) {
      URL.revokeObjectURL(urlPrev);
      return abrirPaginaPdf(indice + escolha.navegarPdf);
    }
    if (!escolha) { URL.revokeObjectURL(urlPrev); return avancarPdf(); }

    el.pdfBotao.textContent = "Finalizando…";
    const fim = await pedirAoWorker({
      tipo: "final", blob: prep.blob, rect: escolha.rect, giro: escolha.giro,
      lado: CONFIG.LADO_MAXIMO, qualidade: CONFIG.QUALIDADE,
    });
    URL.revokeObjectURL(urlPrev);

    rascunho.forEach((p) => URL.revokeObjectURL(p.url));
    rascunho = [{ blob: fim.blob, largura: fim.largura, altura: fim.altura,
                  url: URL.createObjectURL(fim.blob) }];

    el.form.classList.remove("escondido");
    el.fotografar.classList.add("escondido");
    el.pdfBotao.classList.add("escondido");
    el.data.value = hojeISO();
    el.nome.value = "";
    el.tipo.value = "exame";
    desenharRascunho();
    atualizarBotaoMaisPagina();
    leituraPodeEscrever = { nome: true, data: true, tipo: true };
    lerDocumento(rascunho[0].blob);
  } catch (e) {
    console.error(e);
    aviso("Não consegui processar uma das páginas do PDF.", "erro");
    return avancarPdf();
  } finally {
    el.pdfBotao.disabled = false;
    el.pdfBotao.textContent = TEXTO_PDF_REPOUSO;
  }
}

el.pdfNavAnterior.onclick = () => {
  if (indicePdfAtual > 0) abrirPaginaPdf(indicePdfAtual - 1);
};
el.pdfNavProxima.onclick = () => {
  if (filaPdfPaginas && indicePdfAtual < filaPdfPaginas.length - 1) {
    abrirPaginaPdf(indicePdfAtual + 1);
  }
};

// Fechar o app com um documento a meio (recorte feito, formulário aberto e
// não guardado) ou com páginas do PDF ainda não processadas perde esse
// trabalho de verdade — nada disso está gravado ainda. O que já foi
// guardado (naFila) NÃO entra aqui: aquilo sobrevive um fechar, e avisar
// por causa dele seria alarme falso.
window.addEventListener("beforeunload", (e) => {
  const trabalhoEmRisco = rascunho.length > 0
    || (filaPdfPaginas && filaPdfPaginas.length > 0);
  if (!trabalhoEmRisco) return;
  e.preventDefault();
  e.returnValue = "";
});

el.pdf.onchange = async () => {
  const arquivosPdf = [...el.pdf.files];
  el.pdf.value = "";
  if (!arquivosPdf.length) return;

  el.pdfBotao.disabled = true;
  el.pdfBotao.textContent = "Abrindo PDF…";

  const novasPaginas = [];
  for (const arquivoPdf of arquivosPdf) {
    try {
      novasPaginas.push(...(await pdfParaBlobs(arquivoPdf)));
    } catch (e) {
      console.error(e);
      aviso("Não consegui abrir este PDF. Confira se o arquivo não está "
          + "corrompido ou protegido por senha.", "erro");
    }
  }

  el.pdfBotao.disabled = false;
  el.pdfBotao.textContent = TEXTO_PDF_REPOUSO;
  if (!novasPaginas.length) return;

  if (novasPaginas.length > 1) {
    aviso(`Este PDF tem ${novasPaginas.length} páginas. Cada uma abre como `
        + "um documento separado — use ◀ ▶ para navegar (volte a uma "
        + "página para recortar outro exame nela), e Cancelar para pular "
        + "uma página.", "info");
  }
  filaPdfPaginas = novasPaginas;
  abrirPaginaPdf(0);
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
  android: $("bv-android"), appbrowser: $("bv-appbrowser"),
  abrirEm: $("bv-abrir-em"),
  faixaBtn: $("faixa-btn"), faixaFechar: $("faixa-fechar"),
};

let convite = null;   // o aviso de instalação guardado pelo navegador

const jaInstalado = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/* Navegador de DENTRO de outro aplicativo — WhatsApp, Instagram, Facebook.
   Instalar ali e impossivel: o item "Adicionar a Tela de Inicio" nao existe
   nesse navegador, em nenhum dos dois sistemas.

   E o caminho mais provavel do piloto, porque o link vai por WhatsApp.

   COMO SE RECONHECE, e por que assim: o Safari de verdade manda "Safari/"
   no `userAgent`; o WebView embutido do iPhone, nao. No Android os
   navegadores de aplicativo se anunciam com "wv". Os dois sao heuristica —
   nao ha API para isto —, mas errar aqui e barato: o pior caso e mostrar
   uma instrucao a mais para quem ja estava no navegador certo. Errar para o
   outro lado deixa a pessoa procurando um menu que nao existe. */
const ehNavegadorDeApp = () => {
  if (jaInstalado()) return false;
  const ua = navigator.userAgent || "";
  // SEM BARRA INVERTIDA NENHUMA. A versao anterior desta linha tinha um
  // contorno de palavra, e ele nao chegou como dois caracteres: chegou como
  // o BYTE 0x08, backspace, dentro da expressao. A expressao passou a casar
  // "wv" no meio de qualquer palavra — e o arquivo comparava sem reclamar.
  // O modulo ja tinha registrado essa armadilha; eu cai nela de novo.
  //
  // O WebView do Android se anuncia com a sequencia exata "; wv)".
  if (ua.indexOf("; wv)") >= 0) return true;
  for (const marca of ["FBAN", "FBAV", "Instagram", "Line/", "GSA/"]) {
    if (ua.indexOf(marca) >= 0) return true;
  }
  // iPhone: o WebView embutido nao traz "Safari/", e os navegadores de
  // verdade se identificam (CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge).
  if (!ehIOS()) return false;
  const proprio = ["Safari/", "CriOS", "FxiOS", "EdgiOS"];
  return !proprio.some((m) => ua.indexOf(m) >= 0);
};

const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// O navegador dispara isto quando considera o app instalável. Guardamos em vez
// de deixar passar: assim o convite aparece no NOSSO botão, no momento em que
// faz sentido, e não numa barrinha que o usuário fecha sem ler.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  convite = e;
  if (!bv.tela.classList.contains("escondido")) {
    // Chegou depois de a tela abrir: troca a instrução escrita pelo botão.
    // Um toque é melhor que seguir três passos de menu, e deixar os dois
    // na tela faria a pessoa escolher entre caminhos que fazem o mesmo.
    // Nao troca nada se a pessoa esta dentro do navegador de outro
    // aplicativo: la o atalho nasceria abrindo dentro dele de novo.
    if (ehNavegadorDeApp()) return;
    bv.android.classList.add("escondido");
    bv.instalar.classList.remove("escondido");
  } else {
    mostrarFaixa();
  }
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

/* `revisao=true` é como a tela abre a partir de "Minha conta" (ver
   ct.comoFunciona.onclick), fora da primeira visita: a pessoa já tem
   conta, então "Já usei antes em outro celular" — que dispara a
   recuperação de acesso — não faz sentido aqui e some; o botão de
   fechar troca de "Começar agora" para "Entendi", porque não há nada
   para começar, só para rever. */
function abrirBoasVindas(revisao = false) {
  bv.tela.classList.remove("escondido");
  bv.comecar.textContent = revisao ? "Entendi" : "Começar agora";
  $("bv-voltar").classList.toggle("escondido", revisao);
  /* TRÊS CAMINHOS, e o terceiro faltava.

     Com o convite do navegador, o botão. No iPhone, que nunca oferece, as
     instruções. E no Android SEM o convite — que acontece, porque o Chrome
     decide por heurística de engajamento — não havia nada: nem botão, nem
     instrução. A pessoa saía sem saber que dava para instalar.

     O convite pode chegar DEPOIS desta tela abrir; quando chega, o ouvinte
     de `beforeinstallprompt` troca a instrução pelo botão, que é melhor. */
  /* A ORDEM IMPORTA, e o primeiro caso e o que faltava.

     Dentro do navegador de outro aplicativo nao ha instalacao possivel, e
     nenhuma instrucao sobre Compartilhar resolve — o item nao existe la.
     Por isso ele vem ANTES de tudo, inclusive do convite: se por acaso o
     navegador embutido oferecer o convite, instalar dali gera um atalho
     que abre de novo dentro do aplicativo. */
  if (ehNavegadorDeApp()) {
    bv.abrirEm.textContent = ehIOS() ? "Abrir no Safari" : "Abrir no Chrome";
    bv.appbrowser.classList.remove("escondido");
  } else if (convite) {
    bv.instalar.classList.remove("escondido");
  } else if (ehIOS()) {
    bv.ios.classList.remove("escondido");
  } else {
    bv.android.classList.remove("escondido");
  }
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
    // CAMPO A CAMPO, e nao `consumo = l`: o retorno do Supabase carrega
    // prototipo e chaves que nao sao nossas, e copiar o objeto inteiro
    // faria o resto do aplicativo depender do formato dele.
    //
    // `teto_pessoas` entrou aqui junto com sql/009 e QUASE ficou de fora:
    // sem ele, desenharContaPessoas caia no `|| 2` e o teto virava um
    // numero cravado no aplicativo — o contrario do que o resto do modulo
    // faz, que e perguntar ao banco. Nada quebrava; so parava de obedecer.
    if (l) consumo = { documentos: l.documentos, teto: l.teto, bytes: l.bytes,
                       pessoas: l.pessoas, teto_pessoas: l.teto_pessoas };
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
/* ── O nome do paciente ───────────────────────────────────────────────────
   Existe por causa da tela do MÉDICO. Lá o acervo abria anônimo — "Acervo
   do paciente" e mais nada —, com a pessoa sentada na frente dele. Uma
   tela que não afirma de quem é o acervo nunca pode estar errada, e isso
   soa bom mas não é: erro visível se corrige; ausência de afirmação, não.

   Fica na tela da CONTA, e não no começo: pedir nome antes da primeira
   foto é uma barreira entre o paciente e o que ele veio fazer. E não é
   obrigatório em lugar nenhum — em branco, a tela do médico continua
   dizendo "Acervo do paciente", como sempre disse. */
const ct = {
  botao: $("btn-conta"), tela: $("tela-conta"), fechar: $("conta-fechar"),
  estado: $("conta-estado"), estadoTxt: $("conta-estado-txt"),
  proteger: $("conta-proteger"), pronta: $("conta-pronta"),
  passo1: $("proteger-passo1"), passo2: $("proteger-passo2"),
  email: $("conta-email"), enviar: $("conta-enviar"), eco: $("conta-email-eco"),
  codigo: $("conta-codigo"), confirmar: $("conta-confirmar"), voltar: $("conta-voltar"),
  emailAtual: $("conta-email-atual"), sair: $("conta-sair"),
  encerrar: $("conta-encerrar"), comoFunciona: $("conta-como-funciona"),
  pessoasLista: $("conta-pessoas"), pessoaNome: $("pessoa-nome"),
  pessoaParentesco: $("pessoa-parentesco"), pessoaAdicionar: $("pessoa-adicionar"),
  pessoaNova: $("pessoa-nova"), pessoaPago: $("pessoa-pago"),
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


/* ═══ QUEM ESTÁ NESTA CONTA ═══════════════════════════════════════════════
   Duas pessoas de graça, a terceira é paga. O teto vive no BANCO
   (limite_de_pessoas, sql/009) pelo mesmo motivo do teto de documentos: a
   chave anônima roda no celular de qualquer um, e limite conferido só na
   tela é sugestão. Aqui o trabalho é outro — avisar ANTES, para a pessoa
   não digitar um nome e levar uma recusa seca.

   NÃO HÁ COBRANÇA ainda: o aplicativo não tem gateway, assinatura nem
   webhook, e isso é um projeto próprio. O que existe é a trava e o aviso
   honesto de que o recurso vai ser pago.                                   */
const ROTULO_PARENTESCO = { eu: "você", filho: "filho", filha: "filha",
                            mae: "mãe", pai: "pai", conjuge: "cônjuge",
                            outro: "" };

function desenharContaPessoas() {
  if (!ct.pessoasLista) return;
  ct.pessoasLista.innerHTML = "";
  for (const p of pessoas) {
    const n = documentos.filter((d) => (d.pessoa_id || pessoaEuId()) === p.id).length;
    const linha = document.createElement("div");
    linha.className = "pessoa-linha";

    const campo = document.createElement("input");
    campo.type = "text"; campo.maxLength = 60;
    campo.value = p.nome || "";
    campo.placeholder = p.parentesco === "eu" ? "Seu nome" : "Nome";
    // Grava ao SAIR do campo, e não a cada tecla: uma escrita por letra
    // digitada gasta rede e cota de requisição para nada.
    campo.onchange = () => renomearPessoa(p, campo.value);
    linha.appendChild(campo);

    const par = document.createElement("span");
    par.className = "par";
    par.textContent = n + (n === 1 ? " doc" : " docs");
    par.title = ROTULO_PARENTESCO[p.parentesco] || "";
    linha.appendChild(par);

    // A pessoa "eu" não se apaga: é quem abriu a conta, e sem ela o acervo
    // ficaria sem dono. Para sair de vez existe "Encerrar conta", que diz
    // com todas as letras o que faz.
    if (p.parentesco !== "eu") {
      const x = document.createElement("button");
      x.className = "tirar";
      x.type = "button";
      x.setAttribute("aria-label", "Remover " + nomeDaPessoa(p));
      x.textContent = "🗑️";
      x.onclick = () => removerPessoa(p, n);
      linha.appendChild(x);
    }
    ct.pessoasLista.appendChild(linha);
  }

  // Do BANCO. O `|| 2` e para o caso de meu_consumo ainda ser a versao de
  // tres colunas (banco sem sql/009), nao para o dia a dia.
  const teto = (consumo && consumo.teto_pessoas) || 2;
  const cheio = pessoas.length >= teto;
  ct.pessoaNova.classList.toggle("escondido", cheio);
  ct.pessoaAdicionar.classList.toggle("escondido", cheio);
  ct.pessoaPago.classList.toggle("escondido", !cheio);
  if (cheio) {
    ct.pessoaPago.innerHTML = "<b>Duas pessoas é o limite gratuito</b>"
      + "Guardar o acervo de uma terceira pessoa vai ser um recurso pago. "
      + "Ainda não está disponível — quando estiver, avisamos por aqui.";
  }
}

async function renomearPessoa(p, nome) {
  const limpo = (nome || "").trim().slice(0, 60);
  if (limpo === (p.nome || "")) return;
  const { error } = await sb.from("pessoas")
    .update({ nome: limpo || null }).eq("id", p.id);
  if (error) { aviso(explicar(error), "erro"); return; }
  p.nome = limpo || null;
  // A pessoa "eu" é a mesma gente que pacientes_app.nome descreve, e é de
  // lá que a tela do médico lia o nome até agora. Renomear uma sem a outra
  // deixaria dois nomes para a mesma pessoa, e o médico veria o antigo.
  if (p.parentesco === "eu") {
    await sb.from("pacientes_app").upsert({ id: usuario.id, nome: limpo || null },
                                          { onConflict: "id" });
    usuario.nome = limpo || null;
  }
  desenharContaPessoas();
  desenharLista();
  aviso("Nome guardado.", "ok");
}

async function adicionarPessoa() {
  const nome = (ct.pessoaNome.value || "").trim().slice(0, 60);
  if (!nome) {
    aviso("Escreva o nome da pessoa.", "erro");
    ct.pessoaNome.focus();
    return;
  }
  ct.pessoaAdicionar.disabled = true;
  ct.pessoaAdicionar.textContent = "Adicionando…";
  try {
    const { data, error } = await sb.from("pessoas").insert({
      conta_id: usuario.id, nome,
      parentesco: ct.pessoaParentesco.value,
    }).select("id, nome, parentesco, data_nascimento, criado_em").single();
    if (error) throw error;
    pessoas.push(data);
    ct.pessoaNome.value = "";
    await lerConsumo();
    desenharContaPessoas();
    desenharLista();
    aviso(nome + " entrou na sua conta. Use as abas no alto da tela para "
        + "escolher de quem é cada documento.", "ok");
  } catch (e) {
    aviso(explicar(e), "erro");
  } finally {
    ct.pessoaAdicionar.disabled = false;
    ct.pessoaAdicionar.textContent = "+ Adicionar pessoa";
  }
}

/* Remover leva os DOCUMENTOS junto — a chave estrangeira é on delete
   cascade, e não há para onde mandar exame de quem não está mais na conta.
   Por isso a pergunta diz o NÚMERO, como a de encerrar conta: "apagar tudo"
   é abstrato, "apagar os 12 documentos do João" é o que se perde de fato.

   As imagens saem ANTES, pelo cliente, na mesma ordem e pela mesma razão de
   apagarDocumento: apagar a linha primeiro deixaria os JPEG no servidor
   sem ninguém que saiba o caminho deles. */
async function removerPessoa(p, quantos) {
  if (!navigator.onLine) {
    return aviso("Remover uma pessoa precisa de internet — os documentos "
               + "dela estão no servidor.", "info", "Sem conexão");
  }
  const nome = nomeDaPessoa(p);
  const texto = quantos
    ? "Remover " + nome + " e apagar os " + quantos + " documento(s) dela?"
    : "Remover " + nome + " desta conta?";
  if (!await confirmarModal(texto + LINHA + LINHA
      + "Isto não pode ser desfeito. Se você tem os papéis originais, eles "
      + "continuam com você.",
      { textoConfirmar: "Remover", perigo: true })) return;
  try {
    const meus = documentos.filter((d) => d.pessoa_id === p.id);
    const caminhos = meus.flatMap((d) =>
      (d.documento_paginas || []).map((x) => x.storage_path));
    if (caminhos.length) {
      const { error } = await sb.storage.from("documentos").remove(caminhos);
      if (error) throw error;
    }
    const { error: e2 } = await sb.from("pessoas").delete().eq("id", p.id);
    if (e2) throw e2;
    pessoas = pessoas.filter((x) => x.id !== p.id);
    if (pessoaAtiva === p.id) pessoaAtiva = pessoaEuId();
    await lerConsumo();
    await carregar();
    desenharContaPessoas();
    aviso(nome + " foi removida.", "ok");
  } catch (e) {
    console.warn("[pessoa]", e?.message || e);
    aviso("Não consegui remover agora. Nada foi apagado — tente de novo.", "erro");
  }
}

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

  desenharContaPessoas();
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
        const ok = await confirmarModal(`Você tem ${documentos.length} documento(s) guardado(s) `
          + "neste celular que ainda não estão ligados a e-mail nenhum. Ao entrar "
          + "com outra conta, eles deixam de aparecer aqui. Deseja continuar?",
          { textoConfirmar: "Continuar" });
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
ct.comoFunciona.onclick = () => abrirBoasVindas(true);
ct.pessoaAdicionar.onclick = adicionarPessoa;
ct.enviar.onclick = enviarCodigo;
ct.confirmar.onclick = confirmarCodigo;
ct.voltar.onclick = () => {
  ct.passo2.classList.add("passo-oculto");
  ct.passo1.classList.remove("passo-oculto");
};
ct.sair.onclick = async () => {
  if (!await confirmarModal("Sair da conta neste celular? Seus documentos continuam "
             + "guardados e voltam quando você entrar de novo.",
             { textoConfirmar: "Sair" })) return;
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
  if (!await confirmarModal("Encerrar sua conta e apagar tudo o que está guardado?"
               + LINHA + LINHA
               + "Isto NÃO é o mesmo que sair do aplicativo. Não dá para "
               + "desfazer, e os documentos não voltam em nenhum celular.",
               { textoConfirmar: "Encerrar conta", perigo: true })) return;

  // Conta de verdade, do servidor e da fila: a segunda pergunta precisa
  // dizer o que se perde, não "tudo".
  let quantos = documentos.length + naFila.length;
  const aviso2 = quantos
    ? `Confirmar: apagar ${quantos} documento(s) e encerrar a conta?`
    : "Confirmar: encerrar a conta?";
  if (!await confirmarModal(aviso2 + LINHA + LINHA
               + "Se você tem os papéis originais, eles continuam com você.",
               { textoConfirmar: "Confirmar", perigo: true })) return;

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

// Fila de páginas de PDF: depois de guardar OU pular (cancelar) a página
// atual, a próxima da fila abre sozinha — "uma de cada vez" vira realidade
// sem o paciente precisar apertar "Enviar PDF" de novo a cada exame.
const guardarBase = el.salvar.onclick;
// SO anda se guardou de verdade. `guardar()` desiste em silencio em tres
// casos — sem paginas, duplicata recusada no modal, e IndexedDB que nao
// aceitou a gravacao — e avancar neles DESCARTA a pagina do PDF que a
// pessoa acabou de recortar, abrindo a seguinte por cima do aviso de erro.
// Quem recusa a duplicata quer voltar ao formulario, nao pular o exame.
el.salvar.onclick = async () => { if (await guardarBase()) avancarPdf(); };
const cancelarBase = el.cancelar.onclick;
el.cancelar.onclick = () => { cancelarBase(); avancarPdf(); };
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

// Colapsar/expandir o card do boneco. Preferência salva no aparelho — não
// é dado de saúde, é só "como a pessoa gosta de ver a tela", então
// localStorage serve bem aqui (mesmo padrão já usado para bemvindo-visto).
function corpoAlternarColapso(recolhido) {
  el.corpoBloco.classList.toggle("recolhido", recolhido);
  el.corpoCabecalho.setAttribute("aria-expanded", String(!recolhido));
  el.corpoSeta.textContent = recolhido ? "▸" : "▾";
  try { localStorage.setItem("corpo-recolhido", recolhido ? "1" : "0"); }
  catch (e) { /* janela anônima */ }
}
el.corpoCabecalho.onclick = () => {
  corpoAlternarColapso(!el.corpoBloco.classList.contains("recolhido"));
};
{
  let recolhidoSalvo = false;
  try { recolhidoSalvo = localStorage.getItem("corpo-recolhido") === "1"; }
  catch (e) { /* janela anônima */ }
  if (recolhidoSalvo) corpoAlternarColapso(true);
}

// Tamanho do texto. Preferência salva no aparelho, mesmo padrão do resto.
// `escala` chega como string do dataset (data-escala="1.15"); as classes
// batem com o valor por igualdade de texto, não numérica, então "1" fica
// sem classe nenhuma (tamanho normal já é o padrão da folha de estilo).
const botoesTextoOpcao = [...document.querySelectorAll(".texto-opcao")];
function aplicarTamanhoTexto(escala) {
  document.body.classList.remove("texto-m", "texto-g");
  if (escala === "1.15") document.body.classList.add("texto-m");
  else if (escala === "1.3") document.body.classList.add("texto-g");
  for (const b of botoesTextoOpcao) {
    b.classList.toggle("selecionada", b.dataset.escala === escala);
  }
  try { localStorage.setItem("tamanho-texto", escala); } catch (e) { /* janela anônima */ }
}
for (const b of botoesTextoOpcao) {
  b.onclick = () => aplicarTamanhoTexto(b.dataset.escala);
}
{
  let escalaSalva = "1";
  try { escalaSalva = localStorage.getItem("tamanho-texto") || "1"; }
  catch (e) { /* janela anônima */ }
  aplicarTamanhoTexto(escalaSalva);
}

/* ── Partida ──────────────────────────────────────────────────────────── */
(async () => {
  atualizarFaixaOffline();
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
    /* O TERMO NA ABERTURA, para quem nao aceitou a versao atual.
       Cobre DOIS casos que pareciam um so:

       - o texto mudou depois de a pessoa aceitar;
       - a pessoa NUNCA aceitou.

       O segundo nao era hipotese: a conta de teste tinha `termo_aceito_em`
       NULO no banco, com as boas-vindas ja vistas. O unico gatilho para
       quem ja passou das boas-vindas era o botao Fotografar — entao dava
       para consultar o acervo, usar a agenda e liberar tudo a um medico
       sem nenhum consentimento gravado. So a camera era barrada.

       Nao abre por cima das BOAS-VINDAS: la o termo ja vem em seguida
       (`fecharBoasVindas`), e duas paredes de texto seguidas, na primeira
       vez, e a melhor forma de a pessoa fechar as duas sem ler. */
    const bvAberta = !bv.tela.classList.contains("escondido");
    if (!jaAceitou() && !bvAberta) abrirTermo();
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
  navigator.serviceWorker.register("sw.js").then((registro) => {
    // "updatefound" dispara quando o navegador acha um sw.js DIFERENTE do
    // que já está rodando e começa a instalar em segundo plano — sozinho,
    // sem pedir licença, do jeito que o próprio sw.js já faz (skipWaiting +
    // clients.claim). O trabalho aqui é só um: avisar que aconteceu, porque
    // sem isso a pessoa fica na versão velha até fechar e abrir o app nas
    // vez, e "não funciona" que na real era cache já custou tempo demais
    // nesta conversa.
    registro.addEventListener("updatefound", () => {
      const novo = registro.installing;
      if (!novo) return;
      novo.addEventListener("statechange", () => {
        // "installed" acontece também na PRIMEIRA instalação, sem versão
        // velha para trocar — só é uma ATUALIZAÇÃO de verdade quando já
        // existe um controller rodando por cima da página atual.
        if (novo.state === "installed" && navigator.serviceWorker.controller) {
          const d = aviso('Nova versão disponível. '
            + '<button type="button" id="btn-atualizar-versao" '
            + 'class="leitura-tentar">Atualizar</button>', "info");
          const botao = d.querySelector("#btn-atualizar-versao");
          if (botao) botao.onclick = () => location.reload();
        }
      });
    });
  }).catch(() => {});
}

/* ── Botão voltar do celular ─────────────────────────────────────────────
   Dois papéis, um só listener, porque os dois disputam o MESMO botão:

   1) Fechar a tela ou o formulário aberto — recorte, conta, visualizador,
      compromisso, mostrar-ao-médico, ou o formulário de documento. Sem
      isto, o botão voltar do Android pularia direto para "sair do app"
      mesmo com uma dessas telas na frente, o que ninguém espera.
   2) Só na tela principal (nada aberto): perguntar antes de sair de
      verdade. Um toque sozinho não fecha — evita perder, sem querer, um
      documento a meio de preencher por um deslize do gesto de voltar.
      Dois toques em menos de 2s deixam sair.

   `history.pushState` cria um degrau extra no histórico só para o Android
   ter o que "voltar" — sem isto não haveria popstate nenhum para ouvir. */
const FECHAR_TELA_CHEIA = {
  "tela-conta": "conta-fechar", "tela-recorte": "recorte-cancelar",
  "tela-visu": "visu-fechar", "tela-compromisso": "comp-cancelar",
  "tela-mostrar": "mostrar-fechar",
};
function fecharTelaAtual() {
  // O MODAL VEM PRIMEIRO, e a ordem nao e arbitraria: ele esta por CIMA de
  // tudo (z-index 100) e ESPERA uma resposta. Com ele aberto, o voltar
  // fechava a tela de TRAS — a pessoa via sumir o visualizador e ficava com
  // "Apagar este documento?" pairando sobre a lista, agora perguntando
  // sobre algo que nao esta mais na tela.
  //
  // Voltar responde NAO, sempre. Nenhuma pergunta deste aplicativo tem o
  // "sim" como resposta segura: as que existem apagam documento, removem
  // pessoa ou encerram conta.
  if (!el.modalFundo.classList.contains("escondido")) {
    el.modalCancelar.click();
    return true;
  }
  for (const [telaId, botaoId] of Object.entries(FECHAR_TELA_CHEIA)) {
    const tela = document.getElementById(telaId);
    if (tela && !tela.classList.contains("escondido")) {
      const botao = document.getElementById(botaoId);
      if (botao) { botao.click(); return true; }
    }
  }
  if (!el.form.classList.contains("escondido")) { cancelar(); return true; }
  return false;
}

let ultimoAvisoSair = 0;
history.pushState({ app: true }, "");
window.addEventListener("popstate", () => {
  if (fecharTelaAtual()) { history.pushState({ app: true }, ""); return; }

  const agora = Date.now();
  if (agora - ultimoAvisoSair < 2000) return;   // segundo toque: deixa sair
  ultimoAvisoSair = agora;
  aviso("Toque em voltar mais uma vez para sair.", "info");
  history.pushState({ app: true }, "");
});
