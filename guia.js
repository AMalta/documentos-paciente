/* COMO USAR (04/10/2026, aprovado pelo usuário).
   Guia de seis cartões, cada um com uma mini-tela animada desenhada aqui
   mesmo — sem vídeo: abre sem internet, pesa nada e acompanha o app quando
   uma tela muda (é só mexer neste arquivo).

   Abre pelo ❓ do início (ao lado da Conta), por "Como usar o app" em
   Minha conta, e SOZINHO uma vez: depois do aceite do termo para quem é
   novo, ou na abertura para quem já usava (`guia-visto` no localStorage).

   O aviso da véspera sem exame novo (sql/023) abre aqui, já no cartão certo.

   O último cartão leva à ação: sem nenhum documento, "Guardar meu primeiro
   exame" abre a câmera; com documentos, só "Entendi".                      */
(function () {
  const q = (id) => document.getElementById(id);
  const VISTO = "guia-visto";

  const dedo = '<span class="gu-dedo" aria-hidden="true">👆</span>';
  const linhas = (n) => '<div class="gu-ld"><i></i><s></s></div>'.repeat(n);
  const barra = (ativo) => '<div class="gu-nav">' +
    [["💬", "Conversas"], ["📅", "Agenda"], ["📁", "Documentos"], ["🩺", "Ao médico"]]
      .map(([i, t]) => `<span class="${t === ativo ? "on" : ""}">${i}<br>${t}</span>`).join("") + "</div>";

  const CARTOES = [
    {
      cena: `<div class="gu-mini">${linhas(2)}
               <div class="gu-ld gu-novo"><i></i><div><b>Hemograma</b><s></s></div></div>
               <span class="gu-fab">📷 Guardar exame</span>${barra("Conversas")}</div>
             <div class="gu-papel gu-p1"></div><div class="gu-flash"></div>${dedo}`,
      titulo: "Guarde o exame de papel",
      texto: "Toque em <b>📷 Guardar exame</b> e aponte para a folha. O indiDoc acerta o corte e o exame entra na sua lista, com a data.",
    },
    {
      cena: `<div class="gu-mini"><div class="gu-dois"><span>📷 Fotografar</span><span class="gu-alvo">📄 PDF</span></div>
               <div class="gu-ld gu-novo"><i></i><div><b>Resultado do laboratório</b><s></s></div></div>
               ${linhas(2)}${barra("Documentos")}</div>
             <div class="gu-arq"><div>📁 Downloads</div><div class="sel">📄 resultado_lab.pdf</div><div>📄 boleto.pdf</div></div>
             <div class="gu-papel gu-pg gu-pg1"><em>1</em></div><div class="gu-papel gu-pg gu-pg2"><em>2</em></div><div class="gu-papel gu-pg gu-pg3"><em>3</em></div>${dedo}`,
      titulo: "Recebeu o exame em PDF?",
      texto: "Baixe o PDF do laboratório (do site, do e-mail ou do WhatsApp). Em <b>Documentos</b>, toque em <b>📄 PDF</b> e escolha o arquivo. Se o exame tem várias páginas, marque <b>“a próxima página é deste mesmo documento”</b> e elas ficam juntas.",
    },
    {
      cena: `<div class="gu-mini"><div class="gu-chips"><span class="on">Eu</span><span class="gu-filho">Pedro · filho</span></div>
               <div class="gu-troca">${linhas(3)}</div>${barra("Documentos")}</div>
             <div class="gu-conta">👤 Quem está nesta conta<div class="gu-add">+ Adicionar pessoa</div></div>${dedo}`,
      titulo: "Guarde os exames da família",
      texto: "Os exames do seu filho, da sua mãe ou de quem você cuida também cabem aqui. Em <b>👤 Conta</b>, toque em <b>+ Adicionar pessoa</b>. Cada um tem o seu acervo: toque no nome para trocar, e o médico vê só o da pessoa que está na consulta.",
    },
    {
      cena: `<div class="gu-mini"><div class="gu-busca">🔍 <span>holter</span></div>
               <div class="gu-chips gu-tipos"><span>Todos</span><span class="gu-tipo">Exames</span><span>Receitas</span></div>
               <div class="gu-ld"><i></i><div><b>Holter 24h</b><s></s></div></div>
               <div class="gu-ld gu-some"><i></i><s></s></div><div class="gu-ld gu-some"><i></i><s></s></div>${barra("Documentos")}</div>
             <svg class="gu-boneco" viewBox="0 0 60 110" aria-hidden="true"><circle cx="30" cy="12" r="10" fill="#cfd8dc"/><rect class="gu-peito" x="16" y="25" width="28" height="36" rx="10" fill="#cfd8dc"/><rect x="18" y="60" width="10" height="44" rx="5" fill="#cfd8dc"/><rect x="32" y="60" width="10" height="44" rx="5" fill="#cfd8dc"/><rect x="4" y="27" width="9" height="34" rx="4.5" fill="#cfd8dc"/><rect x="47" y="27" width="9" height="34" rx="4.5" fill="#cfd8dc"/></svg>`,
      titulo: "Ache qualquer exame em segundos",
      texto: "Em <b>Documentos</b>, escreva o nome na <b>busca</b>, escolha o <b>tipo</b> ou toque numa parte do <b>🧍 corpo</b>: o coração mostra Holter, eco e ECG.",
    },
    {
      cena: `<div class="gu-mini">${linhas(3)}${barra("Ao médico")}
               <div class="gu-verde">Mostre o número ao médico
                 <div><span class="gu-gerar">Gerar código</span></div>
                 <div class="gu-cod">482 915</div>vale até o fim do dia
                 <div class="gu-med">👨‍⚕️ <b>No consultório:</b> o médico digita o número e vê seus documentos, sem senha nem cadastro.</div>
               </div></div>${dedo}`,
      titulo: "Mostre ao médico na consulta",
      texto: "Toque em <b>Ao médico</b>, na barra de baixo, e depois em <b>Gerar código</b>. O médico digita o número no computador dele e vê os seus exames até o fim do dia.",
    },
    {
      cena: `<div class="gu-mini">${linhas(3)}${barra("Conversas")}
               <div class="gu-aviso">🔔 <b>Consulta amanhã com Dr. Décio</b><br>Deixar ele ver seus 3 exames novos?
                 <div class="gu-bts"><span class="sim">Deixar ver</span><span>Ver quais</span><span>Agora não</span></div></div>
               <div class="gu-ok">✓ Liberado para esta consulta</div></div>${dedo}`,
      titulo: "Antes da consulta, um toque",
      texto: "Se a sua clínica usa o Indiclin, o indiDoc avisa na véspera. Toque em <b>Deixar ver</b> e o médico já encontra os exames novos, só naquela consulta. Nada vai para a clínica sem você liberar.",
    },
  ];

  const tela = document.createElement("div");
  tela.className = "tela-cheia escondido";
  tela.id = "tela-guia";
  tela.setAttribute("role", "dialog");
  tela.setAttribute("aria-label", "Como usar o indiDoc");
  tela.innerHTML = `
    <div class="gu-cab"><b>Como usar</b><button type="button" class="gu-fechar" id="gu-fechar">✕ Fechar</button></div>
    <div class="gu-janela"><div class="gu-trilho" id="gu-trilho">${CARTOES.map((c, i) => `
      <section class="gu-cartao gu-c${i + 1}" aria-roledescription="cartão" aria-label="${i + 1} de ${CARTOES.length}">
        <div class="gu-cena">${c.cena}</div>
        <h2>${c.titulo}</h2><p>${c.texto}</p>
      </section>`).join("")}</div></div>
    <div class="gu-rodape">
      <div class="gu-pontos" id="gu-pontos">${"<i></i>".repeat(CARTOES.length)}</div>
      <div class="gu-botoes"><button type="button" class="gu-voltar" id="gu-voltar">Voltar</button>
        <button type="button" class="gu-prox" id="gu-prox">Próximo</button></div>
    </div>`;
  document.body.appendChild(tela);

  const trilho = q("gu-trilho"), prox = q("gu-prox"), volt = q("gu-voltar");
  let atual = 0;

  // Sem documento nenhum, o fim do guia é o começo do uso.
  const semDocumentos = () => {
    try { return (consumo?.documentos || 0) === 0; } catch (e) { return false; }
  };

  function ir(i) {
    atual = Math.max(0, Math.min(CARTOES.length - 1, i));
    trilho.style.transform = `translateX(-${atual * 100}%)`;
    [...q("gu-pontos").children].forEach((p, j) => p.classList.toggle("on", j === atual));
    // A animação recomeça ao chegar no cartão: sem isso, quem passa
    // devagar chega com ela pela metade.
    trilho.children[atual].classList.remove("gu-ativo");
    void trilho.children[atual].offsetWidth;
    [...trilho.children].forEach((c, j) => c.classList.toggle("gu-ativo", j === atual));
    volt.style.visibility = atual ? "visible" : "hidden";
    const ultimo = atual === CARTOES.length - 1;
    prox.textContent = !ultimo ? "Próximo" : semDocumentos() ? "📷 Guardar meu primeiro exame" : "Entendi";
  }

  // `n`: o cartão de partida (o aviso da véspera abre no papel ou no
  // "Mostre ao médico"; Voltar segue levando aos anteriores).
  function abrir(n) {
    tela.classList.remove("escondido");
    ir(Number(n) || 0);
    try { localStorage.setItem(VISTO, "1"); } catch (e) {}
  }
  function fechar() { tela.classList.add("escondido"); }

  prox.onclick = () => {
    if (atual < CARTOES.length - 1) return ir(atual + 1);
    const fotografar = semDocumentos();
    fechar();
    if (fotografar) { if (window.Abas) Abas.ir("documentos"); q("btn-fotografar")?.click(); }
  };
  volt.onclick = () => ir(atual - 1);
  q("gu-fechar").onclick = fechar;

  // Deslizar o cartão. Só dedo e caneta: com mouse, o arrasto roubava o
  // clique (a mesma armadilha da lista de documentos).
  let x0 = null;
  trilho.addEventListener("pointerdown", (e) => { x0 = e.pointerType === "mouse" ? null : e.clientX; });
  trilho.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const d = e.clientX - x0; x0 = null;
    if (Math.abs(d) > 40) ir(atual + (d < 0 ? 1 : -1));
  });

  /* Uma vez sozinho: só com o termo aceito e nada aberto por cima (boas-
     vindas, termo, câmera) — guia por cima de outra tela é parede de texto. */
  function talvezAbrir() {
    try { if (localStorage.getItem(VISTO) === "1") return; } catch (e) { return; }
    try { if (!usuario || !jaAceitou()) return; } catch (e) { return; }
    const outra = document.querySelector(".tela-cheia:not(.escondido):not(.como-aba):not(#tela-guia),"
      + "#bemvindo:not(.escondido),#termo:not(.escondido)");
    if (outra) return;
    abrir();
  }

  /* Aviso da véspera tocado (sw.js, sql/023): abre no cartão pedido.
     Espera o login e o termo (~20 s), como o aviso dos exames novos. */
  function abrirPeloAviso(n, tentativas = 40) {
    let pronto = false;
    try { pronto = !!usuario && jaAceitou(); } catch (e) {}
    if (pronto) return abrir(n);
    if (tentativas > 0) setTimeout(() => abrirPeloAviso(n, tentativas - 1), 500);
  }
  const pedido = /#guia=(\d+)/.exec(location.hash);
  if (pedido) {
    history.replaceState(history.state, "", location.pathname + location.search);
    abrirPeloAviso(pedido[1]);
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if ((e.data || {}).abrir === "guia") abrirPeloAviso(e.data.cartao);
    });
  }

  window.Guia = { abrir, talvezAbrir };
})();
